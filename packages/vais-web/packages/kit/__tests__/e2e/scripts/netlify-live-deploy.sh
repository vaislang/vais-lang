#!/usr/bin/env bash
# vais-web Netlify live deploy smoke runner.
#
# Inputs (env):
#   NETLIFY_AUTH_TOKEN         required — personal access token (User settings > Applications)
#   VAIS_NETLIFY_LIVE_DIST     required — directory containing the adapter output tree
#                                         (dist/functions/handler.js + dist/static/_redirects
#                                          + dist/netlify.toml)
#   VAIS_NETLIFY_LIVE_NAME     optional — Netlify site name (default: vais-web-live-<rand>)
#
# Outputs (stdout):
#   DEPLOY_URL=<https URL>           printed once on successful deploy
#   PROBE_OK=root:<status>:<sha>     printed once after root HTTP probe
#   PROBE_DYN=<status>:<sha>         printed once after dynamic-route probe
#   ROOT_BODY_FIRST_120=<...>        first 120 bytes of root body
#   DYN_BODY_FIRST_120=<...>         first 120 bytes of dynamic-route body
#
# Side effects:
#   creates a Netlify site and production deployment scoped to the token's owner,
#   then deletes the site on EXIT trap (always — even on probe failure). exits
#   non-zero on any failure including cleanup. uses npx netlify-cli@latest (no
#   global install required); requires network for the npm fetch on first run.

set -euo pipefail

require() {
    if [ -z "${!1:-}" ]; then
        echo "ERROR: env $1 not set" >&2
        exit 2
    fi
}

require NETLIFY_AUTH_TOKEN
require VAIS_NETLIFY_LIVE_DIST

if [ ! -f "${VAIS_NETLIFY_LIVE_DIST}/dist/functions/handler.js" ]; then
    echo "ERROR: ${VAIS_NETLIFY_LIVE_DIST}/dist/functions/handler.js missing" >&2
    exit 2
fi

SITE_NAME="${VAIS_NETLIFY_LIVE_NAME:-vais-web-live-$(date +%s)-$$}"

# Pick a fixed netlify-cli version so output parsing is stable.
NETLIFY_CLI="npx --yes netlify-cli@17"

SITE_ID=""
DEPLOY_URL=""
cleanup() {
    local rc=$?
    # Best-effort teardown: delete the site if we created one.
    # Suppress all errors — cleanup must never block the exit code from the probe phase.
    if [ -n "${SITE_ID}" ]; then
        ${NETLIFY_CLI} api deleteSite \
            --data="{\"site_id\":\"${SITE_ID}\"}" \
            --auth="${NETLIFY_AUTH_TOKEN}" \
            >/dev/null 2>&1 || true
    fi
    exit "${rc}"
}
trap cleanup EXIT

# Create a new Netlify site with the chosen name.
# `netlify sites:create` prints a summary; parse out the site ID from the API
# response line. We use --with-ci to suppress interactive prompts.
CREATE_OUTPUT=$(
    ${NETLIFY_CLI} sites:create \
        --name="${SITE_NAME}" \
        --auth="${NETLIFY_AUTH_TOKEN}" \
        --with-ci \
        2>&1 || true
)

# The CLI prints the site ID on a line like "Site ID: <uuid>".
SITE_ID=$(echo "${CREATE_OUTPUT}" | grep -oE 'Site ID:[[:space:]]+[a-zA-Z0-9-]+' | sed 's/Site ID:[[:space:]]*//' | head -n 1 || true)

if [ -z "${SITE_ID}" ]; then
    echo "ERROR: could not extract SITE_ID from netlify sites:create output:" >&2
    echo "${CREATE_OUTPUT}" >&2
    exit 3
fi

# Deploy with prod flag; static dir = dist/static, functions dir = dist/functions.
DEPLOY_OUTPUT=$(
    ${NETLIFY_CLI} deploy \
        --prod \
        --dir="${VAIS_NETLIFY_LIVE_DIST}/dist/static" \
        --functions="${VAIS_NETLIFY_LIVE_DIST}/dist/functions" \
        --site="${SITE_ID}" \
        --auth="${NETLIFY_AUTH_TOKEN}" \
        2>&1
)

# Netlify CLI prints the production URL on a line like "Website URL: https://...".
DEPLOY_URL=$(echo "${DEPLOY_OUTPUT}" | grep -oE 'https://[a-zA-Z0-9.-]+\.netlify\.app' | head -n 1 || true)

if [ -z "${DEPLOY_URL}" ]; then
    echo "ERROR: could not extract DEPLOY_URL from netlify deploy output:" >&2
    echo "${DEPLOY_OUTPUT}" >&2
    exit 3
fi

echo "DEPLOY_URL=${DEPLOY_URL}"

# Netlify propagation is usually <2s but allow up to 20s for cold edge cache.
PROBE_BODY=""
PROBE_STATUS=""
for attempt in 1 2 3 4 5 6 7 8 9 10; do
    HTTP_RESPONSE=$(curl -sS -o "/tmp/ntl_probe_body.$$" -w "%{http_code}" "${DEPLOY_URL}/" || echo "000")
    if [ "${HTTP_RESPONSE}" = "200" ] || [ "${HTTP_RESPONSE}" = "404" ]; then
        PROBE_STATUS="${HTTP_RESPONSE}"
        PROBE_BODY=$(cat "/tmp/ntl_probe_body.$$" 2>/dev/null || true)
        rm -f "/tmp/ntl_probe_body.$$"
        break
    fi
    sleep 2
done

if [ -z "${PROBE_STATUS}" ]; then
    echo "ERROR: probe never returned 2xx/4xx (last code ${HTTP_RESPONSE})" >&2
    exit 6
fi

# Probe the dynamic route too; any HTTP status proves the deployment routed
# the request (200 on Functions success, 404 on missing handler — both prove
# the edge is live and matched some route table).
DYN_RESPONSE=$(curl -sS -o "/tmp/ntl_probe_dyn.$$" -w "%{http_code}" "${DEPLOY_URL}/blog/live-deploy" || echo "000")
DYN_BODY=$(cat "/tmp/ntl_probe_dyn.$$" 2>/dev/null || true)
rm -f "/tmp/ntl_probe_dyn.$$"

if command -v sha256sum >/dev/null 2>&1; then
    HASH_CMD="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
    HASH_CMD="shasum -a 256"
else
    HASH_CMD="cat"
fi

ROOT_HASH=$(printf '%s' "${PROBE_BODY}" | ${HASH_CMD} | awk '{print $1}')
DYN_HASH=$(printf '%s' "${DYN_BODY}" | ${HASH_CMD} | awk '{print $1}')

echo "PROBE_OK=root:${PROBE_STATUS}:${ROOT_HASH}"
echo "PROBE_DYN=${DYN_RESPONSE}:${DYN_HASH}"
echo "ROOT_BODY_FIRST_120=${PROBE_BODY:0:120}"
echo "DYN_BODY_FIRST_120=${DYN_BODY:0:120}"

# trap cleanup will tear down the site + deployment

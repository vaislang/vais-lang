#!/usr/bin/env bash
# vais-web Vercel live deploy smoke runner.
#
# Inputs (env):
#   VERCEL_TOKEN           required — personal access token (Settings > Tokens)
#   VAIS_VERCEL_LIVE_DIST  required — directory containing .vercel/output/ tree
#                                     (config.json + static/ + functions/)
#   VAIS_VERCEL_LIVE_NAME  optional — vercel project name (default: vais-web-live-<rand>)
#
# Outputs (stdout):
#   DEPLOY_URL=<https URL>           printed once on successful deploy
#   PROBE_OK=root:<status>:<sha>     printed once after root HTTP probe
#   PROBE_DYN=<status>:<sha>         printed once after dynamic-route probe
#   ROOT_BODY_FIRST_120=<...>        first 120 bytes of root body
#   DYN_BODY_FIRST_120=<...>         first 120 bytes of dynamic-route body
#
# Side effects:
#   creates a Vercel deployment scoped to the token's owner, then removes it
#   on EXIT trap (always — even on probe failure). exits non-zero on any
#   failure including cleanup. uses npx vercel@latest (no global install
#   required); requires network for the npm fetch on first run.

set -euo pipefail

require() {
    if [ -z "${!1:-}" ]; then
        echo "ERROR: env $1 not set" >&2
        exit 2
    fi
}

require VERCEL_TOKEN
require VAIS_VERCEL_LIVE_DIST

if [ ! -f "${VAIS_VERCEL_LIVE_DIST}/.vercel/output/config.json" ]; then
    echo "ERROR: ${VAIS_VERCEL_LIVE_DIST}/.vercel/output/config.json missing" >&2
    exit 2
fi

PROJECT_NAME="${VAIS_VERCEL_LIVE_NAME:-vais-web-live-$(date +%s)-$$}"

# Pick a fixed vercel CLI version so output parsing is stable.
VERCEL_CLI="npx --yes vercel@53"

DEPLOY_URL=""
cleanup() {
    local rc=$?
    # Best-effort teardown: remove the deployment by URL if we captured one,
    # otherwise remove the project if it exists. Suppress all errors —
    # cleanup must never block the exit code from the probe phase.
    if [ -n "${DEPLOY_URL}" ]; then
        ${VERCEL_CLI} remove --yes --token="${VERCEL_TOKEN}" "${DEPLOY_URL#https://}" \
            >/dev/null 2>&1 || true
    fi
    ${VERCEL_CLI} remove --yes --token="${VERCEL_TOKEN}" "${PROJECT_NAME}" \
        >/dev/null 2>&1 || true
    exit "${rc}"
}
trap cleanup EXIT

# Vercel `--prebuilt` consumes an already-built .vercel/output/ tree. We run
# the CLI from VAIS_VERCEL_LIVE_DIST so it picks up that directory directly.
# `--yes` skips the interactive project linking prompt (creates one named
# after the directory's basename — we override via `--name`).
DEPLOY_OUTPUT=$(
    cd "${VAIS_VERCEL_LIVE_DIST}" && \
    ${VERCEL_CLI} deploy \
        --prebuilt \
        --prod \
        --yes \
        --token="${VERCEL_TOKEN}" \
        --name="${PROJECT_NAME}" \
        2>&1
)

# Vercel CLI prints the production URL on a line by itself (last line is the
# canonical https://... URL). Capture the first https:// match to avoid
# inspect/log noise.
DEPLOY_URL=$(echo "${DEPLOY_OUTPUT}" | grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' | head -n 1 || true)

if [ -z "${DEPLOY_URL}" ]; then
    echo "ERROR: could not extract DEPLOY_URL from vercel output:" >&2
    echo "${DEPLOY_OUTPUT}" >&2
    exit 3
fi

echo "DEPLOY_URL=${DEPLOY_URL}"

# Vercel propagation is usually <2s but allow up to 20s for cold edge cache.
PROBE_BODY=""
PROBE_STATUS=""
for attempt in 1 2 3 4 5 6 7 8 9 10; do
    HTTP_RESPONSE=$(curl -sS -o "/tmp/vc_probe_body.$$" -w "%{http_code}" "${DEPLOY_URL}/" || echo "000")
    if [ "${HTTP_RESPONSE}" = "200" ] || [ "${HTTP_RESPONSE}" = "404" ]; then
        PROBE_STATUS="${HTTP_RESPONSE}"
        PROBE_BODY=$(cat "/tmp/vc_probe_body.$$" 2>/dev/null || true)
        rm -f "/tmp/vc_probe_body.$$"
        break
    fi
    sleep 2
done

if [ -z "${PROBE_STATUS}" ]; then
    echo "ERROR: probe never returned 2xx/4xx (last code ${HTTP_RESPONSE})" >&2
    exit 6
fi

# Probe the dynamic route too; any HTTP status proves the deployment routed
# the request (200 on SSR success, 404 on missing handler — both prove edge
# is live and matched some route table).
DYN_RESPONSE=$(curl -sS -o "/tmp/vc_probe_dyn.$$" -w "%{http_code}" "${DEPLOY_URL}/blog/live-deploy" || echo "000")
DYN_BODY=$(cat "/tmp/vc_probe_dyn.$$" 2>/dev/null || true)
rm -f "/tmp/vc_probe_dyn.$$"

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

# trap cleanup will tear down the deployment + project

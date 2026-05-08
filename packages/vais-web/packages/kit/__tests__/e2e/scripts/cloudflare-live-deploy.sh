#!/usr/bin/env bash
# vais-web Cloudflare Workers live deploy smoke runner.
#
# Inputs (env):
#   CLOUDFLARE_API_TOKEN    required — Workers Scripts:Edit + Account:Read
#   CLOUDFLARE_ACCOUNT_ID   required — account UUID (32 hex)
#   VAIS_CF_LIVE_DIST       required — dist directory containing _worker.js + index.html
#   VAIS_CF_LIVE_NAME       optional — worker name (default: vais-web-live-<rand>)
#
# Outputs (stdout):
#   DEPLOY_URL=<https URL>     printed once on successful deploy
#   PROBE_OK=<status:body_hash> printed once after HTTP probe passes
#
# Side effects:
#   creates a Workers script under the account, then deletes it (always — even
#   on probe failure). exits non-zero on any failure including cleanup.

set -euo pipefail

require() {
    if [ -z "${!1:-}" ]; then
        echo "ERROR: env $1 not set" >&2
        exit 2
    fi
}

require CLOUDFLARE_API_TOKEN
require CLOUDFLARE_ACCOUNT_ID
require VAIS_CF_LIVE_DIST

if [ ! -f "${VAIS_CF_LIVE_DIST}/_worker.js" ]; then
    echo "ERROR: ${VAIS_CF_LIVE_DIST}/_worker.js missing" >&2
    exit 2
fi

WORKER_NAME="${VAIS_CF_LIVE_NAME:-vais-web-live-$(date +%s)-$$}"
API_BASE="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${WORKER_NAME}"
SUBDOMAIN_API="${API_BASE}/subdomain"

cleanup() {
    local rc=$?
    # always delete; suppress stderr on missing-script case
    curl -sS -X DELETE \
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
        "${API_BASE}?force=true" >/dev/null 2>&1 || true
    exit "${rc}"
}
trap cleanup EXIT

# Cloudflare Workers API requires multipart/form-data with metadata + module file.
# Use the modern modules-syntax upload (not service-worker-syntax).
METADATA_JSON='{"main_module":"_worker.js","compatibility_date":"2024-09-01"}'

UPLOAD_RESPONSE=$(curl -sS -X PUT \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -F "metadata=${METADATA_JSON};type=application/json" \
    -F "_worker.js=@${VAIS_CF_LIVE_DIST}/_worker.js;type=application/javascript+module" \
    "${API_BASE}")

if ! echo "${UPLOAD_RESPONSE}" | grep -qE '"success":[[:space:]]*true'; then
    echo "ERROR: upload failed: ${UPLOAD_RESPONSE}" >&2
    exit 3
fi

# Enable workers.dev subdomain so the script is reachable without DNS work.
SUBDOMAIN_RESPONSE=$(curl -sS -X POST \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{"enabled":true}' \
    "${SUBDOMAIN_API}")

if ! echo "${SUBDOMAIN_RESPONSE}" | grep -qE '"success":[[:space:]]*true'; then
    echo "ERROR: subdomain enable failed: ${SUBDOMAIN_RESPONSE}" >&2
    exit 4
fi

# Discover the account-level workers.dev subdomain (e.g. <name>.<sub>.workers.dev).
SUBDOMAIN_INFO=$(curl -sS \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/subdomain")
ACCOUNT_SUBDOMAIN=$(echo "${SUBDOMAIN_INFO}" | tr -d '\n' | sed -n 's/.*"subdomain":[[:space:]]*"\([^"]*\)".*/\1/p')

if [ -z "${ACCOUNT_SUBDOMAIN}" ]; then
    echo "ERROR: could not resolve account workers.dev subdomain: ${SUBDOMAIN_INFO}" >&2
    exit 5
fi

DEPLOY_URL="https://${WORKER_NAME}.${ACCOUNT_SUBDOMAIN}.workers.dev"
echo "DEPLOY_URL=${DEPLOY_URL}"

# Cloudflare propagation can take a few seconds; retry up to 20s.
PROBE_BODY=""
PROBE_STATUS=""
for attempt in 1 2 3 4 5 6 7 8 9 10; do
    HTTP_RESPONSE=$(curl -sS -o /tmp/cf_probe_body.$$ -w "%{http_code}" "${DEPLOY_URL}/" || echo "000")
    if [ "${HTTP_RESPONSE}" = "200" ] || [ "${HTTP_RESPONSE}" = "404" ]; then
        PROBE_STATUS="${HTTP_RESPONSE}"
        PROBE_BODY=$(cat /tmp/cf_probe_body.$$ 2>/dev/null || true)
        rm -f /tmp/cf_probe_body.$$
        break
    fi
    sleep 2
done

if [ -z "${PROBE_STATUS}" ]; then
    echo "ERROR: probe never returned 2xx/4xx (last code ${HTTP_RESPONSE})" >&2
    exit 6
fi

# Probe the dynamic route too (404 expected for unmatched, 200 for SSR fallback).
DYN_RESPONSE=$(curl -sS -o /tmp/cf_probe_dyn.$$ -w "%{http_code}" "${DEPLOY_URL}/blog/live-deploy" || echo "000")
DYN_BODY=$(cat /tmp/cf_probe_dyn.$$ 2>/dev/null || true)
rm -f /tmp/cf_probe_dyn.$$

# Hash bodies with shasum (macOS) or sha256sum (Linux) — script must run in CI too.
if command -v sha256sum >/dev/null 2>&1; then
    HASH_CMD="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
    HASH_CMD="shasum -a 256"
else
    HASH_CMD="cat"  # fallback: emit body verbatim (test runner can match)
fi

ROOT_HASH=$(printf '%s' "${PROBE_BODY}" | ${HASH_CMD} | awk '{print $1}')
DYN_HASH=$(printf '%s' "${DYN_BODY}" | ${HASH_CMD} | awk '{print $1}')

echo "PROBE_OK=root:${PROBE_STATUS}:${ROOT_HASH}"
echo "PROBE_DYN=${DYN_RESPONSE}:${DYN_HASH}"
echo "ROOT_BODY_FIRST_120=${PROBE_BODY:0:120}"
echo "DYN_BODY_FIRST_120=${DYN_BODY:0:120}"

# trap cleanup will tear down the worker

#!/usr/bin/env bash
# vais-web AWS Lambda live deploy smoke runner.
#
# Inputs (env):
#   AWS_ACCESS_KEY_ID          required — IAM access key
#   AWS_SECRET_ACCESS_KEY      required — IAM secret key
#   AWS_LAMBDA_ROLE_ARN        required — IAM execution role ARN for the Lambda function
#   AWS_REGION                 optional — AWS region (default: us-east-1)
#   VAIS_AWS_LIVE_DIST         required — directory containing dist/handler.js
#   VAIS_AWS_LIVE_NAME         optional — Lambda function name (default: vais-web-live-<rand>)
#
# Outputs (stdout):
#   DEPLOY_URL=<https URL>           printed once on successful deploy (Function URL)
#   PROBE_OK=root:<status>:<sha>     printed once after root HTTP probe
#   PROBE_DYN=<status>:<sha>         printed once after dynamic-route probe
#   ROOT_BODY_FIRST_120=<...>        first 120 bytes of root body
#   DYN_BODY_FIRST_120=<...>         first 120 bytes of dynamic-route body
#
# Side effects:
#   creates a Lambda function + Function URL under the account, then deletes
#   the function on EXIT trap (always — even on probe failure). Function URLs
#   are removed automatically when the function is deleted. exits non-zero on
#   any failure including cleanup. requires the `aws` CLI to be installed and
#   on PATH (no npx fallback — aws is not available via npx).

set -euo pipefail

require() {
    if [ -z "${!1:-}" ]; then
        echo "ERROR: env $1 not set" >&2
        exit 2
    fi
}

require AWS_ACCESS_KEY_ID
require AWS_SECRET_ACCESS_KEY
require AWS_LAMBDA_ROLE_ARN
require VAIS_AWS_LIVE_DIST

if ! command -v aws >/dev/null 2>&1; then
    echo "ERROR: aws CLI not found on PATH — install awscli v2 first" >&2
    exit 2
fi

if [ ! -f "${VAIS_AWS_LIVE_DIST}/dist/handler.js" ]; then
    echo "ERROR: ${VAIS_AWS_LIVE_DIST}/dist/handler.js missing" >&2
    exit 2
fi

REGION="${AWS_REGION:-us-east-1}"
FUNCTION_NAME="${VAIS_AWS_LIVE_NAME:-vais-web-live-$(date +%s)-$$}"

# Working directory for building the zip archive.
WORK_DIR=$(mktemp -d "/tmp/vais_aws_live_$$.XXXX")

cleanup() {
    local rc=$?
    # Best-effort teardown: delete the Lambda function (also removes the
    # Function URL). Suppress all errors — cleanup must never mask the probe
    # exit code.
    aws lambda delete-function \
        --region="${REGION}" \
        --function-name="${FUNCTION_NAME}" \
        >/dev/null 2>&1 || true
    rm -rf "${WORK_DIR}" 2>/dev/null || true
    exit "${rc}"
}
trap cleanup EXIT

# Build the deployment zip. The handler uses ESM (export async function handler)
# so we include a package.json with "type":"module". Lambda handler ref is
# "handler.handler" (filename without extension, dot, exported function name).
cp "${VAIS_AWS_LIVE_DIST}/dist/handler.js" "${WORK_DIR}/handler.js"
printf '{"type":"module"}\n' > "${WORK_DIR}/package.json"
(cd "${WORK_DIR}" && zip -q lambda.zip handler.js package.json)

ZIP_PATH="${WORK_DIR}/lambda.zip"

# Create the Lambda function.
CREATE_OUTPUT=$(aws lambda create-function \
    --region="${REGION}" \
    --function-name="${FUNCTION_NAME}" \
    --runtime=nodejs20.x \
    --handler=handler.handler \
    --zip-file="fileb://${ZIP_PATH}" \
    --role="${AWS_LAMBDA_ROLE_ARN}" \
    --publish \
    2>&1)

if echo "${CREATE_OUTPUT}" | grep -qiE '"FunctionArn"'; then
    : # success
else
    echo "ERROR: lambda create-function failed: ${CREATE_OUTPUT}" >&2
    exit 3
fi

# Wait for the function to reach Active state (usually <10s on first deploy).
aws lambda wait function-active \
    --region="${REGION}" \
    --function-name="${FUNCTION_NAME}" \
    >/dev/null 2>&1 || true

# Create the Function URL with no auth (public access).
URL_OUTPUT=$(aws lambda create-function-url-config \
    --region="${REGION}" \
    --function-name="${FUNCTION_NAME}" \
    --auth-type=NONE \
    2>&1)

DEPLOY_URL=$(echo "${URL_OUTPUT}" | tr -d '\n' | sed -n 's/.*"FunctionUrl":[[:space:]]*"\([^"]*\)".*/\1/p' | sed 's|/$||')

if [ -z "${DEPLOY_URL}" ]; then
    echo "ERROR: could not extract FunctionUrl from: ${URL_OUTPUT}" >&2
    exit 3
fi

# Add a resource-based policy to allow public invocation.
aws lambda add-permission \
    --region="${REGION}" \
    --function-name="${FUNCTION_NAME}" \
    --statement-id=FunctionURLAllowPublicAccess \
    --action=lambda:InvokeFunctionUrl \
    --principal='*' \
    --function-url-auth-type=NONE \
    >/dev/null 2>&1

echo "DEPLOY_URL=${DEPLOY_URL}"

# AWS Lambda Function URL propagation + cold start can take ~30s. Use 18
# attempts × 3s = up to 54s window before giving up.
PROBE_BODY=""
PROBE_STATUS=""
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18; do
    HTTP_RESPONSE=$(curl -sS -o "/tmp/aws_probe_body.$$" -w "%{http_code}" "${DEPLOY_URL}/" || echo "000")
    if [ "${HTTP_RESPONSE}" = "200" ] || [ "${HTTP_RESPONSE}" = "404" ]; then
        PROBE_STATUS="${HTTP_RESPONSE}"
        PROBE_BODY=$(cat "/tmp/aws_probe_body.$$" 2>/dev/null || true)
        rm -f "/tmp/aws_probe_body.$$"
        break
    fi
    sleep 3
done

if [ -z "${PROBE_STATUS}" ]; then
    echo "ERROR: probe never returned 2xx/4xx (last code ${HTTP_RESPONSE})" >&2
    exit 6
fi

# Probe the dynamic route too; any HTTP status proves the Function URL routed
# the request (200 on SSR success, 404 on missing handler — both prove Lambda
# is live and handled the invocation).
DYN_RESPONSE=$(curl -sS -o "/tmp/aws_probe_dyn.$$" -w "%{http_code}" "${DEPLOY_URL}/blog/live-deploy" || echo "000")
DYN_BODY=$(cat "/tmp/aws_probe_dyn.$$" 2>/dev/null || true)
rm -f "/tmp/aws_probe_dyn.$$"

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

# trap cleanup will delete the Lambda function (+ its Function URL)

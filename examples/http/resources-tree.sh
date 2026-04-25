#!/usr/bin/env bash
set -euo pipefail

SERVER_URL="${SERVER_URL:-http://localhost:6001}"
CAPABILITY_TOKEN="${CAPABILITY_TOKEN:?set CAPABILITY_TOKEN first}"
RESOURCE_URI="${RESOURCE_URI:-viking://resources/tenants/acme/}"
ENCODED_URI="$(node -e "console.log(encodeURIComponent(process.argv[1]))" "${RESOURCE_URI}")"

curl -sS "${SERVER_URL}/api/resources/tree?uri=${ENCODED_URI}&depth=2" \
  -H "Authorization: Bearer ${CAPABILITY_TOKEN}" \
  -H "x-request-id: http-example-resources-tree"

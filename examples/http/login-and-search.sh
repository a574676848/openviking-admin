#!/usr/bin/env bash
set -euo pipefail

SERVER_URL="${SERVER_URL:-http://localhost:6001}"
TENANT_CODE="${TENANT_CODE:-acme}"
USERNAME="${USERNAME:-admin}"
PASSWORD="${PASSWORD:-admin123}"
QUERY="${QUERY:-多租户隔离}"

LOGIN_RESPONSE="$(
  curl -sS -X POST "${SERVER_URL}/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"${USERNAME}\",
      \"password\": \"${PASSWORD}\",
      \"tenantCode\": \"${TENANT_CODE}\"
    }"
)"

ACCESS_TOKEN="$(node -e "const payload = JSON.parse(process.argv[1]); console.log((payload.data ?? payload).accessToken)" "${LOGIN_RESPONSE}")"

curl -sS -X POST "${SERVER_URL}/api/v1/knowledge/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "x-request-id: http-example-search" \
  -d "{
    \"query\": \"${QUERY}\",
    \"limit\": 5,
    \"scoreThreshold\": 0.5
  }"

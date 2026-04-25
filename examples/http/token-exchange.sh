#!/usr/bin/env bash
set -euo pipefail

SERVER_URL="${SERVER_URL:-http://localhost:6001}"
JWT_ACCESS_TOKEN="${JWT_ACCESS_TOKEN:?set JWT_ACCESS_TOKEN first}"

curl -sS -X POST "${SERVER_URL}/api/auth/token/exchange" \
  -H "Authorization: Bearer ${JWT_ACCESS_TOKEN}" \
  -H "x-request-id: http-example-token-exchange"

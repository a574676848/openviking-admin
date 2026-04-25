#!/usr/bin/env bash
set -euo pipefail

SERVER_URL="${SERVER_URL:-http://localhost:6001}"
SESSION_ID="${SESSION_ID:?set SESSION_ID from the SSE endpoint first}"
SESSION_TOKEN="${SESSION_TOKEN:?set SESSION_TOKEN from the SSE endpoint first}"
API_KEY="${API_KEY:?set API_KEY first}"

curl -sS -X POST "${SERVER_URL}/api/mcp/message?sessionId=${SESSION_ID}&sessionToken=${SESSION_TOKEN}&key=${API_KEY}" \
  -H "Content-Type: application/json" \
  --data @examples/mcp/tools-call-search.json

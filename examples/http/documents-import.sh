#!/usr/bin/env bash
set -euo pipefail

ADMIN_BASE_URL="${ADMIN_BASE_URL:-http://localhost:6001}"
TOKEN="${TOKEN:?请设置 TOKEN}"
KB_ID="${KB_ID:?请设置 KB_ID}"
DOC_URL="${DOC_URL:-https://example.com/product.pdf}"

curl -sS -X POST "$ADMIN_BASE_URL/api/v1/import-tasks/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sourceType\":\"url\",\"knowledgeBaseId\":\"$KB_ID\",\"sourceUrl\":\"$DOC_URL\"}"

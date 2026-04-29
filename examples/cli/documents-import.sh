#!/usr/bin/env bash
set -euo pipefail

KB_ID="${KB_ID:-}"
DOC_URL="${DOC_URL:-https://example.com/product.pdf}"

if [ -z "$KB_ID" ]; then
  echo "请先设置 KB_ID，或执行 ova kb list 选择目标知识库。" >&2
  exit 1
fi

npm run ova -- kb list
npm run ova -- documents import "$DOC_URL" --kb "$KB_ID" --type url --output json

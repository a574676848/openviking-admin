#!/usr/bin/env bash
set -euo pipefail

PROFILE="${PROFILE:-dev}"
QUERY="${QUERY:-多租户隔离}"

ova capabilities list --profile "${PROFILE}" --output json
ova knowledge search \
  --query "${QUERY}" \
  --limit 5 \
  --profile "${PROFILE}" \
  --output json

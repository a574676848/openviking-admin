#!/usr/bin/env bash
set -euo pipefail

SERVER_URL="${SERVER_URL:-http://localhost:6001}"
TENANT_CODE="${TENANT_CODE:-acme}"
USERNAME="${USERNAME:-admin}"
PASSWORD="${PASSWORD:-admin123}"
PROFILE="${PROFILE:-dev}"

ova auth login \
  --server "${SERVER_URL}" \
  --username "${USERNAME}" \
  --password "${PASSWORD}" \
  --tenant-code "${TENANT_CODE}" \
  --profile "${PROFILE}"

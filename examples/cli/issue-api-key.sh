#!/usr/bin/env bash
set -euo pipefail

PROFILE="${PROFILE:-dev}"
KEY_NAME="${KEY_NAME:-cli-example}"

ova auth credential-options --profile "${PROFILE}" --output json
ova auth client-credentials \
  --name "${KEY_NAME}" \
  --profile "${PROFILE}" \
  --save \
  --output json

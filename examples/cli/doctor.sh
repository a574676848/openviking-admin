#!/usr/bin/env bash
set -euo pipefail

PROFILE="${PROFILE:-dev}"

ova doctor --profile "${PROFILE}" --output jsonl

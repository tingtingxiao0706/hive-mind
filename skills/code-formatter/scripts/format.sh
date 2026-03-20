#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:---check}"
TARGET="${2:-.}"

if ! command -v npx &> /dev/null; then
  echo "Error: npx is required but not found. Install Node.js 18+." >&2
  exit 1
fi

echo "Running Prettier ($ACTION) on: $TARGET"
npx --yes prettier "$ACTION" "$TARGET"

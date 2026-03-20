#!/usr/bin/env bash
set -euo pipefail

if ! command -v git &> /dev/null; then
  echo "Error: git is required but not found." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree &> /dev/null 2>&1; then
  echo "Error: not inside a git repository." >&2
  exit 1
fi

echo "=== Staged Files ==="
git diff --cached --name-status

echo ""
echo "=== Staged Diff (stat) ==="
git diff --cached --stat

echo ""
echo "=== Staged Diff (detailed) ==="
git diff --cached --no-color | head -500

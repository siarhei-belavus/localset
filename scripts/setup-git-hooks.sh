#!/bin/bash

set -euo pipefail

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

git config core.hooksPath .githooks

echo "Configured git hooks path: .githooks"

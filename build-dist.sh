#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "build-dist.sh is a compatibility wrapper. Delegating to build-dist.mjs..."
cd "$REPO_ROOT"
node build-dist.mjs "${1:-}"

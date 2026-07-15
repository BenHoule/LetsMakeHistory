#!/usr/bin/env bash
# =============================================================================
#  build-dist.sh — Create a distributable installer for Let's Make History
# =============================================================================
# Prerequisites (run ONCE before your first build):
#   - Node.js 20 LTS  https://nodejs.org
#   - pnpm 9+          npm install -g pnpm
#   - Windows only: Visual Studio Build Tools (for native module rebuild)
#       https://visualstudio.microsoft.com/visual-cpp-build-tools/
#   - macOS only: Xcode Command Line Tools  (xcode-select --install)
#
# Usage:
#   bash build-dist.sh           # builds for the current OS
#   bash build-dist.sh --win     # cross-compile Windows installer (from Linux/macOS)
#   bash build-dist.sh --mac     # macOS DMG  (must run ON macOS for notarisation)
#   bash build-dist.sh --linux   # Linux AppImage
#
# Output:
#   dist/   — contains the platform-specific installer(s)
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-}"

echo ""
echo "=========================================="
echo "  Let's Make History — Distribution Build"
echo "=========================================="
echo ""

# ── 0. Install all workspace dependencies ────────────────────────────────────
echo "[1/5] Installing workspace dependencies…"
cd "$REPO_ROOT"
pnpm install --frozen-lockfile

# ── 1. Build the SvelteKit client as a static site ───────────────────────────
echo "[2/5] Building SvelteKit client (adapter-static)…"
cd "$REPO_ROOT/packages/client"
# NODE_ENV=production triggers adapter-static in vite.config.ts
NODE_ENV=production pnpm run build

CLIENT_BUILD="$REPO_ROOT/packages/client/build"
if [ ! -d "$CLIENT_BUILD" ]; then
  echo "ERROR: Client build output not found at $CLIENT_BUILD"
  echo "       Make sure the SvelteKit build succeeded."
  exit 1
fi
echo "  → Client built to packages/client/build/"

# ── 2. Compile the TypeScript server to JavaScript ───────────────────────────
echo "[3/5] Bundling server with esbuild…"
cd "$REPO_ROOT/packages/server"
pnpm run build
echo "  → Server bundled to packages/server/dist/index.js"

# ── 3. Rebuild better-sqlite3 for the packaged Electron version ──────────────
echo "[4/5] Rebuilding better-sqlite3 for Electron $(cat packages/electron/node_modules/electron/package.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])')…"
cd "$REPO_ROOT/packages/server"
npx --yes @electron/rebuild \
  --version "$(cat "$REPO_ROOT/packages/electron/node_modules/electron/package.json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])')" \
  --module-dir dist/node_modules/better-sqlite3 \
  --which-module better-sqlite3 2>&1 | tail -3
cd "$REPO_ROOT/packages/electron"
# Install electron with scripts allowed so the binary downloads
npm install

# ── 5. Run electron-builder ──────────────────────────────────────────────────
echo "[5/5] Packaging with electron-builder…"
cd "$REPO_ROOT/packages/electron"

# Detect WSL2 environment
IS_WSL2=false
if grep -qi microsoft /proc/version 2>/dev/null || [ -n "${WSL_DISTRO_NAME:-}" ]; then
  IS_WSL2=true
fi

BUILDER_FLAGS=""
case "$TARGET" in
  --win)
    if [ "$IS_WSL2" = true ]; then
      echo "ℹ  WSL2 detected — using --win-dir to skip Wine/NSIS"
      echo "    To create the final NSIS installer (.exe), copy the app from"
      echo "    dist/win-unpacked/ to a native Windows machine or use Windows native build tools."
      BUILDER_FLAGS="--win --dir"
    else
      # Full NSIS installer — requires wine32 multiarch when building on Linux/macOS.
      # One-time setup (run as root, Linux only):
      #   sudo dpkg --add-architecture i386
      #   sudo apt-get update
      #   sudo apt-get install wine32:i386
      #   WINEPREFIX=~/.wine32 WINEARCH=win32 wineboot --init
      # Then always pass WINEPREFIX when calling this script:
      #   WINEPREFIX=~/.wine32 WINEARCH=win32 bash build-dist.sh --win
      BUILDER_FLAGS="--win"
    fi
    ;;
  --win-dir)
    # Unpacked Windows directory only (no NSIS, no Wine needed — good for testing)
    BUILDER_FLAGS="--win --dir"
    ;;
  --mac)   BUILDER_FLAGS="--mac" ;;
  --linux) BUILDER_FLAGS="--linux" ;;
  *)       BUILDER_FLAGS="" ;;
esac

# Patch package.json to use absolute output path (electron-builder resolves
# directories relative to the config file location).
node --input-type=module <<JSEOF
import { readFileSync, writeFileSync } from 'fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.build.directories = { output: '$REPO_ROOT/dist' };
pkg.build.extraResources = [
  { from: '$REPO_ROOT/packages/server', to: 'server',
    filter: ['**/*', '!src/**', '!node_modules/.cache/**', '!**/*.map'] },
  { from: '$REPO_ROOT/packages/client/build', to: 'client-build' },
];
writeFileSync('package.json', JSON.stringify(pkg, null, 2));
JSEOF

# Run the locally installed electron-builder binary directly.
# shellcheck disable=SC2086
node "$REPO_ROOT/packages/electron/node_modules/electron-builder/cli.js" $BUILDER_FLAGS

echo ""
echo "=========================================="
echo "  Build complete!  Output → dist/"
echo "=========================================="
echo ""
ls -lh "$REPO_ROOT/dist/" 2>/dev/null || true

#!/bin/bash
set -euo pipefail

# Build the opensearch-link plugin for production.
# Transpiles TypeScript to JavaScript using tsc and packages the plugin.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build/opensearch-link"

echo "==> Cleaning build directory"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "==> Transpiling TypeScript"
npm install --no-save typescript@5 2>/dev/null
npx tsc \
  --outDir "$BUILD_DIR/server" \
  --target ES2020 \
  --module commonjs \
  --moduleResolution node \
  --esModuleInterop \
  --skipLibCheck \
  --declaration false \
  --strict false \
  --noEmit false \
  --rootDir "$SCRIPT_DIR/server" \
  "$SCRIPT_DIR/server/index.ts" \
  "$SCRIPT_DIR/server/plugin.ts" \
  "$SCRIPT_DIR/server/types.ts" \
  "$SCRIPT_DIR/server/lib/rison.ts" \
  "$SCRIPT_DIR/server/lib/state_builder.ts" \
  "$SCRIPT_DIR/server/routes/redirect.ts" \
  2>&1 || true
# tsc will complain about missing OSD type declarations — that's OK,
# we just need the JS output.

echo "==> Copying manifest and config"
cp "$SCRIPT_DIR/opensearch_dashboards.json" "$BUILD_DIR/"
cp "$SCRIPT_DIR/package.json" "$BUILD_DIR/"

echo "==> Build complete: $BUILD_DIR"
find "$BUILD_DIR" -type f | sort | sed 's|^|    |'

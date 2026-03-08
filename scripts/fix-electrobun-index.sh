#!/bin/bash
# Post-build script to create index.js symlink for Electrobun launcher

set -e

BUILD_DIR="build/dev-linux-x64/VoiceVault-dev/Resources/app/bun"

if [ -d "$BUILD_DIR" ]; then
  echo "[fix-electrobun-index] Creating symlink in $BUILD_DIR"
  rm -f "$BUILD_DIR/index.js"
  ln -sf main.js "$BUILD_DIR/index.js"
  echo "[fix-electrobun-index] Symlink created successfully"
else
  echo "[fix-electrobun-index] Build directory not found: $BUILD_DIR"
fi

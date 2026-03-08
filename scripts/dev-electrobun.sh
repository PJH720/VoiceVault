#!/bin/bash
# Wrapper script to run Electrobun dev with proper setup

set -e

echo "[dev-electrobun] Starting Electrobun development build..."

# Kill any existing processes on the ports we'll use
lsof -t -i:50100 -i:5173 2>/dev/null | xargs -r kill -9 || true

# Build and start dev server
cd "$(dirname "$0")/.."
export LD_LIBRARY_PATH=.
export VOICEVAULT_DEV=1
export NODE_ENV=development

echo "[dev-electrobun] Running electrobun dev command..."
./node_modules/electrobun/bin/electrobun dev &
ELECTROBUN_PID=$!

# Wait for the build to complete (electrobun should create the build directory)
sleep 5

# Fix the index.js symlink issue
echo "[dev-electrobun] Fixing index.js symlink..."
bash scripts/fix-electrobun-index.sh

# Wait for the Electrobun process to complete
wait $ELECTROBUN_PID || true

#!/bin/bash
# Electrobun dev launcher — deterministic build-then-run sequence
# Ensures index.js symlink exists BEFORE the launcher starts (no race condition).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
BUILD_DIR="$ROOT/build/dev-linux-x64/VoiceVault-dev"
BIN_DIR="$BUILD_DIR/bin"
RESOURCES_DIR="$BUILD_DIR/Resources"
APP_BUN_DIR="$RESOURCES_DIR/app/bun"

cd "$ROOT"

echo "[dev-electrobun] Killing stale processes on ports 50100, 5173..."
lsof -t -i:50100 -i:5173 2>/dev/null | xargs -r kill -9 || true
sleep 0.5

# ── Step 1: Build bun entrypoint ──────────────────────────────────────────────
echo "[dev-electrobun] Building bun entrypoint..."
bun build src/main/main.ts \
  --outdir out/electrobun/main \
  --target bun

# ── Step 2: Run electrobun dev to populate the build directory ────────────────
# This copies binaries, native libs, and version.json, then starts the launcher.
# We capture its build phase output but stop it BEFORE it launches the GUI.
echo "[dev-electrobun] Populating build directory via electrobun dev (build phase)..."
timeout 15 ./node_modules/electrobun/bin/electrobun dev &
ELECTROBUN_DEV_PID=$!

# Wait until the build directory + bin/launcher appear (max 12s)
for i in $(seq 1 24); do
  if [ -f "$BIN_DIR/launcher" ]; then
    echo "[dev-electrobun] Build directory ready (${i}x0.5s)"
    break
  fi
  sleep 0.5
done

if [ ! -f "$BIN_DIR/launcher" ]; then
  echo "[dev-electrobun] ERROR: Build directory not ready after 12s — aborting"
  kill $ELECTROBUN_DEV_PID 2>/dev/null || true
  exit 1
fi

# ── Step 3: Inject our compiled app as index.js (before launcher touches it) ──
echo "[dev-electrobun] Injecting compiled app as index.js..."
mkdir -p "$APP_BUN_DIR"
cp "$ROOT/out/electrobun/main/main.js" "$APP_BUN_DIR/index.js"
echo "[dev-electrobun] app/bun/index.js written ($(wc -c < "$APP_BUN_DIR/index.js") bytes)"

# Kill the background electrobun dev process (we'll drive the launcher ourselves)
kill $ELECTROBUN_DEV_PID 2>/dev/null || true
wait $ELECTROBUN_DEV_PID 2>/dev/null || true
sleep 0.5

# ── Step 4: Start launcher directly (GTK loop runs on its thread; Worker free) ─
echo "[dev-electrobun] Starting launcher..."
export LD_LIBRARY_PATH="$BIN_DIR:${LD_LIBRARY_PATH:-}"
export VOICEVAULT_DEV=1
export NODE_ENV=development

exec "$BIN_DIR/launcher"

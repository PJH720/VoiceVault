#!/bin/bash
# Electrobun dev launcher — deterministic build-then-run sequence
# Ensures index.js symlink exists BEFORE the launcher starts (no race condition).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

# ── Platform detection ───────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS-$ARCH" in
  Darwin-arm64)  PLATFORM="macos-arm64" ;;
  Darwin-x86_64) PLATFORM="macos-x64"   ;;
  Linux-x86_64)  PLATFORM="linux-x64"   ;;
  *) echo "[dev-electrobun] Unsupported platform: $OS-$ARCH"; exit 1 ;;
esac

echo "[dev-electrobun] Platform: $PLATFORM"

BUILD_DIR="$ROOT/build/dev-${PLATFORM}/VoiceVault-dev"
BIN_DIR="$BUILD_DIR/bin"
RESOURCES_DIR="$BUILD_DIR/Resources"
APP_BUN_DIR="$RESOURCES_DIR/app/bun"

cd "$ROOT"

echo "[dev-electrobun] Killing stale processes on ports 50100, 5173..."
STALE_PIDS=$(lsof -t -i:50100 -i:5173 2>/dev/null || true)
if [ -n "$STALE_PIDS" ]; then
  echo "$STALE_PIDS" | xargs kill -9 2>/dev/null || true
fi
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
node ./node_modules/electrobun/bin/electrobun.cjs dev &
ELECTROBUN_DEV_PID=$!

# Kill the electrobun dev process after 15s if it hasn't exited
( sleep 15 && kill $ELECTROBUN_DEV_PID 2>/dev/null ) &
TIMEOUT_PID=$!

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
kill $TIMEOUT_PID 2>/dev/null || true
wait $ELECTROBUN_DEV_PID 2>/dev/null || true
sleep 0.5

# ── Step 4: Start launcher directly (GTK loop runs on its thread; Worker free) ─
echo "[dev-electrobun] Starting launcher..."
if [ "$OS" = "Linux" ]; then
  export LD_LIBRARY_PATH="$BIN_DIR:${LD_LIBRARY_PATH:-}"
fi
export VOICEVAULT_DEV=1
export NODE_ENV=development

exec "$BIN_DIR/launcher"

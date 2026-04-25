#!/usr/bin/env bash
# scripts/post-build.sh
#
# Electrobun postBuild hook — called after the app bundle is assembled.
#
# Injects statically-linked whisper-cli and llama-cli binaries into the
# app bundle's bin/ directory if they are present in scripts/bin/.
#
# In CI (GitHub Actions), the package.yml workflow builds static binaries
# and places them in scripts/bin/ before running the Electrobun build.
# On local developer machines, this script is a no-op if scripts/bin/ is empty.
#
# After injection, resolveBinary() in src/main/utils/subprocess.ts will
# find these bundled binaries at their highest-priority search path:
#   ~/.local/share/VoiceVault/bin/  (extracted from the installer)
#
# See: src/main/utils/subprocess.ts resolveBinary()
#      src/main/services/setup.ts   first-run binary verification

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Electrobun sets ELECTROBUN_BUILD_DIR to the platform build folder
# e.g. build/stable-linux-x64/VoiceVault/
BUNDLE_BIN_DIR="${ELECTROBUN_BUILD_DIR:-}/bin"

echo "[post-build] BUILD_DIR=${ELECTROBUN_BUILD_DIR:-}"
echo "[post-build] BUNDLE_BIN_DIR=${BUNDLE_BIN_DIR}"

# Location where CI deposits pre-compiled static binaries
STATIC_BIN_DIR="$PROJECT_ROOT/scripts/bin"

if [ ! -d "$STATIC_BIN_DIR" ]; then
  echo "[post-build] scripts/bin/ not found — skipping binary injection (no bundled AI binaries)"
  exit 0
fi

if [ -z "${ELECTROBUN_BUILD_DIR:-}" ]; then
  echo "[post-build] ELECTROBUN_BUILD_DIR not set — skipping injection"
  exit 0
fi

if [ ! -d "$BUNDLE_BIN_DIR" ]; then
  echo "[post-build] Bundle bin/ not found at $BUNDLE_BIN_DIR — skipping injection"
  exit 0
fi

INJECTED=0

for BINARY in whisper-cli llama-cli ffmpeg; do
  SRC="$STATIC_BIN_DIR/$BINARY"
  if [ -f "$SRC" ]; then
    echo "[post-build] Injecting $BINARY into bundle bin/"
    cp "$SRC" "$BUNDLE_BIN_DIR/$BINARY"
    chmod +x "$BUNDLE_BIN_DIR/$BINARY"
    INJECTED=$((INJECTED + 1))
  fi
done

if [ "$INJECTED" -eq 0 ]; then
  echo "[post-build] No static binaries found in scripts/bin/ — users will download on first run"
else
  echo "[post-build] Injected $INJECTED binaries into the app bundle"
fi

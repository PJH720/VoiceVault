#!/bin/bash
# Smoke test for Whisper integration via Electrobun HTTP RPC
# Usage: ./scripts/test-whisper.sh [audio_file]
set -euo pipefail

RPC_PORT=${VOICEVAULT_RPC_PORT:-50100}
RPC_URL="http://localhost:${RPC_PORT}/rpc"
AUDIO_FILE="${1:-}"

echo "=== VoiceVault Whisper Smoke Test ==="
echo ""

# 1. Check binary status
echo "1. Checking whisper-cli binary..."
BINARY=$(curl -sf -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d '{"channel":"whisper:binary-status","params":null}')
echo "   $BINARY"
if echo "$BINARY" | grep -q '"available":true'; then
  echo "   ✅ Binary found"
else
  echo "   ❌ Binary not found"
  exit 1
fi

# 2. Check model status
echo ""
echo "2. Checking model status (tiny.en)..."
MODEL=$(curl -sf -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d '{"channel":"whisper:model-status","params":{"modelSize":"tiny.en"}}')
echo "   $MODEL"
if echo "$MODEL" | grep -q '"available":true'; then
  echo "   ✅ Model available"
else
  echo "   ⚠️  Model not found at ~/.voicevault/models/ggml-tiny.en.bin"
  echo "   Run: ln -sf ~/.local/share/VoiceVault/models/ggml-tiny.en.bin ~/.voicevault/models/"
fi

# 3. Transcribe test audio
if [ -z "$AUDIO_FILE" ]; then
  echo ""
  echo "3. Creating test audio (1s 440Hz tone)..."
  AUDIO_FILE="/tmp/voicevault-test-audio.mp3"
  ffmpeg -y -f lavfi -i "sine=frequency=440:duration=1" -q:a 9 "$AUDIO_FILE" 2>/dev/null
fi

echo ""
echo "4. Transcribing: $AUDIO_FILE"
RESULT=$(curl -sf -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d "{\"channel\":\"whisper:transcribe-file\",\"params\":{\"audioPath\":\"$AUDIO_FILE\",\"modelSize\":\"tiny.en\"}}" \
  --max-time 60)
echo "   $RESULT"
if echo "$RESULT" | grep -q '"result"'; then
  echo "   ✅ Transcription completed successfully"
else
  echo "   ❌ Transcription failed"
  exit 1
fi

echo ""
echo "=== All checks passed ✅ ==="

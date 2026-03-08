# Performance Benchmarks — Expected Numbers (v0.6.0)

**Date:** 2026-03-05
**Status:** Expected (upstream-sourced) — not measured locally
**Target Hardware:** Apple M4 (MacBook Air), 16 GB unified memory
**Issue:** [#215](https://github.com/pj/VoiceVault/issues/215)

> **Note:** Actual benchmarking requires whisper.cpp sidecar binary and node-llama-cpp installed with models downloaded. These are *expected* numbers extrapolated from upstream whisper.cpp and llama.cpp benchmarks on Apple Silicon (M1/M2/M3 Pro/Max). M4 is expected to match or exceed M3 Pro performance.

---

## 1. Whisper Transcription Performance (whisper.cpp sidecar)

### 1.1 Real-Time Factor (RTF) — Expected on Apple M4

RTF = processing time / audio duration. Values < 1.0 mean faster than real-time.

| Model | Disk | Memory | RTF (Metal GPU) | RTF (CPU-only, 8 threads) | Notes |
|-------|------|--------|-----------------|---------------------------|-------|
| **base** | 142 MiB | ~388 MB | **~0.05–0.08** | ~0.15–0.25 | Recommended for real-time streaming |
| **small** | 466 MiB | ~852 MB | **~0.10–0.18** | ~0.4–0.6 | Good accuracy/speed balance |
| **medium** | 1.5 GiB | ~2.1 GB | **~0.25–0.40** | ~1.0–1.5 | Near real-time with Metal; may lag CPU-only |
| **large-v3-turbo** | 1.6 GiB | ~2.1 GB | **~0.20–0.35** | ~0.8–1.2 | Turbo variant optimized for speed |

**Sources:**
- [whisper.cpp README — Memory usage table](https://github.com/ggml-org/whisper.cpp#memory-usage)
- [whisper.cpp Metal benchmarks](https://github.com/ggml-org/whisper.cpp/discussions/1463) — M1/M2/M3 results
- Community benchmarks on Apple Silicon show Metal acceleration delivers 3–5× speedup over CPU-only on Apple Silicon
- M4 expected to be ~10–20% faster than M3 due to improved Neural Engine and memory bandwidth

### 1.2 Core ML Acceleration (ANE)

Per whisper.cpp documentation, Core ML with Apple Neural Engine provides **>3× speedup** over CPU-only execution for the encoder pass. Combined with Metal for the decoder:

| Model | RTF (Core ML + Metal) | First-run penalty |
|-------|----------------------|-------------------|
| **base** | **~0.03–0.05** | ~5–10s (ANE compilation) |
| **small** | **~0.06–0.12** | ~10–15s |
| **medium** | **~0.15–0.25** | ~20–30s |

First-run ANE compilation is cached for subsequent runs.

---

## 2. LLM Summarization Latency (node-llama-cpp)

### 2.1 Model: Llama 3.2 3B Instruct (Q4_K_M quantization)

VoiceVault uses `node-llama-cpp` with `gpuLayers: 'max'` on macOS (Metal offloading) and context size of 8192 tokens.

| Metric | Expected Value | Notes |
|--------|---------------|-------|
| **Model file size** | ~1.8 GB (Q4_K_M) | GGUF format |
| **Model load time** | ~1–3s | Metal GPU layers, first load |
| **Prompt eval (prefill)** | ~200–400 tokens/s | Metal-accelerated on M4 |
| **Generation speed** | ~40–80 tokens/s | Q4_K_M, Metal, M4 |
| **Summarization latency** (500-word transcript → ~200 token output) | **~3–5s** | Including prompt eval |
| **Incremental summary** (~100 token output) | **~1.5–3s** | Shorter output, partial context |

**Alternative model: Gemma 2 3N Instruct (Q4_K_M)**
- Similar performance profile to Llama 3.2 3B
- File size: ~1.8 GB

**Sources:**
- [node-llama-cpp documentation](https://node-llama-cpp.withcat.ai) — Metal support, automatic GPU detection
- [llama.cpp benchmarks](https://github.com/ggml-org/llama.cpp/discussions/4167) — Apple Silicon token generation rates
- Community benchmarks: 3B Q4_K_M models on M2/M3 typically achieve 50–80 tok/s generation

---

## 3. Memory Usage — Combined Workload

### 3.1 Per-Component Memory

| Component | Memory (RSS) | Notes |
|-----------|-------------|-------|
| **Electron shell** (renderer + main) | ~150–250 MB | Chromium overhead, varies with UI complexity |
| **Whisper model (base)** | ~388 MB | Loaded in sidecar process |
| **Whisper model (small)** | ~852 MB | Loaded in sidecar process |
| **Whisper model (medium)** | ~2.1 GB | Loaded in sidecar process |
| **LLM model (3B Q4_K_M)** | ~2.0–2.5 GB | Metal GPU layers, VRAM shared with system |
| **Audio buffers & misc** | ~50–100 MB | PCM buffers, IPC overhead |

### 3.2 Total Expected Memory (Simultaneous Models)

| Configuration | Total RAM | Feasibility (16 GB system) |
|---------------|----------|---------------------------|
| **Whisper base + LLM 3B** | ~2.8–3.1 GB | ✅ Comfortable |
| **Whisper small + LLM 3B** | ~3.3–3.6 GB | ✅ Comfortable |
| **Whisper medium + LLM 3B** | ~4.5–4.9 GB | ✅ OK, leaves room for OS + other apps |
| **Whisper large + LLM 3B** | ~6.3–6.7 GB | ⚠️ Tight on 16 GB with other apps |

> **Note:** On macOS with unified memory, Metal GPU memory is shared with system RAM. GPU layers for both whisper.cpp and llama.cpp draw from the same pool. The numbers above represent total system memory impact.

### 3.3 Sidecar Architecture Benefit

Since WhisperService runs whisper.cpp as a **sidecar child process** (per ADR-001), the whisper model memory is isolated from the Electron/Node.js process. This means:
- Whisper memory can be reclaimed by terminating the sidecar when not actively transcribing
- Node.js heap is not affected by whisper model loading
- LLM model (via node-llama-cpp native addon) runs in-process but uses Metal/mmap for model weights

---

## 4. Optimization Opportunities

### 4.1 CoreML Acceleration (Whisper)
- **Impact:** >3× encoder speedup via Apple Neural Engine
- **Implementation:** Build whisper.cpp with `-DWHISPER_COREML=1`, generate `.mlmodelc` per model
- **Trade-off:** Requires pre-generated Core ML models (~same size as GGML), first-run compilation delay
- **Priority:** 🔴 High — significant real-time performance gain

### 4.2 Metal GPU (Both Whisper + LLM)
- **Impact:** 3–5× over CPU-only for whisper.cpp; essential for llama.cpp token generation
- **Implementation:** Already enabled — whisper.cpp auto-detects Metal; node-llama-cpp uses `gpuLayers: 'max'`
- **Status:** ✅ Already configured in codebase

### 4.3 Quantization Levels (Whisper)
- **Available:** Q5_0, Q5_1, Q8_0 for whisper models
- **Impact:** 30–50% memory reduction with minimal quality loss (Q5_0)
- **Implementation:** Run `whisper-quantize` on GGML models, use quantized files in sidecar
- **Priority:** 🟡 Medium — useful for constrained devices

### 4.4 Quantization Levels (LLM)
- **Current:** Q4_K_M (good balance of quality and speed)
- **Alternatives:**

| Quant | Size (3B) | Quality | Speed |
|-------|-----------|---------|-------|
| Q8_0 | ~3.2 GB | Best | Slower, more memory |
| Q4_K_M | ~1.8 GB | Good | ✅ Current choice |
| Q4_0 | ~1.7 GB | Acceptable | Fastest |
| IQ3_XXS | ~1.2 GB | Degraded | Fastest, smallest |

### 4.5 Model Loading Strategy
- **Lazy loading:** Don't load LLM until first summarization request
- **Unloading:** Release whisper sidecar between recordings; release LLM after summarization idle timeout
- **Impact:** Reduces steady-state memory from ~3–5 GB to ~200 MB (Electron-only)
- **Priority:** 🔴 High — essential for good desktop citizen behavior

### 4.6 Voice Activity Detection (VAD)
- **whisper.cpp now supports built-in VAD** — skip silent segments before inference
- **Impact:** Reduces effective audio processed by 30–60% in typical meetings
- **Priority:** 🟡 Medium — improves both latency and battery life

### 4.7 Streaming / Chunked Inference
- **Current approach:** 2-second PCM windows sent to whisper.cpp
- **Optimization:** Use whisper.cpp `--stream` mode with sliding window for lower latency
- **Trade-off:** Slightly lower accuracy at segment boundaries
- **Priority:** 🟡 Medium

---

## 5. Recommendations for v0.6.0

1. **Default to `base` model** for real-time transcription — fastest, ~388 MB, well under real-time on M4
2. **Enable Metal acceleration** (already done) — no configuration needed on macOS
3. **Implement lazy load/unload** for both models — critical for memory management
4. **Defer CoreML integration** to v0.7.0 — requires model conversion pipeline, significant packaging complexity
5. **Use Q4_K_M quantization** for LLM (already configured) — best quality/speed trade-off for 3B models
6. **Add model size selector in UI** with memory usage estimates so users can make informed choices

---

## 6. Benchmarking Plan (Post-Binary Integration)

Once the whisper.cpp sidecar is integrated (#204), run actual benchmarks:

```bash
# Whisper benchmark (built-in whisper-bench tool)
./whisper-bench -m models/ggml-base.bin -t 8

# LLM benchmark via node-llama-cpp CLI
npx node-llama-cpp chat --model models/Llama-3.2-3B-Instruct-Q4_K_M.gguf --benchmark
```

Capture and document:
- [ ] Actual RTF per model size on M4
- [ ] Token generation speed for LLM on M4
- [ ] Peak RSS memory per configuration
- [ ] Battery impact (Energy Impact in Activity Monitor) during sustained transcription
- [ ] Thermal throttling behavior under sustained load

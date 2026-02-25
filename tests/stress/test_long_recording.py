"""12-hour continuous recording stability stress test.

Simulates 720 minutes (12 hours) by directly driving RecordingSession's
_drain_and_summarize() in a tight loop. Uses real SQLite + real ChromaDB
but mocked LLM/STT for maximum speed.

Validates:
- Zero failures across 720 cycles
- Memory increase < 100 MB
- SQLite DB file < 50 MB
- ChromaDB vectors == 720 and search < 1 s
- Total execution < 300 s (5 min)
"""

import gc
import os
import time

import psutil
import pytest

TOTAL_MINUTES = 720  # 12 hours


@pytest.mark.stress
async def test_12h_continuous_recording_stability(
    stress_db_engine,
    stress_chroma,
    stress_session_factory,
    tmp_path,
):
    """Simulate 720 minutes of continuous recording and verify stability."""
    process = psutil.Process(os.getpid())
    failure_count = 0
    memory_samples: list[float] = []

    # ── Setup ──────────────────────────────────────────────────────────────
    initial_rss = process.memory_info().rss
    memory_samples.append(initial_rss / (1024 * 1024))  # MB

    session = stress_session_factory(recording_id=1)

    # ── 720-cycle loop ─────────────────────────────────────────────────────
    t_start = time.perf_counter()

    for minute in range(TOTAL_MINUTES):
        text = (
            f"[Minute {minute}] This is a simulated transcript for minute "
            f"{minute} of a 12-hour recording session. The speaker is "
            f"discussing topic {minute % 12} which relates to "
            f"{'AI and machine learning' if minute % 3 == 0 else 'software design'} "
            f"concepts from the lecture."
        )

        session.enqueue_transcript(minute, text)

        try:
            await session._drain_and_summarize()
        except Exception as exc:
            failure_count += 1
            print(f"  FAILURE at minute {minute}: {exc}")

        # Sample memory every 60 cycles (each simulated hour)
        if (minute + 1) % 60 == 0:
            gc.collect()
            rss_mb = process.memory_info().rss / (1024 * 1024)
            memory_samples.append(rss_mb)

    t_end = time.perf_counter()
    total_time = t_end - t_start

    # ── Final measurements ─────────────────────────────────────────────────
    gc.collect()
    final_rss = process.memory_info().rss
    memory_increase_mb = (final_rss - initial_rss) / (1024 * 1024)

    # DB file size
    db_path = tmp_path / "stress_test.db"
    db_size_mb = db_path.stat().st_size / (1024 * 1024) if db_path.exists() else 0.0

    # ChromaDB measurements
    chroma_count = await stress_chroma.count()

    # Search latency
    search_vector = [0.1] * 384
    t_search_start = time.perf_counter()
    await stress_chroma.search(embedding=search_vector, top_k=5)
    search_latency = time.perf_counter() - t_search_start

    # ── Report ─────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  12-HOUR CONTINUOUS RECORDING STRESS TEST RESULTS")
    print("=" * 60)
    print(f"  Total minutes simulated : {TOTAL_MINUTES}")
    print(f"  Failures               : {failure_count}")
    print(f"  Total wall-clock time  : {total_time:.1f}s")
    print(f"  Avg time per minute    : {total_time / TOTAL_MINUTES * 1000:.1f}ms")
    print(f"  Memory increase        : {memory_increase_mb:.1f} MB")
    print(f"  Initial RSS            : {initial_rss / (1024 * 1024):.1f} MB")
    print(f"  Final RSS              : {final_rss / (1024 * 1024):.1f} MB")
    print(f"  SQLite DB size         : {db_size_mb:.2f} MB")
    print(f"  ChromaDB vectors       : {chroma_count}")
    print(f"  ChromaDB search latency: {search_latency * 1000:.1f}ms")
    print()
    print("  Memory samples (MB per hour):")
    for i, sample in enumerate(memory_samples):
        label = "start" if i == 0 else f"hour {i}"
        print(f"    {label:>8}: {sample:.1f} MB")
    print("=" * 60 + "\n")

    # ── Assertions ─────────────────────────────────────────────────────────
    assert failure_count == 0, f"Expected 0 failures, got {failure_count}"

    assert memory_increase_mb < 100, (
        f"Memory increase {memory_increase_mb:.1f} MB exceeds 100 MB limit"
    )

    assert db_size_mb < 50, f"SQLite DB size {db_size_mb:.2f} MB exceeds 50 MB limit"

    assert chroma_count == TOTAL_MINUTES, (
        f"Expected {TOTAL_MINUTES} ChromaDB vectors, got {chroma_count}"
    )

    assert search_latency < 1.0, f"ChromaDB search latency {search_latency:.3f}s exceeds 1s limit"

    assert total_time < 300, f"Total execution time {total_time:.1f}s exceeds 300s (5 min) limit"

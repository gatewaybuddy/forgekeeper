from __future__ import annotations

import time

from forgekeeper_v2.orchestrator.policies import FloorPolicy, TriggerPolicy


def test_trigger_policy_basic() -> None:
    tp = TriggerPolicy(max_latency_s=0.01, min_silence_s=0.001)
    assert tp.should_emit()
    tp.mark_emitted()
    tp.activity()
    assert not tp.should_emit()
    time.sleep(0.02)
    assert tp.should_emit()


def test_floor_policy_preemption() -> None:
    fp = FloorPolicy(slice_ms=10)
    s1 = fp.next_speaker()
    s2 = fp.next_speaker()
    assert s1 != s2
    fp.mark_user_active()
    assert fp.next_speaker() == "user"


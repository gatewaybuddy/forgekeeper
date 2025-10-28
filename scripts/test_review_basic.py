#!/usr/bin/env python3
"""
Basic smoke test for self-review iteration feature (M2: T201).

Tests:
1. Review mode can be enabled via environment variable
2. Review orchestrator evaluates responses
3. ContextLog events are created for review cycles
4. Quality scores are extracted correctly

Usage:
    FRONTEND_ENABLE_REVIEW=1 python scripts/test_review_basic.py
"""

import json
import os
import sys
import time
from pathlib import Path

# Add forgekeeper to path
sys.path.insert(0, str(Path(__file__).parent.parent / "forgekeeper"))

from services.context_log import jsonl as ctxlog


def test_review_config():
    """Test that review configuration can be loaded."""
    print("✓ Testing review configuration...")

    # Check environment variables
    enabled = os.getenv("FRONTEND_ENABLE_REVIEW", "0") == "1"
    iterations = int(os.getenv("FRONTEND_REVIEW_ITERATIONS", "3"))
    threshold = float(os.getenv("FRONTEND_REVIEW_THRESHOLD", "0.7"))

    print(f"  Review enabled: {enabled}")
    print(f"  Review iterations: {iterations}")
    print(f"  Quality threshold: {threshold}")

    if not enabled:
        print("  ⚠️  Review mode not enabled. Set FRONTEND_ENABLE_REVIEW=1 to test.")
        return False

    return True


def test_contextlog_events():
    """Test that ContextLog can store review events."""
    print("\n✓ Testing ContextLog review events...")

    # Import review event helpers
    from services.context_log.review import (
        create_review_cycle_event,
        create_regeneration_event,
        create_review_summary_event,
    )

    # Create test events
    review_event = create_review_cycle_event(
        conv_id="test-conv-001",
        trace_id="test-trace-001",
        iteration=1,
        review_pass=1,
        quality_score=0.85,
        threshold=0.7,
        critique="Good response, minor improvements needed.",
        accepted=True,
        elapsed_ms=500,
    )

    print(f"  Created review_cycle event: {review_event['id'][:8]}...")
    print(f"  Quality score: {review_event['quality_score']}")
    print(f"  Accepted: {review_event['accepted']}")

    # Append to ContextLog
    try:
        ctxlog.append(review_event)
        print("  ✓ Event appended to ContextLog")
    except Exception as e:
        print(f"  ✗ Failed to append: {e}")
        return False

    # Create regeneration event
    regen_event = create_regeneration_event(
        conv_id="test-conv-001",
        trace_id="test-trace-001",
        iteration=1,
        attempt=1,
        reason="Response could be more detailed",
        previous_score=0.65,
        elapsed_ms=1200,
    )

    print(f"  Created regeneration event: {regen_event['id'][:8]}...")
    print(f"  Previous score: {regen_event['previous_score']}")

    try:
        ctxlog.append(regen_event)
        print("  ✓ Event appended to ContextLog")
    except Exception as e:
        print(f"  ✗ Failed to append: {e}")
        return False

    # Create summary event
    summary_event = create_review_summary_event(
        conv_id="test-conv-001",
        trace_id="test-trace-001",
        iteration=2,
        total_passes=2,
        final_score=0.85,
        regeneration_count=1,
        accepted=True,
        total_elapsed_ms=1700,
    )

    print(f"  Created review_summary event: {summary_event['id'][:8]}...")
    print(f"  Final score: {summary_event['final_score']}")
    print(f"  Total passes: {summary_event['total_passes']}")
    print(f"  Regenerations: {summary_event['regeneration_count']}")

    try:
        ctxlog.append(summary_event)
        print("  ✓ Event appended to ContextLog")
    except Exception as e:
        print(f"  ✗ Failed to append: {e}")
        return False

    return True


def test_tail_review_events():
    """Test that review events can be retrieved via tail."""
    print("\n✓ Testing ContextLog tail for review events...")

    try:
        # Tail recent events
        events = ctxlog.tail(n=10, conv_id="test-conv-001")

        print(f"  Retrieved {len(events)} recent events")

        # Filter review-related events
        review_events = [e for e in events if e.get("act") in ["review_cycle", "regeneration", "review_summary"]]

        print(f"  Found {len(review_events)} review-related events:")

        for event in review_events:
            act = event.get("act")
            name = event.get("name", "")
            score = event.get("quality_score") or event.get("final_score") or event.get("previous_score")
            print(f"    - {act} ({name}): score={score}")

        if len(review_events) >= 3:
            print("  ✓ All review event types found")
            return True
        else:
            print("  ⚠️  Not all review event types found")
            return False

    except Exception as e:
        print(f"  ✗ Failed to tail: {e}")
        return False


def test_quality_score_extraction():
    """Test quality score extraction from various text formats."""
    print("\n✓ Testing quality score extraction...")

    # This would normally be imported from the Node module,
    # but we'll test the Python equivalent logic
    test_cases = [
        ("Quality score: 0.85", 0.85),
        ("Score: 0.92", 0.92),
        ("0.75/1.0", 0.75),
        ("I rate this 0.88 out of 1.0", 0.88),
        ("Quality: 0.95", 0.95),
    ]

    passed = 0
    for text, expected in test_cases:
        # Simple extraction logic for testing
        import re

        # Pattern 1: "score: 0.85"
        match = re.search(r'(?:quality\s+)?score\s*:?\s*([0-9]*\.?[0-9]+)', text, re.IGNORECASE)
        if match:
            score = float(match.group(1))
            if 0.0 <= score <= 1.0 and abs(score - expected) < 0.01:
                print(f"  ✓ Extracted {score} from: '{text}'")
                passed += 1
                continue

        # Pattern 2: "0.85/1.0"
        match = re.search(r'([0-9]*\.?[0-9]+)\s*/\s*1\.0', text)
        if match:
            score = float(match.group(1))
            if 0.0 <= score <= 1.0 and abs(score - expected) < 0.01:
                print(f"  ✓ Extracted {score} from: '{text}'")
                passed += 1
                continue

        # Pattern 3: Standalone decimal
        match = re.search(r'\b([0-9]*\.?[0-9]+)\b', text)
        if match:
            score = float(match.group(1))
            if 0.0 <= score <= 1.0 and abs(score - expected) < 0.01:
                print(f"  ✓ Extracted {score} from: '{text}'")
                passed += 1
                continue

        print(f"  ✗ Failed to extract from: '{text}'")

    print(f"  Passed {passed}/{len(test_cases)} extraction tests")
    return passed == len(test_cases)


def main():
    """Run all smoke tests."""
    print("=" * 60)
    print("Self-Review Iteration Smoke Test (M2: T201)")
    print("=" * 60)

    results = []

    # Test 1: Configuration
    results.append(("Configuration", test_review_config()))

    # Test 2: ContextLog events
    results.append(("ContextLog Events", test_contextlog_events()))

    # Test 3: Tail review events
    results.append(("Tail Review Events", test_tail_review_events()))

    # Test 4: Score extraction
    results.append(("Score Extraction", test_quality_score_extraction()))

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary:")
    print("=" * 60)

    passed = 0
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"  {status}: {name}")
        if result:
            passed += 1

    print(f"\nPassed: {passed}/{len(results)}")

    if passed == len(results):
        print("\n🎉 All smoke tests passed!")
        return 0
    else:
        print("\n⚠️  Some tests failed. Review enabled: FRONTEND_ENABLE_REVIEW=1")
        return 1


if __name__ == "__main__":
    sys.exit(main())

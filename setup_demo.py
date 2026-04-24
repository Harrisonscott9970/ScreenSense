#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ScreenSense  -  Demo Pre-Training Script
========================================
Run this ONCE before any demo or marking session.
It seeds realistic data and trains the Random Forest through 15 cycles
so the Overview tab shows a full learning curve right away.

Usage:
    python setup_demo.py              # 15 cycles, 200 entries each
    python setup_demo.py --cycles 20  # more cycles
    python setup_demo.py --entries 300 # more entries per cycle

IMPORTANT: Start ScreenSense (the control panel, or the backend manually)
before running this script.
"""

import urllib.request, json, time, sys, argparse

API = "http://127.0.0.1:8000"


def api_get(path, timeout=10):
    with urllib.request.urlopen(f"{API}{path}", timeout=timeout) as r:
        return json.loads(r.read())


def api_post(path, body=b"{}", timeout=90):
    req = urllib.request.Request(
        f"{API}{path}", method="POST",
        headers={"Content-Type": "application/json"},
        data=body)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def wait_for_backend(timeout=15):
    print(f"  Connecting to backend at {API}...", end="", flush=True)
    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(f"{API}/health", timeout=2)
            print("  connected.")
            return True
        except Exception:
            print(".", end="", flush=True)
            time.sleep(1)
    print()
    return False


def bar(done, total, width=30):
    filled = int(width * done / total)
    return "[" + "#" * filled + "-" * (width - filled) + "]"


def run(cycles=15, entries_per_cycle=200):
    print()
    print("=" * 62)
    print("  ScreenSense  -  Demo Pre-Training")
    print(f"  {cycles} cycles  x  {entries_per_cycle} entries  =  "
          f"{cycles * entries_per_cycle} total entries")
    print("  Random Forest trains in seconds per cycle (not hours).")
    print("=" * 62)
    print()

    if not wait_for_backend():
        print()
        print("  ERROR: Backend is not running.")
        print("  Start the ScreenSense Control Panel and press")
        print("  'Start ScreenSense' first, then run this script.")
        print()
        sys.exit(1)

    f1_history = []
    start_time = time.time()

    for i in range(1, cycles + 1):
        cycle_start = time.time()
        print(f"  {bar(i-1, cycles)}  Cycle {i:>2}/{cycles}", flush=True)

        # Seed
        print(f"    Seeding {entries_per_cycle} entries...", end="", flush=True)
        try:
            d = api_post("/api/test/seed",
                         json.dumps({
                             "user_id": "demo_user",
                             "n": entries_per_cycle
                         }).encode())
            seeded = d.get("entries_created", d.get("seeded", "?"))
            print(f" {seeded} added.", flush=True)
        except Exception as e:
            print(f" WARN: {e}", flush=True)

        # Retrain
        print("    Retraining Random Forest...", end="", flush=True)
        try:
            d = api_post("/api/retrain", timeout=120)
            f1n      = d.get("new_f1_weighted", 0)
            f1o      = d.get("old_f1_weighted", 0)
            improved = d.get("improved", False)
            diff     = f1n - f1o
            sign     = "+" if diff >= 0 else ""
            status   = "improved" if improved else "no change (kept old)"
            f1_history.append(f1n)
            elapsed  = time.time() - cycle_start
            print(f" F1 {f1o:.4f} -> {f1n:.4f}  "
                  f"({sign}{diff*100:.2f}%)  [{status}]  "
                  f"{elapsed:.1f}s", flush=True)
        except Exception as e:
            print(f" WARN: {e}", flush=True)

        # Brief pause between cycles so backend isn't overwhelmed
        if i < cycles:
            time.sleep(2)

    total_time = time.time() - start_time
    print()
    print(f"  {bar(cycles, cycles)}  Complete!")
    print()
    print("=" * 62)
    print("  RESULTS")
    print("=" * 62)
    if f1_history:
        print(f"  Starting F1 : {f1_history[0]:.4f}")
        print(f"  Final F1    : {f1_history[-1]:.4f}")
        print(f"  Peak F1     : {max(f1_history):.4f}")
        delta = f1_history[-1] - f1_history[0]
        sign  = "+" if delta >= 0 else ""
        print(f"  Net change  : {sign}{delta*100:.2f}%")
        print(f"  Cycles run  : {len(f1_history)}")
        print(f"  Total data  : ~{cycles * entries_per_cycle} entries")
    print(f"  Total time  : {total_time:.0f} seconds")
    print()
    print("  The model is now pre-trained and ready to demo.")
    print("  Open the Control Panel and check the Overview tab")
    print("  to see the full F1 learning curve.")
    print("=" * 62)
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Pre-train the ScreenSense Random Forest for demo.")
    parser.add_argument("--cycles",  type=int, default=15,
                        help="Number of seed+retrain cycles (default 15)")
    parser.add_argument("--entries", type=int, default=200,
                        help="Entries seeded per cycle (default 200)")
    args = parser.parse_args()
    run(cycles=args.cycles, entries_per_cycle=args.entries)

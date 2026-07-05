"""Benchmark the native C++ packer against the pure-Python optimizer.

Run from the repo root after building the native module (native/build.sh):
    python3 examples/native_benchmark.py

If the native module is not built, it reports that and still runs the Python
path so the script never fails hard.
"""

from __future__ import annotations

import os
import random
import sys
import time

# Ensure the repo root is importable when run as `python3 examples/native_benchmark.py`.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from native import accelerator
from palletizer_full.optimizer import Box, Pallet, optimize_pallet


def make_boxes(n: int, seed: int = 7) -> list[Box]:
    rng = random.Random(seed)
    out = []
    for i in range(n):
        out.append(
            Box(
                sku_id=f"SKU{i}",
                length_mm=rng.choice([200, 300, 400, 600]),
                width_mm=rng.choice([150, 200, 300, 400]),
                height_mm=rng.choice([120, 150, 200]),
                weight_kg=rng.uniform(1, 8),
            )
        )
    return out


def _time(fn, iters: int = 5) -> float:
    t0 = time.perf_counter()
    for _ in range(iters):
        fn()
    return (time.perf_counter() - t0) / iters


def main() -> None:
    pallet = Pallet()
    print(f"native module available: {accelerator.available()}\n")
    for n in (50, 200, 800):
        boxes = make_boxes(n)
        t_py = _time(lambda b=boxes: optimize_pallet(b, pallet))
        t_nat = _time(lambda b=boxes: accelerator.fast_pack(b, pallet))
        speedup = t_py / t_nat if t_nat else float("nan")
        print(f"n={n:>4}  python={t_py*1000:7.2f}ms  native={t_nat*1000:7.2f}ms  speedup={speedup:5.1f}x")


if __name__ == "__main__":
    main()

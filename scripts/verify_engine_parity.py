#!/usr/bin/env python3
"""Verify the TypeScript engine port is identical to the Python core.

Usage (from repo root):
    cd web && npx tsx scripts/parity-dump.ts && cd ..
    python3 scripts/verify_engine_parity.py

Exits non-zero if any placement or metric differs. This is the guarantee
behind the website's claim that the browser demos run "the same algorithm as
the Python core" — if this script fails, that claim is false and the port
must be fixed before deploying.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from palletizer_full.optimizer import Box, optimize_pallet  # noqa: E402

METRIC_KEYS = [
    "num_layers", "stack_height_mm", "total_weight_kg", "volume_density",
    "baseline_density", "density_uplift_pct", "support_score", "com_score",
    "stability_score", "is_valid",
]


def main() -> int:
    dump = Path("/tmp/ts_plans.json")
    if not dump.exists():
        print("Run `npx tsx scripts/parity-dump.ts` in web/ first.", file=sys.stderr)
        return 2

    data = json.loads(dump.read_text())
    all_ok = True
    for name, d in data.items():
        boxes = []
        for line in d["csv"]:
            sku, l, w, h, kg = line.split(",")
            boxes.append(Box(sku, float(l), float(w), float(h), float(kg)))
        plan = optimize_pallet(boxes)

        py_pl = [[p.sku_id, p.x_mm, p.y_mm, p.z_mm, p.length_mm, p.width_mm, p.rot_deg, p.layer]
                 for p in plan.placements]
        ts_pl = [[a[0]] + [float(x) for x in a[1:]] for a in d["placements"]]
        py_pl = [[a[0]] + [float(x) for x in a[1:]] for a in py_pl]

        diffs = {
            k: (getattr(plan, k), d["metrics"][k])
            for k in METRIC_KEYS
            if abs(float(getattr(plan, k)) - float(d["metrics"][k])) > 1e-9
        }
        ok = py_pl == ts_pl and not diffs and plan.unplaced == d["metrics"]["unplaced"]
        all_ok &= ok
        status = "IDENTICAL" if ok else f"DIFF {diffs}"
        print(f"{name:12s} {len(py_pl):3d} boxes  {status}")

    print("PARITY:", "PASS" if all_ok else "FAIL")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

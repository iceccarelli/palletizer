"""Stress + invariant tests for the optional native C++ packer.

These guard the two promises the native path makes:
  1. It is safe: every placement stays inside the pallet, no same-layer
     footprint overlaps, deterministic output, sane edge-case handling.
  2. It is optional: if the compiled module is absent, the Python fallback
     still returns a valid result (the non-breaking guarantee).

Nothing here asserts the native packer is bit-identical to optimize_pallet —
it deliberately is not. It asserts the native output is *valid*, which is what
matters for an opt-in accelerator.
"""

from __future__ import annotations

import random
from collections import defaultdict

import pytest

from native import accelerator
from palletizer_full.optimizer import Box, Pallet

PALLET = Pallet()


def _boxes(n: int, seed: int) -> list[Box]:
    r = random.Random(seed)
    return [
        Box(
            sku_id=f"S{i}",
            length_mm=r.choice([200, 300, 400, 600]),
            width_mm=r.choice([150, 200, 300, 400]),
            height_mm=r.choice([120, 150, 200]),
            weight_kg=r.uniform(1, 8),
        )
        for i in range(n)
    ]


def _within_bounds(p: dict) -> bool:
    return (
        p["x_mm"] >= -1e-6
        and p["y_mm"] >= -1e-6
        and p["x_mm"] + p["length_mm"] <= PALLET.length_mm + 1e-6
        and p["y_mm"] + p["width_mm"] <= PALLET.width_mm + 1e-6
        and p["z_mm"] + p["height_mm"] <= PALLET.max_height_mm + 1e-6
    )


def _same_layer_overlaps(placements: list[dict]) -> int:
    layers: dict[int, list[dict]] = defaultdict(list)
    for p in placements:
        layers[p["layer"]].append(p)
    overlaps = 0
    for lp in layers.values():
        for i in range(len(lp)):
            for j in range(i + 1, len(lp)):
                a, c = lp[i], lp[j]
                ox = max(0.0, min(a["x_mm"] + a["length_mm"], c["x_mm"] + c["length_mm"]) - max(a["x_mm"], c["x_mm"]))
                oy = max(0.0, min(a["y_mm"] + a["width_mm"], c["y_mm"] + c["width_mm"]) - max(a["y_mm"], c["y_mm"]))
                if ox > 1e-6 and oy > 1e-6:
                    overlaps += 1
    return overlaps


@pytest.mark.parametrize("n", [1, 10, 50, 200, 800, 2000])
def test_native_placements_within_pallet(n: int) -> None:
    res = accelerator.fast_pack(_boxes(n, n), PALLET)
    assert all(_within_bounds(p) for p in res["placements"])


@pytest.mark.parametrize("n", [50, 200, 800])
def test_native_no_same_layer_overlap(n: int) -> None:
    res = accelerator.fast_pack(_boxes(n, n), PALLET)
    assert _same_layer_overlaps(res["placements"]) == 0


def test_native_is_deterministic() -> None:
    boxes = _boxes(300, 42)
    assert accelerator.fast_pack(boxes, PALLET) == accelerator.fast_pack(boxes, PALLET)


def test_native_stack_within_height() -> None:
    res = accelerator.fast_pack(_boxes(500, 3), PALLET)
    assert res["stack_height_mm"] <= PALLET.max_height_mm + 1e-6


def test_native_empty_input() -> None:
    res = accelerator.fast_pack([], PALLET)
    assert res["placements"] == []
    assert res["num_layers"] == 0


def test_native_oversized_box_is_unplaced() -> None:
    res = accelerator.fast_pack([Box("big", 5000, 5000, 150, 2)], PALLET)
    assert res["placements"] == []
    assert "big" in res["unplaced"]


def test_native_conserves_or_flags_every_sku() -> None:
    """Every input SKU is either placed or reported unplaced — nothing vanishes."""
    boxes = _boxes(400, 9)
    res = accelerator.fast_pack(boxes, PALLET)
    accounted = {p["sku_id"] for p in res["placements"]} | set(res["unplaced"])
    assert {b.sku_id for b in boxes} <= accounted


def test_fallback_returns_valid_plan_without_native(monkeypatch: pytest.MonkeyPatch) -> None:
    """Simulate the native module being unbuilt: fast_pack must still work."""
    monkeypatch.setattr(accelerator, "_NATIVE", None)
    monkeypatch.setattr(accelerator, "_LOAD_TRIED", True)
    # available() now reports False; fast_pack must fall through to Python.
    assert accelerator.available() is False
    res = accelerator.fast_pack(_boxes(60, 5), PALLET)
    assert res["placements"], "Python fallback returned no placements"
    assert all(_within_bounds(p) for p in res["placements"])

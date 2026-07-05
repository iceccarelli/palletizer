"""Optional native accelerator for palletising.

Loads the compiled C++ packer if it has been built (native/palletizer_native*.so)
and otherwise falls back to the pure-Python engine in palletizer_full.optimizer.
Nothing in the existing codebase depends on this module, so the parity-checked
Python path is unaffected whether or not the native module is present.

IMPORTANT (honesty note): the native packer is a *comparable-quality* fast
heuristic, NOT a bit-identical port of optimize_pallet. On mixed-SKU inputs it
can place a slightly different set of boxes. Use it where raw layer-packing
speed matters and a small quality delta is acceptable; keep production plans on
the parity-checked Python/TS path until (and unless) the native packer is made
bit-identical and added to verify_engine_parity.py.

Usage:
    from native import accelerator
    if accelerator.available():
        result = accelerator.fast_pack(boxes, pallet)   # dict of raw geometry
    else:
        plan = optimize_pallet(boxes, pallet)           # pure-Python fallback
"""

from __future__ import annotations

import importlib
import os
import sys
from typing import Any

from palletizer_full.optimizer import Box, Pallet, optimize_pallet

_NATIVE = None
_LOAD_TRIED = False


def _load() -> Any | None:
    global _NATIVE, _LOAD_TRIED
    if _LOAD_TRIED:
        return _NATIVE
    _LOAD_TRIED = True
    here = os.path.dirname(__file__)
    if here not in sys.path:
        sys.path.insert(0, here)
    try:
        _NATIVE = importlib.import_module("palletizer_native")
    except ImportError:
        _NATIVE = None
    return _NATIVE


def available() -> bool:
    """True if the compiled C++ module can be imported."""
    return _load() is not None


def fast_pack(boxes: list[Box], pallet: Pallet | None = None) -> dict:
    """Pack via the C++ module if available, else via the Python optimizer.

    Returns a dict of raw geometry (placements/unplaced/num_layers/...). When the
    native module is missing this delegates to optimize_pallet and returns its
    to_dict(), so callers get a consistent shape either way.
    """
    pallet = pallet or Pallet()
    nat = _load()
    if nat is None:
        return optimize_pallet(boxes, pallet).to_dict()
    dicts = [
        {
            "sku_id": b.sku_id,
            "length_mm": b.length_mm,
            "width_mm": b.width_mm,
            "height_mm": b.height_mm,
            "weight_kg": b.weight_kg,
        }
        for b in boxes
    ]
    return nat.pack(
        dicts,
        pallet.length_mm,
        pallet.width_mm,
        pallet.max_height_mm,
        pallet.max_weight_kg,
    )

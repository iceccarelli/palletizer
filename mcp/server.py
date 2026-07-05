"""Palletizer MCP server (stdio JSON-RPC 2.0).

Exposes the *existing* Python engine (palletizer_full.optimizer) to any
MCP-capable agent — Claude Desktop, an internal LangGraph agent, a WMS-side
orchestrator — without writing a bespoke REST integration per client. That is
the honest version of the "integrate any WMS fast" idea: the value is a single
typed tool surface that agents can discover and call, not magic that eliminates
all integration work.

What it is:
  * A minimal, dependency-free implementation of the MCP wire protocol
    (JSON-RPC 2.0 over stdio): initialize -> tools/list -> tools/call.
  * Three tools that call real code in this repo:
      - optimize_pallet     -> palletizer_full.optimizer.optimize_pallet
      - validate_stability  -> palletizer_full.optimizer._stability
      - ingest_wms_csv      -> heuristic CSV-header -> Box mapping
  * ingest_wms_csv does deterministic fuzzy header matching by default. If
    ANTHROPIC_API_KEY is set AND --llm is passed, it will additionally ask a
    model to resolve ambiguous headers. Without the key it never pretends to;
    it falls back to the deterministic mapper and says so in the response.

What it is NOT:
  * It does not claim to auto-integrate SAP/Blue Yonder/Manhattan in one day.
    It gives agents a clean, typed entry point; the integration work shrinks,
    it does not vanish.

Run:
    python3 -m mcp.server            # deterministic CSV mapping
    python3 -m mcp.server --llm      # also use an LLM for ambiguous headers

Then point an MCP client at this process's stdio. A smoke test that speaks the
protocol without a full client lives in examples/mcp_smoke.py.
"""

from __future__ import annotations

import csv
import io
import json
import os
import sys
from difflib import SequenceMatcher
from typing import Any

from palletizer_full.optimizer import (
    Box,
    Pallet,
    Placement,
    _stability,
    optimize_pallet,
)

PROTOCOL_VERSION = "2024-11-05"
SERVER_NAME = "palletizer"
SERVER_VERSION = "0.1.0"

# Canonical Box fields and the header aliases we recognise deterministically.
_FIELD_ALIASES: dict[str, list[str]] = {
    "sku_id": ["sku", "sku_id", "item", "item_id", "product", "product_id", "material", "article"],
    "length_mm": ["length", "length_mm", "len", "l", "long_mm", "depth", "depth_mm"],
    "width_mm": ["width", "width_mm", "wid", "w", "breadth"],
    "height_mm": ["height", "height_mm", "hgt", "h", "tall"],
    "weight_kg": ["weight", "weight_kg", "wt", "mass", "mass_kg", "kg"],
}


def _best_header(field: str, headers: list[str]) -> tuple[str | None, float]:
    """Return (matched_header, score) for a canonical field via fuzzy matching."""
    aliases = _FIELD_ALIASES[field]
    best_h, best_s = None, 0.0
    for h in headers:
        hl = h.strip().lower().replace(" ", "_")
        for alias in aliases:
            s = SequenceMatcher(None, hl, alias).ratio()
            if hl == alias:
                s = 1.0
            if s > best_s:
                best_s, best_h = s, h
    return best_h, best_s


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------
def _tool_optimize_pallet(args: dict[str, Any]) -> dict[str, Any]:
    boxes = [
        Box(
            sku_id=str(b["sku_id"]),
            length_mm=float(b["length_mm"]),
            width_mm=float(b["width_mm"]),
            height_mm=float(b["height_mm"]),
            weight_kg=float(b.get("weight_kg", 0.0)),
        )
        for b in args["boxes"]
    ]
    p = args.get("pallet") or {}
    pallet = Pallet(
        length_mm=float(p.get("length_mm", 1219.0)),
        width_mm=float(p.get("width_mm", 1016.0)),
        max_height_mm=float(p.get("max_height_mm", 1800.0)),
        max_weight_kg=float(p.get("max_weight_kg", 1000.0)),
    )
    return optimize_pallet(boxes, pallet).to_dict()


def _tool_validate_stability(args: dict[str, Any]) -> dict[str, Any]:
    placements = [
        Placement(
            sku_id=str(pl["sku_id"]),
            x_mm=float(pl["x_mm"]),
            y_mm=float(pl["y_mm"]),
            z_mm=float(pl["z_mm"]),
            length_mm=float(pl["length_mm"]),
            width_mm=float(pl["width_mm"]),
            height_mm=float(pl["height_mm"]),
            weight_kg=float(pl.get("weight_kg", 0.0)),
            rot_deg=float(pl.get("rot_deg", 0.0)),
            layer=int(pl.get("layer", 0)),
        )
        for pl in args["placements"]
    ]
    p = args.get("pallet") or {}
    pallet = Pallet(
        length_mm=float(p.get("length_mm", 1219.0)),
        width_mm=float(p.get("width_mm", 1016.0)),
    )
    support, com, overall = _stability(placements, pallet)
    return {"support_score": support, "com_score": com, "stability_score": overall}


def _tool_ingest_wms_csv(args: dict[str, Any], use_llm: bool) -> dict[str, Any]:
    text = args["csv_text"]
    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []

    # Deterministic mapping first.
    mapping: dict[str, str | None] = {}
    scores: dict[str, float] = {}
    for field in _FIELD_ALIASES:
        h, s = _best_header(field, headers)
        mapping[field] = h if s >= 0.6 else None
        scores[field] = round(s, 2)

    llm_used = False
    ambiguous = [f for f, s in scores.items() if s < 0.6 and f != "weight_kg"]
    if use_llm and ambiguous and os.environ.get("ANTHROPIC_API_KEY"):
        try:
            resolved = _llm_resolve_headers(headers, ambiguous)
            for f, h in resolved.items():
                if h in headers:
                    mapping[f] = h
            llm_used = True
        except Exception as exc:  # never let the LLM path break ingestion
            mapping.setdefault("_llm_error", None)
            scores["_llm_error"] = 0.0
            _log(f"llm header resolution failed: {exc}")

    boxes: list[dict[str, Any]] = []
    skipped = 0
    for row in reader:
        try:
            box = {
                "sku_id": row[mapping["sku_id"]] if mapping["sku_id"] else f"ROW{len(boxes)}",
                "length_mm": float(row[mapping["length_mm"]]),
                "width_mm": float(row[mapping["width_mm"]]),
                "height_mm": float(row[mapping["height_mm"]]),
                "weight_kg": float(row[mapping["weight_kg"]]) if mapping["weight_kg"] else 0.0,
            }
            boxes.append(box)
        except (KeyError, TypeError, ValueError):
            skipped += 1

    return {
        "boxes": boxes,
        "mapped_columns": {k: v for k, v in mapping.items() if not k.startswith("_")},
        "confidence": scores,
        "rows_skipped": skipped,
        "llm_used": llm_used,
        "note": (
            "Deterministic header matching. Set ANTHROPIC_API_KEY and start the "
            "server with --llm to resolve ambiguous headers with a model."
        ),
    }


def _llm_resolve_headers(headers: list[str], fields: list[str]) -> dict[str, str]:
    """Optional: ask a model to map ambiguous canonical fields to CSV headers.

    Only reached when ANTHROPIC_API_KEY is present and --llm is set. Returns a
    {field: header} dict. Kept small and defensive; failures fall back upstream.
    """
    import urllib.request

    prompt = (
        "Map each target field to the single best-matching CSV column header. "
        "Respond ONLY with a JSON object {field: header}. "
        f"Headers: {headers}. Target fields: {fields}."
    )
    body = json.dumps(
        {
            "model": "claude-sonnet-4-6",
            "max_tokens": 300,
            "messages": [{"role": "user", "content": prompt}],
        }
    ).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "content-type": "application/json",
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    text = "".join(part.get("text", "") for part in data.get("content", []))
    text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(text)


# ---------------------------------------------------------------------------
# Tool registry + JSON schemas (what agents discover via tools/list)
# ---------------------------------------------------------------------------
_BOX_SCHEMA = {
    "type": "object",
    "properties": {
        "sku_id": {"type": "string"},
        "length_mm": {"type": "number"},
        "width_mm": {"type": "number"},
        "height_mm": {"type": "number"},
        "weight_kg": {"type": "number"},
    },
    "required": ["sku_id", "length_mm", "width_mm", "height_mm"],
}

TOOLS = [
    {
        "name": "optimize_pallet",
        "description": "Compute a physics-validated pallet plan for a set of boxes. "
        "Returns placements, density uplift vs baseline, and stability scores.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "boxes": {"type": "array", "items": _BOX_SCHEMA},
                "pallet": {"type": "object"},
            },
            "required": ["boxes"],
        },
    },
    {
        "name": "validate_stability",
        "description": "Score the support and centre-of-mass stability of an existing set of placements.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "placements": {"type": "array", "items": {"type": "object"}},
                "pallet": {"type": "object"},
            },
            "required": ["placements"],
        },
    },
    {
        "name": "ingest_wms_csv",
        "description": "Map an arbitrary WMS CSV export onto the canonical Box schema by "
        "fuzzy header matching (optionally LLM-assisted). Returns boxes ready for optimize_pallet.",
        "inputSchema": {
            "type": "object",
            "properties": {"csv_text": {"type": "string"}},
            "required": ["csv_text"],
        },
    },
]


# ---------------------------------------------------------------------------
# JSON-RPC / MCP plumbing
# ---------------------------------------------------------------------------
def _log(msg: str) -> None:
    print(f"[palletizer-mcp] {msg}", file=sys.stderr, flush=True)


def _dispatch(method: str, params: dict[str, Any], use_llm: bool) -> Any:
    if method == "initialize":
        return {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
        }
    if method == "tools/list":
        return {"tools": TOOLS}
    if method == "tools/call":
        name = params["name"]
        args = params.get("arguments", {})
        if name == "optimize_pallet":
            result = _tool_optimize_pallet(args)
        elif name == "validate_stability":
            result = _tool_validate_stability(args)
        elif name == "ingest_wms_csv":
            result = _tool_ingest_wms_csv(args, use_llm)
        else:
            raise ValueError(f"unknown tool: {name}")
        return {"content": [{"type": "text", "text": json.dumps(result)}], "isError": False}
    raise ValueError(f"unknown method: {method}")


def serve(use_llm: bool = False) -> None:
    """Read newline-delimited JSON-RPC requests from stdin, write replies to stdout."""
    _log(f"ready (llm={'on' if use_llm else 'off'})")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
        req_id = req.get("id")
        method = req.get("method", "")
        params = req.get("params", {}) or {}
        # Notifications (no id) get no response.
        if req_id is None and method.startswith("notifications/"):
            continue
        try:
            result = _dispatch(method, params, use_llm)
            resp = {"jsonrpc": "2.0", "id": req_id, "result": result}
        except Exception as exc:
            resp = {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32000, "message": str(exc)}}
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


def main() -> None:
    use_llm = "--llm" in sys.argv
    serve(use_llm=use_llm)


if __name__ == "__main__":
    main()

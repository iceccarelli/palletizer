"""Protocol + robustness stress tests for the MCP server.

Exercises the JSON-RPC surface directly via _dispatch (fast, in-process) plus
one real stdio subprocess round-trip, and hammers the error paths: unknown
method, unknown tool, malformed arguments, messy/empty CSV. The server must
answer every case with a structured result or a JSON-RPC error and never raise
out to the caller.
"""

from __future__ import annotations

import json
import subprocess
import sys

import pytest

from mcp.server import _dispatch

MESSY_CSV = "Article,Long (mm),Breadth,Tall,Mass_kg\nA-1,300,200,150,4.2\nA-2,400,300,150,6.1\n"


def _call(tool: str, args: dict) -> dict:
    resp = _dispatch("tools/call", {"name": tool, "arguments": args}, use_llm=False)
    return json.loads(resp["content"][0]["text"])


def test_initialize_handshake() -> None:
    res = _dispatch("initialize", {}, use_llm=False)
    assert res["protocolVersion"]
    assert res["serverInfo"]["name"] == "palletizer"


def test_tools_list_is_stable() -> None:
    tools = _dispatch("tools/list", {}, use_llm=False)["tools"]
    assert [t["name"] for t in tools] == ["optimize_pallet", "validate_stability", "ingest_wms_csv"]
    for t in tools:  # every tool advertises a schema
        assert t["inputSchema"]["type"] == "object"


def test_unknown_method_raises() -> None:
    with pytest.raises(ValueError):
        _dispatch("does/not/exist", {}, use_llm=False)


def test_unknown_tool_raises() -> None:
    with pytest.raises(ValueError):
        _dispatch("tools/call", {"name": "nope", "arguments": {}}, use_llm=False)


def test_ingest_maps_messy_headers() -> None:
    out = _call("ingest_wms_csv", {"csv_text": MESSY_CSV})
    assert out["mapped_columns"]["sku_id"] == "Article"
    assert out["mapped_columns"]["length_mm"] == "Long (mm)"
    assert len(out["boxes"]) == 2
    assert out["llm_used"] is False


def test_ingest_empty_csv_does_not_crash() -> None:
    out = _call("ingest_wms_csv", {"csv_text": ""})
    assert out["boxes"] == []


def test_ingest_garbage_rows_are_skipped_not_fatal() -> None:
    csv = "sku,length_mm,width_mm,height_mm\nOK,300,200,150\nBAD,notanumber,200,150\n"
    out = _call("ingest_wms_csv", {"csv_text": csv})
    assert len(out["boxes"]) == 1
    assert out["rows_skipped"] == 1


def test_ingest_then_optimize_pipeline() -> None:
    ingested = _call("ingest_wms_csv", {"csv_text": MESSY_CSV})
    plan = _call("optimize_pallet", {"boxes": ingested["boxes"]})
    assert plan["placements"]
    assert 0.0 <= plan["stability_score"] <= 1.0


def test_optimize_missing_required_field_errors_cleanly() -> None:
    # A box missing length_mm should surface as a JSON-RPC error, not a hang.
    resp = _dispatch("initialize", {}, use_llm=False)  # sanity
    assert resp
    with pytest.raises((KeyError, ValueError, TypeError)):
        _call("optimize_pallet", {"boxes": [{"sku_id": "x", "width_mm": 1, "height_mm": 1}]})


def test_stdio_roundtrip_end_to_end() -> None:
    """One real subprocess round-trip over stdio to prove the wire protocol."""
    proc = subprocess.Popen(
        [sys.executable, "-m", "mcp.server"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        assert proc.stdin and proc.stdout
        proc.stdin.write(json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}) + "\n")
        proc.stdin.flush()
        reply = json.loads(proc.stdout.readline())
        assert reply["id"] == 1
        assert reply["result"]["serverInfo"]["name"] == "palletizer"

        # Malformed JSON on the wire must not kill the server; next request still answered.
        proc.stdin.write("this is not json\n")
        proc.stdin.flush()
        proc.stdin.write(json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}) + "\n")
        proc.stdin.flush()
        reply2 = json.loads(proc.stdout.readline())
        assert reply2["id"] == 2
        assert len(reply2["result"]["tools"]) == 3
    finally:
        proc.terminate()

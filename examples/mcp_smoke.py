"""Smoke test for the Palletizer MCP server.

Spawns `python3 -m mcp.server`, performs the initialize handshake, lists tools,
and calls each one with real data — proving the server speaks MCP end to end
without needing a full MCP client installed.

Run from the repo root:
    python3 examples/mcp_smoke.py
"""

from __future__ import annotations

import json
import subprocess
import sys

MESSY_CSV = """Article,Long (mm),Breadth,Tall,Mass_kg
A-100,300,200,150,4.2
A-101,400,300,150,6.1
A-102,200,200,120,2.0
"""


def _rpc(proc: subprocess.Popen, msg: dict) -> dict:
    proc.stdin.write(json.dumps(msg) + "\n")
    proc.stdin.flush()
    line = proc.stdout.readline()
    return json.loads(line)


def main() -> int:
    proc = subprocess.Popen(
        [sys.executable, "-m", "mcp.server"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    assert proc.stdin and proc.stdout
    ok = True
    try:
        init = _rpc(proc, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
        print("initialize ->", init["result"]["serverInfo"])

        tools = _rpc(proc, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
        names = [t["name"] for t in tools["result"]["tools"]]
        print("tools/list ->", names)
        assert names == ["optimize_pallet", "validate_stability", "ingest_wms_csv"]

        # 1) Ingest a deliberately messy CSV (non-standard headers).
        ingest = _rpc(
            proc,
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "ingest_wms_csv", "arguments": {"csv_text": MESSY_CSV}},
            },
        )
        ingest_payload = json.loads(ingest["result"]["content"][0]["text"])
        print("ingest_wms_csv -> mapped", ingest_payload["mapped_columns"])
        assert len(ingest_payload["boxes"]) == 3, "expected 3 boxes from messy CSV"

        # 2) Feed those boxes straight into optimize_pallet.
        opt = _rpc(
            proc,
            {
                "jsonrpc": "2.0",
                "id": 4,
                "method": "tools/call",
                "params": {
                    "name": "optimize_pallet",
                    "arguments": {"boxes": ingest_payload["boxes"]},
                },
            },
        )
        plan = json.loads(opt["result"]["content"][0]["text"])
        print(
            f"optimize_pallet -> placed={len(plan['placements'])} "
            f"density_uplift={plan['density_uplift_pct']:.1f}% "
            f"stability={plan['stability_score']:.2f} valid={plan['is_valid']}"
        )
        assert plan["placements"], "optimizer returned no placements"

        # 3) Validate stability of the returned placements.
        stab = _rpc(
            proc,
            {
                "jsonrpc": "2.0",
                "id": 5,
                "method": "tools/call",
                "params": {
                    "name": "validate_stability",
                    "arguments": {"placements": plan["placements"]},
                },
            },
        )
        scores = json.loads(stab["result"]["content"][0]["text"])
        print("validate_stability ->", {k: round(v, 3) for k, v in scores.items()})

        print("\nMCP SMOKE: PASS")
    except Exception as exc:
        ok = False
        print("MCP SMOKE: FAIL ->", exc)
        print(proc.stderr.read())
    finally:
        proc.terminate()
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

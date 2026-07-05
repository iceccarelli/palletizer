# Palletizer MCP layer

A minimal, dependency-free [Model Context Protocol](https://modelcontextprotocol.io)
server that exposes the existing Python engine to MCP-capable agents (Claude
Desktop, an internal LangGraph/crewAI agent, a WMS-side orchestrator) over a
single typed tool surface, instead of a bespoke REST integration per client.

## What it does (and doesn't)

It gives agents three discoverable tools that call **real code in this repo**:

| Tool | Backed by |
|------|-----------|
| `optimize_pallet` | `palletizer_full.optimizer.optimize_pallet` |
| `validate_stability` | `palletizer_full.optimizer._stability` |
| `ingest_wms_csv` | fuzzy header → `Box` mapping (optional LLM assist) |

It does **not** auto-integrate SAP / Blue Yonder / Manhattan in a day. The honest
value is smaller: a stable, typed entry point an agent can discover and call, so
the per-client integration shrinks to schema mapping rather than custom
middleware. `ingest_wms_csv` maps messy CSV headers deterministically; with
`ANTHROPIC_API_KEY` set and `--llm` passed, it also asks a model to resolve
ambiguous headers. Without the key it never pretends to — it falls back and says so.

## Run it

```bash
# from the repo root
python3 -m mcp.server          # deterministic header mapping
python3 -m mcp.server --llm    # also use an LLM for ambiguous headers (needs ANTHROPIC_API_KEY)
```

Verify end-to-end without a full MCP client:

```bash
python3 examples/mcp_smoke.py
```

Expected: initialize handshake, three tools listed, a messy CSV mapped to the
canonical schema, a plan computed, and stability scored — ending in `MCP SMOKE: PASS`.

## Wire to Claude Desktop (optional)

Add to your MCP client config (adjust the path):

```json
{
  "mcpServers": {
    "palletizer": {
      "command": "python3",
      "args": ["-m", "mcp.server"],
      "cwd": "/absolute/path/to/palletizer"
    }
  }
}
```

## Where this goes next

- Move the paid, hardened multi-agent orchestration (dynamic replanning,
  execution watchdog, certified connectors) into `enterprise/` behind the same
  tool interface — the open-core server stays the honest baseline.
- Add per-tool auth + rate limiting before any server is exposed beyond stdio.

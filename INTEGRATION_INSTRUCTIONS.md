# Integration instructions — native C++ packer + MCP layer

This drop is **additive only**. It adds two new top-level directories (`native/`,
`mcp/`), two example scripts, and makes two one-line edits to existing files
(`pyproject.toml` packages list, `.gitignore`). It touches **no** existing
Python/TS logic, so `verify_engine_parity.py`, the demos, Docker, and every
current test behave exactly as before.

Two ways to apply it. Use the patch (preferred — matches your existing
`*.patch` workflow); the ZIP is a fallback.

## Option A — apply the patch (recommended)

```bash
# from repo root, on a clean main
git checkout -b feat/native-mcp
git am < palletizer-native-mcp.patch      # or: git apply palletizer-native-mcp.patch
```

If `git am` complains, `git apply --3way palletizer-native-mcp.patch` is the
fallback. Then commit if you used plain `apply`.

## Option B — unzip the new files

```bash
# from repo root
unzip palletizer-native-mcp.zip -d .      # writes native/ mcp/ examples/*.py INTEGRATION_INSTRUCTIONS.md
# then re-apply the two existing-file edits by hand, or just:
git add native mcp examples/mcp_smoke.py examples/native_benchmark.py INTEGRATION_INSTRUCTIONS.md
```

The ZIP does **not** overwrite `pyproject.toml` or `.gitignore` — apply those
two edits yourself (add `"mcp*", "native*"` to `[tool.setuptools.packages.find]`
include; add `native/*.so` to `.gitignore`).

## Build + verify the MCP layer (no build step needed)

```bash
python3 -m mcp.server            # starts the stdio server (Ctrl-C to stop)
python3 examples/mcp_smoke.py    # end-to-end: initialize -> tools -> messy CSV -> plan -> stability
```

Expected last line: `MCP SMOKE: PASS`. With `ANTHROPIC_API_KEY` exported you can
run `python3 -m mcp.server --llm` to enable LLM-assisted header resolution for
ambiguous WMS CSVs.

## Build + verify the native C++ packer

```bash
pip install pybind11
./native/build.sh                          # no cmake needed; or: cmake -S native -B native/build && cmake --build native/build
python3 -c "from native import accelerator; print('native available:', accelerator.available())"
python3 examples/native_benchmark.py       # prints python vs native timings + speedup
```

Expected: `native available: True` and roughly 5–7× faster than the Python path
on 50–800 mixed boxes (your numbers vary by machine).

## Confirm nothing else broke

```bash
python3 scripts/verify_engine_parity.py    # unchanged — still passes
python3 -m pytest -q                        # existing suite, unchanged
ruff check mcp native examples/mcp_smoke.py examples/native_benchmark.py
```

## What this is and isn't (read before you demo it)

- The **native packer is a heuristic, not a MILP solver**, and is **not
  bit-identical** to `palletizer_full/optimizer.py`. It's an opt-in fast path,
  not a replacement for the parity-checked engine. Don't route production plans
  through it until it's made bit-identical and added to `verify_engine_parity.py`.
- The **MCP server is a real typed tool surface** over your existing engine. It
  shrinks per-client WMS integration to schema mapping; it does not make
  SAP/Blue Yonder integration disappear. `ingest_wms_csv` maps headers
  deterministically and only uses an LLM when you explicitly enable it.

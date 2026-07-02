# Demo Rebuild — Interactive Suite

Six interactive demos at `/demos`, a rebuilt `/demo`, three API routes, and a
FastAPI bridge. One rule governed every decision: **nothing on the website
claims a capability the code doesn't have.**

## The core move: the browser runs the real algorithm

`web/lib/palletizer/optimizer.ts` is a **function-for-function TypeScript port
of `palletizer_full/optimizer.py`** — same shelf packer, same baseline, same
stability model (0.6·support + 0.4·CoM). Verified bit-identical:

```bash
cd web && npx tsx scripts/parity-dump.ts && cd ..
python3 scripts/verify_engine_parity.py
# beverage  5 boxes  IDENTICAL
# pharma   10 boxes  IDENTICAL
# ecomm36  36 boxes  IDENTICAL
# PARITY: PASS
```

This replaces the previous `/demo` frontend "optimizer", which **simulated**
results (`stability_score: 0.78 + density * 0.2`) under a "no hardcoded
patterns" banner. That is exactly the kind of overclaim that kills trust with
a plant manager. It's gone. Every number rendered anywhere is now derived from
computed geometry.

## Running locally

```bash
cd web
npm install
npm run dev          # http://localhost:3000/demos
```

Optional Python backend as source of truth (same endpoint contract):

```bash
pip install fastapi uvicorn
uvicorn gateway.demo_api:app --port 8100
echo 'PALLETIZER_BACKEND_URL=http://localhost:8100' >> web/.env.local
```

Optional LLM Co-Pilot path:

```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> web/.env.local   # server-side only, never shipped to the client
# optional: COPILOT_MODEL=claude-haiku-4-5
```

## The six demos (`/demos`)

| Demo | What it proves |
|---|---|
| **Production Interactive** | CSV → real plan. Drag any box: it settles onto the highest supporting surface and the load is re-scored live with the optimizer's own math. Per-box color = its actual support ratio. "Auto-fix worst box" is a support-ratio search, and the toast tells you so. |
| **High-Mix E-comm** | 36 seeded chaotic SKUs (reproducible — no cherry-picked screenshots). High-velocity toggle runs *both* plans and shows the measured density-vs-cycle delta. Cycle model is stated: 7.5 s/pick + 1.8 s per 90° rotation. |
| **Stress Test & Recovery** | Perturb a pharma load (heavy tote to top, shift off-center), watch the deterministic score fail, then verify with a **Rapier rigid-body drop test** (real masses, g = 9.81) reporting measured max displacement. Recover with `heavy_low + fragile_high` constraints; before/after table. |
| **Multi-Pallet What-If** | The A/B split *is* the optimizer's overflow logic. Move a box between pallets; both re-optimize and re-validate instantly. |
| **Robot Execution** | Animated pick-and-place sequence. Pause, drag a placed box, export URScript for just the remaining picks — closed-loop editing mid-run. |
| **Digital Twin + Co-Pilot** | Live SKU weight/fragility sliders re-plan instantly. NL chat with an explicit two-path toggle (below). |

All six share the metrics row, Plan JSON + URScript exports (URScript output
is byte-identical to the previous format), validation banner, and pilot CTA
pre-filled with plan id + metrics.

## Co-Pilot: the honest hybrid ML architecture

Both paths translate a sentence into the **same strict constraint schema**,
then re-run the **same deterministic optimizer**. The parser only ever selects
constraints — it never places boxes and never produces metrics.

- **Client path** (`web/lib/palletizer/copilot.ts`): deterministic rule
  parser. Instant, offline, labelled "CLIENT • DETERMINISTIC PARSER" in the UI.
- **Backend path** (`/api/adapt-plan`): with `ANTHROPIC_API_KEY` set, an LLM
  parses into the same schema (sanitized/clamped server-side), responds with
  `parser: "llm"`. Without the key it falls back to the rule parser and the UI
  says so.

### What was deliberately NOT shipped (and why)

The original brief asked for an ONNX model via `onnxruntime-web` and an
in-browser WebLLM. **There is no trained model in this repo.** Shipping a stub
that pretends to be learned inference is a fabricated capability — the exact
thing a skeptical integrator will probe and the exact thing this codebase's
own docstrings promise not to do ("Nothing here is random or hardcoded").

The honest production path, when there is training data from real cells:
1. Train a placement-suggestion / learned-stability model in Python against
   logged plans + outcomes.
2. Export to ONNX; load in `onnxruntime-web` behind the same
   `StabilityValidation` interface (the seam already exists in
   `lib/palletizer/stability.ts`).
3. Until then, the deterministic engine *is* the product, and it is strong
   enough to sell on its own: identical math in browser and robot cell is a
   better pitch than a toy neural net.

## API contract (Next routes ↔ FastAPI bridge)

- `POST /api/optimize` — `{skus, constraints?, pallet?}` → `{plan}`. Proxies to
  `PALLETIZER_BACKEND_URL/optimize` when set (`engine: "python-core"`),
  otherwise runs the TS engine (`engine: "ts-port"`). Identical results either way.
- `POST /api/validate-stability` — `{placements, pallet?}` → per-box support
  ratios, CoM, warnings, suggestions. Same proxy behaviour.
- `POST /api/adapt-plan` — `{prompt, skus, current_constraints?}` →
  `{plan, constraints, explanation, parser}`.

`gateway/demo_api.py` mirrors the constraint extensions
(`heavy_low`, `fragile_high`, `speed_mode`, height/weight caps) on the Python
side so both engines stay in lockstep. `scripts/verify_engine_parity.py` is
the tripwire: if it fails, the "same algorithm" claim on the website is false
and must not deploy.

## Performance & bundle

- `/demos` first load: **122 kB** — all 3D is `next/dynamic` with `ssr: false`.
- Rapier WASM loads only when the user actually runs the gravity settle.
- Drag validation is throttled to ~16 Hz; the geometric check is < 0.1 ms for
  100 boxes, so interaction stays at 60 fps.
- Labels render only on hover/selection above 16 boxes (drei `Html` is the
  expensive part, not the meshes).

## Known limitations (say these out loud in sales calls, they build trust)

- The stability model is support-ratio + CoM; it does not model crush
  strength, pallet flex, or dynamic transport loads. The Rapier settle is a
  static drop test, not a transport simulation.
- `speed_mode`'s cycle estimate uses fixed per-pick constants; real cycle
  times come from the robot's own motion planner.
- Multi-pallet "Optimize All" is greedy overflow, not a global bin-packing
  solve (the core's docstring already flags CP-SAT/MILP as the v2 swap-in).

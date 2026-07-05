# Construction Vertical + ROS 2 / LiDAR Reference — Integration Notes

This adds a construction-materials vertical to the existing Palletizer repo: a
domain optimizer, a browser demo, four new website routes, ROS 2 + LiDAR
reference code, and packaging/tests. It is **strictly additive** — no existing
core module is rewritten, and the existing website, demos, API and Vercel deploy
are untouched.

It is delivered as a single `git am`-able patch. If you're reading this, the
patch has already been applied.

## What this is (and isn't)

- **Is:** an open, early-stage extension. A working browser planner, a Python
  reference optimizer, honest pre-launch copy, and ROS 2 / LiDAR example code.
- **Isn't:** a certified, deployed, or revenue-generating product. There are no
  customers, no measured ROI, and no validated safety system here. The website
  copy and code comments say so plainly. Please keep it that way — if you later
  add real numbers, cite where they came from.

## Applying it

```bash
# from the repo root, on a clean working tree
git am < 0001-construction-vertical-ros2-lidar-reference.patch
```

If `git am` reports a conflict (e.g. your `pyproject.toml` or `Navbar.tsx` has
diverged), either resolve the conflict and `git am --continue`, or fall back to
copying the files from the `payload/` directory in the delivery zip and
re-applying the two small edits by hand (see the zip's `README`).

## Verify (what was run before shipping)

```bash
# Python: install the construction extra and run the suite
pip install -e ".[construction]" --break-system-packages
pytest tests/ -q                 # 75 passed (70 existing + 5 new)
palletize-construction --demo-drywall

# Web: the production build must be green (this is what Vercel runs)
cd web && npm install && npm run build
```

The build was verified green with the new routes prerendered:
`/construction`, `/hardware`, `/integrations`, `/about`.

## What was added

**Python**
- `construction/` — `ConstructionPalletOptimizer`, construction SKU library
  (drywall, plywood, lumber bundles, cement/grout bags, paint, LVT), and
  domain stability constraints. Imports cleanly (the original delivery had two
  circular imports; fixed).
- `ros2_integration/` — ROS 2 node, LiDAR perception, and vendor-neutral bridge
  examples. **Imports without ROS 2 installed** (rclpy-dependent classes load
  lazily); accessing them without rclpy raises a clear error.
- `tests/test_construction.py` — 5 tests covering imports, SKU library, plan
  consistency, JSON export, and ROS-free import.
- `examples/construction/basic_construction_palletise.py`.

**Packaging (`pyproject.toml`, setuptools — this repo does not use poetry)**
- `construction` and `ros2_integration` added to the packages find-include.
- New pip-installable extra: `construction = ["numpy>=1.24", "scipy>=1.10"]`.
- New console script: `palletize-construction`.
- ROS 2 / LiDAR deps (`rclpy`, `sensor-msgs`, `open3d`) are intentionally **not**
  pip extras — they belong in a ROS 2 workspace, not `pip install`.

**Website (new routes only; the global `Navbar`/`Footer` from `layout.tsx` are
reused — the new pages do not ship their own nav/footer)**
- `/construction` — interactive browser planner (real TypeScript engine, not a
  fake timeout) plus honest market context.
- `/hardware` — vendor-neutral arm/sensor/tooling reference, framed as
  recommendations.
- `/integrations` — ROS 2 + LiDAR technical notes and illustrative usage.
- `/about` — open-source, early-stage, pre-revenue positioning.
- `web/lib/construction-optimizer.ts` — the browser planner engine.
- `web/components/Navbar.tsx` — one added "Industries" menu so the routes are
  reachable.

## The honest part

The optimizer is a greedy layered heuristic. On a 1200×1000 pallet, a 4×8 sheet
overhangs and stacks roughly one-per-layer, and the reported stability/cycle
numbers are illustrative, not measured. That's fine for a demo and a foundation
— it is labeled as such throughout. The most valuable next step is not another
page or feature; it's one real conversation with a construction-products line or
prefab yard willing to pilot.

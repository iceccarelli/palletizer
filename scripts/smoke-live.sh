#!/usr/bin/env bash
# Live smoke tests for palletizer-app.vercel.app (or any deploy).
# Usage:  ./scripts/smoke-live.sh [base_url]
# Every check hits the REAL production site — no mocks. Exit code 0 = all pass.

set -u
BASE="${1:-https://palletizer-app.vercel.app}"
PASS=0; FAIL=0

ok()   { PASS=$((PASS+1)); printf "  \033[32mPASS\033[0m  %s\n" "$1"; }
bad()  { FAIL=$((FAIL+1)); printf "  \033[31mFAIL\033[0m  %s\n" "$1"; }
check() { # check <description> <expected> <actual>
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected '$2', got '$3')"; fi
}

echo "== Pages render (HTTP 200 + content marker) — $BASE"
for route_marker in "/demos|Prove it to yourself" "/demo|Live Pallet Optimizer" "/|Palletizer" "/pricing|Pricing" "/contact|"; do
  route="${route_marker%%|*}"; marker="${route_marker#*|}"
  code=$(curl -s -o /tmp/page.html -w "%{http_code}" "$BASE$route")
  check "GET $route → 200" "200" "$code"
  if [ -n "$marker" ]; then
    hits=$(grep -c "$marker" /tmp/page.html || true)
    [ "$hits" -ge 1 ] && ok "GET $route contains '$marker'" || bad "GET $route missing '$marker'"
  fi
done

echo "== /api/optimize — happy path returns a computed plan"
RESP=$(curl -s -X POST "$BASE/api/optimize" -H 'Content-Type: application/json' \
  -d '{"skus":[{"sku_id":"A1","length_mm":300,"width_mm":300,"height_mm":200,"weight_kg":4},{"sku_id":"A2","length_mm":400,"width_mm":300,"height_mm":220,"weight_kg":14}]}')
python3 - "$RESP" <<'PY' && ok "optimize: valid plan JSON with geometry-derived metrics" || bad "optimize: bad response"
import json, sys
p = json.loads(sys.argv[1])["plan"]
m = p["metrics"]
assert p["engine"] in ("ts-port", "python-core")
assert m["num_boxes"] == 2 and len(p["boxes"]) == 2
assert 0 < m["volume_density"] <= 1 and 0 <= m["stability_score"] <= 1
assert m["stack_height_mm"] > 0 and m["est_robot_cycle_s"] > 0
# metric must be consistent with its own boxes — recompute stack height
top = max(b["z_mm"] + b["height_mm"] for b in p["boxes"])
assert abs(top - m["stack_height_mm"]) < 1, "stack height inconsistent with placements"
PY

echo "== /api/optimize — determinism (same input ⇒ identical placements)"
R1=$(curl -s -X POST "$BASE/api/optimize" -H 'Content-Type: application/json' -d '{"skus":[{"sku_id":"D","length_mm":350,"width_mm":250,"height_mm":180,"weight_kg":6}]}' | python3 -c "import sys,json;p=json.load(sys.stdin)['plan'];print(json.dumps([[b['x_mm'],b['y_mm'],b['z_mm'],b['rot_deg']] for b in p['boxes']]))")
R2=$(curl -s -X POST "$BASE/api/optimize" -H 'Content-Type: application/json' -d '{"skus":[{"sku_id":"D","length_mm":350,"width_mm":250,"height_mm":180,"weight_kg":6}]}' | python3 -c "import sys,json;p=json.load(sys.stdin)['plan'];print(json.dumps([[b['x_mm'],b['y_mm'],b['z_mm'],b['rot_deg']] for b in p['boxes']]))")
check "optimize: deterministic placements" "$R1" "$R2"

echo "== /api/optimize — constraints actually change the plan"
TOP_FRAGILE=$(curl -s -X POST "$BASE/api/optimize" -H 'Content-Type: application/json' \
  -d '{"skus":[{"sku_id":"GLASS","length_mm":300,"width_mm":240,"height_mm":180,"weight_kg":4,"fragility":0.9},{"sku_id":"BRICK","length_mm":400,"width_mm":300,"height_mm":220,"weight_kg":18,"fragility":0.1},{"sku_id":"BRICK2","length_mm":420,"width_mm":320,"height_mm":240,"weight_kg":16,"fragility":0.1}],"constraints":{"fragile_high":true,"heavy_low":true}}' \
  | python3 -c "import sys,json;bs=json.load(sys.stdin)['plan']['boxes'];print(max(bs,key=lambda b:b['z_mm'])['sku_id'])")
check "fragile_high puts GLASS on top" "GLASS" "$TOP_FRAGILE"

echo "== /api/optimize — input validation (error paths)"
check "empty skus → 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/optimize" -H 'Content-Type: application/json' -d '{"skus":[]}')"
check "malformed JSON → 400" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/optimize" -H 'Content-Type: application/json' -d 'not json')"
check ">500 skus → 400" "400" "$(python3 -c "import json;print(json.dumps({'skus':[{'sku_id':f'S{i}','length_mm':200,'width_mm':200,'height_mm':200,'weight_kg':1} for i in range(501)]}))" | curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/optimize" -H 'Content-Type: application/json' -d @-)"

echo "== /api/validate-stability — catches a floating box"
FLOAT=$(curl -s -X POST "$BASE/api/validate-stability" -H 'Content-Type: application/json' \
  -d '{"placements":[{"sku_id":"GROUND","x_mm":0,"y_mm":0,"z_mm":0,"length_mm":400,"width_mm":300,"height_mm":200,"weight_kg":10,"rot_deg":0,"layer":0},{"sku_id":"FLOATER","x_mm":800,"y_mm":700,"z_mm":600,"length_mm":300,"width_mm":300,"height_mm":200,"weight_kg":8,"rot_deg":0,"layer":1}]}')
python3 - "$FLOAT" <<'PY' && ok "validate-stability: floater flagged critical, load unstable" || bad "validate-stability: floater NOT caught"
import json, sys
v = json.loads(sys.argv[1])["validation"]
assert v["is_stable"] is False
f = next(b for b in v["per_box"] if b["sku_id"] == "FLOATER")
assert f["status"] == "critical" and f["support_ratio"] == 0
PY

echo "== /api/adapt-plan — NL sentence → constraints → re-plan"
ADAPT=$(curl -s -X POST "$BASE/api/adapt-plan" -H 'Content-Type: application/json' \
  -d '{"prompt":"keep the glass on top and nothing taller than 1200mm","skus":[{"sku_id":"SKU001","length_mm":300,"width_mm":300,"height_mm":200,"weight_kg":4,"fragility":0.9},{"sku_id":"SKU002","length_mm":400,"width_mm":300,"height_mm":220,"weight_kg":14,"fragility":0.1}]}')
python3 - "$ADAPT" <<'PY' && ok "adapt-plan: parsed fragile_high + max_height, labeled parser, plan respects cap" || bad "adapt-plan: parse/replan failed"
import json, sys
d = json.loads(sys.argv[1])
assert d["parser"] in ("llm", "deterministic-rules")
c = d["constraints"]
assert c.get("fragile_high") is True and c.get("max_height_mm") == 1200
assert d["plan"]["metrics"]["stack_height_mm"] <= 1200
PY

echo "== Latency sanity (server-side engine)"
T=$(curl -s -o /dev/null -w "%{time_total}" -X POST "$BASE/api/optimize" -H 'Content-Type: application/json' -d '{"skus":[{"sku_id":"T","length_mm":300,"width_mm":300,"height_mm":200,"weight_kg":4}]}')
python3 -c "import sys; t=float('$T'); sys.exit(0 if t < 3.0 else 1)" && ok "optimize round-trip ${T}s (< 3s)" || bad "optimize slow: ${T}s"

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

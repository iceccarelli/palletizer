"""Tests for the real pallet optimizer: metrics must be computed, not faked."""
from palletizer_full.optimizer import Box, Pallet, load_boxes_csv, optimize_pallet

SAMPLE = [
    Box("A", 400, 300, 250, 8.5), Box("A", 400, 300, 250, 8.5),
    Box("A", 400, 300, 250, 8.5), Box("B", 600, 400, 300, 15.0),
    Box("B", 600, 400, 300, 15.0), Box("C", 300, 200, 200, 4.0),
    Box("D", 500, 350, 280, 11.0), Box("E", 250, 250, 180, 3.2),
]


def test_produces_placements():
    plan = optimize_pallet(SAMPLE)
    assert len(plan.placements) > 0
    assert plan.num_layers >= 1


def test_density_is_real_fraction():
    plan = optimize_pallet(SAMPLE)
    assert 0.0 < plan.volume_density <= 1.0
    assert 0.0 < plan.baseline_density <= 1.0


def test_uplift_is_computed_not_hardcoded():
    plan = optimize_pallet(SAMPLE)
    # uplift must equal the formula from the two real densities
    expected = round((plan.volume_density - plan.baseline_density) / plan.baseline_density * 100, 1)
    assert plan.density_uplift_pct == expected


def test_stability_is_deterministic():
    # The original bug: stability was Math.random(). It must be reproducible.
    p1 = optimize_pallet(SAMPLE)
    p2 = optimize_pallet(SAMPLE)
    assert p1.stability_score == p2.stability_score
    assert 0.0 <= p1.stability_score <= 1.0


def test_no_box_exceeds_pallet_bounds():
    pallet = Pallet()
    plan = optimize_pallet(SAMPLE, pallet)
    for p in plan.placements:
        assert p.x_mm + p.length_mm <= pallet.length_mm + 1e-6
        assert p.y_mm + p.width_mm <= pallet.width_mm + 1e-6


def test_oversized_box_is_unplaced():
    plan = optimize_pallet([Box("HUGE", 5000, 5000, 500, 50)])
    assert "HUGE" in plan.unplaced
    assert plan.placements == []


def test_height_budget_respected():
    pallet = Pallet(max_height_mm=300)
    boxes = [Box(f"T{i}", 400, 300, 250, 5) for i in range(20)]
    plan = optimize_pallet(boxes, pallet)
    assert plan.stack_height_mm <= 300


def test_empty_input():
    plan = optimize_pallet([])
    assert plan.placements == []
    assert plan.is_valid is False


def test_csv_roundtrip(tmp_path):
    csv = tmp_path / "s.csv"
    csv.write_text("sku_id,length_mm,width_mm,height_mm,weight_kg\nX,400,300,200,5\n")
    boxes = load_boxes_csv(csv)
    assert len(boxes) == 1 and boxes[0].sku_id == "X"

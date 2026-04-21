"""
Unit tests for SpineMetrics geometry engine.
Run with: python -m pytest packages/measurement_engine/tests.py -v
No image files needed — pure math tests.
"""

import math
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from packages.measurement_engine.geometry import (
    cobb_angle, sacral_slope, pelvic_tilt,
    pelvic_incidence, pi_ll_mismatch,
    measurement_confidence, check_pi_consistency,
    line_angle_deg, midpoint, distance,
)


def approx(a, b, tol=0.5):
    return abs(a - b) <= tol


# ─── line_angle_deg ───────────────────────────────────────────────────────────

def test_line_angle_horizontal():
    assert approx(line_angle_deg((0, 0), (100, 0)), 0.0)

def test_line_angle_45():
    assert approx(line_angle_deg((0, 0), (100, 100)), 45.0)

def test_line_angle_negative():
    # Line going down-left
    assert approx(abs(line_angle_deg((100, 0), (0, 0))), 180.0)


# ─── Cobb angle ───────────────────────────────────────────────────────────────

def test_cobb_parallel_endplates_zero():
    """Parallel endplates → 0° Cobb."""
    assert approx(cobb_angle((0,0),(100,0), (0,100),(100,100)), 0.0)

def test_cobb_perpendicular_endplates_90():
    """Perpendicular endplates → 90° Cobb."""
    assert approx(cobb_angle((0,0),(0,100), (0,0),(100,0)), 90.0)

def test_cobb_known_angle_45():
    """L1 horizontal, S1 at 45° → Cobb = 45°."""
    # L1 horizontal
    l1_l, l1_r = (0, 0), (100, 0)
    # S1 at 45° (rising right)
    s1_l, s1_r = (0, 100), (100, 0)
    result = cobb_angle(l1_l, l1_r, s1_l, s1_r)
    assert approx(result, 45.0), f"Expected ~45°, got {result}"

def test_cobb_symmetry():
    """Swapping endplate order should not change Cobb angle."""
    l1_l, l1_r = (10, 50), (110, 45)
    s1_l, s1_r = (10, 300), (110, 315)
    c1 = cobb_angle(l1_l, l1_r, s1_l, s1_r)
    c2 = cobb_angle(s1_l, s1_r, l1_l, l1_r)
    assert approx(c1, c2), f"{c1} != {c2}"

def test_cobb_typical_lordosis():
    """Simulate ~47° lordosis: L1 slightly tilted, S1 more tilted."""
    # L1 superior endplate, nearly horizontal, slight posterior tilt
    l1_l, l1_r = (100, 100), (300, 107)   # ~2° tilt
    # S1 superior endplate, significantly tilted (lordosis)
    s1_l, s1_r = (100, 500), (300, 455)   # ~13° → Cobb ~11–15°
    result = cobb_angle(l1_l, l1_r, s1_l, s1_r)
    assert 8 <= result <= 20, f"Expected 8–20°, got {result}"


# ─── Sacral slope ─────────────────────────────────────────────────────────────

def test_sacral_slope_horizontal():
    """Horizontal S1 endplate → SS = 0°."""
    assert approx(sacral_slope((0, 100), (100, 100)), 0.0)

def test_sacral_slope_30():
    """S1 at 30° from horizontal → SS = 30°."""
    x = 100
    y = math.tan(math.radians(30)) * x
    result = sacral_slope((0, 0), (x, y))
    assert approx(result, 30.0), f"Expected 30°, got {result}"

def test_sacral_slope_positive():
    """SS is always positive (acute angle)."""
    result = sacral_slope((100, 200), (0, 150))   # reversed direction
    assert result >= 0


# ─── Pelvic tilt ──────────────────────────────────────────────────────────────

def test_pelvic_tilt_zero():
    """S1 directly above femoral head → PT = 0° (no tilt)."""
    s1_mid = (100, 100)
    femoral = (100, 300)   # directly below in image
    result = pelvic_tilt(s1_mid, femoral)
    assert approx(result, 0.0), f"Expected 0°, got {result}"

def test_pelvic_tilt_90():
    """S1 directly to the right of femoral head → PT = 90° (extreme retroversion)."""
    s1_mid = (200, 300)
    femoral = (100, 300)   # same y
    result = pelvic_tilt(s1_mid, femoral)
    assert approx(result, 90.0), f"Expected 90°, got {result}"

def test_pelvic_tilt_typical_20():
    """Simulate ~20° PT."""
    # femoral at origin, S1 midpoint shifted
    femoral = (100.0, 400.0)
    # 20° from vertical: x-offset = sin(20°) * distance, y-offset = cos(20°) * distance
    dist = 100.0
    s1_mid = (
        femoral[0] + dist * math.sin(math.radians(20)),
        femoral[1] - dist * math.cos(math.radians(20)),
    )
    result = pelvic_tilt(s1_mid, femoral)
    assert approx(result, 20.0), f"Expected ~20°, got {result}"

def test_pelvic_tilt_always_positive():
    """PT is always positive."""
    assert pelvic_tilt((100, 50), (200, 300)) >= 0
    assert pelvic_tilt((300, 50), (200, 300)) >= 0


# ─── Pelvic incidence ─────────────────────────────────────────────────────────

def test_pelvic_incidence_identity():
    """PI = PT + SS by definition."""
    pt_val = 18.0
    ss_val = 36.0
    assert approx(pelvic_incidence(pt_val, ss_val), 54.0)

def test_pelvic_incidence_typical():
    """Typical PI range: 40–65°."""
    pi = pelvic_incidence(20.0, 34.0)
    assert 40 <= pi <= 65


# ─── PI-LL mismatch ───────────────────────────────────────────────────────────

def test_pill_zero():
    """PI = LL → mismatch = 0."""
    assert approx(pi_ll_mismatch(54.0, 54.0), 0.0)

def test_pill_positive():
    """PI > LL → positive mismatch (hypolordosis)."""
    assert pi_ll_mismatch(54.0, 40.0) > 0

def test_pill_negative():
    """PI < LL → negative mismatch (hyperlordosis)."""
    assert pi_ll_mismatch(40.0, 54.0) < 0


# ─── Consistency check ────────────────────────────────────────────────────────

def test_consistency_pass():
    result = check_pi_consistency(54.0, 18.0, 36.0, tolerance=4.0)
    assert result["is_consistent"]
    assert result["error_deg"] < 4.0

def test_consistency_fail():
    result = check_pi_consistency(54.0, 18.0, 30.0, tolerance=4.0)
    assert not result["is_consistent"]
    assert result["error_deg"] > 4.0


# ─── Confidence propagation ───────────────────────────────────────────────────

def test_confidence_min():
    assert measurement_confidence([0.9, 0.5, 0.7], method="min") == 0.5

def test_confidence_mean():
    result = measurement_confidence([0.9, 0.5], method="mean")
    assert approx(result, 0.7)

def test_confidence_empty():
    assert measurement_confidence([]) == 0.0


if __name__ == "__main__":
    # Run all tests manually
    tests = [f for f in dir() if f.startswith("test_")]
    passed = failed = 0
    for t in tests:
        try:
            globals()[t]()
            print(f"  ✓ {t}")
            passed += 1
        except AssertionError as e:
            print(f"  ✗ {t}: {e}")
            failed += 1
        except Exception as e:
            print(f"  ✗ {t}: {type(e).__name__}: {e}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed")

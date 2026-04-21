"""
SpineMetrics — Geometric Measurement Engine

Pure deterministic functions.
No image processing. No OpenCV. No model inference.
Input: landmark coordinates (floats).
Output: measured angles (floats).

All functions are independently unit-testable.

Coordinate system:
  x increases right, y increases down (standard image coords).

References:
  - Cobb angle: standard method per SRS guidelines
  - Sacral slope: S1 endplate angle from horizontal (Legaye 1998)
  - Pelvic tilt: angle from vertical, femoral head to S1 midpoint (Schwab 2012)
  - Pelvic incidence: PT + SS (geometric identity, Legaye 1998)
"""

from __future__ import annotations
import math
from typing import Optional, Tuple

Point = Tuple[float, float]


# ─── Basic geometry ───────────────────────────────────────────────────────────

def line_angle_deg(p1: Point, p2: Point) -> float:
    """
    Signed angle of line p1→p2 from horizontal.
    Returns degrees in (-180, 180].
    """
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    return math.degrees(math.atan2(dy, dx))


def acute_angle_from_horizontal(p1: Point, p2: Point) -> float:
    """
    Acute angle of line from horizontal. Always 0–90°.
    """
    a = abs(line_angle_deg(p1, p2) % 180)
    return min(a, 180 - a)


def midpoint(p1: Point, p2: Point) -> Point:
    return ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)


def distance(p1: Point, p2: Point) -> float:
    return math.hypot(p2[0] - p1[0], p2[1] - p1[1])


# ─── Cobb angle ───────────────────────────────────────────────────────────────

def cobb_angle(
    endplate1_left:  Point,
    endplate1_right: Point,
    endplate2_left:  Point,
    endplate2_right: Point,
) -> float:
    """
    Cobb angle between two endplate lines.

    Method: angle between the perpendiculars to each endplate line.
    This is the standard clinical Cobb method (SRS).

    Returns degrees, always positive (0–90°).

    Args:
        endplate1_left/right: two points defining the superior endplate (e.g. L1)
        endplate2_left/right: two points defining the inferior endplate (e.g. S1)

    Mathematical derivation:
        a1 = angle of endplate 1 from horizontal
        a2 = angle of endplate 2 from horizontal
        perp1 = a1 + 90° (perpendicular to endplate 1)
        perp2 = a2 + 90°
        Cobb = |perp1 - perp2| mod 180, normalized to ≤ 90°

    Note: The result is equivalent to |a1 - a2| normalized to ≤ 90°,
    since the perpendicular shift cancels out.
    """
    a1 = line_angle_deg(endplate1_left, endplate1_right)
    a2 = line_angle_deg(endplate2_left, endplate2_right)
    diff = abs(a1 - a2) % 180
    if diff > 90:
        diff = 180 - diff
    return round(diff, 2)


# ─── Sacral slope ─────────────────────────────────────────────────────────────

def sacral_slope(
    s1_left:  Point,
    s1_right: Point,
) -> float:
    """
    Sacral slope: acute angle of S1 superior endplate from horizontal.

    Clinical definition (Legaye 1998, Eur Spine J):
        SS = angle between S1 superior endplate and horizontal plane.
        Positive when endplate tilts anteriorly (as in normal lordosis).

    Returns degrees (0–90°).
    """
    return round(acute_angle_from_horizontal(s1_left, s1_right), 2)


# ─── Pelvic tilt ──────────────────────────────────────────────────────────────

def pelvic_tilt(
    s1_midpoint:    Point,
    femoral_center: Point,
) -> float:
    """
    Pelvic tilt: angle from vertical of line from femoral head axis to S1 midpoint.

    Clinical definition (Duval-Beaupère 1992, Legaye 1998):
        PT = angle between vertical and line from bicoxofemoral axis to S1 midpoint.
        Positive = retroversion (head posterior to S1 midpoint).

    In image coordinates (y increases down):
        vertical direction = (0, -1) (upward in image)
        The line goes from femoral_center UP to s1_midpoint.

    Returns degrees (0–90° for physiological retroversion).
    """
    dx = s1_midpoint[0] - femoral_center[0]
    dy = s1_midpoint[1] - femoral_center[1]   # negative when s1 is above femoral
    # Angle from vertical = atan2(|horizontal|, |vertical|)
    if abs(dy) < 1e-6:
        return 90.0
    return round(math.degrees(math.atan2(abs(dx), abs(dy))), 2)


# ─── Pelvic incidence ─────────────────────────────────────────────────────────

def pelvic_incidence(pt: float, ss: float) -> float:
    """
    Pelvic incidence = pelvic tilt + sacral slope.

    This is a geometric identity (Legaye 1998, Eur Spine J):
        PI = PT + SS

    PI is a fixed morphological parameter — it does not change with posture.
    It determines the required lumbar lordosis for sagittal balance.

    Alternative direct computation from landmarks is also possible
    (angle between perpendicular to S1 endplate and line from S1 midpoint to
    femoral head), but PI = PT + SS is mathematically equivalent and
    more numerically stable when both PT and SS are already computed.

    Returns degrees.
    """
    return round(pt + ss, 2)


# ─── PI-LL mismatch ───────────────────────────────────────────────────────────

def pi_ll_mismatch(pi: float, lumbar_lordosis: float) -> float:
    """
    PI-LL mismatch = PI - Lumbar Lordosis (L1-S1 Cobb).

    Clinical reference: Schwab et al. 2012, Spine (SRS-Schwab classification).
        >10° = (+) modifier — clinically significant
        >20° = (++) modifier — severe sagittal malalignment

    Positive mismatch = hypolordosis relative to PI.
    Negative mismatch = hyperlordosis relative to PI.

    Returns degrees (signed).
    """
    return round(pi - lumbar_lordosis, 2)


# ─── Confidence propagation ───────────────────────────────────────────────────

def measurement_confidence(
    input_confidences: list[float],
    method: str = "min",
) -> float:
    """
    Compute output confidence from input landmark confidences.

    method="min": output confidence = minimum of inputs (conservative)
    method="mean": output confidence = mean of inputs

    For clinical measurements, conservative (min) is preferred:
    a measurement is only as reliable as its least reliable landmark.
    """
    if not input_confidences:
        return 0.0
    if method == "min":
        return round(min(input_confidences), 3)
    return round(sum(input_confidences) / len(input_confidences), 3)


# ─── Geometric consistency check ─────────────────────────────────────────────

def check_pi_consistency(pi: float, pt: float, ss: float, tolerance: float = 4.0) -> dict:
    """
    Check: PI should equal PT + SS within tolerance.
    Returns dict with is_consistent, error_deg, note.
    """
    error = abs(pi - pt - ss)
    return {
        "is_consistent": error <= tolerance,
        "error_deg":     round(error, 1),
        "note": (
            f"PI ({pi}°) = PT ({pt}°) + SS ({ss}°) → error {error:.1f}° "
            f"{'✓ within {tolerance}° tolerance' if error <= tolerance else '⚠ exceeds tolerance'}"
        ),
    }

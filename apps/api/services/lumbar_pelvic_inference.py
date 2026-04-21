"""
SpineMetrics — Lumbar/Pelvic Landmark Inference Service

This is the ONLY layer that touches raw image bytes.
It returns a LumbarPelvicLandmarks object.
The measurement engine consumes that object — it never sees raw images.

Current implementation: CV heuristic (Canny + Hough).
Future: swap this layer for a trained landmark detection model.
The interface (input: bytes → output: LumbarPelvicLandmarks) is stable.

To plug in a trained model:
  1. Implement run_trained_model(raw_bytes) → LumbarPelvicLandmarks
  2. Set INFERENCE_BACKEND=model in environment
  3. This service routes to it automatically

No other files change when a real model is added.
"""

from __future__ import annotations
import math
import os
import sys
import numpy as np
from typing import Optional, Tuple, List

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../.."))

from packages.shared_types.landmarks import (
    LumbarPelvicLandmarks, EndplateLandmarks, ImagePoint,
)

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False

try:
    from PIL import Image as PILImage
    import io
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

INFERENCE_BACKEND = os.environ.get("INFERENCE_BACKEND", "cv_heuristic")


# ─── Image loading ────────────────────────────────────────────────────────────

def load_grayscale(raw_bytes: bytes) -> Tuple[np.ndarray, int, int]:
    """
    Load image bytes to grayscale numpy array.
    Returns (gray_array, original_width, original_height).
    """
    if CV2_AVAILABLE:
        arr = np.frombuffer(raw_bytes, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
        if img is not None:
            return img, img.shape[1], img.shape[0]

    if PIL_AVAILABLE:
        pil = PILImage.open(io.BytesIO(raw_bytes)).convert("L")
        arr = np.array(pil, dtype=np.uint8)
        return arr, pil.width, pil.height

    raise RuntimeError(
        "No image decoding library available. "
        "Install opencv-python-headless or Pillow."
    )


def assess_quality(gray: np.ndarray) -> Tuple[str, List[str]]:
    """Quick quality assessment from pixel statistics."""
    h, w = gray.shape
    flags = []
    if w < 300 or h < 300:
        flags.append(f"Small image ({w}×{h}px) — landmark detection unreliable.")
        return "poor", flags
    std = float(np.std(gray))
    if std < 15:
        flags.append("Very low contrast. Landmark detection will likely fail.")
        return "poor", flags
    if std < 28:
        flags.append("Low contrast. Consider using DICOM export for better results.")
        return "fair", flags
    return "good", flags


def resize_preserve_scale(gray: np.ndarray, max_dim: int = 1024) -> Tuple[np.ndarray, float]:
    """
    Resize to max_dim on longest side.
    Returns (resized, scale) where scale = resized / original.
    Landmark coords from resized image must be divided by scale to get original coords.
    """
    h, w = gray.shape
    scale = min(max_dim / max(h, w), 1.0)
    if scale == 1.0 or not CV2_AVAILABLE:
        return gray, 1.0
    new_w, new_h = int(w * scale), int(h * scale)
    return cv2.resize(gray, (new_w, new_h), interpolation=cv2.INTER_AREA), scale


# ─── Hough line detection ─────────────────────────────────────────────────────

class HoughLine:
    def __init__(self, x1, y1, x2, y2):
        if x1 > x2:
            x1, y1, x2, y2 = x2, y2, x1, y1
        self.x1, self.y1 = float(x1), float(y1)
        self.x2, self.y2 = float(x2), float(y2)

    @property
    def length(self): return math.hypot(self.x2-self.x1, self.y2-self.y1)

    @property
    def angle_deg(self): return math.degrees(math.atan2(self.y2-self.y1, self.x2-self.x1))

    @property
    def slope_deg(self):
        a = abs(self.angle_deg % 180)
        return min(a, 180-a)

    @property
    def center_y(self): return (self.y1 + self.y2) / 2

    @property
    def midpoint(self): return ((self.x1+self.x2)/2, (self.y1+self.y2)/2)


def detect_hough_lines(gray: np.ndarray) -> List[HoughLine]:
    if not CV2_AVAILABLE:
        return []
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8,8))
    enhanced = clahe.apply(gray)
    blurred = cv2.GaussianBlur(enhanced, (3,3), 0)
    edges = cv2.Canny(blurred, 25, 75, apertureSize=3)
    h, w = gray.shape
    raw = cv2.HoughLinesP(
        edges, rho=1, theta=np.pi/180, threshold=25,
        minLineLength=max(int(w*0.09), 35),
        maxLineGap=max(int(w*0.04), 12),
    )
    return [HoughLine(*r[0]) for r in raw] if raw is not None else []


def score_endplate_candidate(
    line: HoughLine, y_center: float, y_range: float, img_width: float
) -> float:
    """Multi-factor score: zone fit × slope × span. Returns 0–1."""
    zone_score = max(0.0, 1.0 - ((line.center_y - y_center) / y_range) ** 2)
    if zone_score < 0.01: return 0.0
    if line.slope_deg > 22: return 0.0
    span = line.length / img_width
    if span < 0.08: return 0.0
    slope_score = 1.0 - (line.slope_deg / 22.0) ** 1.5
    span_score = min(span / 0.35, 1.0)
    return zone_score * slope_score * span_score


def select_endplate(
    lines: List[HoughLine], y_center: float, y_range: float, img_width: float
) -> Tuple[Optional[HoughLine], float]:
    """Pick best endplate line and return (line, confidence)."""
    scored = [(l, score_endplate_candidate(l, y_center, y_range, img_width))
              for l in lines]
    scored = [(l, s) for l, s in scored if s > 0]
    if not scored: return None, 0.0
    scored.sort(key=lambda x: -x[1])
    best_line, best_score = scored[0]
    return best_line, min(best_score * 1.15, 1.0)


def hough_line_to_endplate_landmarks(
    line: HoughLine, confidence: float, scale: float
) -> EndplateLandmarks:
    """Convert a HoughLine to EndplateLandmarks in original image coordinates."""
    inv = 1.0 / scale
    return EndplateLandmarks(
        left_point=ImagePoint(
            x=line.x1 * inv, y=line.y1 * inv, confidence=confidence
        ),
        right_point=ImagePoint(
            x=line.x2 * inv, y=line.y2 * inv, confidence=confidence
        ),
    )


def null_endplate_landmarks() -> EndplateLandmarks:
    return EndplateLandmarks(
        left_point=ImagePoint(x=0, y=0, confidence=0.0, note="not detected"),
        right_point=ImagePoint(x=0, y=0, confidence=0.0, note="not detected"),
    )


# ─── Hough circle (femoral head) detection ────────────────────────────────────

def detect_femoral_heads(
    gray: np.ndarray, scale: float
) -> Tuple[ImagePoint, ImagePoint]:
    """
    Returns (left_head, right_head) as ImagePoints in original image coordinates.
    If only one head detected, it is assigned to the more lateral side.
    If none detected, both have confidence=0.
    """
    if not CV2_AVAILABLE:
        return (ImagePoint(x=0,y=0,confidence=0.0,note="cv2 unavailable"),
                ImagePoint(x=0,y=0,confidence=0.0,note="cv2 unavailable"))

    h, w = gray.shape
    roi_top = int(h * 0.52)
    roi = gray[roi_top:]
    blurred = cv2.GaussianBlur(roi, (11,11), 3)
    min_r, max_r = max(int(w*0.04), 8), int(w*0.14)

    circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=1.2,
        minDist=int(w*0.08), param1=45, param2=27,
        minRadius=min_r, maxRadius=max_r,
    )

    inv = 1.0 / scale

    if circles is None:
        note = "Femoral head not detected. Ensure image includes both femoral heads."
        return (ImagePoint(x=0,y=0,confidence=0.0,note=note),
                ImagePoint(x=0,y=0,confidence=0.0,note=note))

    circles = np.round(circles[0]).astype(int)
    # Adjust y to full image space
    adjusted = [(int(cx), int(cy + roi_top), int(cr)) for cx, cy, cr in circles]
    # Filter: must be in lower image region
    adjusted = [c for c in adjusted if roi_top < c[1] < int(h * 0.93)]
    if not adjusted:
        return (ImagePoint(x=0,y=0,confidence=0.0,note="No valid femoral head candidates"),
                ImagePoint(x=0,y=0,confidence=0.0,note="No valid femoral head candidates"))

    if len(adjusted) == 1:
        cx, cy, cr = adjusted[0]
        note = "Single femoral head detected — bilateral measurement not possible."
        conf = 0.38
        pt = ImagePoint(x=cx*inv, y=cy*inv, confidence=conf, note=note)
        # Assign to whichever side is closer to image center
        if cx < w / 2:
            return pt, ImagePoint(x=0, y=0, confidence=0.0, note="not detected")
        return ImagePoint(x=0, y=0, confidence=0.0, note="not detected"), pt

    # Multiple circles: find best bilateral pair
    adjusted.sort(key=lambda c: c[0])   # sort left→right by x
    best_pair, best_sym = None, -1.0
    for i in range(len(adjusted)):
        for j in range(i+1, len(adjusted)):
            c1, c2 = adjusted[i], adjusted[j]
            x_sep = abs(c1[0]-c2[0]) / w
            y_diff = abs(c1[1]-c2[1]) / h
            size_ratio = min(c1[2],c2[2]) / max(c1[2],c2[2]) if max(c1[2],c2[2]) > 0 else 0
            if 0.07 < x_sep < 0.55 and y_diff < 0.10:
                sym = size_ratio * (1.0 - y_diff * 3)
                if sym > best_sym:
                    best_sym = sym
                    best_pair = (c1, c2)

    if best_pair is None:
        # Fallback: take the largest
        largest = max(adjusted, key=lambda c: c[2])
        note = "Single best femoral head candidate."
        conf = 0.33
        pt = ImagePoint(x=largest[0]*inv, y=largest[1]*inv, confidence=conf, note=note)
        return pt, ImagePoint(x=0, y=0, confidence=0.0, note="not detected")

    c1, c2 = best_pair
    conf = min(0.30 + best_sym * 0.45, 0.72)
    note_both = f"Bilateral detection, symmetry score={best_sym:.2f}."
    left_pt  = ImagePoint(x=c1[0]*inv, y=c1[1]*inv, confidence=conf, note=note_both)
    right_pt = ImagePoint(x=c2[0]*inv, y=c2[1]*inv, confidence=conf, note=note_both)
    return left_pt, right_pt


# ─── Main inference function ──────────────────────────────────────────────────

def run_inference(raw_bytes: bytes) -> LumbarPelvicLandmarks:
    """
    Entry point for landmark detection.
    Routes to CV heuristic or trained model based on INFERENCE_BACKEND env var.

    Returns LumbarPelvicLandmarks with detection results.
    Low-confidence or failed detections have confidence=0.0 on affected points.
    """
    backend = INFERENCE_BACKEND

    if backend == "cv_heuristic":
        return _cv_heuristic_inference(raw_bytes)
    elif backend == "model":
        return _model_inference(raw_bytes)
    else:
        raise ValueError(
            f"Unknown INFERENCE_BACKEND='{backend}'. "
            "Set to 'cv_heuristic' or 'model'."
        )


def _cv_heuristic_inference(raw_bytes: bytes) -> LumbarPelvicLandmarks:
    """
    CV heuristic landmark detection using Canny + Hough.
    Source: cv_heuristic.
    """
    gray, orig_w, orig_h = load_grayscale(raw_bytes)
    quality, q_notes = assess_quality(gray)
    proc, scale = resize_preserve_scale(gray, max_dim=1024)
    ph, pw = proc.shape

    # Detect lines
    lines = detect_hough_lines(proc)

    notes = [
        f"INFERENCE_BACKEND=cv_heuristic",
        f"Lines detected: {len(lines)}",
    ]

    # Endplate zones (fractions of processed image height)
    l1_y_center = ph * 0.22
    l1_y_range  = ph * 0.14
    s1_y_center = ph * 0.63
    s1_y_range  = ph * 0.15

    l1_line, l1_conf = select_endplate(lines, l1_y_center, l1_y_range, pw)
    s1_line, s1_conf = select_endplate(lines, s1_y_center, s1_y_range, pw)

    notes.append(f"L1 endplate confidence: {l1_conf:.2f}")
    notes.append(f"S1 endplate confidence: {s1_conf:.2f}")

    if l1_line:
        l1_lm = hough_line_to_endplate_landmarks(l1_line, l1_conf, scale)
    else:
        l1_lm = null_endplate_landmarks()

    if s1_line:
        s1_lm = hough_line_to_endplate_landmarks(s1_line, s1_conf, scale)
    else:
        s1_lm = null_endplate_landmarks()

    fem_left, fem_right = detect_femoral_heads(proc, scale)
    notes.append(
        f"Femoral: L={fem_left.confidence:.2f}, R={fem_right.confidence:.2f}"
    )

    return LumbarPelvicLandmarks(
        source="cv_heuristic",
        l1_superior=l1_lm,
        s1_superior=s1_lm,
        femoral_left=fem_left,
        femoral_right=fem_right,
        image_width_px=orig_w,
        image_height_px=orig_h,
        image_quality=quality,
        quality_notes=q_notes + notes,
    )


def _model_inference(raw_bytes: bytes) -> LumbarPelvicLandmarks:
    """
    Adapter for trained landmark detection model.
    NOT YET IMPLEMENTED.

    To implement:
      1. Load model weights from models/lumbar_pelvic/
      2. Preprocess image to model input format
      3. Run inference
      4. Parse model output to LumbarPelvicLandmarks

    Example model types that would fit here:
      - PyTorch VertexNet / SpineNet landmark detector
      - ONNX Runtime inference (cross-platform)
      - Custom U-Net with heatmap-based landmark localization
    """
    # Try to load a model if weights exist
    model_path = os.path.join(
        os.path.dirname(__file__), "../../../models/lumbar_pelvic/model.onnx"
    )
    if os.path.exists(model_path):
        raise NotImplementedError(
            f"Model found at {model_path} but inference adapter not yet implemented. "
            "Implement _model_inference() to connect this model."
        )
    else:
        raise RuntimeError(
            "INFERENCE_BACKEND=model but no model found at models/lumbar_pelvic/model.onnx. "
            "Either train a model, download pre-trained weights, "
            "or set INFERENCE_BACKEND=cv_heuristic."
        )

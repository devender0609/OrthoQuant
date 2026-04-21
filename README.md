# SpineMetrics v6 — Backend-Driven Clinical Imaging Platform

> Research Use Only · Not FDA-Cleared

## Quick Start

```bash
# Backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn apps.api.main:app --reload --port 8000
# Docs: http://localhost:8000/docs

# Frontend (new terminal)
cd apps/web && npm install && npm run dev
# App: http://localhost:5173

# Tests
python packages/measurement_engine/tests.py
```

## Architecture

Image → FastAPI → lumbar_pelvic_inference.py → LumbarPelvicLandmarks
                                                        │
                                              measurement_engine/geometry.py
                                                        │
                                              LumbarPelvicResponse → JSON → Frontend

## To plug in a trained model

1. Drop model at models/lumbar_pelvic/model.onnx
2. Implement _model_inference() in apps/api/services/lumbar_pelvic_inference.py
3. Set INFERENCE_BACKEND=model in .env

See full documentation in README_FULL.md or ask for details.

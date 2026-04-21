# Lumbar/Pelvic Model Weights

Place trained model file here: model.onnx

Expected input: preprocessed grayscale radiograph image
Expected output: landmark heatmaps or coordinate predictions
  conforming to LumbarPelvicLandmarks schema in packages/shared_types/landmarks.py

Set INFERENCE_BACKEND=model in .env to activate.

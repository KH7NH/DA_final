from pathlib import Path
import numpy as np
from PIL import Image
import tensorflow as tf

# ====== CONFIG (y như bạn) ======
GORE_MODEL_PATH = Path("models/efficientnet_b3_final.keras")
NSFW_MODEL_PATH = Path("models/nsfw_mobilenetv2_3class.h5")

NSFW_LABELS = ["drawings", "hentai", "porn"]
SENSITIVE_CLASS = "porn"

THRESHOLD = 0.5
USE_GORE_IN_FINAL = True

# ====== Load model 1 lần khi start service ======
gore_model = tf.keras.models.load_model(str(GORE_MODEL_PATH))
nsfw_model = tf.keras.models.load_model(str(NSFW_MODEL_PATH))

def softmax(x: np.ndarray) -> np.ndarray:
    x = x.astype(np.float32)
    x = x - np.max(x)
    e = np.exp(x)
    return e / (np.sum(e) + 1e-9)

def get_model_input_hw(model):
    shape = getattr(model, "input_shape", None)
    if not shape:
        return (224, 224)

    if isinstance(shape, list):
        shape = shape[0]

    if len(shape) == 4:
        h, w = shape[1], shape[2]
        if h is None or w is None:
            return (224, 224)
        return (int(h), int(w))

    if len(shape) == 3:
        h, w = shape[0], shape[1]
        if h is None or w is None:
            return (224, 224)
        return (int(h), int(w))

    return (224, 224)

def preprocess_image_bytes(image_bytes: bytes, target_hw):
    img = Image.open(BytesIO(image_bytes)).convert("RGB")
    w, h = target_hw[1], target_hw[0]
    img = img.resize((w, h))
    arr = np.asarray(img).astype(np.float32) / 255.0
    return np.expand_dims(arr, axis=0)

def interpret_output(y: np.ndarray, labels=None):
    y = np.array(y)
    y_flat = y.flatten()

    if y_flat.size == 1:
        return {"type": "scalar", "score": float(y_flat[0])}

    probs = y_flat.astype(np.float32)
    s = float(np.sum(probs))
    if not (0.98 <= s <= 1.02):
        probs = softmax(probs)

    idx_sorted = np.argsort(-probs)

    def label_of(i: int) -> str:
        if labels and i < len(labels):
            return labels[i]
        return f"class{i}"

    topk = []
    for i in idx_sorted[: min(3, probs.size)]:
        topk.append({"label": label_of(int(i)), "prob": float(probs[int(i)])})

    return {"type": "multi", "topk": topk, "probs": probs.tolist()}

def get_sensitive_prob(nsfw_out, sensitive_class: str):
    if nsfw_out["type"] == "scalar":
        return float(nsfw_out["score"])

    probs = nsfw_out.get("probs", [])
    if probs and NSFW_LABELS and len(probs) == len(NSFW_LABELS):
        if sensitive_class in NSFW_LABELS:
            return float(probs[NSFW_LABELS.index(sensitive_class)])

    topk = nsfw_out.get("topk", [])
    return float(topk[0]["prob"]) if topk else 0.0

# IMPORTANT: BytesIO import
from io import BytesIO

def predict_image_bytes(image_bytes: bytes):
    gore_hw = get_model_input_hw(gore_model)
    nsfw_hw = get_model_input_hw(nsfw_model)

    x_gore = preprocess_image_bytes(image_bytes, gore_hw)
    x_nsfw = preprocess_image_bytes(image_bytes, nsfw_hw)

    y_gore = np.squeeze(gore_model.predict(x_gore, verbose=0))
    y_nsfw = np.squeeze(nsfw_model.predict(x_nsfw, verbose=0))

    gore_out = interpret_output(y_gore)
    nsfw_out = interpret_output(y_nsfw, labels=NSFW_LABELS)

    gore_score = gore_out["score"] if gore_out["type"] == "scalar" else None
    sensitive_prob = get_sensitive_prob(nsfw_out, SENSITIVE_CLASS)

    is_sensitive = (sensitive_prob >= THRESHOLD)
    if USE_GORE_IN_FINAL and gore_score is not None:
        is_sensitive = is_sensitive or (float(gore_score) >= THRESHOLD)

    return {
        "gore_score": float(gore_score) if gore_score is not None else None,
        "nsfw_top_label": nsfw_out["topk"][0]["label"] if nsfw_out.get("topk") else None,
        "nsfw_top_prob": float(nsfw_out["topk"][0]["prob"]) if nsfw_out.get("topk") else None,
        "nsfw_sensitive_class": SENSITIVE_CLASS,
        "nsfw_sensitive_prob": float(sensitive_prob),
        "threshold": THRESHOLD,
        "is_sensitive": bool(is_sensitive),
    }

"""
خادم API يربط واجهة React بمكتبة face_recognition.

التشغيل من مجلد المشروع الرئيسي (project test):
  pip install -r api/requirements.txt
  uvicorn api.main:app --reload --port 8787
"""

from __future__ import annotations

import io
from typing import Any

import cv2
import face_recognition
import numpy as np
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

app = FastAPI(title="Face Match API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# بصمة الوجه المرجعي (مصفوفة طولها 128)
known_encoding: np.ndarray | None = None
DEFAULT_TOLERANCE = 0.55


def _image_to_rgb_array(data: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(data)).convert("RGB")
    return np.asarray(img)


def _first_face_encoding(image: np.ndarray) -> np.ndarray | None:
    encs = face_recognition.face_encodings(image)
    return encs[0] if encs else None


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/reference-status")
def reference_status() -> dict[str, Any]:
    return {"loaded": known_encoding is not None}


@app.post("/api/reference")
async def set_reference(file: UploadFile = File(...)) -> dict[str, Any]:
    global known_encoding  # noqa: PLW0603
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="أرسل ملف صورة (jpg أو png).")

    raw = await file.read()
    try:
        image = _image_to_rgb_array(raw)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"تعذر قراءة الصورة: {e}") from e

    enc = _first_face_encoding(image)
    if enc is None:
        raise HTTPException(
            status_code=422,
            detail="لم يُعثر على وجه في الصورة. جرّب صورة أوضح بوجه واحد.",
        )

    known_encoding = enc
    return {"ok": True, "message": "تم حفظ الوجه المرجعي."}


@app.post("/api/match")
async def match_frame(
    file: UploadFile = File(...),
    tolerance: float = Query(default=DEFAULT_TOLERANCE, ge=0.3, le=0.75),
) -> dict[str, Any]:
    if known_encoding is None:
        raise HTTPException(
            status_code=400,
            detail="ارفع صورة مرجعية أولاً من الواجهة.",
        )

    raw = await file.read()
    try:
        image = _image_to_rgb_array(raw)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"تعذر قراءة الإطار: {e}") from e

    # تصغير لتسريع المعالجة (مثل سكربت الكاميرا المحلي)
    small = image
    h, w = small.shape[:2]
    if max(h, w) > 960:
        scale = 960 / max(h, w)
        new_w, new_h = int(w * scale), int(h * scale)
        small_bgr = cv2.cvtColor(small, cv2.COLOR_RGB2BGR)
        resized = cv2.resize(small_bgr, (new_w, new_h))
        small = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)

    locations = face_recognition.face_locations(small, model="hog")
    encodings = face_recognition.face_encodings(small, locations)

    if not encodings:
        return {
            "match": False,
            "distance": None,
            "message": "لا يوجد وجه واضح في الإطار.",
        }

    best = min(
        float(face_recognition.face_distance([known_encoding], enc)[0])
        for enc in encodings
    )
    is_match = best <= tolerance

    return {
        "match": is_match,
        "distance": round(best, 4),
        "message": "نفس الشخص في الصورة المرجعية."
        if is_match
        else "لا يطابق الصورة المرجعية.",
    }

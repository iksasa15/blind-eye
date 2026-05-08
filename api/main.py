"""
خادم API يربط واجهة React بمكتبة face_recognition.

التشغيل من مجلد المشروع الرئيسي (project test):
  pip install -r api/requirements.txt
  uvicorn api.main:app --reload --port 8787
"""

from __future__ import annotations

import io
import os
import re
from pathlib import Path
from typing import Any

import cv2
import face_recognition
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
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

# بصمات مرجعية (وجهك من الصورة الأصلية + نسخة معكوسة أفقياً لمطابقة السيلفي/الكاميرا)
KNOWN_REF_ENCODINGS: list[np.ndarray] = []
DEFAULT_TOLERANCE = 0.58

# مجلد حفظ صور الوجوه (بجانب مجلد api/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
FACES_DIR = PROJECT_ROOT / "faces"

# (encoding, {name, relation, source_file}) من ملفات faces/*.jpg بنفس تسمية database_loader
FACE_LIBRARY: list[tuple[np.ndarray, dict[str, str]]] = []


def _ensure_faces_dir() -> None:
    FACES_DIR.mkdir(parents=True, exist_ok=True)


def _sanitize_filename_part(raw: str, default: str) -> str:
    s = (raw or "").strip()
    s = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', "", s)
    s = "_".join(part for part in s.split() if part)
    if not s:
        return default
    return s[:64]


def _unique_jpeg_path(stem: str) -> Path:
    _ensure_faces_dir()
    first = FACES_DIR / f"{stem}.jpg"
    if not first.exists():
        return first
    n = 2
    while True:
        p = FACES_DIR / f"{stem}_{n}.jpg"
        if not p.exists():
            return p
        n += 1


def reload_face_library() -> None:
    """إعادة قراءة مجلد faces/ (يُستدعى عند التشغيل وبعد حفظ صورة جديدة)."""
    global FACE_LIBRARY  # noqa: PLW0603
    entries: list[tuple[np.ndarray, dict[str, str]]] = []
    if FACES_DIR.is_dir():
        for filename in sorted(os.listdir(FACES_DIR)):
            low = filename.lower()
            if not low.endswith((".jpg", ".jpeg", ".png")):
                continue
            path = FACES_DIR / filename
            try:
                img = face_recognition.load_image_file(str(path))
            except OSError:
                continue
            encs = face_recognition.face_encodings(img, num_jitters=1)
            if not encs:
                continue
            stem = filename.rsplit(".", 1)[0]
            parts = stem.split("_", 1)
            meta = {
                "name": parts[0] if parts[0] else "مجهول",
                "relation": parts[1] if len(parts) > 1 else "معروف",
                "source_file": filename,
            }
            entries.append((encs[0], meta))
    FACE_LIBRARY = entries


def _identity_candidates() -> list[tuple[np.ndarray, dict[str, str]]]:
    out: list[tuple[np.ndarray, dict[str, str]]] = list(FACE_LIBRARY)
    for i, ref in enumerate(KNOWN_REF_ENCODINGS):
        out.append(
            (
                ref,
                {
                    "name": "شخص الصورة المرجعية",
                    "relation": "من الواجهة",
                    "source_file": f"reference_{i}",
                },
            )
        )
    return out


def _identify_face_encoding(query_enc: np.ndarray) -> dict[str, Any]:
    """يقارن وجه الإطار مع faces/ + صورة المرجع المرفوعة."""
    candidates = _identity_candidates()
    if not candidates:
        return {
            "status": "no_library",
            "label_ar": "لا توجد أسماء بعد — أضف صوراً في مجلد faces أو ارفع صورة مرجعية من الواجهة.",
            "name": None,
            "relation": None,
            "distance": None,
        }

    best_d = 1e9
    best_meta: dict[str, str] | None = None
    for enc, meta in candidates:
        d = float(face_recognition.face_distance([enc], query_enc)[0])
        if d < best_d:
            best_d = d
            best_meta = meta

    assert best_meta is not None
    known_t = 0.48
    uncertain_t = 0.62

    if best_d <= known_t:
        status = "known"
        label_ar = f"هذا {best_meta['name']} ({best_meta['relation']})"
    elif best_d <= uncertain_t:
        status = "uncertain"
        label_ar = f"ربما {best_meta['name']} ({best_meta['relation']}) — غير متأكد"
    else:
        status = "unknown"
        label_ar = (
            f"غير متطابق مع الأسماء المحفوظة. الأقرب: {best_meta['name']} "
            f"(مسافة {best_d:.2f})"
        )

    return {
        "status": status,
        "label_ar": label_ar,
        "name": best_meta["name"],
        "relation": best_meta["relation"],
        "distance": round(float(best_d), 4),
        "source_file": best_meta.get("source_file"),
    }


def _pick_largest_face(
    items: list[tuple[np.ndarray, dict[str, int]]],
) -> tuple[np.ndarray, dict[str, int]] | None:
    if not items:
        return None

    def area(item: tuple[np.ndarray, dict[str, int]]) -> int:
        _, b = item
        w = max(0, b["right"] - b["left"])
        h = max(0, b["bottom"] - b["top"])
        return w * h

    return max(items, key=area)


def _image_to_rgb_array(data: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(data)).convert("RGB")
    return np.asarray(img)


def _flip_rgb_horizontal(image: np.ndarray) -> np.ndarray:
    bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    flipped = cv2.flip(bgr, 1)
    return cv2.cvtColor(flipped, cv2.COLOR_BGR2RGB)


def _first_face_encoding(image: np.ndarray, *, num_jitters: int = 2) -> np.ndarray | None:
    encs = face_recognition.face_encodings(image, num_jitters=num_jitters)
    return encs[0] if encs else None


def _collect_reference_encodings(image: np.ndarray) -> list[np.ndarray]:
    """وجه من الصورة كما هي + من نسخة معكوسة (يقلّل فشل التعرف بسبب اتجاه السيلفي)."""
    out: list[np.ndarray] = []
    for arr in (image, _flip_rgb_horizontal(image)):
        enc = _first_face_encoding(arr, num_jitters=2)
        if enc is None:
            continue
        if not any(
            float(face_recognition.face_distance([enc], other)[0]) < 0.07
            for other in out
        ):
            out.append(enc)
    return out


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/reference-status")
def reference_status() -> dict[str, Any]:
    return {"loaded": len(KNOWN_REF_ENCODINGS) > 0}


@app.post("/api/reference")
async def set_reference(file: UploadFile = File(...)) -> dict[str, Any]:
    global KNOWN_REF_ENCODINGS  # noqa: PLW0603
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="أرسل ملف صورة (jpg أو png).")

    raw = await file.read()
    try:
        image = _image_to_rgb_array(raw)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"تعذر قراءة الصورة: {e}") from e

    encs = _collect_reference_encodings(image)
    if not encs:
        raise HTTPException(
            status_code=422,
            detail="لم يُعثر على وجه في الصورة. جرّب صورة أوضح بوجه واحد.",
        )

    KNOWN_REF_ENCODINGS = encs
    return {
        "ok": True,
        "message": "تم حفظ الوجه المرجعي (مع معالجة اتجاه الصورة).",
        "variants": len(encs),
    }


def _face_boxes_from_rgb(
    rgb: np.ndarray, *, max_side: int = 1280
) -> list[dict[str, int]]:
    """مستطيلات الوجوه فقط (بدون مقارنة مرجع) — لمعاينة مباشرة من الكاميرا."""
    oh, ow = rgb.shape[:2]
    small = _resize_max_side(rgb, max_side)
    sw = small.shape[1]
    sx = ow / sw
    sy = oh / small.shape[0]
    locs = face_recognition.face_locations(
        small,
        number_of_times_to_upsample=2,
        model="hog",
    )
    boxes: list[dict[str, int]] = []
    for (t, r, b, l) in locs:
        box = {
            "top": int(round(t * sy)),
            "right": int(round(r * sx)),
            "bottom": int(round(b * sy)),
            "left": int(round(l * sx)),
        }
        box["left"] = max(0, min(ow - 1, box["left"]))
        box["right"] = max(0, min(ow, box["right"]))
        box["top"] = max(0, min(oh - 1, box["top"]))
        box["bottom"] = max(0, min(oh, box["bottom"]))
        if box["right"] > box["left"] and box["bottom"] > box["top"]:
            boxes.append(box)
    return boxes


@app.post("/api/detect-faces")
async def detect_faces(file: UploadFile = File(...)) -> dict[str, Any]:
    """كشف وجوه في إطار الكاميرا — لا يحتاج صورة مرجعية."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="أرسل ملف صورة.")

    raw = await file.read()
    try:
        image = _image_to_rgb_array(raw)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"تعذر قراءة الصورة: {e}") from e

    faces = _face_boxes_from_rgb(image)
    return {"faces": faces}


@app.post("/api/analyze-frame")
async def analyze_frame(file: UploadFile = File(...)) -> dict[str, Any]:
    """كشف وجوه + تخمين الاسم من مجلد faces ومن صورة المرجع."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="أرسل ملف صورة.")

    raw = await file.read()
    try:
        image = _image_to_rgb_array(raw)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"تعذر قراءة الصورة: {e}") from e

    faces = _face_boxes_from_rgb(image)
    items = _faces_with_encodings(image)
    picked = _pick_largest_face(items)
    identity: dict[str, Any] | None = None
    if picked is not None:
        enc, _box = picked
        identity = _identify_face_encoding(enc)

    return {"faces": faces, "identity": identity}


def _resize_max_side(rgb: np.ndarray, max_side: int = 960) -> np.ndarray:
    h, w = rgb.shape[:2]
    if max(h, w) <= max_side:
        return rgb
    scale = max_side / max(h, w)
    new_w, new_h = int(w * scale), int(h * scale)
    small_bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    resized = cv2.resize(small_bgr, (new_w, new_h))
    return cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)


def _faces_with_encodings(
    rgb: np.ndarray,
) -> list[tuple[np.ndarray, dict[str, int]]]:
    """ترميزات الوجوه + مستطيلاتها بإحداثيات الصورة الأصلية (عرض × ارتفاع الإطار المرسل)."""
    oh, ow = rgb.shape[:2]
    small = _resize_max_side(rgb, 960)
    sh, sw = small.shape[:2]
    sx = ow / sw
    sy = oh / sh
    items: list[tuple[np.ndarray, dict[str, int]]] = []

    def add_from(arr: np.ndarray, map_from_flipped: bool) -> None:
        locs = face_recognition.face_locations(
            arr,
            number_of_times_to_upsample=2,
            model="hog",
        )
        encs = face_recognition.face_encodings(arr, locs, num_jitters=2)
        for enc, (t, r, b, l) in zip(encs, locs):
            if map_from_flipped:
                l0 = sw - r
                r0 = sw - l
            else:
                l0, r0 = l, r
            box = {
                "top": int(round(t * sy)),
                "right": int(round(r0 * sx)),
                "bottom": int(round(b * sy)),
                "left": int(round(l0 * sx)),
            }
            # قصّ على حدود الصورة
            box["left"] = max(0, min(ow - 1, box["left"]))
            box["right"] = max(0, min(ow, box["right"]))
            box["top"] = max(0, min(oh - 1, box["top"]))
            box["bottom"] = max(0, min(oh, box["bottom"]))
            items.append((enc, box))

    add_from(small, False)
    add_from(_flip_rgb_horizontal(small), True)
    return items


@app.post("/api/match")
async def match_frame(
    file: UploadFile = File(...),
    tolerance: float = Query(default=DEFAULT_TOLERANCE, ge=0.3, le=0.75),
) -> dict[str, Any]:
    if not KNOWN_REF_ENCODINGS:
        raise HTTPException(
            status_code=400,
            detail="ارفع صورة مرجعية أولاً من الواجهة.",
        )

    raw = await file.read()
    try:
        image = _image_to_rgb_array(raw)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"تعذر قراءة الإطار: {e}") from e

    items = _faces_with_encodings(image)

    if not items:
        return {
            "match": False,
            "distance": None,
            "message": "لا يوجد وجه واضح في الإطار.",
            "face_box": None,
            "identity": None,
        }

    best_d = 1e9
    best_box: dict[str, int] | None = None
    best_enc: np.ndarray | None = None
    for ref in KNOWN_REF_ENCODINGS:
        for enc, box in items:
            d = float(face_recognition.face_distance([ref], enc)[0])
            if d < best_d:
                best_d = d
                best_box = box
                best_enc = enc

    is_match = best_d <= tolerance

    identity: dict[str, Any] | None = None
    if best_enc is not None:
        identity = _identify_face_encoding(best_enc)
        if is_match and identity:
            identity = {
                **identity,
                "status": "match_reference",
                "label_ar": f"ـ تطابق مع صورتك المرجعية ✓ — {identity['label_ar']}",
            }

    return {
        "match": is_match,
        "distance": round(float(best_d), 4),
        "message": "نفس الشخص في الصورة المرجعية."
        if is_match
        else "لا يطابق الصورة المرجعية.",
        "face_box": best_box,
        "identity": identity,
    }


@app.post("/api/faces/save")
async def save_captured_face(
    file: UploadFile = File(...),
    name: str = Form(..., min_length=1, max_length=80),
    relation: str = Form("معروف", max_length=80),
) -> dict[str, Any]:
    """يلتقط الواجهة إطاراً ويحفظه في مجلد faces/ بصيغة الاسم_الصلة.jpg"""
    name = name.strip()
    relation = (relation or "").strip() or "معروف"
    if not name:
        raise HTTPException(status_code=400, detail="الاسم مطلوب.")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="أرسل ملف صورة (jpg أو png).")

    raw = await file.read()
    try:
        image = _image_to_rgb_array(raw)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"تعذر قراءة الصورة: {e}") from e

    if _first_face_encoding(image) is None:
        raise HTTPException(
            status_code=422,
            detail="لم يُعثر على وجه في الإطار. وقّف وجهك أمام الكاميرا وحاول مرة أخرى.",
        )

    part_name = _sanitize_filename_part(name, "شخص")
    part_rel = _sanitize_filename_part(relation, "معروف")
    stem = f"{part_name}_{part_rel}"
    out_path = _unique_jpeg_path(stem)

    try:
        Image.fromarray(image).save(out_path, format="JPEG", quality=92)
    except OSError as e:
        raise HTTPException(
            status_code=500, detail=f"تعذر حفظ الملف: {e}"
        ) from e

    rel = out_path.relative_to(PROJECT_ROOT)
    reload_face_library()

    return {
        "ok": True,
        "filename": out_path.name,
        "saved_to": str(rel).replace("\\", "/"),
        "message": f"تم الحفظ في المجلد: {rel.parent}",
    }


reload_face_library()

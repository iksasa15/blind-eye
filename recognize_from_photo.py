"""
التعرف على شخص من الكاميرا باستخدام صورة مرجعية واحدة.

الاستخدام:
  python recognize_from_photo.py --image ./my_face.jpg
  python recognize_from_photo.py -i faces/Ahmed_Brother.jpg --camera 0

المكتبات: pip install opencv-python face_recognition numpy
(على mac قد تحتاج cmake و dlib قبل face_recognition)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import face_recognition
import numpy as np


def load_reference_encoding(image_path: Path) -> np.ndarray:
    if not image_path.is_file():
        print(f"خطأ: الملف غير موجود: {image_path}", file=sys.stderr)
        sys.exit(1)

    image = face_recognition.load_image_file(str(image_path))
    encodings = face_recognition.face_encodings(image)
    if not encodings:
        print(
            "خطأ: لم يُعثر على وجه في الصورة المرجعية. "
            "استخدم صورة واضحة بوجه واحد قريب من الكاميرا.",
            file=sys.stderr,
        )
        sys.exit(1)
    if len(encodings) > 1:
        print("تنبيه: أكثر من وجه في الصورة — سيتم استخدام أول وجه فقط.")
    return encodings[0]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="مقارنة وجه الكاميرا مع صورة مرجعية (face_recognition)."
    )
    parser.add_argument(
        "-i",
        "--image",
        type=Path,
        required=True,
        help="مسار صورة الشخص (jpg أو png) — وجه واحد واضح",
    )
    parser.add_argument(
        "--camera",
        type=int,
        default=0,
        help="رقم الكاميرا (افتراضي 0)",
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.55,
        help="حد التطابق: أقل = أكثر صرامة (مثال 0.45–0.60). الافتراضي 0.55",
    )
    parser.add_argument(
        "--scale",
        type=float,
        default=0.25,
        help="تصغير الإطار للسرعة (0.25 يعني ربع الحجم)",
    )
    args = parser.parse_args()

    known = load_reference_encoding(args.image)
    print(f"تم تحميل الوجه المرجعي من: {args.image.resolve()}")

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print("خطأ: تعذر فتح الكاميرا.", file=sys.stderr)
        sys.exit(1)

    print("\n--- جاهز ---")
    print("اضغط q أو ESC للخروج.\n")

    window = "Face match — اضغط q للخروج"

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        small = cv2.resize(frame, (0, 0), fx=args.scale, fy=args.scale)
        rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)

        locations = face_recognition.face_locations(rgb, model="hog")
        encodings = face_recognition.face_encodings(rgb, locations)

        display = frame.copy()
        label = "لا يوجد وجه"
        color = (0, 165, 255)  # برتقالي

        for (top, right, bottom, left), enc in zip(locations, encodings):
            dist = float(face_recognition.face_distance([known], enc)[0])
            match = dist <= args.tolerance

            if match:
                label = f"نفس الشخص (مسافة {dist:.2f})"
                color = (0, 200, 0)
            else:
                label = f"شخص آخر (مسافة {dist:.2f})"
                color = (0, 0, 220)

            inv = 1.0 / args.scale
            t, r, b, l = (
                int(top * inv),
                int(right * inv),
                int(bottom * inv),
                int(left * inv),
            )
            cv2.rectangle(display, (l, t), (r, b), color, 2)
            cv2.putText(
                display,
                label,
                (l, max(25, t - 10)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                color,
                2,
                cv2.LINE_AA,
            )

        if not locations:
            cv2.putText(
                display,
                label,
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                color,
                2,
                cv2.LINE_AA,
            )

        cv2.imshow(window, display)
        key = cv2.waitKey(1) & 0xFF
        if key in (ord("q"), ord("Q"), 27):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()

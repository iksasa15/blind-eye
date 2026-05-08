import { useEffect, useRef, useState, type RefObject } from "react"
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision"

export type TrackBox = {
  top: number
  right: number
  bottom: number
  left: number
}

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"

function detectionToBox(
  bb: { originX: number; originY: number; width: number; height: number },
  vw: number,
  vh: number
): TrackBox {
  const left = Math.max(0, Math.min(vw - 1, bb.originX))
  const top = Math.max(0, Math.min(vh - 1, bb.originY))
  const right = Math.max(left + 1, Math.min(vw, bb.originX + bb.width))
  const bottom = Math.max(top + 1, Math.min(vh, bb.originY + bb.height))
  return { top, right, bottom, left }
}

/**
 * تتبع وجوه من الكاميرا في المتصفح (إطار بإطار) عبر MediaPipe — يتبع الحركة بسلاسة
 * دون انتظار الخادم. التعرف على الاسم يبقى عبر Python (face_recognition).
 */
export function useClientFaceTrack(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean
): { boxes: TrackBox[]; ready: boolean; failed: boolean } {
  const [boxes, setBoxes] = useState<TrackBox[]>([])
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const detectorRef = useRef<FaceDetector | null>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!enabled) {
      cancelAnimationFrame(rafRef.current)
      setBoxes([])
      setReady(false)
      setFailed(false)
      return
    }

    let cancelled = false

    const boot = async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE, false)
        const tryCreate = (delegate: "GPU" | "CPU") =>
          FaceDetector.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: MODEL_URL,
              delegate,
            },
            runningMode: "VIDEO",
            minDetectionConfidence: 0.4,
            minSuppressionThreshold: 0.22,
          })
        let detector: FaceDetector
        try {
          detector = await tryCreate("GPU")
        } catch {
          detector = await tryCreate("CPU")
        }
        if (cancelled) {
          detector.close()
          return
        }
        detectorRef.current = detector
        setReady(true)
        setFailed(false)

        const loop = () => {
          if (cancelled) return
          const video = videoRef.current
          const det = detectorRef.current
          if (!video || !det || video.readyState < 2) {
            rafRef.current = requestAnimationFrame(loop)
            return
          }
          const vw = video.videoWidth
          const vh = video.videoHeight
          if (!vw || !vh) {
            rafRef.current = requestAnimationFrame(loop)
            return
          }
          try {
            const result = det.detectForVideo(video, performance.now())
            const next: TrackBox[] = []
            for (const d of result.detections) {
              const bb = d.boundingBox
              if (bb) next.push(detectionToBox(bb, vw, vh))
            }
            setBoxes(next)
          } catch {
            setBoxes([])
          }
          rafRef.current = requestAnimationFrame(loop)
        }
        rafRef.current = requestAnimationFrame(loop)
      } catch {
        if (!cancelled) {
          setFailed(true)
          setReady(false)
          setBoxes([])
        }
      }
    }

    void boot()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      const d = detectorRef.current
      detectorRef.current = null
      try {
        d?.close()
      } catch {
        /* ignore */
      }
      setBoxes([])
      setReady(false)
    }
  }, [enabled, videoRef])

  return { boxes, ready, failed }
}

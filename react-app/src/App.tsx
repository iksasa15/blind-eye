import { useCallback, useEffect, useRef, useState } from "react"
import {
  Camera,
  CameraOff,
  Download,
  ImagePlus,
  Loader2,
  Moon,
  RefreshCw,
  Save,
  Scan,
  Server,
  Sun,
  UserCheck,
  UserX,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type MatchResponse = {
  match: boolean
  distance: number | null
  message: string
}

const API_BASE = ""

type HealthCheckResult = { ok: true } | { ok: false; detail: string }

async function fetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; detail: string }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, init)
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const detail =
        typeof data.detail === "string"
          ? data.detail
          : Array.isArray(data.detail)
            ? JSON.stringify(data.detail)
            : res.statusText || "خطأ من الخادم"
      return { ok: false, detail }
    }
    return { ok: true, data: data as T }
  } catch {
    return {
      ok: false,
      detail: "تعذر الاتصال بالخادم. شغّل: uvicorn api.main:app --port 8787",
    }
  }
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [isDark, setIsDark] = useState(false)
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)
  const [referenceLoaded, setReferenceLoaded] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [tolerance, setTolerance] = useState(0.55)
  const [lastMatch, setLastMatch] = useState<MatchResponse | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [retestingServer, setRetestingServer] = useState(false)
  const [faceName, setFaceName] = useState("")
  const [faceRelation, setFaceRelation] = useState("معروف")
  const [saveFaceBusy, setSaveFaceBusy] = useState(false)
  const [snapshotBusy, setSnapshotBusy] = useState(false)

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle("dark", next)
  }

  const checkHealth = useCallback(async (): Promise<HealthCheckResult> => {
    const r = await fetchJson<{ status: string }>("/api/health")
    if (!r.ok) {
      setApiOnline(false)
      return { ok: false, detail: r.detail }
    }
    setApiOnline(true)
    const s = await fetchJson<{ loaded: boolean }>("/api/reference-status")
    if (s.ok) setReferenceLoaded(s.data.loaded)
    return { ok: true }
  }, [])

  const retestServer = useCallback(async () => {
    setRetestingServer(true)
    setErrorMsg(null)
    setStatusMsg(null)
    const res = await checkHealth()
    setRetestingServer(false)
    if (res.ok) {
      setStatusMsg("تم التحقق: الخادم يعمل.")
    } else {
      setErrorMsg(res.detail)
    }
  }, [checkHealth])

  useEffect(() => {
    void checkHealth()
  }, [checkHealth])

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current)
      scanTimerRef.current = null
    }
    setScanning(false)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  const startCamera = async () => {
    setErrorMsg(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      const v = videoRef.current
      if (v) {
        v.srcObject = stream
        await v.play()
      }
      setCameraOn(true)
    } catch {
      setErrorMsg("لم نتمكن من فتح الكاميرا. تحقق من الصلاحيات في المتصفح.")
    }
  }

  const onReferenceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setUploadBusy(true)
    setErrorMsg(null)
    setStatusMsg(null)
    const fd = new FormData()
    fd.append("file", file)
    const r = await fetchJson<{ ok?: boolean; message?: string }>("/api/reference", {
      method: "POST",
      body: fd,
    })
    setUploadBusy(false)
    if (!r.ok) {
      setErrorMsg(r.detail)
      setReferenceLoaded(false)
      return
    }
    setReferenceLoaded(true)
    setStatusMsg(r.data.message ?? "تم حفظ الصورة المرجعية.")
  }

  const captureFrameToJpegBlob = useCallback(
    async (quality = 0.82): Promise<Blob | null> => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) return null

      const w = video.videoWidth
      const h = video.videoHeight
      if (!w || !h) return null

      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")
      if (!ctx) return null
      ctx.drawImage(video, 0, 0, w, h)

      return await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality)
      )
    },
    []
  )

  const captureAndMatch = useCallback(async () => {
    const blob = await captureFrameToJpegBlob(0.82)
    if (!blob) return

    const fd = new FormData()
    fd.append("file", blob, "frame.jpg")
    const r = await fetchJson<MatchResponse>(
      `/api/match?tolerance=${encodeURIComponent(String(tolerance))}`,
      { method: "POST", body: fd }
    )
    if (!r.ok) {
      setErrorMsg(r.detail)
      return
    }
    setLastMatch(r.data)
    setErrorMsg(null)
  }, [tolerance, captureFrameToJpegBlob])

  const saveCaptureToFaces = async () => {
    if (!cameraOn) {
      setErrorMsg("شغّل الكاميرا أولاً.")
      return
    }
    const name = faceName.trim()
    if (!name) {
      setErrorMsg("اكتب الاسم قبل الحفظ (يُستخدم في اسم الملف).")
      return
    }
    setSaveFaceBusy(true)
    setErrorMsg(null)
    setStatusMsg(null)

    const blob = await captureFrameToJpegBlob(0.92)
    if (!blob) {
      setSaveFaceBusy(false)
      setErrorMsg("تعذر التقاط الإطار. تأكد أن الكاميرا تعرض صورة.")
      return
    }

    const fd = new FormData()
    fd.append("file", blob, "capture.jpg")
    fd.append("name", name)
    fd.append("relation", faceRelation.trim() || "معروف")

    const r = await fetchJson<{
      ok?: boolean
      filename?: string
      saved_to?: string
      message?: string
    }>("/api/faces/save", { method: "POST", body: fd })

    setSaveFaceBusy(false)
    if (!r.ok) {
      setErrorMsg(r.detail)
      return
    }
    setStatusMsg(
      r.data.message
        ? `${r.data.message} — ${r.data.filename ?? ""}`
        : `تم الحفظ: ${r.data.saved_to ?? r.data.filename ?? ""}`
    )
  }

  const downloadSnapshotFromBrowser = async () => {
    if (!cameraOn) {
      setErrorMsg("شغّل الكاميرا أولاً.")
      return
    }
    setSnapshotBusy(true)
    setErrorMsg(null)
    const blob = await captureFrameToJpegBlob(0.95)
    setSnapshotBusy(false)
    if (!blob) {
      setErrorMsg("تعذر التقاط الصورة من المتصفح.")
      return
    }
    const url = URL.createObjectURL(blob)
    const stamp = new Date()
      .toISOString()
      .replaceAll(":", "-")
      .replace("T", "_")
      .slice(0, 19)
    const a = document.createElement("a")
    a.href = url
    a.download = `webcam-capture_${stamp}.jpg`
    a.rel = "noopener"
    a.click()
    URL.revokeObjectURL(url)
    setStatusMsg("تم تحميل لقطة من الكاميرا كملف JPG (مجلد التنزيلات في المتصفح).")
  }

  useEffect(() => {
    if (!scanning || !cameraOn) return
    void captureAndMatch()
    scanTimerRef.current = setInterval(() => {
      void captureAndMatch()
    }, 1200)
    return () => {
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current)
        scanTimerRef.current = null
      }
    }
  }, [scanning, cameraOn, captureAndMatch])

  const toggleScan = () => {
    if (!referenceLoaded) {
      setErrorMsg("ارفع صورة مرجعية أولاً.")
      return
    }
    if (!cameraOn) {
      setErrorMsg("شغّل الكاميرا أولاً.")
      return
    }
    setScanning((s) => !s)
    setErrorMsg(null)
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b border-border/40 backdrop-blur-md bg-background/80 sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="size-8 shrink-0 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 grid place-items-center">
              <Scan className="size-4 text-white" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-base sm:text-lg truncate block">
                التعرف على الوجه
              </span>
              <span className="text-xs text-muted-foreground hidden sm:block">
                React + Python (FastAPI)
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`hidden sm:inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                apiOnline
                  ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                  : "border-destructive/30 text-destructive"
              }`}
              title="حالة خادم Python"
            >
              <Server className="size-3" />
              {apiOnline === null
                ? "…"
                : apiOnline
                  ? "الخادم متصل"
                  : "الخادم غير متصل"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              title="إعادة اختبار الخادم"
              aria-label="إعادة اختبار الخادم"
              disabled={retestingServer}
              onClick={() => void retestServer()}
            >
              {retestingServer ? (
                <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
              ) : (
                <RefreshCw className="size-4 shrink-0" aria-hidden />
              )}
              <span className="hidden sm:inline">إعادة اختبار الخادم</span>
            </Button>
            <Button variant="ghost" size="icon" type="button" onClick={toggleTheme}>
              {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-8 max-w-4xl space-y-6">
        {errorMsg && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {errorMsg}
          </div>
        )}
        {statusMsg && !errorMsg && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
            {statusMsg}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ImagePlus className="size-5" />
                صورة مرجعية
              </CardTitle>
              <CardDescription>
                صورة واضحة لوجه واحد — تُستخدم للمقارنة مع الكاميرا.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">اختر ملفاً</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadBusy || apiOnline === false}
                  onChange={(e) => void onReferenceFile(e)}
                  className="text-sm file:me-3 file:rounded-md file:border file:border-input file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
                />
              </label>
              {uploadBusy && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  جاري المعالجة…
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                الحالة:{" "}
                <strong>{referenceLoaded ? "تم التحميل" : "لم تُرفع بعد"}</strong>
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={retestingServer}
                onClick={() => void retestServer()}
              >
                {retestingServer ? (
                  <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
                ) : (
                  <RefreshCw className="size-4 shrink-0" aria-hidden />
                )}
                إعادة اختبار الخادم
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Camera className="size-5" />
                الكاميرا والمسح
              </CardTitle>
              <CardDescription>
                افتح الكاميرا ثم فعّل المسح الدوري لإرسال إطارات إلى Python.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {!cameraOn ? (
                  <Button type="button" onClick={() => void startCamera()}>
                    <Camera className="size-4" />
                    تشغيل الكاميرا
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" onClick={stopCamera}>
                    <CameraOff className="size-4" />
                    إيقاف الكاميرا
                  </Button>
                )}
                <Button
                  type="button"
                  variant={scanning ? "destructive" : "default"}
                  disabled={!cameraOn || !referenceLoaded}
                  onClick={toggleScan}
                >
                  {scanning ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      إيقاف المسح
                    </>
                  ) : (
                    <>
                      <Scan className="size-4" />
                      بدء المسح
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="tol">
                  حد التطابق (tolerance): {tolerance.toFixed(2)}
                </label>
                <input
                  id="tol"
                  type="range"
                  min={0.35}
                  max={0.7}
                  step={0.01}
                  value={tolerance}
                  onChange={(e) => setTolerance(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <p className="text-xs text-muted-foreground">
                  أقل = أكثر صرامة (أقل قبول للتشابه).
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">معاينة الكاميرا</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative rounded-lg border bg-muted/30 overflow-hidden aspect-video grid place-items-center">
              <video
                ref={videoRef}
                className="max-h-[420px] w-full object-contain mirror"
                playsInline
                muted
                autoPlay
              />
              {!cameraOn && (
                <span className="absolute text-sm text-muted-foreground">
                  الكاميرا متوقفة
                </span>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between rounded-lg border bg-muted/20 p-3">
              <p className="text-sm text-muted-foreground">
                التقاط صورة من الكاميرا وتنزيلها على جهازك (يعمل بدون خادم).
              </p>
              <Button
                type="button"
                className="gap-2 shrink-0"
                disabled={!cameraOn || snapshotBusy}
                onClick={() => void downloadSnapshotFromBrowser()}
              >
                {snapshotBusy ? (
                  <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
                ) : (
                  <Download className="size-4 shrink-0" aria-hidden />
                )}
                التقاط صورة من المتصفح
              </Button>
            </div>

            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Save className="size-4" />
                  حفظ لقطة في مجلد faces
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  يُحفظ الملف على جهازك داخل{" "}
                  <code className="rounded bg-muted px-1">project test/faces/</code>{" "}
                  بصيغة الاسم_الصلة.jpg (متوافق مع <code className="rounded bg-muted px-1">database_loader.py</code>).
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium">الاسم</span>
                  <input
                    type="text"
                    value={faceName}
                    onChange={(e) => setFaceName(e.target.value)}
                    placeholder="مثال: أحمد"
                    disabled={!cameraOn || saveFaceBusy}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">صلة القرابة / وصف</span>
                  <input
                    type="text"
                    value={faceRelation}
                    onChange={(e) => setFaceRelation(e.target.value)}
                    placeholder="مثال: أخ"
                    disabled={!cameraOn || saveFaceBusy}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                disabled={!cameraOn || saveFaceBusy || apiOnline === false}
                onClick={() => void saveCaptureToFaces()}
              >
                {saveFaceBusy ? (
                  <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
                ) : (
                  <Save className="size-4 shrink-0" aria-hidden />
                )}
                التقاط صورة وحفظها في faces
              </Button>
            </div>

            {lastMatch && (
              <div
                className={`flex flex-wrap items-center gap-3 rounded-lg border p-4 ${
                  lastMatch.match
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-border bg-muted/40"
                }`}
              >
                {lastMatch.match ? (
                  <UserCheck className="size-10 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <UserX className="size-10 text-muted-foreground shrink-0" />
                )}
                <div>
                  <p className="font-semibold text-lg">
                    {lastMatch.match ? "تطابق" : "لا تطابق"}
                  </p>
                  <p className="text-sm text-muted-foreground">{lastMatch.message}</p>
                  {lastMatch.distance != null && (
                    <p className="text-xs mt-1 font-mono">
                      المسافة: {lastMatch.distance}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="py-4 text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">تشغيل الخادم:</strong> من مجلد{" "}
            <code className="rounded bg-muted px-1">project test</code> نفّذ:{" "}
            <code className="rounded bg-muted px-1 text-xs">
              pip install -r api/requirements.txt && uvicorn api.main:app --reload
              --port 8787
            </code>
            <br />
            ثم من <code className="rounded bg-muted px-1">react-app</code>:{" "}
            <code className="rounded bg-muted px-1 text-xs">npm run dev</code> — الوكيل
            يوجّه <code className="rounded bg-muted px-1">/api</code> إلى المنفذ 8787.
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default App

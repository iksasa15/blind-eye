# blind-eye

تطبيق ويب للتعرف على الوجوه باستخدام واجهة React وخادم FastAPI.

## المتطلبات

- Node.js
- npm
- Python 3.11 أو أحدث
- على macOS قد تحتاج أدوات بناء قبل تثبيت مكتبة `face_recognition`:

```bash
brew install cmake
```

## تشغيل الخادم الخلفي

من مجلد المشروع الرئيسي:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r api/requirements.txt
uvicorn api.main:app --reload --port 8787
```

بعد التشغيل، يمكن اختبار الخادم من:

```bash
http://127.0.0.1:8787/api/health
```

## تشغيل واجهة React

افتح نافذة Terminal ثانية، ثم شغّل:

```bash
cd react-app
npm install
npm run dev
```

افتح التطبيق من الرابط الذي يظهر في الطرفية، غالباً:

```bash
http://localhost:5173
```

## ملاحظات مهمة

- يجب تشغيل الخادم الخلفي على المنفذ `8787` لأن إعدادات Vite تمرر طلبات `/api` إلى `http://127.0.0.1:8787`.
- عند حفظ وجه من الواجهة، سيُنشئ الخادم مجلد `faces` في جذر المشروع ويحفظ الصور داخله.
- إذا فشل تثبيت `face_recognition` أو `dlib` على macOS، تأكد من تثبيت `cmake` ثم أعد تشغيل أمر `pip install`.

## أوامر مفيدة

داخل مجلد `react-app`:

```bash
npm run build
npm run lint
npm run preview
```

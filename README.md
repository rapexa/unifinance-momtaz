# یونی‌فایننس — نرم‌افزار مالی مؤسسات مشاوره تحصیلی

شهریه و اقساط دانش‌آموزان (مانده ماه / مانده کل)، حقوق و سهم مشاوران با حساب جاری، پیامک یادآوری بدهی، لینک و درگاه پرداخت، مراکز هزینه، قرارداد مدارس، گزارش سود و زیان و داشبورد مالی — با تقویم شمسی.

## ساختار

| مسیر | توضیح |
|---|---|
| `src/` | فرانت‌اند (React + Vite + TypeScript + shadcn/ui) |
| `src/pages/Landing.tsx`, `src/config/saas.ts` | صفحه فروش؛ قیمت‌ها و اطلاعات تماس در `saas.ts` |
| `backend/` | API (Go + Gin + GORM + MySQL/MariaDB)؛ مهاجرت پایگاه داده هنگام اجرا خودکار است |
| `backend/cmd/license` | ابزار صدور لایسنس مشتری‌ها |
| `Dockerfile` | یک ایمیج شامل API و فرانت (هر کانتینر = یک مشتری) |
| `deploy/` | راه‌اندازی سرور SaaS، نصب روی سرور مشتری و به‌روزرسانی سرور فعلی — **[راهنما](deploy/README.md)** |

## اجرای محلی

```bash
# API
cd backend && cp config.example.yaml config.yaml   # اطلاعات پایگاه داده را تنظیم کنید
go run ./cmd                                         # http://localhost:8081

# فرانت
npm ci && npm run dev                                # http://localhost:8080
```

همه تنظیمات `config.yaml` با متغیر محیطی `UNIFINANCE_*` هم قابل تغییرند (مثلاً `UNIFINANCE_DB_PASS`).

## تست

```bash
cd backend && go test ./...
npx vitest run
```

# راهنمای راه‌اندازی و فروش (SaaS)

سه حالت اجرا پشتیبانی می‌شود:

| حالت | برای چه کسی | ابزار |
|---|---|---|
| **سرور فعلی ممتاز** | همان نصب فعلی (بدون Docker) | `deploy/momtaz/update.sh` |
| **ابری روی سرور شما (SaaS)** | مشتری‌هایی که روی سرور شما با زیردامنه یا دامنه خودشان کار می‌کنند | `deploy/saas/uf.sh` |
| **روی سرور مشتری (On-Premise)** | مشتری‌هایی که سرور خودشان را می‌خواهند | `uf.sh onprem-bundle` ← `deploy/onprem/` |

هر مشتری **کانتینر، پایگاه داده، دامنه، مدیر و لایسنس جداگانه** دارد؛ اطلاعات مشتری‌ها هیچ‌وقت با هم قاطی نمی‌شود.

### چه کسی رایگان است و چه کسی پلن لازم دارد؟

- **گروه مشاوره ممتاز (نصب فعلی): رایگان، دائمی و بدون محدودیت.** هنگام اولین اجرای این نسخه، برنامه می‌بیند که پایگاه داده از قبل کاربر دارد و آن را «نصب مالک» علامت می‌زند. در تنظیمات «اشتراک ویژه مالک — رایگان · نامحدود» نمایش داده می‌شود. هیچ کاری لازم نیست.
- **هر نصب دیگری پلن لازم دارد:** هر پایگاه داده تازه (مشتری جدید) بدون لایسنس فقط‌خواندنی است. ایمیج Docker (سرور SaaS و نصب روی سرور مشتری) هیچ‌وقت «مالک» نمی‌شود، حتی اگر کسی پایگاه داده یا تنظیماتش را دست‌کاری کند.
- کلید عمومی لایسنس داخل برنامه است (`backend/pkg/license/vendor_key.go`). **کلید خصوصی** (`license-private.key`) فقط نزد شماست و با آن برای مشتری‌ها لایسنس صادر می‌کنید. اگر گم شود، باید جفت‌کلید جدید بسازید و کلید عمومی داخل برنامه را عوض کنید؛ از آن چند نسخه پشتیبان امن نگه دارید.
- اگر روزی به هر دلیل روی سرور ممتاز بنر «لایسنس ثبت نشده» دیدید: در `backend/config.yaml` این دو خط را اضافه کنید و API را ری‌استارت کنید:
  ```yaml
  license:
    owner: true
  ```

---

## ۱) به‌روزرسانی سرور فعلی ممتاز

روی سرور، داخل پوشه پروژه:

```bash
SERVICE=نام-سرویس-systemd WEB_ROOT=/مسیر/فرانت ./deploy/momtaz/update.sh
```

کارهایی که انجام می‌دهد: `git pull`، پشتیبان پایگاه داده در `backups/`، ساخت API و فرانت، کپی فرانت به `WEB_ROOT`، ری‌استارت سرویس و بررسی سلامت. تغییرات پایگاه داده هنگام اجرای API خودکار اعمال می‌شود.

> نسخه‌ای که از سورس ساخته می‌شود لایسنس ندارد و نامحدود است؛ رفتار سرور ممتاز تغییری نمی‌کند.

**دیپلوی خودکار با هر push:** در GitHub → Settings → Secrets → Actions این‌ها را تعریف کنید:
`MOMTAZ_SSH_HOST`، `MOMTAZ_SSH_USER`، `MOMTAZ_SSH_KEY` (کلید خصوصی SSH)، `MOMTAZ_APP_DIR` (مسیر پروژه روی سرور) و در صورت نیاز `MOMTAZ_SERVICE` و `MOMTAZ_WEB_ROOT`. از آن به بعد هر push روی `main` خودکار دیپلوی می‌شود (`.github/workflows/deploy.yml`).

---

## ۲) سرور SaaS (میزبانی چند مشتری)

### پیش‌نیاز
- سرور Ubuntu 22.04+، حداقل ۴ گیگ رم (هر مشتری حدود ۵۰ تا ۱۰۰ مگ رم مصرف می‌کند)
- Docker + compose plugin
- یک دامنه اصلی (مثلاً `unifinance.ir`) با رکورد **wildcard**: `*.unifinance.ir → IP سرور` و رکورد A برای خود دامنه

### راه‌اندازی اولیه

```bash
git clone <repo> /opt/unifinance && cd /opt/unifinance/deploy/saas
./uf.sh setup          # بار اول: فایل .env را می‌سازد
nano .env              # BASE_DOMAIN و ACME_EMAIL را تنظیم کنید (و mirrorها در صورت نیاز)
mkdir -p keys && nano keys/license-private.key   # محتوای فایل license-private.key که دارید را اینجا بچسبانید
chmod 600 keys/license-private.key
./uf.sh setup          # ساخت ایمیج، بررسی کلید، راه‌اندازی MariaDB و Caddy
./uf.sh install-cron   # پشتیبان‌گیری شبانه
```

> **مهم:** `keys/license-private.key` کلید امضای همه لایسنس‌هاست. آن را هرگز در گیت قرار ندهید و نسخه پشتیبان امن خارج از سرور نگه دارید.

### سایت فروش خودتان

```bash
./uf.sh create sales --domain unifinance.ir --org "یونی‌فایننس" --admin-email you@example.com --vendor
```

- صفحه اول `https://unifinance.ir` صفحه فروش است و «ورود» به پنل خودتان می‌رود.
- درخواست‌های دمو در منوی «درخواست‌های دمو» همین پنل جمع می‌شود.
- برای پیامک هر درخواست جدید: در `tenants/sales/tenant.env` مقدار `UNIFINANCE_SAAS_NOTIFY_PHONE` و اطلاعات ملی‌پیامک (`UNIFINANCE_MELIPAYAMAK_*` با `FROM`) را بگذارید و `./uf.sh restart sales`.
- قیمت‌ها، محدودیت پلن‌ها، سؤالات متداول و راه‌های تماس در `src/config/saas.ts` است؛ بعد از ویرایش `./uf.sh update sales`.

### پلن‌ها

| پلن | `--plan` | سقف پیش‌فرض |
|---|---|---|
| پایه | `basic` | ۱۰۰ دانش‌آموز فعال، ۵ کاربر |
| حرفه‌ای | `pro` | ۴۰۰ دانش‌آموز، ۱۵ کاربر |
| سازمانی | `enterprise` | نامحدود |
| آزمایشی | `--trial 14` | مثل حرفه‌ای، ۱۴ روز |
| رایگان دائمی (هدیه) | `--free` | نامحدود، بدون انقضا |

با `--students` و `--users` می‌توانید سقف را تغییر دهید و با `--months` مدت را. قیمت‌ها و متن پلن‌ها در صفحه فروش از `src/config/saas.ts` می‌آید؛ اگر سقف‌ها را عوض کردید، هر دو جا را یکی کنید.

### ساخت مشتری جدید

```bash
# زیردامنه رایگان: ayandeh.unifinance.ir — یک سال پلن حرفه‌ای
./uf.sh create ayandeh --org "مؤسسه مشاوره آینده" --admin-email admin@ayandeh.ir \
  --plan pro --months 12

# دوره آزمایشی ۱۴ روزه روی دامنه خود مشتری
./uf.sh create saba --domain panel.saba.ir --org "آموزشگاه صبا" --admin-email boss@saba.ir --trial 14
```

خروجی: آدرس پنل، ایمیل و رمز اولیه (در `tenants/<slug>/credentials.txt` هم ذخیره می‌شود) برای ارسال به مشتری.
برای دامنه خود مشتری، او باید رکورد A دامنه‌اش را به IP سرور شما بزند؛ گواهی HTTPS خودکار صادر می‌شود.

**تنظیم درگاه و پیامک اختصاصی مشتری:** در `tenants/<slug>/tenant.env` مقادیر `UNIFINANCE_ZARINPAL_MERCHANT_ID` و `UNIFINANCE_MELIPAYAMAK_*` را وارد و `./uf.sh restart <slug>` کنید.

### مدیریت روزانه

| کار | دستور |
|---|---|
| فهرست مشتری‌ها و تاریخ انقضا | `./uf.sh list` |
| تمدید / ارتقا | `./uf.sh license ayandeh --plan pro --months 12` |
| تعلیق (عدم پرداخت) | `./uf.sh suspend ayandeh` (اطلاعات حفظ می‌شود) |
| فعال‌سازی مجدد | `./uf.sh resume ayandeh` |
| پشتیبان | `./uf.sh backup --all` یا `./uf.sh backup ayandeh` |
| بازگردانی | `./uf.sh restore ayandeh backups/ayandeh/<file>.sql.gz` |
| لاگ | `./uf.sh logs ayandeh` |
| حذف | `./uf.sh remove ayandeh` (با `--purge` همه اطلاعات حذف می‌شود) |
| به‌روزرسانی همه به نسخه جدید | `git pull && ./uf.sh update --all` |

### رفتار اشتراک
- تا تاریخ انقضا همه امکانات فعال است؛ از ۱۴ روز مانده، بنر تمدید نمایش داده می‌شود.
- تا ۷ روز پس از انقضا همچنان کار می‌کند (با هشدار)؛ بعد از آن **فقط‌خواندنی** می‌شود: اطلاعات دیده می‌شود، ولی ثبت و ویرایش تا تمدید بسته است. هیچ اطلاعاتی حذف نمی‌شود.
- سقف دانش‌آموزان/کاربران فعال پلن هنگام ثبت مورد جدید کنترل می‌شود (`0` = نامحدود).
- مشتری کلید تمدید را می‌تواند خودش در «مدیریت سال مالی ← اشتراک نرم‌افزار» وارد کند؛ `uf.sh license` این کار را خودکار انجام می‌دهد.

---

## ۳) نصب روی سرور مشتری

روی سرور SaaS خودتان:

```bash
./uf.sh onprem-bundle ayandeh --org "مؤسسه مشاوره آینده" --plan onprem --months 12
```

فایل `dist/onprem-ayandeh.tar.gz` (حدود ۲۰ مگ: برنامه + لایسنس + اسکریپت‌ها) را برای مشتری بفرستید. او طبق `README.md` داخل بسته فقط اجرا می‌کند:

```bash
sudo ./install.sh --domain panel.ayandeh.ir --org "مؤسسه مشاوره آینده" --admin-email admin@ayandeh.ir
```

برای تمدید، کلید جدید را با `./uf.sh`-ی که لایسنس صادر می‌کند بسازید (یا دوباره `onprem-bundle`) و کلید را برای مشتری بفرستید تا در پنل وارد کند.

---

## ۴) نکات سرورهای داخل ایران

- Docker Hub معمولاً از ایران در دسترس نیست. ساده‌ترین راه، تنظیم یک registry mirror در Docker است؛ در `/etc/docker/daemon.json`:
  ```json
  { "registry-mirrors": ["https://docker.arvancloud.ir"] }
  ```
  سپس `sudo systemctl restart docker`. (هر mirror دیگری که Docker Hub را proxy کند هم کار می‌کند.)
- یا نام کامل تصاویر را در `.env` به یک mirror تغییر دهید؛ قالب آن مثل `mirror.gcr.io/library/mariadb:11` است (`MARIADB_IMAGE`، `CADDY_IMAGE`، `NODE_IMAGE`، `GO_IMAGE`، `RUNTIME_IMAGE`).
- برای npm و Go هم در صورت نیاز `NPM_REGISTRY` و `GOPROXY` را به mirror تغییر دهید.
- راه دیگر: ایمیج را GitHub Actions می‌سازد (`.github/workflows/docker.yml`)؛ فایل `unifinance-image.tar.gz` را از بخش Artifacts دانلود و با `gunzip -c unifinance-image.tar.gz | docker load` روی سرور بارگذاری کنید؛ سپس در `.env` مقدار `IMAGE=unifinance:latest` بماند و `SKIP_BUILD=1 ./uf.sh update --all` بزنید.

---

## ۵) امنیت

- `backend/config.example.yaml` و فایل‌های `.env` داخل مخزن، رمز پایگاه داده، کلید JWT، API پیامک و merchant زرین‌پال واقعی دارند. آن‌ها را از مخزن حذف و روی سرور **عوض** کنید.
- فایل‌های `deploy/saas/.env`، `keys/`، `tenants/` و `backups/` در `.gitignore` هستند؛ آن‌ها را هرگز commit نکنید.

/**
 * Normalize API / thrown errors into Persian, user-facing messages.
 * Technical English messages are mapped or replaced with a safe fallback.
 * Already-Persian backend messages are kept as-is.
 */

const EXACT_MAP: Record<string, string> = {
  "invalid credentials": "ایمیل یا رمز عبور نامعتبر است.",
  "user is inactive": "حساب کاربری غیرفعال است.",
  "access denied: admin only": "دسترسی فقط برای مدیر مجاز است.",
  "access denied": "دسترسی مجاز نیست.",
  "internal error": "خطای داخلی سرور. لطفاً دوباره تلاش کنید.",
  "invalid refresh token": "نشست نامعتبر است. دوباره وارد شوید.",
  "missing user in context": "نشست نامعتبر است. دوباره وارد شوید.",
  "invalid user id type": "نشست نامعتبر است. دوباره وارد شوید.",
  "user not found": "کاربر یافت نشد.",
  "logout failed": "خروج با خطا مواجه شد.",
  "if this email exists, a reset link will be sent":
    "اگر این ایمیل ثبت شده باشد، لینک بازیابی ارسال می‌شود.",
  "missing authorization header": "نشست منقضی شده است. دوباره وارد شوید.",
  "invalid authorization header": "نشست نامعتبر است. دوباره وارد شوید.",
  "invalid or expired token": "نشست منقضی شده است. دوباره وارد شوید.",
  "invalid token type": "نشست نامعتبر است. دوباره وارد شوید.",
  "failed to verify session": "خطا در بررسی نشست. دوباره تلاش کنید.",
  "session expired, please log in again": "نشست منقضی شده است. دوباره وارد شوید.",
  "missing role in context": "دسترسی مجاز نیست.",
  "invalid role type": "دسترسی مجاز نیست.",
  "insufficient permissions": "شما به این بخش دسترسی ندارید.",
  "failed to check permission": "خطا در بررسی دسترسی.",
  "failed to list students": "خطا در دریافت لیست دانش‌آموزان.",
  "student not found": "دانش‌آموز یافت نشد.",
  "invalid id": "شناسه نامعتبر است.",
  "school_contract_id is required for school registration":
    "برای ثبت‌نام مدرسه‌ای، انتخاب قرارداد مدرسه الزامی است.",
  "delivery_mode is required (online or in_person)":
    "نحوه برگزاری (آنلاین یا حضوری) الزامی است.",
  "failed to create student": "ثبت دانش‌آموز با خطا مواجه شد.",
  "failed to update student": "ویرایش دانش‌آموز با خطا مواجه شد.",
  "failed to list payments": "خطا در دریافت لیست پرداخت‌ها.",
  "payment not found": "پرداخت یافت نشد.",
  "failed to get payment summary": "خطا در دریافت خلاصه پرداخت‌ها.",
  "student_id is required": "انتخاب دانش‌آموز الزامی است.",
  "amount must be greater than zero": "مبلغ باید بیشتر از صفر باشد.",
  "failed to load reports summary": "خطا در دریافت خلاصه گزارش‌ها.",
  "failed to load revenue series": "خطا در دریافت نمودار درآمد.",
  "failed to load payroll series": "خطا در دریافت نمودار حقوق.",
  "failed to load payment details": "خطا در دریافت جزئیات پرداخت‌ها.",
  "failed to load revenue by student": "خطا در دریافت درآمد به تفکیک دانش‌آموز.",
  "failed to load payroll lines": "خطا در دریافت جزئیات حقوق.",
  "failed to load payroll by user": "خطا در دریافت حقوق به تفکیک کارمند.",
  "failed to load student debts": "خطا در دریافت بدهی دانش‌آموزان.",
  "failed to load advisor debts": "خطا در دریافت بدهی مشاوران.",
  "invalid month; expected yyyy-mm": "فرمت ماه نامعتبر است (مثال: ۱۴۰۳-۰۱).",
  "invalid from; expected yyyy-mm": "تاریخ شروع نامعتبر است.",
  "invalid to; expected yyyy-mm": "تاریخ پایان نامعتبر است.",
  "to must be greater than or equal to from": "تاریخ پایان باید بعد از شروع باشد.",
  "failed to load organization settings": "خطا در دریافت تنظیمات سازمان.",
  "failed to update organization settings": "خطا در ذخیره تنظیمات سازمان.",
  "failed to load profile": "خطا در دریافت پروفایل.",
  "avatar file is required": "انتخاب تصویر الزامی است.",
  "invalid image type; use jpg, png, gif or webp":
    "فرمت تصویر نامعتبر است؛ از jpg، png، gif یا webp استفاده کنید.",
  "failed to save avatar": "ذخیره تصویر با خطا مواجه شد.",
  "failed to update profile": "ذخیره پروفایل با خطا مواجه شد.",
  "email already exists": "این ایمیل قبلاً ثبت شده است.",
  "current password is incorrect": "رمز عبور فعلی نادرست است.",
  "new password is too short": "رمز عبور جدید کوتاه است.",
  "failed to change password": "تغییر رمز عبور با خطا مواجه شد.",
  "failed to update 2fa setting": "خطا در تنظیم احراز هویت دو مرحله‌ای.",
  "failed to load notifications settings": "خطا در دریافت تنظیمات اعلان‌ها.",
  "failed to update notifications settings": "خطا در ذخیره تنظیمات اعلان‌ها.",
  "failed to load payment settings": "خطا در دریافت تنظیمات پرداخت.",
  "failed to update payment settings": "خطا در ذخیره تنظیمات پرداخت.",
  "failed to load dashboard kpis": "خطا در دریافت شاخص‌های داشبورد.",
  "failed to load recent payments": "خطا در دریافت پرداخت‌های اخیر.",
  "failed to load debt alerts": "خطا در دریافت هشدار بدهی‌ها.",
  "failed to load revenue trend": "خطا در دریافت روند درآمد.",
  "failed to list roles": "خطا در دریافت نقش‌ها.",
  "role not found": "نقش یافت نشد.",
  "role code already exists": "کد نقش تکراری است.",
  "cannot delete system role": "نقش سیستمی قابل حذف نیست.",
  "name is required": "نام الزامی است.",
  "failed to list school contracts": "خطا در دریافت قراردادهای مدرسه.",
  "school contract not found": "قرارداد مدرسه یافت نشد.",
  "failed to create school contract": "ثبت قرارداد مدرسه با خطا مواجه شد.",
  "failed to update school contract": "ویرایش قرارداد مدرسه با خطا مواجه شد.",
  "failed to delete school contract": "حذف قرارداد مدرسه با خطا مواجه شد.",
  "plan not found": "پلن یافت نشد.",
  "invalid response from server": "پاسخ سرور نامعتبر است.",
  "server unreachable. please try again later.":
    "خطای اتصال به سرور. لطفاً بعداً دوباره تلاش کنید.",
  "login failed": "ورود ناموفق بود. دوباره تلاش کنید.",
  "payslip is paid and locked": "این فیش پرداخت شده و قفل است.",
};

const CONTAINS_MAP: Array<[RegExp, string]> = [
  [/failed to fetch|networkerror|load failed/i, "خطای اتصال به سرور. لطفاً اتصال اینترنت را بررسی کنید."],
  [/invalid credentials/i, "ایمیل یا رمز عبور نامعتبر است."],
  [/access denied/i, "دسترسی مجاز نیست."],
  [/insufficient permissions/i, "شما به این بخش دسترسی ندارید."],
  [/session expired/i, "نشست منقضی شده است. دوباره وارد شوید."],
  [/expired token|invalid token/i, "نشست منقضی شده است. دوباره وارد شوید."],
  [/not found/i, "مورد درخواستی یافت نشد."],
  [/already exists/i, "این مورد قبلاً ثبت شده است."],
  [/forbidden/i, "دسترسی مجاز نیست."],
  [/unauthorized/i, "لطفاً دوباره وارد شوید."],
  [/internal( server)? error|failed to/i, "خطایی رخ داد. لطفاً دوباره تلاش کنید."],
  [/Key: '|json:|binding/i, "اطلاعات ارسالی نامعتبر است."],
];

function hasPersian(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

/** Map a raw API error string to a Persian user-facing message. */
export function localizeApiError(raw: unknown, fallback: string): string {
  const msg = typeof raw === "string" ? raw.trim() : "";
  if (!msg) return fallback;
  if (hasPersian(msg)) return msg;

  const exact = EXACT_MAP[msg.toLowerCase()];
  if (exact) return exact;

  for (const [re, fa] of CONTAINS_MAP) {
    if (re.test(msg)) return fa;
  }

  return fallback;
}

/** Safe message for toast / inline UI from any thrown value. */
export function toUserError(err: unknown, fallback = "خطایی رخ داد. لطفاً دوباره تلاش کنید."): string {
  if (err instanceof Error) return localizeApiError(err.message, fallback);
  if (typeof err === "string") return localizeApiError(err, fallback);
  return fallback;
}

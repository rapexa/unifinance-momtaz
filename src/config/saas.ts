/**
 * Sales page content. Edit prices, limits and contact details here — nothing else needs to
 * change. Prices are in toman. Leave a contact field empty to hide it.
 *
 * Plan codes must match the -plan value used when issuing license keys (cmd/license).
 */

export interface SaasPlan {
  code: string;
  name: string;
  description: string;
  /** Monthly price in toman; null = «تماس بگیرید» */
  monthly: number | null;
  /** Yearly price in toman (usually ~2 months free); null = «تماس بگیرید» */
  yearly: number | null;
  students: string;
  users: string;
  features: string[];
  highlighted?: boolean;
}

export const SAAS_CONTACT = {
  /** e.g. "021-12345678" */
  phone: "",
  /** e.g. "09121234567" */
  mobile: "",
  /** e.g. "https://t.me/yourid" */
  telegram: "",
  /** e.g. "https://wa.me/989121234567" */
  whatsapp: "",
  /** e.g. "sales@example.com" */
  email: "",
};

/** Free trial length offered on the page (days). */
export const TRIAL_DAYS = 14;

export const SAAS_PLANS: SaasPlan[] = [
  {
    code: "basic",
    name: "پایه",
    description: "برای مشاوران مستقل و مؤسسه‌های کوچک",
    monthly: 890_000,
    yearly: 8_900_000,
    students: "تا ۱۰۰ دانش‌آموز فعال",
    users: "تا ۵ کاربر",
    features: [
      "شهریه، اقساط و مانده ماه/کل دانش‌آموزان",
      "حقوق و سهم مشاوران با حساب جاری",
      "گزارش سود و زیان و بدهی‌ها",
      "زیردامنه اختصاصی و SSL",
      "پشتیبان‌گیری روزانه",
    ],
  },
  {
    code: "pro",
    name: "حرفه‌ای",
    description: "برای مؤسسه‌های در حال رشد با چند مشاور",
    monthly: 1_890_000,
    yearly: 18_900_000,
    students: "تا ۴۰۰ دانش‌آموز فعال",
    users: "تا ۱۵ کاربر",
    features: [
      "همه امکانات پلن پایه",
      "پیامک یادآوری بدهی با متن دلخواه",
      "لینک و درگاه پرداخت آنلاین",
      "قرارداد مدارس و مراکز هزینه",
      "دامنه اختصاصی خودتان",
    ],
    highlighted: true,
  },
  {
    code: "enterprise",
    name: "سازمانی / روی سرور شما",
    description: "برای مجموعه‌های بزرگ یا نصب روی سرور اختصاصی",
    monthly: null,
    yearly: null,
    students: "دانش‌آموز نامحدود",
    users: "کاربر نامحدود",
    features: [
      "همه امکانات پلن حرفه‌ای",
      "نصب روی سرور خودتان (On-Premise)",
      "انتقال اطلاعات قبلی از اکسل",
      "آموزش حضوری/آنلاین تیم",
      "پشتیبانی اولویت‌دار",
    ],
  },
];

export const SAAS_FAQ: { q: string; a: string }[] = [
  {
    q: "اطلاعات ما کجا نگهداری می‌شود؟",
    a: "در نسخه ابری، اطلاعات هر مجموعه در پایگاه داده جداگانه روی سرور ما نگهداری و هر شب پشتیبان‌گیری می‌شود. در نسخه روی سرور شما، اطلاعات کاملاً نزد خودتان است.",
  },
  {
    q: "می‌توانیم روی دامنه خودمان استفاده کنیم؟",
    a: "بله. یک زیردامنه رایگان به شما می‌دهیم و اگر دامنه دارید (مثلاً panel.yourdomain.ir) با یک رکورد DNS روی دامنه خودتان با گواهی SSL راه‌اندازی می‌شود.",
  },
  {
    q: "اطلاعات فعلی‌مان در اکسل است؛ منتقل می‌شود؟",
    a: "بله. در راه‌اندازی کمک می‌کنیم لیست دانش‌آموزان، مشاوران و پرداخت‌های قبلی وارد شود تا از همان روز اول مانده‌ها درست باشد.",
  },
  {
    q: "اگر اشتراک تمام شود چه می‌شود؟",
    a: "تا یک هفته بعد از پایان اشتراک همه امکانات فعال می‌ماند. پس از آن سیستم فقط‌خواندنی می‌شود؛ یعنی اطلاعات شما حذف نمی‌شود و قابل مشاهده و خروجی گرفتن است تا تمدید کنید.",
  },
  {
    q: "حقوق مشاوران چطور حساب می‌شود؟",
    a: "برای هر نقش، حقوق ثابت یا درصدی از شهریه دانش‌آموزان تعریف می‌کنید. هر پرداخت دانش‌آموز بدهی شما به مشاور را می‌سازد، هر پرداخت به مشاور از آن کم می‌شود و مانده به ماه بعد منتقل می‌شود.",
  },
  {
    q: "پیامک یادآوری با چه سامانه‌ای ارسال می‌شود؟",
    a: "با پنل ملی‌پیامک خودتان. متن پیامک‌ها قابل ویرایش است و بدهکاران ۱، ۷ و ۳۰ روز مانده به سررسید یا دارای بدهی معوق به‌صورت خودکار یادآوری دریافت می‌کنند.",
  },
];

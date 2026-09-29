import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Cloud,
  CreditCard,
  Globe,
  GraduationCap,
  Landmark,
  LogIn,
  Mail,
  MessageCircle,
  Phone,
  Receipt,
  School,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/jalaliDate";
import { useSiteInfo } from "@/hooks/useSiteInfo";
import { submitLead } from "@/api/siteApi";
import { SAAS_CONTACT, SAAS_FAQ, SAAS_PLANS, TRIAL_DAYS, type SaasPlan } from "@/config/saas";

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: GraduationCap,
    title: "شهریه و اقساط دانش‌آموزان",
    text: "ماهانه، اقساطی یا سالانه؛ «مانده ماه» و «مانده کل» هر دانش‌آموز از تاریخ ثبت‌نام خودکار حساب می‌شود.",
  },
  {
    icon: Wallet,
    title: "حقوق و سهم مشاوران",
    text: "هر پرداخت دانش‌آموز بدهی شما به مشاور را می‌سازد و هر پرداخت به مشاور از آن کم می‌شود؛ مانده به ماه بعد می‌رود.",
  },
  {
    icon: Bell,
    title: "پیامک یادآوری بدهی",
    text: "بدهکاران ۱، ۷ و ۳۰ روز مانده به سررسید و بدهی‌های معوق خودکار پیامک می‌گیرند؛ متن پیامک دست شماست.",
  },
  {
    icon: CreditCard,
    title: "لینک و درگاه پرداخت",
    text: "برای هر قسط لینک پرداخت آنلاین بفرستید یا شماره کارت و شبای حساب‌های مجموعه را به دانش‌آموز نشان دهید.",
  },
  {
    icon: BarChart3,
    title: "سود و زیان و گزارش‌ها",
    text: "درآمد، حقوق، هزینه‌ها و سود این ماه و از ابتدای سال مالی، به‌همراه بدهی‌ها و مطالبات در یک نگاه.",
  },
  {
    icon: Receipt,
    title: "مراکز هزینه",
    text: "اجاره، قبوض، تبلیغات و هر هزینه دیگری را ثبت کنید؛ هزینه‌های ثابت در سررسیدهای پیش رو یادآوری می‌شوند.",
  },
  {
    icon: School,
    title: "قرارداد مدارس",
    text: "تعداد دانش‌آموز، مبلغ هر نفر، مدت قرارداد و نوع پرداخت ماهانه، ترمی یا سالانه برای هر مدرسه.",
  },
  {
    icon: ShieldCheck,
    title: "نقش‌ها و دسترسی‌ها",
    text: "مدیر، منشی، مشاور و … هر کدام فقط بخش‌ها و دانش‌آموزان مربوط به خودشان را می‌بینند.",
  },
  {
    icon: CalendarDays,
    title: "تقویم شمسی دقیق",
    text: "همه محاسبات بر اساس ماه‌های شمسی واقعی و سال مالی قابل بستن و آرشیو.",
  },
];

const SCREENS: { key: string; label: string; src: string; caption: string }[] = [
  { key: "dashboard", label: "داشبورد مالی", src: "/landing/dashboard.jpg", caption: "موجودی، درآمد، هزینه، سود و کارهای نیازمند اقدام در یک صفحه" },
  { key: "students", label: "دانش‌آموزان", src: "/landing/students.jpg", caption: "مانده ماه و مانده کل هر دانش‌آموز، بدهکار یا بستانکار" },
  { key: "payroll", label: "حقوق مشاوران", src: "/landing/payroll.jpg", caption: "حقوق و سهم هر مشاور، پرداخت‌ها و مانده حساب" },
  { key: "reports", label: "گزارش‌ها", src: "/landing/reports.jpg", caption: "سود و زیان ماه و از ابتدای سال، به‌همراه بدهی‌ها" },
];

const STUDENT_RANGES = ["کمتر از ۵۰", "۵۰ تا ۱۰۰", "۱۰۰ تا ۲۵۰", "۲۵۰ تا ۵۰۰", "بیش از ۵۰۰"];

function priceText(v: number | null): string {
  if (v == null) return "تماس بگیرید";
  return v.toLocaleString("fa-IR");
}

function SectionTitle({ kicker, title, text }: { kicker: string; title: string; text?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <p className="mb-2 text-sm font-bold text-primary">{kicker}</p>
      <h2 className="text-2xl font-bold leading-snug text-foreground sm:text-3xl">{title}</h2>
      {text && <p className="mt-3 leading-7 text-muted-foreground">{text}</p>}
    </div>
  );
}

function BrowserFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-2xl shadow-primary/10">
      <div className="flex items-center gap-1.5 border-b bg-muted/60 px-3 py-2" dir="ltr">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="mx-auto hidden rounded-md bg-background px-3 py-0.5 text-[11px] text-muted-foreground sm:block">
          panel.your-domain.ir
        </span>
      </div>
      <img src={src} alt={alt} className="block w-full" loading="lazy" width={1440} height={900} />
    </div>
  );
}

function PlanCard({ plan, yearly, onChoose }: { plan: SaasPlan; yearly: boolean; onChoose: (code: string) => void }) {
  const price = yearly ? plan.yearly : plan.monthly;
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border bg-card p-6",
        plan.highlighted && "border-2 border-primary shadow-xl shadow-primary/10",
      )}
    >
      {plan.highlighted && (
        <span className="absolute -top-3 right-6 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
          پیشنهاد ما
        </span>
      )}
      <h3 className="text-lg font-bold">{plan.name}</h3>
      <p className="mt-1 min-h-[2.5rem] text-sm text-muted-foreground">{plan.description}</p>
      <div className="my-5">
        {price == null ? (
          <p className="text-2xl font-bold">تماس بگیرید</p>
        ) : (
          <p className="flex items-baseline gap-1">
            <span className="text-3xl font-bold number-display">{priceText(price)}</span>
            <span className="text-sm text-muted-foreground">تومان / {yearly ? "سال" : "ماه"}</span>
          </p>
        )}
      </div>
      <div className="mb-4 space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
        <p className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-primary" />
          {plan.students}
        </p>
        <p className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          {plan.users}
        </p>
      </div>
      <ul className="mb-6 space-y-2 text-sm">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            {f}
          </li>
        ))}
      </ul>
      <Button className="mt-auto w-full" variant={plan.highlighted ? "default" : "outline"} onClick={() => onChoose(plan.code)}>
        {price == null ? "درخواست مشاوره" : `شروع ${toPersianDigits(String(TRIAL_DAYS))} روز رایگان`}
      </Button>
    </div>
  );
}

function ContactLinks({ className }: { className?: string }) {
  const items = [
    SAAS_CONTACT.mobile && { icon: Phone, label: toPersianDigits(SAAS_CONTACT.mobile), href: `tel:${SAAS_CONTACT.mobile}` },
    SAAS_CONTACT.phone && { icon: Phone, label: toPersianDigits(SAAS_CONTACT.phone), href: `tel:${SAAS_CONTACT.phone.replace(/-/g, "")}` },
    SAAS_CONTACT.telegram && { icon: Send, label: "تلگرام", href: SAAS_CONTACT.telegram },
    SAAS_CONTACT.whatsapp && { icon: MessageCircle, label: "واتس‌اپ", href: SAAS_CONTACT.whatsapp },
    SAAS_CONTACT.email && { icon: Mail, label: SAAS_CONTACT.email, href: `mailto:${SAAS_CONTACT.email}` },
  ].filter(Boolean) as { icon: LucideIcon; label: string; href: string }[];
  if (items.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {items.map((i) => (
        <a
          key={i.href}
          href={i.href}
          target={i.href.startsWith("http") ? "_blank" : undefined}
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:border-primary/50"
        >
          <i.icon className="h-4 w-4 text-primary" />
          <span dir="auto">{i.label}</span>
        </a>
      ))}
    </div>
  );
}

function DemoForm({ plan, setPlan, enabled }: { plan: string; setPlan: (v: string) => void; enabled: boolean }) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    organization: "",
    city: "",
    students_range: "",
    hosting: "CLOUD",
    message: "",
    website: "",
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.name.trim().length < 2) return setError("نام خود را وارد کنید.");
    if (form.phone.trim().length < 10) return setError("شماره موبایل را وارد کنید.");
    setSending(true);
    try {
      await submitLead({ ...form, plan });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-10 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-600" />
        <h3 className="text-xl font-bold">درخواست شما ثبت شد</h3>
        <p className="text-muted-foreground">همکاران ما به‌زودی با شماره {toPersianDigits(form.phone)} تماس می‌گیرند.</p>
      </div>
    );
  }

  const chip = (active: boolean) =>
    cn(
      "rounded-lg border px-3 py-2 text-sm transition-colors",
      active ? "border-primary bg-primary/10 font-bold text-primary" : "bg-background hover:border-primary/40",
    );

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-5 sm:p-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          نام و نام خانوادگی *
          <Input value={form.name} onChange={(e) => set("name")(e.target.value)} autoComplete="name" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          شماره موبایل *
          <Input
            value={form.phone}
            onChange={(e) => set("phone")(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder="0912…"
            className="text-right"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          نام مؤسسه / مجموعه
          <Input value={form.organization} onChange={(e) => set("organization")(e.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          شهر
          <Input value={form.city} onChange={(e) => set("city")(e.target.value)} />
        </label>
      </div>
      <div className="grid gap-1.5 text-sm font-medium">
        تعداد دانش‌آموزان
        <div className="flex flex-wrap gap-2">
          {STUDENT_RANGES.map((r) => (
            <button type="button" key={r} className={chip(form.students_range === r)} onClick={() => set("students_range")(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 text-sm font-medium">
          پلن
          <div className="flex flex-wrap gap-2">
            {SAAS_PLANS.map((p) => (
              <button type="button" key={p.code} className={chip(plan === p.code)} onClick={() => setPlan(p.code)}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-1.5 text-sm font-medium">
          محل نصب
          <div className="flex flex-wrap gap-2">
            {[
              ["CLOUD", "ابری (سرور ما)"],
              ["ONPREM", "سرور خودمان"],
              ["UNSURE", "نمی‌دانم"],
            ].map(([v, l]) => (
              <button type="button" key={v} className={chip(form.hosting === v)} onClick={() => set("hosting")(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
      <label className="grid gap-1.5 text-sm font-medium">
        توضیحات
        <Textarea value={form.message} onChange={(e) => set("message")(e.target.value)} rows={3} placeholder="مثلاً روش فعلی حسابداری، تعداد مشاوران، دامنه‌ای که دارید…" />
      </label>
      {/* Honeypot: hidden from people, bots fill it. */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={form.website}
        onChange={(e) => set("website")(e.target.value)}
        className="hidden"
        aria-hidden="true"
      />
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {!enabled && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          ثبت آنلاین درخواست در این نسخه فعال نیست؛ لطفاً از راه‌های تماس زیر استفاده کنید.
        </p>
      )}
      <Button type="submit" size="lg" className="w-full gap-2" disabled={sending || !enabled}>
        {sending ? "در حال ارسال..." : "ثبت درخواست دمو رایگان"}
        {!sending && <ArrowLeft className="h-4 w-4" />}
      </Button>
      <p className="text-center text-xs text-muted-foreground">اطلاعات شما فقط برای تماس کارشناس فروش استفاده می‌شود.</p>
    </form>
  );
}

/** Public sales page (vendor site). */
const Landing = () => {
  const { data: site } = useSiteInfo();
  const product = site?.product_name || "یونی‌فایننس";
  const [yearly, setYearly] = useState(true);
  const [screen, setScreen] = useState(SCREENS[0].key);
  const [plan, setPlan] = useState("pro");
  const active = SCREENS.find((s) => s.key === screen) ?? SCREENS[0];

  useEffect(() => {
    document.title = `${product} | نرم‌افزار مالی مؤسسات مشاوره تحصیلی`;
  }, [product]);

  const choosePlan = (code: string) => {
    setPlan(code);
    document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
  };

  const nav = [
    ["#features", "امکانات"],
    ["#screens", "تصاویر"],
    ["#hosting", "نحوه ارائه"],
    ["#pricing", "قیمت‌ها"],
    ["#faq", "سؤالات"],
  ];

  return (
    <div dir="rtl" className="min-h-screen scroll-smooth bg-background text-right text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <a href="#top" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Landmark className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold">{product}</span>
          </a>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            {nav.map(([href, label]) => (
              <a key={href} href={href} className="hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="gap-1">
              <Link to="/login">
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">ورود</span>
              </Link>
            </Button>
            <Button size="sm" asChild>
              <a href="#demo">درخواست دمو</a>
            </Button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.12),transparent_60%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-20">
            <div>
              <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-bold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                ویژه مؤسسات و مشاوران تحصیلی و کنکور
              </span>
              <h1 className="text-3xl font-bold leading-[1.5] sm:text-4xl sm:leading-[1.5]">
                حساب‌وکتاب مؤسسه مشاوره‌تان را
                <span className="text-primary"> دقیق و خودکار </span>
                کنید
              </h1>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">
                شهریه و اقساط دانش‌آموزان، حقوق و سهم مشاوران، پیامک یادآوری بدهی و گزارش سود و زیان — همه با تقویم
                شمسی، روی دامنه اختصاصی خودتان.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button size="lg" asChild className="gap-2">
                  <a href="#demo">
                    درخواست دمو رایگان
                    <ArrowLeft className="h-4 w-4" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#pricing">مشاهده قیمت‌ها</a>
                </Button>
              </div>
              <ul className="mt-7 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                {[`${toPersianDigits(String(TRIAL_DAYS))} روز استفاده رایگان`, "راه‌اندازی روی دامنه شما", "پشتیبان‌گیری شبانه"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <BrowserFrame src="/landing/dashboard.jpg" alt="داشبورد مالی" />
          </div>
        </section>

        {/* Pains */}
        <section className="border-y bg-muted/30">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-10 md:grid-cols-3">
            {[
              ["مانده بدهی دانش‌آموزان را هنوز از اکسل درمی‌آورید؟", "مانده ماه و مانده کل هر دانش‌آموز همیشه به‌روز است."],
              ["تسویه با مشاوران آخر هر ماه چالش است؟", "حساب جاری هر مشاور: طلب، پرداختی و مانده منتقل‌شده."],
              ["یادآوری بدهی را یکی‌یکی پیامک می‌کنید؟", "یادآوری خودکار با متن دلخواه و لیست کامل بدهکاران."],
            ].map(([q, a]) => (
              <div key={q} className="rounded-xl bg-card p-5 shadow-sm">
                <p className="font-bold">{q}</p>
                <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
          <SectionTitle kicker="امکانات" title="هر آنچه یک مؤسسه مشاوره برای امور مالی لازم دارد" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border bg-card p-5 transition-colors hover:border-primary/40">
                <span className="mb-3 inline-flex rounded-lg bg-primary/10 p-2.5 text-primary">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="font-bold">{f.title}</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Screens */}
        <section id="screens" className="scroll-mt-20 bg-muted/30 py-16">
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle kicker="نمای نرم‌افزار" title="ساده، فارسی و طراحی‌شده برای کار روزانه" />
            <div className="mb-5 flex flex-wrap justify-center gap-2">
              {SCREENS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setScreen(s.key)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition-colors",
                    screen === s.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mb-5 text-center text-sm text-muted-foreground">{active.caption}</p>
            <div className="mx-auto max-w-5xl">
              <BrowserFrame src={active.src} alt={active.label} />
            </div>
          </div>
        </section>

        {/* Hosting options */}
        <section id="hosting" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
          <SectionTitle
            kicker="نحوه ارائه"
            title="روی سرور ما یا روی سرور شما"
            text="هر مجموعه نسخه و پایگاه داده جداگانه خودش را دارد؛ اطلاعات شما با هیچ مجموعه دیگری مشترک نیست."
          />
          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                icon: Cloud,
                title: "ابری (پیشنهادی)",
                points: [
                  "بدون نیاز به سرور و فنی‌کار",
                  "زیردامنه رایگان یا دامنه خودتان با SSL",
                  "پشتیبان‌گیری شبانه و به‌روزرسانی خودکار",
                  "پرداخت ماهانه یا سالانه",
                ],
              },
              {
                icon: Server,
                title: "روی سرور شما",
                points: [
                  "نصب روی سرور یا هاست اختصاصی خودتان",
                  "اطلاعات کاملاً نزد خودتان",
                  "نصب با یک اسکریپت (Docker)",
                  "لایسنس سالانه با به‌روزرسانی و پشتیبانی",
                ],
              },
            ].map((o) => (
              <div key={o.title} className="rounded-2xl border bg-card p-6">
                <div className="mb-4 flex items-center gap-3">
                  <span className="rounded-xl bg-primary/10 p-3 text-primary">
                    <o.icon className="h-6 w-6" />
                  </span>
                  <h3 className="text-lg font-bold">{o.title}</h3>
                </div>
                <ul className="space-y-2 text-sm">
                  {o.points.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              [Send, "۱. ثبت درخواست", "فرم دمو را پر کنید؛ همان روز تماس می‌گیریم."],
              [Globe, "۲. راه‌اندازی", "پنل شما روی زیردامنه یا دامنه خودتان آماده می‌شود."],
              [Building2, "۳. شروع کار", "آموزش کوتاه، ورود اطلاعات و شروع استفاده."],
            ].map(([Icon, t, d]) => {
              const I = Icon as LucideIcon;
              return (
                <div key={t as string} className="flex items-start gap-3 rounded-xl bg-muted/40 p-4">
                  <I className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-bold">{t as string}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{d as string}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 bg-muted/30 py-16">
          <div className="mx-auto max-w-6xl px-4">
            <SectionTitle kicker="قیمت‌ها" title="پلن مناسب مجموعه‌تان را انتخاب کنید" text={`همه پلن‌ها با ${toPersianDigits(String(TRIAL_DAYS))} روز استفاده رایگان شروع می‌شوند.`} />
            <div className="mb-8 flex justify-center">
              <div className="inline-flex rounded-full border bg-card p-1 text-sm">
                <button
                  type="button"
                  onClick={() => setYearly(false)}
                  className={cn("rounded-full px-4 py-1.5", !yearly && "bg-primary text-primary-foreground")}
                >
                  ماهانه
                </button>
                <button
                  type="button"
                  onClick={() => setYearly(true)}
                  className={cn("rounded-full px-4 py-1.5", yearly && "bg-primary text-primary-foreground")}
                >
                  سالانه <span className="text-xs opacity-80">(۲ ماه رایگان)</span>
                </button>
              </div>
            </div>
            <div className="grid gap-5 lg:grid-cols-3">
              {SAAS_PLANS.map((p) => (
                <PlanCard key={p.code} plan={p} yearly={yearly} onChoose={choosePlan} />
              ))}
            </div>
            <p className="mt-5 text-center text-xs text-muted-foreground">قیمت‌ها به تومان است. هزینه پنل پیامک و درگاه پرداخت جداگانه و به نام خود مجموعه است.</p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-16">
          <SectionTitle kicker="سؤالات متداول" title="پیش از شروع" />
          <Accordion type="single" collapsible className="rounded-2xl border bg-card px-5">
            {SAAS_FAQ.map((f, i) => (
              <AccordionItem key={f.q} value={`q${i}`} className={i === SAAS_FAQ.length - 1 ? "border-b-0" : undefined}>
                <AccordionTrigger className="text-right font-bold hover:no-underline">{f.q}</AccordionTrigger>
                <AccordionContent className="leading-7 text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Demo form */}
        <section id="demo" className="scroll-mt-20 bg-primary/5 py-16">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <p className="mb-2 text-sm font-bold text-primary">درخواست دمو</p>
              <h2 className="text-2xl font-bold leading-snug sm:text-3xl">پنل آزمایشی خودتان را بگیرید</h2>
              <p className="mt-3 leading-8 text-muted-foreground">
                فرم را پر کنید تا کارشناس ما تماس بگیرد، نیاز مجموعه‌تان را بررسی کند و یک پنل {toPersianDigits(String(TRIAL_DAYS))} روزه
                رایگان برایتان راه‌اندازی کند.
              </p>
              <ul className="mt-5 space-y-2 text-sm">
                {["بدون نیاز به کارت بانکی", "آموزش رایگان راه‌اندازی", "کمک در ورود اطلاعات قبلی"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {t}
                  </li>
                ))}
              </ul>
              <ContactLinks className="mt-6" />
            </div>
            <div className="lg:col-span-3">
              <DemoForm plan={plan} setPlan={setPlan} enabled={site?.vendor === true} />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
          <p className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" />
            {product} — نرم‌افزار مالی مؤسسات مشاوره تحصیلی
          </p>
          <div className="flex items-center gap-4">
            <a href="#pricing" className="hover:text-foreground">
              قیمت‌ها
            </a>
            <a href="#demo" className="hover:text-foreground">
              درخواست دمو
            </a>
            <Link to="/login" className="hover:text-foreground">
              ورود مشتریان
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;

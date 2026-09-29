import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileMinus,
  HandCoins,
  Layers,
  List,
  Receipt,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addPeriodKeyMonths, currentPeriodKey, formatIsoDateShamsi, toPersianDigits } from "@/lib/jalaliDate";
import { formatPayrollPeriod } from "@/lib/payrollDisplay";
import { getDashboardOverview, type OverviewKPI, type OverviewTransaction, type OverviewUpcoming } from "@/api/dashboardApi";
import { RecordExpenseDialog } from "@/components/payroll/ExpensesOverview";

function toman(cents: number): string {
  const v = Math.floor(Math.abs(cents || 0) / 10).toLocaleString("fa-IR");
  return cents < 0 ? `−${v}` : v;
}

const compact = new Intl.NumberFormat("fa-IR", { notation: "compact", maximumFractionDigits: 1 });

/** Percent change vs. previous month; null when there is nothing to compare. */
function pctChange(value: number, previous?: number): number | null {
  if (previous == null) return null;
  if (previous === 0) return value === 0 ? 0 : null;
  return Math.round(((value - previous) / Math.abs(previous)) * 100);
}

function ChangeLine({ value, previous, upIsGood = true }: { value: number; previous?: number; upIsGood?: boolean }) {
  if (previous == null) return null;
  const pct = pctChange(value, previous);
  if (pct == null) {
    return (
      <p className="text-xs text-muted-foreground">
        ماه قبل: <span className="number-display">{toman(previous)}</span>
      </p>
    );
  }
  const up = pct >= 0;
  const good = pct === 0 || up === upIsGood;
  const Icon = up ? ArrowUpRight : ArrowDownLeft;
  return (
    <p className="flex items-center gap-1 text-xs">
      <Icon className={cn("h-3.5 w-3.5", good ? "text-emerald-600" : "text-destructive")} />
      <span dir="ltr" className={cn("font-medium", good ? "text-emerald-600" : "text-destructive")}>
        {toPersianDigits(`${up ? "+" : ""}${pct}%`)}
      </span>
      <span className="text-muted-foreground">نسبت به ماه قبل</span>
    </p>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-10 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const TONES = {
  green: { icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400", line: "#059669" },
  red: { icon: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400", line: "#dc2626" },
  orange: { icon: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400", line: "#ea580c" },
  blue: { icon: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400", line: "#0284c7" },
};

function KpiCard({
  title,
  icon: Icon,
  kpi,
  tone,
  upIsGood = true,
  loading,
  to,
  note,
}: {
  title: string;
  icon: LucideIcon;
  kpi?: OverviewKPI;
  tone: keyof typeof TONES;
  upIsGood?: boolean;
  loading: boolean;
  to?: string;
  /** Shown instead of the month-over-month line when there is no previous value. */
  note?: string;
}) {
  const t = TONES[tone];
  const value = kpi?.value_cents ?? 0;
  const body = (
    <div className="card-elevated flex h-full flex-col gap-2 p-4 transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-foreground">{title}</p>
        <span className={cn("rounded-lg p-2", t.icon)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={cn("text-2xl font-bold number-display", value < 0 && "text-destructive")}>
        <span dir="ltr">{loading ? "—" : toman(value)}</span>
      </p>
      {!loading && <ChangeLine value={value} previous={kpi?.previous_cents} upIsGood={upIsGood} />}
      {!loading && note && kpi?.previous_cents == null && <p className="text-xs text-muted-foreground">{note}</p>}
      {!loading && kpi && kpi.spark_cents.length > 1 && <Sparkline data={kpi.spark_cents} color={t.line} />}
    </div>
  );
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function ActionCard({
  title,
  icon: Icon,
  line,
  amountCents,
  button,
  tone,
  onClick,
}: {
  title: string;
  icon: LucideIcon;
  line: string;
  amountCents: number;
  button: string;
  tone: "red" | "orange";
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className={cn("rounded-full p-1.5", TONES[tone].icon)}>
          <Icon className="h-4 w-4" />
        </span>
        <p className={cn("font-bold", tone === "red" ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400")}>
          {title}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        {line} · <span className="font-bold text-foreground number-display">{toman(amountCents)}</span> تومان
      </p>
      <Button
        size="sm"
        className={cn(
          "mt-auto w-fit text-white",
          tone === "red" ? "bg-red-600 hover:bg-red-700" : "bg-orange-500 hover:bg-orange-600",
        )}
        onClick={onClick}
      >
        {button}
      </Button>
    </div>
  );
}

function Panel({ title, icon: Icon, action, children, className }: {
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card-elevated min-w-0 p-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold text-foreground">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function daysBadge(days: number) {
  if (days < 0) return { text: `${toPersianDigits(String(-days))} روز گذشته`, cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" };
  if (days === 0) return { text: "امروز", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" };
  if (days <= 3) return { text: `${toPersianDigits(String(days))} روز دیگر`, cls: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" };
  if (days <= 7) return { text: `${toPersianDigits(String(days))} روز دیگر`, cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" };
  return { text: `${toPersianDigits(String(days))} روز دیگر`, cls: "bg-muted text-muted-foreground" };
}

function UpcomingRow({ u }: { u: OverviewUpcoming }) {
  const badge = daysBadge(u.days_left);
  const incoming = u.kind === "STUDENT";
  return (
    <div className="flex items-start justify-between gap-2 border-b py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{u.title}</p>
        <p className="text-xs text-muted-foreground">
          {formatIsoDateShamsi(u.due_date)}
          {u.subtitle ? ` · ${u.subtitle}` : ""}
        </p>
        <p className={cn("mt-0.5 text-sm font-bold number-display", incoming ? "text-emerald-700 dark:text-emerald-400" : "text-foreground")}>
          <span dir="ltr">
            {incoming ? "+" : "−"}
            {toman(u.amount_cents)}
          </span>
        </p>
      </div>
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", badge.cls)}>{badge.text}</span>
    </div>
  );
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  PAID: { text: "تأیید شده", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  PENDING: { text: "در انتظار", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
  OVERDUE: { text: "معوق", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
  CANCELLED: { text: "لغو شده", cls: "bg-muted text-muted-foreground" },
};

const TX_ROUTE: Record<OverviewTransaction["kind"], string> = {
  RECEIPT: "/payments",
  PAYOUT: "/payroll",
  EXPENSE: "/payroll",
};

/** Finance dashboard for admins (full access), per the approved design. */
export function FinanceDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(currentPeriodKey);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const now = currentPeriodKey();
  const isCurrent = period.year === now.year && period.month === now.month;

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-overview", period.year, period.month],
    queryFn: () => getDashboardOverview(period.year, period.month),
  });
  const loading = isLoading || !data;

  const chartData = (data?.series ?? []).map((p) => ({
    label: formatPayrollPeriod(p.year, p.month),
    income: Math.floor(p.income_cents / 10),
    outflow: Math.floor(p.outflow_cents / 10),
    profit: Math.floor(p.profit_cents / 10),
  }));

  const cf = data?.cash_flow;
  const aging = data?.aging;
  const action = data?.action;
  const quick: { label: string; icon: LucideIcon; cls: string; onClick: () => void }[] = [
    {
      label: "ثبت دریافت",
      icon: HandCoins,
      cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400",
      onClick: () => navigate("/payments?new=1"),
    },
    {
      label: "پرداخت حقوق",
      icon: Wallet,
      cls: "border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400",
      onClick: () => navigate("/payroll"),
    },
    {
      label: "ثبت هزینه",
      icon: FileMinus,
      cls: "border-orange-200 bg-orange-50 text-orange-600 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-400",
      onClick: () => setExpenseOpen(true),
    },
    {
      label: "ثبت دانش‌آموز",
      icon: UserPlus,
      cls: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-400",
      onClick: () => navigate("/students?new=1"),
    },
  ];

  const flowRow = (label: string, value: number, prev: number, upIsGood: boolean, bold = false) => (
    <div className="border-b py-2.5 last:border-b-0">
      <div className="flex items-center justify-between">
        <span className={cn("text-sm", bold ? "font-bold" : "text-muted-foreground")}>{label}</span>
        <span dir="ltr" className={cn("font-bold number-display", value < 0 && "text-destructive", bold && "text-lg")}>
          {loading ? "—" : toman(value)}
        </span>
      </div>
      {!loading && <ChangeLine value={value} previous={prev} upIsGood={upIsGood} />}
    </div>
  );

  const agingRows = [
    { label: "کل سررسید گذشته", value: aging?.overdue_cents ?? 0, dot: "bg-red-600" },
    { label: "۱ تا ۳۰ روز", value: aging?.d1_30_cents ?? 0, dot: "bg-orange-500" },
    { label: "۳۱ تا ۶۰ روز", value: aging?.d31_60_cents ?? 0, dot: "bg-amber-400" },
    { label: "بیش از ۶۰ روز", value: aging?.d60_plus_cents ?? 0, dot: "bg-slate-600" },
  ];

  return (
    <div dir="rtl" className="space-y-4 text-right">
      {/* Period + headline */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPeriod((p) => addPeriodKeyMonths(p.year, p.month, -1))}
            aria-label="ماه قبل"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="min-w-[7rem] text-center font-bold">{formatPayrollPeriod(period.year, period.month)}</span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPeriod((p) => addPeriodKeyMonths(p.year, p.month, 1))}
            aria-label="ماه بعد"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {!isCurrent && (
            <Button variant="ghost" size="sm" onClick={() => setPeriod(currentPeriodKey())}>
              ماه جاری
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" /> دانش‌آموزان فعال:{" "}
            <b className="text-foreground">{loading ? "—" : toPersianDigits(String(data.students.active))}</b>
          </span>
          <span className="flex items-center gap-1">
            <UserPlus className="h-4 w-4" /> ثبت‌نام این ماه:{" "}
            <b className="text-foreground">{loading ? "—" : toPersianDigits(String(data.students.registrations))}</b>
          </span>
          <span className="text-xs">مبالغ به تومان</span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard title="موجودی نقد و بانک" icon={Banknote} kpi={data?.kpis.cash} tone="green" loading={loading} to="/payments" />
        <KpiCard title="درآمد این ماه" icon={TrendingUp} kpi={data?.kpis.income} tone="green" loading={loading} to="/reports" />
        <KpiCard title="هزینه این ماه" icon={TrendingDown} kpi={data?.kpis.expenses} tone="red" upIsGood={false} loading={loading} to="/payroll" />
        <KpiCard title="سود خالص" icon={Layers} kpi={data?.kpis.profit} tone="green" loading={loading} to="/reports" />
        <KpiCard
          title="مطالبات سررسیدشده"
          icon={Clock}
          kpi={data?.kpis.overdue}
          tone="red"
          upIsGood={false}
          loading={loading}
          to="/reminders"
          note={data ? `${toPersianDigits(String(data.action.overdue_count))} دانش‌آموز بدهکار · تا امروز` : undefined}
        />
      </div>

      {/* Needs action */}
      <section className="rounded-xl border border-orange-200 bg-orange-50/70 p-4 dark:border-orange-500/30 dark:bg-orange-500/5">
        <h3 className="mb-3 flex items-center gap-2 font-bold text-orange-700 dark:text-orange-400">
          <AlertCircle className="h-5 w-5" />
          نیازمند اقدام
        </h3>
        <div className="grid gap-3 md:grid-cols-3">
          <ActionCard
            title="مطالبات سررسیدشده"
            icon={Clock}
            tone="red"
            line={`${toPersianDigits(String(action?.overdue_count ?? 0))} دانش‌آموز`}
            amountCents={action?.overdue_cents ?? 0}
            button="مشاهده و یادآوری"
            onClick={() => navigate("/reminders")}
          />
          <ActionCard
            title="پرداخت‌های در انتظار"
            icon={Receipt}
            tone="orange"
            line={`${toPersianDigits(String(action?.pending_count ?? 0))} مورد`}
            amountCents={action?.pending_cents ?? 0}
            button="مشاهده"
            onClick={() => navigate("/payments")}
          />
          <ActionCard
            title="حقوق و دستمزد"
            icon={Wallet}
            tone="red"
            line={`مانده حقوق ${toPersianDigits(String(action?.payroll_count ?? 0))} نفر`}
            amountCents={action?.payroll_cents ?? 0}
            button="مشاهده و پرداخت"
            onClick={() => navigate("/payroll")}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-4">
        {/* Right column (RTL): quick access + upcoming */}
        <div className="min-w-0 space-y-4 lg:col-span-1">
          <Panel title="دسترسی سریع" icon={Zap}>
            <div className="grid grid-cols-2 gap-3">
              {quick.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={q.onClick}
                  className={cn("flex flex-col items-center gap-2 rounded-xl border px-2 py-4 text-sm font-medium transition-opacity hover:opacity-80", q.cls)}
                >
                  <q.icon className="h-5 w-5" />
                  {q.label}
                </button>
              ))}
            </div>
          </Panel>
          <Panel
            title="سررسیدهای پیش رو"
            icon={CalendarClock}
            action={
              <Link to="/reminders" className="text-xs text-primary hover:underline">
                مشاهده همه
              </Link>
            }
          >
            {loading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</p>
            ) : data.upcoming.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">سررسیدی در ۳۰ روز آینده نیست.</p>
            ) : (
              data.upcoming.map((u, i) => <UpcomingRow key={`${u.kind}-${u.student_id ?? i}-${i}`} u={u} />)
            )}
          </Panel>
        </div>

        {/* Left: cash flow + receivables + chart + transactions */}
        <div className="min-w-0 space-y-4 lg:col-span-3">
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="min-w-0 space-y-4 xl:col-span-1">
              <Panel title="خلاصه جریان نقدی" icon={Layers}>
                {flowRow("ورودی‌ها", cf?.in_cents ?? 0, cf?.prev_in_cents ?? 0, true)}
                {flowRow("خروجی‌ها", cf?.out_cents ?? 0, cf?.prev_out_cents ?? 0, false)}
                {flowRow("جریان نقدی خالص", cf?.net_cents ?? 0, cf?.prev_net_cents ?? 0, true, true)}
              </Panel>
              <Panel title="وضعیت مطالبات" icon={Users}>
                {agingRows.map((r) => (
                  <div key={r.label} className="flex items-center justify-between border-b py-2 last:border-b-0">
                    <span className="flex items-center gap-2 text-sm">
                      <span className={cn("h-2.5 w-2.5 rounded-full", r.dot)} />
                      {r.label}
                    </span>
                    <span className="font-bold number-display">{loading ? "—" : toman(r.value)}</span>
                  </div>
                ))}
              </Panel>
            </div>
            <Panel title="نمودار درآمد، هزینه و سود (۶ ماه اخیر)" icon={TrendingUp} className="xl:col-span-2">
              <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />درآمد</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" />هزینه</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-sky-600" />سود</span>
              </div>
              <div className="h-72 xl:h-[25rem]" dir="ltr">
                {chartData.length > 0 && (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v: number) => compact.format(v)} />
                      <Tooltip
                        formatter={(v: number, name: string) => [
                          `${v.toLocaleString("fa-IR")} تومان`,
                          name === "income" ? "درآمد" : name === "outflow" ? "هزینه" : "سود",
                        ]}
                        contentStyle={{ direction: "rtl", fontFamily: "inherit" }}
                      />
                      <Line type="monotone" dataKey="income" stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="outflow" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="profit" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Panel>
          </div>

          <Panel title="آخرین تراکنش‌ها" icon={List}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-right text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="p-2 font-medium">تاریخ</th>
                    <th className="p-2 font-medium">شرح</th>
                    <th className="p-2 font-medium">دسته‌بندی</th>
                    <th className="p-2 font-medium">طرف حساب</th>
                    <th className="p-2 font-medium">مبلغ (تومان)</th>
                    <th className="p-2 font-medium">وضعیت</th>
                    <th className="p-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">در حال بارگذاری...</td>
                    </tr>
                  ) : data.recent.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">تراکنشی ثبت نشده است.</td>
                    </tr>
                  ) : (
                    data.recent.map((t) => {
                      const st = STATUS_LABEL[t.status] ?? { text: t.status, cls: "bg-muted text-muted-foreground" };
                      return (
                        <tr key={`${t.kind}-${t.id}`} className="border-b last:border-b-0">
                          <td className="p-2 whitespace-nowrap">{formatIsoDateShamsi(t.date)}</td>
                          <td className="p-2">{t.title}</td>
                          <td className="p-2 text-muted-foreground">{t.category || "—"}</td>
                          <td className="p-2">{t.counterparty || "—"}</td>
                          <td
                            dir="ltr"
                            className={cn(
                              "p-2 text-right font-bold number-display",
                              t.status !== "PAID"
                                ? "text-muted-foreground"
                                : t.amount_cents >= 0
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-destructive",
                            )}
                          >
                            {t.amount_cents >= 0 ? "+" : ""}
                            {toman(t.amount_cents)}
                          </td>
                          <td className="p-2">
                            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", st.cls)}>{st.text}</span>
                          </td>
                          <td className="p-2">
                            <Button variant="ghost" size="icon" className="h-7 w-7" asChild title="مشاهده">
                              <Link to={TX_ROUTE[t.kind]}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>

      <RecordExpenseDialog
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
          queryClient.invalidateQueries({ queryKey: ["expenses-summary"] });
        }}
      />
    </div>
  );
}

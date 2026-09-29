import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Scale, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addPeriodKeyMonths, currentPeriodKey, formatIsoDateShamsi } from "@/lib/jalaliDate";
import { formatPayrollPeriod } from "@/lib/payrollDisplay";
import { getPnL, type PnLFigures } from "@/api/reportsApi";

function toman(cents: number): string {
  const v = Math.floor(Math.abs(cents || 0) / 10).toLocaleString("fa-IR");
  return cents < 0 ? `−${v}` : v;
}

const ROWS: { key: keyof PnLFigures; label: string; tone: string }[] = [
  { key: "income_cents", label: "درآمد کل", tone: "text-emerald-700 dark:text-emerald-400" },
  { key: "salary_cents", label: "حقوق پرداختی", tone: "text-amber-700 dark:text-amber-400" },
  { key: "expenses_cents", label: "هزینه‌ها (اجاره و سایر)", tone: "text-orange-700 dark:text-orange-400" },
  { key: "profit_cents", label: "سود", tone: "" },
];

/** Profit & loss for a month and to date, with debts on both sides. */
export function PnLPanel() {
  const [period, setPeriod] = useState(currentPeriodKey);
  const { data, isLoading } = useQuery({
    queryKey: ["reports-pnl", period.year, period.month],
    queryFn: () => getPnL(period.year, period.month),
  });
  const label = formatPayrollPeriod(period.year, period.month);

  const column = (title: string, subtitle: string, f?: PnLFigures) => (
    <div className="card-elevated p-4">
      <p className="font-bold">{title}</p>
      <p className="mb-3 text-xs text-muted-foreground">{subtitle}</p>
      <div className="space-y-2">
        {ROWS.map((r) => {
          const v = f?.[r.key] ?? 0;
          const isProfit = r.key === "profit_cents";
          return (
            <div
              key={r.key}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2",
                isProfit ? "border-2 border-primary/20 bg-primary/5" : "bg-muted/30",
              )}
            >
              <span className={cn("text-sm", isProfit && "font-bold")}>{r.label}</span>
              <span
                dir="ltr"
                className={cn(
                  "font-bold number-display",
                  isProfit ? (v < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400") : r.tone,
                  isProfit && "text-lg",
                )}
              >
                {isLoading ? "—" : toman(v)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const debts = data?.debts;
  return (
    <section className="mb-6 space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          <h2 className="font-bold">سود و زیان</h2>
        </div>
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
          <span className="min-w-[6.5rem] text-center font-medium">{label}</span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPeriod((p) => addPeriodKeyMonths(p.year, p.month, 1))}
            aria-label="ماه بعد"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {column(`این ماه — ${label}`, "دریافت‌ها و پرداخت‌های همین ماه", data?.month)}
        {column(
          "تا کنون",
          data?.to_date_from
            ? `از شروع سال مالی (${formatIsoDateShamsi(data.to_date_from)}) تا پایان ${label}`
            : `از ابتدا تا پایان ${label}`,
          data?.to_date,
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DebtCard
          icon={ArrowDownRight}
          tone="text-destructive"
          label="بدهی دانش‌آموزان تا این ماه"
          value={debts?.student_due_cents}
          hint={debts ? `${debts.student_debtors.toLocaleString("fa-IR")} دانش‌آموز بدهکار` : undefined}
          loading={isLoading}
        />
        <DebtCard
          icon={Users}
          tone="text-muted-foreground"
          label="کل مانده قراردادهای دانش‌آموزان"
          value={debts?.student_total_cents}
          hint="شامل اقساط ماه‌های آینده"
          loading={isLoading}
        />
        <DebtCard
          icon={Wallet}
          tone="text-amber-700 dark:text-amber-400"
          label="بدهی ما به مشاوران/کارکنان"
          value={debts?.staff_payable_cents}
          hint="مانده حقوق پرداخت‌نشده"
          loading={isLoading}
        />
        <DebtCard
          icon={ArrowUpRight}
          tone="text-sky-700 dark:text-sky-400"
          label="طلب ما از کارکنان"
          value={debts?.staff_credit_cents}
          hint="پرداخت بیش از حقوق"
          loading={isLoading}
        />
      </div>
    </section>
  );
}

function DebtCard({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  loading,
}: {
  icon: React.ElementType;
  tone: string;
  label: string;
  value?: number;
  hint?: string;
  loading: boolean;
}) {
  return (
    <div className="card-elevated p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className={cn("h-4 w-4", tone)} />
      </div>
      <p className={cn("mt-1 text-xl font-bold number-display", tone)}>{loading ? "—" : toman(value ?? 0)}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

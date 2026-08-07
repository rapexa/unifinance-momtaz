import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertCircle,
  Download,
} from "lucide-react";
import {
  SHAMSI_MONTH_NAMES,
  shamsiToGregorianYYYYMM,
  gregorianYYYYMMToShamsi,
  shamsiYearOptions,
} from "@/lib/shamsi";
import { formatIsoDateTimeShamsi } from "@/lib/jalaliDate";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  getReportsSummary,
  getRevenueSeries,
  getPayrollSeries,
  getDebtsByAdvisor,
  getReportPaidPayments,
  getReportRevenueByStudent,
  getReportPayrollLines,
  getReportPayrollByUser,
  getReportStudentDebts,
  type ReportFilter,
} from "@/api/reportsApi";

const MONTH_NAMES = SHAMSI_MONTH_NAMES;

function formatCentsToToman(cents: number): string {
  const tomans = Math.floor(cents / 10);
  if (tomans >= 1_000_000) return `${(tomans / 1_000_000).toFixed(1)}M`;
  return tomans.toLocaleString("fa-IR");
}

function getDefaultFilter(): ReportFilter {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const toGreg = `${y}-${String(m).padStart(2, "0")}`;
  const fromDate = new Date(y, m - 1, 1);
  fromDate.setMonth(fromDate.getMonth() - 2);
  const fromY = fromDate.getFullYear();
  const fromM = fromDate.getMonth() + 1;
  const fromGreg = `${fromY}-${String(fromM).padStart(2, "0")}`;
  return { from: fromGreg, to: toGreg };
}

const SHAMSI_YEARS = shamsiYearOptions();
const MONTH_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const COLORS = ["hsl(175 70% 40%)", "hsl(38 92% 50%)", "hsl(0 72% 51%)", "hsl(260 60% 55%)"];

function downloadCsvBlob(filename: string, rows: string[][]): void {
  const BOM = "\uFEFF";
  const csv = BOM + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CARD_TO_CARD: "کارت به کارت",
  GATEWAY: "درگاه",
  CASH: "نقدی",
  INSTALLMENT: "اقساط",
  OTHER: "سایر",
};

function formatPaidAt(iso: string | null | undefined): string {
  return formatIsoDateTimeShamsi(iso);
}

function formatGregorianMonth(year: number, month: number): string {
  const sh = gregorianYYYYMMToShamsi(`${year}-${String(month).padStart(2, "0")}`);
  return `${MONTH_NAMES[sh.month]} ${sh.year}`;
}

const Reports = () => {
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<ReportFilter>(getDefaultFilter());

  const fromShamsi = useMemo(() => gregorianYYYYMMToShamsi(filter.from), [filter.from]);
  const toShamsi = useMemo(() => gregorianYYYYMMToShamsi(filter.to), [filter.to]);

  const setFromShamsi = (sYear: number, sMonth: number) =>
    setFilter((f) => ({ ...f, from: shamsiToGregorianYYYYMM(sYear, sMonth) }));
  const setToShamsi = (sYear: number, sMonth: number) =>
    setFilter((f) => ({ ...f, to: shamsiToGregorianYYYYMM(sYear, sMonth) }));

  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["reports-summary", filter.from, filter.to],
    queryFn: () => getReportsSummary(filter),
  });

  const { data: revenueSeries = [], isLoading: isRevenueLoading } = useQuery({
    queryKey: ["reports-revenue", filter.from, filter.to],
    queryFn: () => getRevenueSeries(filter),
  });

  const { data: payrollSeries = [], isLoading: isPayrollLoading } = useQuery({
    queryKey: ["reports-payroll", filter.from, filter.to],
    queryFn: () => getPayrollSeries(filter),
  });

  const { data: debtsByAdvisor = [], isLoading: isDebtsLoading } = useQuery({
    queryKey: ["reports-debts", filter.to],
    queryFn: () => getDebtsByAdvisor({ month: filter.to }),
  });

  const { data: paidPayments = [], isLoading: isPaidPaymentsLoading } = useQuery({
    queryKey: ["reports-revenue-payments", filter.from, filter.to],
    queryFn: () => getReportPaidPayments(filter),
  });

  const { data: revenueByStudent = [], isLoading: isRevByStudentLoading } = useQuery({
    queryKey: ["reports-revenue-by-student", filter.from, filter.to],
    queryFn: () => getReportRevenueByStudent(filter),
  });

  const { data: payrollLines = [], isLoading: isPayrollLinesLoading } = useQuery({
    queryKey: ["reports-payroll-lines", filter.from, filter.to],
    queryFn: () => getReportPayrollLines(filter),
  });

  const { data: payrollByUser = [], isLoading: isPayrollByUserLoading } = useQuery({
    queryKey: ["reports-payroll-by-user", filter.from, filter.to],
    queryFn: () => getReportPayrollByUser(filter),
  });

  const { data: studentDebts = [], isLoading: isStudentDebtsLoading } = useQuery({
    queryKey: ["reports-student-debts"],
    queryFn: () => getReportStudentDebts(),
  });

  const revenueChartData = useMemo(() => {
    return revenueSeries.map((p) => ({
      month: formatGregorianMonth(p.year, p.month),
      revenue: Math.floor(p.revenue_cents / 10),
    }));
  }, [revenueSeries]);

  const payrollChartData = useMemo(() => {
    return payrollSeries.map((p) => ({
      month: formatGregorianMonth(p.year, p.month),
      amount: Math.floor(p.payroll_cents / 10),
    }));
  }, [payrollSeries]);

  const debtPieData = useMemo(() => {
    return debtsByAdvisor.map((d) => ({
      name: d.advisor_name,
      value: Math.floor(d.debt_cents / 10),
    }));
  }, [debtsByAdvisor]);

  const filterLabel = `از ${fromShamsi.year}/${SHAMSI_MONTH_NAMES[fromShamsi.month]} تا ${toShamsi.year}/${SHAMSI_MONTH_NAMES[toShamsi.month]}`;

  const exportRevenue = () => {
    const dateRange = `${fromShamsi.year}-${fromShamsi.month}_${toShamsi.year}-${toShamsi.month}`;
    // Sheet 1: paid payments detail
    const h1 = ["شناسه", "تاریخ پرداخت", "مبلغ (تومان)", "روش", "دانش‌آموز", "مشاور", "توضیحات"];
    const r1 = paidPayments.map((p) => [
      String(p.id),
      formatPaidAt(p.paid_at),
      String(Math.round(p.amount_cents / 10)),
      PAYMENT_METHOD_LABELS[p.method] ?? p.method,
      p.student_name,
      p.advisor_name ?? "",
      p.description ?? "",
    ]);
    downloadCsvBlob(`revenue_payments_${dateRange}.csv`, [h1, ...r1]);
  };

  const exportPayroll = () => {
    const dateRange = `${fromShamsi.year}-${fromShamsi.month}_${toShamsi.year}-${toShamsi.month}`;
    const h1 = ["کارمند", "دوره (جلالی)", "حقوق ثابت (تومان)", "حقوق متغیر (تومان)", "جمع (تومان)", "وضعیت", "تاریخ پرداخت"];
    const r1 = payrollLines.map((p) => [
      p.user_name,
      formatGregorianMonth(p.period_year, p.period_month),
      String(Math.round(p.base_salary_cents / 10)),
      String(Math.round(p.variable_salary_cents / 10)),
      String(Math.round(p.total_salary_cents / 10)),
      p.status === "PAID" ? "پرداخت شده" : "در انتظار",
      p.paid_at ? formatPaidAt(p.paid_at) : "",
    ]);
    downloadCsvBlob(`payroll_lines_${dateRange}.csv`, [h1, ...r1]);
  };

  const exportDebts = () => {
    const h1 = ["دانش‌آموز", "مشاور", "بدهی (تومان)"];
    const r1 = studentDebts.map((d) => [
      d.student_name,
      d.advisor_name ?? "",
      String(Math.round(Math.abs(d.balance_cents) / 10)),
    ]);
    downloadCsvBlob(`student_debts_${new Date().toISOString().slice(0, 10)}.csv`, [h1, ...r1]);
  };

  return (
    <MainLayout title="گزارش‌ها" subtitle="گزارش‌های مالی و تحلیلی">
      {/* Filters - no Excel button */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full gap-2 sm:w-auto">
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-start sm:w-auto sm:max-w-[360px]">
                <Calendar className="ml-2 h-4 w-4" />
                <span className="truncate">{filterLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(20rem,calc(100vw-1rem))]" align="start">
              <div className="space-y-3">
                <p className="text-sm font-medium">بازه ماه (شمسی)</p>
                <div className="grid gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">از</label>
                    <div className="mt-1 flex gap-2">
                      <Select
                        value={String(fromShamsi.year)}
                        onValueChange={(v) => setFromShamsi(Number(v), fromShamsi.month)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="سال" />
                        </SelectTrigger>
                        <SelectContent>
                          {SHAMSI_YEARS.map((y) => (
                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={String(fromShamsi.month)}
                        onValueChange={(v) => setFromShamsi(fromShamsi.year, Number(v))}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="ماه" />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTH_OPTIONS.map((m) => (
                            <SelectItem key={m} value={String(m)}>{SHAMSI_MONTH_NAMES[m]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">تا</label>
                    <div className="mt-1 flex gap-2">
                      <Select
                        value={String(toShamsi.year)}
                        onValueChange={(v) => setToShamsi(Number(v), toShamsi.month)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="سال" />
                        </SelectTrigger>
                        <SelectContent>
                          {SHAMSI_YEARS.map((y) => (
                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={String(toShamsi.month)}
                        onValueChange={(v) => setToShamsi(toShamsi.year, Number(v))}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="ماه" />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTH_OPTIONS.map((m) => (
                            <SelectItem key={m} value={String(m)}>{SHAMSI_MONTH_NAMES[m]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setFilterOpen(false)}>
                  اعمال
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="card-elevated p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-success/10 p-3">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">درآمد کل</p>
              <p className="text-xl font-bold number-display text-foreground">
                {isSummaryLoading ? "—" : formatCentsToToman(summary?.total_revenue_cents ?? 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="card-elevated p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-warning/10 p-3">
              <Wallet className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">حقوق پرداختی</p>
              <p className="text-xl font-bold number-display text-foreground">
                {isSummaryLoading ? "—" : formatCentsToToman(summary?.total_payroll_cents ?? 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="card-elevated p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-destructive/10 p-3">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">بدهی‌ها</p>
              <p className="text-xl font-bold number-display text-destructive">
                {isSummaryLoading ? "—" : formatCentsToToman(summary?.total_debt_cents ?? 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="card-elevated p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3">
              <TrendingDown className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">سود خالص</p>
              <p className="text-xl font-bold number-display text-success">
                {isSummaryLoading ? "—" : formatCentsToToman(summary?.net_profit_cents ?? 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <Tabs defaultValue="revenue" className="space-y-4">
        <div className="overflow-x-auto">
        <TabsList className="min-w-max bg-muted/50">
          <TabsTrigger value="revenue" className="data-[state=active]:bg-background">
            درآمد
          </TabsTrigger>
          <TabsTrigger value="payroll" className="data-[state=active]:bg-background">
            حقوق
          </TabsTrigger>
          <TabsTrigger value="debts" className="data-[state=active]:bg-background">
            بدهی‌ها
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="revenue">
          <div className="flex justify-end mb-3">
            <Button variant="outline" size="sm" onClick={exportRevenue} disabled={paidPayments.length === 0}>
              <Download className="ml-2 h-4 w-4" />
              خروجی اکسل پرداخت‌ها
            </Button>
          </div>
          <div className="card-elevated p-5">
            <h3 className="font-bold text-foreground mb-4">روند درآمد ماهانه</h3>
            {isRevenueLoading && (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                در حال بارگذاری...
              </div>
            )}
            {!isRevenueLoading && revenueChartData.length === 0 && (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                داده‌ای برای این بازه وجود ندارد.
              </div>
            )}
            {!isRevenueLoading && revenueChartData.length > 0 && (
              <div className="h-80" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(175 70% 40%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(175 70% 40%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(180 15% 88%)" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(180 10% 45%)", fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(180 10% 45%)", fontSize: 11 }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(0 0% 100%)", border: "1px solid hsl(180 15% 88%)", borderRadius: "8px" }} formatter={(v: number) => [`${(v / 1_000_000).toFixed(1)} میلیون تومان`, "درآمد"]} />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(175 70% 40%)" strokeWidth={2} fill="url(#revenueGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="card-elevated p-5">
              <h3 className="font-bold text-foreground mb-3">دریافتی به تفکیک دانش‌آموز</h3>
              <p className="text-xs text-muted-foreground mb-3">
                جمع مبالغ پرداخت‌شده (وضعیت پرداخت شده) در بازهٔ انتخاب‌شده — هر نفر چقدر پرداخت کرده است.
              </p>
              {isRevByStudentLoading && (
                <p className="text-sm text-muted-foreground py-6 text-center">در حال بارگذاری...</p>
              )}
              {!isRevByStudentLoading && revenueByStudent.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">رکوردی نیست.</p>
              )}
              {!isRevByStudentLoading && revenueByStudent.length > 0 && (
                <div className="max-h-80 overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                      <tr className="border-b text-right">
                        <th className="p-2 font-medium">دانش‌آموز</th>
                        <th className="p-2 font-medium">مشاور</th>
                        <th className="p-2 font-medium">تعداد</th>
                        <th className="p-2 font-medium">جمع (تومان)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueByStudent.map((r) => (
                        <tr key={r.student_id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-2">{r.student_name}</td>
                          <td className="p-2 text-muted-foreground text-xs">{r.advisor_name || "—"}</td>
                          <td className="p-2 number-display">{r.payment_count.toLocaleString("fa-IR")}</td>
                          <td className="p-2 font-medium number-display">{formatCentsToToman(r.total_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card-elevated p-5">
              <h3 className="font-bold text-foreground mb-3">جزئیات پرداخت‌های دریافت‌شده</h3>
              <p className="text-xs text-muted-foreground mb-3">
                هر تراکنش پرداخت‌شده در بازه (تاریخ پرداخت).
              </p>
              {isPaidPaymentsLoading && (
                <p className="text-sm text-muted-foreground py-6 text-center">در حال بارگذاری...</p>
              )}
              {!isPaidPaymentsLoading && paidPayments.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">رکوردی نیست.</p>
              )}
              {!isPaidPaymentsLoading && paidPayments.length > 0 && (
                <div className="max-h-80 overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                      <tr className="border-b text-right">
                        <th className="p-2 font-medium">تاریخ پرداخت</th>
                        <th className="p-2 font-medium">دانش‌آموز</th>
                        <th className="p-2 font-medium">مبلغ</th>
                        <th className="p-2 font-medium">روش</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paidPayments.map((p) => (
                        <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-2 whitespace-nowrap text-xs">{formatPaidAt(p.paid_at)}</td>
                          <td className="p-2">
                            <span className="block">{p.student_name}</span>
                            {p.advisor_name ? (
                              <span className="text-xs text-muted-foreground">مشاور: {p.advisor_name}</span>
                            ) : null}
                          </td>
                          <td className="p-2 font-medium number-display">{formatCentsToToman(p.amount_cents)}</td>
                          <td className="p-2 text-xs">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payroll">
          <div className="flex justify-end mb-3">
            <Button variant="outline" size="sm" onClick={exportPayroll} disabled={payrollLines.length === 0}>
              <Download className="ml-2 h-4 w-4" />
              خروجی اکسل حقوق
            </Button>
          </div>
          <div className="card-elevated p-5">
            <h3 className="font-bold text-foreground mb-4">حقوق پرداختی (بازه انتخاب‌شده)</h3>
            {isPayrollLoading && (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                در حال بارگذاری...
              </div>
            )}
            {!isPayrollLoading && payrollChartData.length === 0 && (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                داده‌ای برای این بازه وجود ندارد.
              </div>
            )}
            {!isPayrollLoading && payrollChartData.length > 0 && (
              <div className="h-80" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={payrollChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(180 15% 88%)" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(180 10% 45%)", fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(180 10% 45%)", fontSize: 11 }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(0 0% 100%)", border: "1px solid hsl(180 15% 88%)", borderRadius: "8px" }} formatter={(v: number) => [`${(v / 1_000_000).toFixed(1)} میلیون تومان`, "حقوق"]} />
                    <Bar dataKey="amount" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="card-elevated p-5">
              <h3 className="font-bold text-foreground mb-3">جمع حقوق به تفکیک کارمند</h3>
              <p className="text-xs text-muted-foreground mb-3">
                در بازهٔ ماه‌های انتخاب‌شده؛ ستون «پرداخت‌شده» فقط فیش‌های با وضعیت پرداخت شده.
              </p>
              {isPayrollByUserLoading && (
                <p className="text-sm text-muted-foreground py-6 text-center">در حال بارگذاری...</p>
              )}
              {!isPayrollByUserLoading && payrollByUser.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">رکوردی نیست.</p>
              )}
              {!isPayrollByUserLoading && payrollByUser.length > 0 && (
                <div className="max-h-80 overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                      <tr className="border-b text-right">
                        <th className="p-2 font-medium">کارمند</th>
                        <th className="p-2 font-medium">نقش</th>
                        <th className="p-2 font-medium">جمع</th>
                        <th className="p-2 font-medium">پرداخت‌شده</th>
                        <th className="p-2 font-medium">در انتظار</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollByUser.map((r) => (
                        <tr key={r.user_id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-2">{r.user_name}</td>
                          <td className="p-2 text-muted-foreground text-xs">{r.role_code || "—"}</td>
                          <td className="p-2 number-display">{formatCentsToToman(r.total_cents)}</td>
                          <td className="p-2 number-display text-success">{formatCentsToToman(r.paid_cents)}</td>
                          <td className="p-2 number-display text-warning">{formatCentsToToman(r.pending_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card-elevated p-5">
              <h3 className="font-bold text-foreground mb-3">جزئیات فیش‌های حقوقی</h3>
              <p className="text-xs text-muted-foreground mb-3">هر ردیف یک فیش برای یک ماه و یک کارمند.</p>
              {isPayrollLinesLoading && (
                <p className="text-sm text-muted-foreground py-6 text-center">در حال بارگذاری...</p>
              )}
              {!isPayrollLinesLoading && payrollLines.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">رکوردی نیست.</p>
              )}
              {!isPayrollLinesLoading && payrollLines.length > 0 && (
                <div className="max-h-80 overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                      <tr className="border-b text-right">
                        <th className="p-2 font-medium">دوره</th>
                        <th className="p-2 font-medium">کارمند</th>
                        <th className="p-2 font-medium">ثابت</th>
                        <th className="p-2 font-medium">متغیر</th>
                        <th className="p-2 font-medium">جمع</th>
                        <th className="p-2 font-medium">وضعیت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollLines.map((row) => (
                        <tr
                          key={`${row.user_id}-${row.period_year}-${row.period_month}`}
                          className="border-b last:border-0 hover:bg-muted/30"
                        >
                          <td className="p-2 whitespace-nowrap text-xs">
                            {formatGregorianMonth(row.period_year, row.period_month)}
                          </td>
                          <td className="p-2">
                            <span className="block">{row.user_name}</span>
                            <span className="text-xs text-muted-foreground">{row.role_code || ""}</span>
                          </td>
                          <td className="p-2 number-display">{formatCentsToToman(row.base_salary_cents)}</td>
                          <td className="p-2 number-display">{formatCentsToToman(row.variable_salary_cents)}</td>
                          <td className="p-2 font-medium number-display">{formatCentsToToman(row.total_salary_cents)}</td>
                          <td className="p-2 text-xs">
                            {row.status === "PAID" ? "پرداخت شده" : "در انتظار"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="debts">
          <div className="flex justify-end mb-3">
            <Button variant="outline" size="sm" onClick={exportDebts} disabled={studentDebts.length === 0}>
              <Download className="ml-2 h-4 w-4" />
              خروجی اکسل بدهی‌ها
            </Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card-elevated p-5">
              <h3 className="font-bold text-foreground mb-4">بدهی به تفکیک مشاور</h3>
              {isDebtsLoading && (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  در حال بارگذاری...
                </div>
              )}
              {!isDebtsLoading && debtPieData.length === 0 && (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  بدهی‌ای ثبت نشده است.
                </div>
              )}
              {!isDebtsLoading && debtPieData.length > 0 && (
                <>
                  <div className="h-64" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={debtPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {debtPieData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => [`${(v / 1_000_000).toFixed(1)} میلیون تومان`, "بدهی"]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap justify-center gap-4 mt-4">
                    {debtsByAdvisor.map((item, index) => (
                      <div key={item.advisor_id} className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className="text-sm text-muted-foreground">{item.advisor_name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="card-elevated p-5">
              <h3 className="font-bold text-foreground mb-4">لیست بدهی‌ها</h3>
              {isDebtsLoading && (
                <div className="py-8 text-center text-muted-foreground">در حال بارگذاری...</div>
              )}
              {!isDebtsLoading && debtsByAdvisor.length === 0 && (
                <div className="py-8 text-center text-muted-foreground">بدهی‌ای ثبت نشده است.</div>
              )}
              {!isDebtsLoading && debtsByAdvisor.length > 0 && (
                <div className="space-y-3">
                  {debtsByAdvisor.map((item, index) => (
                    <div key={item.advisor_id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span className="text-foreground">{item.advisor_name}</span>
                      </div>
                      <span className="font-bold number-display text-destructive">
                        {formatCentsToToman(item.debt_cents)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 card-elevated p-5">
            <h3 className="font-bold text-foreground mb-3">بدهکاران (جزئیات دانش‌آموز)</h3>
            <p className="text-xs text-muted-foreground mb-3">
              ماندهٔ منفی فعلی هر دانش‌آموز؛ مشخص است چه کسی چقدر بدهکار است.
            </p>
            {isStudentDebtsLoading && (
              <p className="text-sm text-muted-foreground py-6 text-center">در حال بارگذاری...</p>
            )}
            {!isStudentDebtsLoading && studentDebts.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">دانش‌آموز بدهکاری نیست.</p>
            )}
            {!isStudentDebtsLoading && studentDebts.length > 0 && (
              <div className="max-h-96 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="border-b text-right">
                      <th className="p-2 font-medium">دانش‌آموز</th>
                      <th className="p-2 font-medium">مشاور</th>
                      <th className="p-2 font-medium">بدهی (تومان)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentDebts.map((s) => (
                      <tr key={s.student_id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-2">{s.student_name}</td>
                        <td className="p-2 text-muted-foreground text-xs">{s.advisor_name || "—"}</td>
                        <td className="p-2 font-bold number-display text-destructive">
                          {formatCentsToToman(-s.balance_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
};

export default Reports;

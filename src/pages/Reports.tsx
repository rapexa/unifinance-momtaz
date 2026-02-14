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
import { Input } from "@/components/ui/input";
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertCircle,
} from "lucide-react";
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
  type ReportFilter,
} from "@/api/reportsApi";

const MONTH_NAMES: Record<number, string> = {
  1: "فروردین", 2: "اردیبهشت", 3: "خرداد", 4: "تیر", 5: "مرداد", 6: "شهریور",
  7: "مهر", 8: "آبان", 9: "آذر", 10: "دی", 11: "بهمن", 12: "اسفند",
};

function formatCentsToToman(cents: number): string {
  const tomans = Math.floor(cents / 10);
  if (tomans >= 1_000_000) return `${(tomans / 1_000_000).toFixed(1)}M`;
  return tomans.toLocaleString("fa-IR");
}

function getDefaultFilter(): ReportFilter {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const to = `${y}-${String(m).padStart(2, "0")}`;
  const fromDate = new Date(y, m - 1, 1);
  fromDate.setMonth(fromDate.getMonth() - 2);
  const fromY = fromDate.getFullYear();
  const fromM = fromDate.getMonth() + 1;
  const from = `${fromY}-${String(fromM).padStart(2, "0")}`;
  return { from, to };
}

const COLORS = ["hsl(175 70% 40%)", "hsl(38 92% 50%)", "hsl(0 72% 51%)", "hsl(260 60% 55%)"];

const Reports = () => {
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<ReportFilter>(getDefaultFilter());

  const fromInput = filter.from;
  const toInput = filter.to;
  const setFrom = (v: string) => setFilter((f) => ({ ...f, from: v }));
  const setTo = (v: string) => setFilter((f) => ({ ...f, to: v }));

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

  const revenueChartData = useMemo(() => {
    return revenueSeries.map((p) => ({
      month: `${MONTH_NAMES[p.month] ?? p.month} ${p.year}`,
      revenue: Math.floor(p.revenue_cents / 10),
    }));
  }, [revenueSeries]);

  const payrollChartData = useMemo(() => {
    return payrollSeries.map((p) => ({
      month: `${MONTH_NAMES[p.month] ?? p.month} ${p.year}`,
      amount: Math.floor(p.payroll_cents / 10),
    }));
  }, [payrollSeries]);

  const debtPieData = useMemo(() => {
    return debtsByAdvisor.map((d) => ({
      name: d.advisor_name,
      value: Math.floor(d.debt_cents / 10),
    }));
  }, [debtsByAdvisor]);

  const filterLabel = `${filter.from} تا ${filter.to}`;

  return (
    <MainLayout title="گزارش‌ها" subtitle="گزارش‌های مالی و تحلیلی">
      {/* Filters - no Excel button */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Calendar className="ml-2 h-4 w-4" />
                {filterLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-3">
                <p className="text-sm font-medium">بازه ماه (YYYY-MM)</p>
                <div className="grid gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">از</label>
                    <Input
                      type="month"
                      value={fromInput}
                      onChange={(e) => setFrom(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">تا</label>
                    <Input
                      type="month"
                      value={toInput}
                      onChange={(e) => setTo(e.target.value)}
                      className="mt-1"
                    />
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
        <TabsList className="bg-muted/50">
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

        <TabsContent value="revenue">
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
        </TabsContent>

        <TabsContent value="payroll">
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
        </TabsContent>

        <TabsContent value="debts">
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
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
};

export default Reports;

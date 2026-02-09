import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download,
  Calendar,
  Filter,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertCircle,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";

const revenueData = [
  { month: "فروردین", revenue: 45000000 },
  { month: "اردیبهشت", revenue: 52000000 },
  { month: "خرداد", revenue: 48000000 },
  { month: "تیر", revenue: 61000000 },
  { month: "مرداد", revenue: 55000000 },
  { month: "شهریور", revenue: 67000000 },
  { month: "مهر", revenue: 72000000 },
  { month: "آبان", revenue: 78000000 },
  { month: "آذر", revenue: 85000000 },
];

const payrollData = [
  { month: "مهر", amount: 42000000 },
  { month: "آبان", amount: 45000000 },
  { month: "آذر", amount: 48000000 },
];

const debtByAdvisor = [
  { name: "سارا محمدی", value: 3500000 },
  { name: "علی نوری", value: 2800000 },
  { name: "رضا احمدی", value: 1930000 },
];

const COLORS = ["hsl(175 70% 40%)", "hsl(38 92% 50%)", "hsl(0 72% 51%)"];

const Reports = () => {
  return (
    <MainLayout title="گزارش‌ها" subtitle="گزارش‌های مالی و تحلیلی">
      {/* Filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Calendar className="ml-2 h-4 w-4" />
            آذر ۱۴۰۳
          </Button>
          <Button variant="outline" size="sm">
            <Filter className="ml-2 h-4 w-4" />
            فیلتر
          </Button>
        </div>
        <Button variant="outline" size="sm">
          <Download className="ml-2 h-4 w-4" />
          خروجی Excel
        </Button>
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
              <p className="text-xl font-bold number-display text-foreground">۵۶۳M</p>
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
              <p className="text-xl font-bold number-display text-foreground">۱۳۵M</p>
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
              <p className="text-xl font-bold number-display text-destructive">۸.۲M</p>
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
              <p className="text-xl font-bold number-display text-success">۴۲۰M</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="revenue" className="data-[state=active]:bg-background">درآمد</TabsTrigger>
          <TabsTrigger value="payroll" className="data-[state=active]:bg-background">حقوق</TabsTrigger>
          <TabsTrigger value="debts" className="data-[state=active]:bg-background">بدهی‌ها</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue">
          <div className="card-elevated p-5">
            <h3 className="font-bold text-foreground mb-4">روند درآمد ماهانه</h3>
            <div className="h-80" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(175 70% 40%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(175 70% 40%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(180 15% 88%)" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(180 10% 45%)", fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(180 10% 45%)", fontSize: 11 }} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(0 0% 100%)", border: "1px solid hsl(180 15% 88%)", borderRadius: "8px" }} formatter={(v: number) => [`${(v / 1000000).toFixed(1)} میلیون`, "درآمد"]} />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(175 70% 40%)" strokeWidth={2} fill="url(#revenueGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payroll">
          <div className="card-elevated p-5">
            <h3 className="font-bold text-foreground mb-4">حقوق پرداختی ۳ ماه اخیر</h3>
            <div className="h-80" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={payrollData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(180 15% 88%)" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "hsl(180 10% 45%)", fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(180 10% 45%)", fontSize: 11 }} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(0 0% 100%)", border: "1px solid hsl(180 15% 88%)", borderRadius: "8px" }} formatter={(v: number) => [`${(v / 1000000).toFixed(1)} میلیون`, "حقوق"]} />
                  <Bar dataKey="amount" fill="hsl(38 92% 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="debts">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card-elevated p-5">
              <h3 className="font-bold text-foreground mb-4">بدهی به تفکیک مشاور</h3>
              <div className="h-64" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={debtByAdvisor}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {debtByAdvisor.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${(v / 1000000).toFixed(1)} میلیون`, "بدهی"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 mt-4">
                {debtByAdvisor.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index] }} />
                    <span className="text-sm text-muted-foreground">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card-elevated p-5">
              <h3 className="font-bold text-foreground mb-4">لیست بدهی‌ها</h3>
              <div className="space-y-3">
                {debtByAdvisor.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index] }} />
                      <span className="text-foreground">{item.name}</span>
                    </div>
                    <span className="font-bold number-display text-destructive">
                      {(item.value / 1000000).toFixed(1)} میلیون
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
};

export default Reports;

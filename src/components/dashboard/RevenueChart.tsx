import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const MONTH_NAMES: Record<number, string> = {
  1: "فروردین", 2: "اردیبهشت", 3: "خرداد", 4: "تیر", 5: "مرداد", 6: "شهریور",
  7: "مهر", 8: "آبان", 9: "آذر", 10: "دی", 11: "بهمن", 12: "اسفند",
};

export interface RevenueTrendPoint {
  year: number;
  month: number;
  revenue_cents: number;
  payroll_cents: number;
}

interface RevenueChartProps {
  data?: RevenueTrendPoint[];
  isLoading?: boolean;
}

export function RevenueChart({ data = [], isLoading }: RevenueChartProps) {
  const chartData = data.map((p) => ({
    month: `${MONTH_NAMES[p.month] ?? p.month} ${p.year}`,
    revenue: Math.floor(p.revenue_cents / 10),
    expenses: Math.floor(p.payroll_cents / 10),
  }));

  return (
    <div className="card-elevated p-5 animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-foreground">نمودار درآمد و هزینه</h3>
          <p className="text-sm text-muted-foreground">مقایسه ماهانه</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-primary" />
            <span className="text-xs text-muted-foreground">درآمد</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-chart-3" />
            <span className="text-xs text-muted-foreground">هزینه</span>
          </div>
        </div>
      </div>
      {isLoading && (
        <div className="h-72 flex items-center justify-center text-muted-foreground">در حال بارگذاری...</div>
      )}
      {!isLoading && chartData.length === 0 && (
        <div className="h-72 flex items-center justify-center text-muted-foreground">داده‌ای برای نمایش وجود ندارد.</div>
      )}
      {!isLoading && chartData.length > 0 && (
        <div className="h-72" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(175 70% 40%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(175 70% 40%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(38 92% 50%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(38 92% 50%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(180 15% 88%)" vertical={false} />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(180 10% 45%)", fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "hsl(180 10% 45%)", fontSize: 11 }}
                tickFormatter={(value) => `${(value / 1_000_000).toFixed(0)}M`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(0 0% 100%)",
                  border: "1px solid hsl(180 15% 88%)",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
                formatter={(value: number) => [`${(value / 1_000_000).toFixed(1)} میلیون تومان`, ""]}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(175 70% 40%)"
                strokeWidth={2}
                fill="url(#colorRevenue)"
                name="درآمد"
              />
              <Area
                type="monotone"
                dataKey="expenses"
                stroke="hsl(38 92% 50%)"
                strokeWidth={2}
                fill="url(#colorExpenses)"
                name="هزینه"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

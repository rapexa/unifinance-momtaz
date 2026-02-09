import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { month: "فروردین", revenue: 45000000, expenses: 32000000 },
  { month: "اردیبهشت", revenue: 52000000, expenses: 35000000 },
  { month: "خرداد", revenue: 48000000, expenses: 31000000 },
  { month: "تیر", revenue: 61000000, expenses: 38000000 },
  { month: "مرداد", revenue: 55000000, expenses: 36000000 },
  { month: "شهریور", revenue: 67000000, expenses: 42000000 },
  { month: "مهر", revenue: 72000000, expenses: 45000000 },
  { month: "آبان", revenue: 78000000, expenses: 48000000 },
  { month: "آذر", revenue: 85000000, expenses: 52000000 },
];

export function RevenueChart() {
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
      <div className="h-72" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
              tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(0 0% 100%)",
                border: "1px solid hsl(180 15% 88%)",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}
              formatter={(value: number) => [`${(value / 1000000).toFixed(1)} میلیون`, ""]}
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
    </div>
  );
}

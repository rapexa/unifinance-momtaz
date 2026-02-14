import { useQuery } from "@tanstack/react-query";
import { Wallet, TrendingUp, Users, AlertCircle } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { KPICard } from "@/components/dashboard/KPICard";
import { RecentPaymentsTable } from "@/components/dashboard/RecentPaymentsTable";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { DebtAlerts } from "@/components/dashboard/DebtAlerts";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { getDashboardSummary, getRevenueTrend } from "@/api/dashboardApi";

function formatCentsToToman(cents: number): string {
  const tomans = Math.floor(cents / 10);
  return tomans.toLocaleString("fa-IR");
}

const Dashboard = () => {
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => getDashboardSummary({ recent_limit: 5, alerts_limit: 5 }),
  });

  const { data: trendData = [], isLoading: trendLoading } = useQuery({
    queryKey: ["dashboard-revenue-trend"],
    queryFn: () => getRevenueTrend({ months: 6 }),
  });

  const kpis = summary?.kpis;
  const totalDebtCents = (kpis?.pending_debt_cents ?? 0) + (kpis?.overdue_debt_cents ?? 0);

  return (
    <MainLayout title="داشبورد" subtitle="خلاصه وضعیت مالی سیستم">
      {/* KPI Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="درآمد کل"
          value={summaryLoading ? "—" : formatCentsToToman(kpis?.total_revenue_cents ?? 0)}
          icon={TrendingUp}
          variant="success"
        />
        <KPICard
          title="بدهی‌ها"
          value={summaryLoading ? "—" : formatCentsToToman(totalDebtCents)}
          icon={AlertCircle}
          variant="danger"
        />
        <KPICard
          title="حقوق پرداختی"
          value={summaryLoading ? "—" : formatCentsToToman(kpis?.monthly_payroll_cents ?? 0)}
          icon={Wallet}
          variant="warning"
        />
        <KPICard
          title="دانش‌آموزان فعال"
          value={summaryLoading ? "—" : String(kpis?.active_students ?? 0)}
          icon={Users}
          variant="default"
        />
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart data={trendData} isLoading={trendLoading} />
        </div>

        <div className="space-y-6">
          <QuickActions />
          <DebtAlerts alerts={summary?.debt_alerts} isLoading={summaryLoading} />
        </div>
      </div>

      {/* Recent payments */}
      <div className="mt-6">
        <RecentPaymentsTable payments={summary?.recent_payments} isLoading={summaryLoading} />
      </div>
    </MainLayout>
  );
};

export default Dashboard;

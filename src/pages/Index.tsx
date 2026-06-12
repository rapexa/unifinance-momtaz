import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Wallet, TrendingUp, Users, AlertCircle, UserPlus } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { KPICard } from "@/components/dashboard/KPICard";
import { RecentPaymentsTable } from "@/components/dashboard/RecentPaymentsTable";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { DebtAlerts } from "@/components/dashboard/DebtAlerts";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { getDashboardSummary, getRevenueTrend } from "@/api/dashboardApi";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { PERMISSIONS } from "@/api/settingsApi";
import { Button } from "@/components/ui/button";

const FIRST_ROUTE_BY_PERMISSION: Record<string, string> = {
  [PERMISSIONS.STUDENTS]: "/students",
  [PERMISSIONS.USERS]: "/users",
  [PERMISSIONS.PLANS]: "/plans",
  [PERMISSIONS.PAYMENTS]: "/payments",
  [PERMISSIONS.PAYROLL]: "/payroll",
  [PERMISSIONS.REMINDERS]: "/reminders",
  [PERMISSIONS.REPORTS]: "/reports",
  [PERMISSIONS.SETTINGS]: "/settings",
};

function formatCentsToToman(cents: number): string {
  const tomans = Math.floor(cents / 10);
  return tomans.toLocaleString("fa-IR");
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { profile } = useCurrentUser();

  useEffect(() => {
    if (!profile) return;
    const perms = profile.permissions;
    if (perms !== undefined && !perms.includes(PERMISSIONS.DASHBOARD)) {
      const first = [PERMISSIONS.STUDENTS, PERMISSIONS.USERS, PERMISSIONS.PLANS, PERMISSIONS.PAYMENTS, PERMISSIONS.PAYROLL, PERMISSIONS.REMINDERS, PERMISSIONS.REPORTS, PERMISSIONS.SETTINGS].find((p) => perms.includes(p));
      navigate(FIRST_ROUTE_BY_PERMISSION[first ?? PERMISSIONS.SETTINGS] ?? "/settings", { replace: true });
    }
  }, [profile, navigate]);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => getDashboardSummary({ recent_limit: 5, alerts_limit: 5 }),
  });

  const { data: trendData = [], isLoading: trendLoading } = useQuery({
    queryKey: ["dashboard-revenue-trend"],
    queryFn: () => getRevenueTrend({ months: 6 }),
  });

  const kpis = summary?.kpis;
  const totalDebtCents =
    kpis?.student_debt_cents ??
    (kpis?.pending_debt_cents ?? 0) + (kpis?.overdue_debt_cents ?? 0);

  return (
    <MainLayout title="داشبورد" subtitle="خلاصه وضعیت مالی سیستم">
      {/* KPI Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
        <KPICard
          title="ثبت‌نام این ماه"
          value={summaryLoading ? "—" : String(kpis?.student_registrations_this_month ?? 0)}
          icon={UserPlus}
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
          <div className="card-elevated p-5">
            <h3 className="mb-3 font-bold text-foreground">ثبت‌نام دانش‌آموز</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              برای ثبت‌نام دانش‌آموز جدید با تمام جزئیات، به صفحه دانش‌آموزان بروید.
            </p>
            <Button className="w-full" onClick={() => navigate("/students")}>
              <UserPlus className="ml-2 h-4 w-4" />
              ثبت‌نام دانش‌آموز جدید
            </Button>
          </div>
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

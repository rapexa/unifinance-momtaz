import { Wallet, TrendingUp, Users, AlertCircle } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { KPICard } from "@/components/dashboard/KPICard";
import { RecentPaymentsTable } from "@/components/dashboard/RecentPaymentsTable";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { DebtAlerts } from "@/components/dashboard/DebtAlerts";
import { QuickActions } from "@/components/dashboard/QuickActions";

const Dashboard = () => {
  return (
    <MainLayout title="داشبورد" subtitle="خلاصه وضعیت مالی سیستم">
      {/* KPI Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="درآمد کل"
          value="۱۲۵,۴۵۰,۰۰۰"
          change={{ value: "+۱۲٪", trend: "up" }}
          icon={TrendingUp}
          variant="success"
        />
        <KPICard
          title="بدهی‌ها"
          value="۸,۲۳۰,۰۰۰"
          change={{ value: "+۳٪", trend: "down" }}
          icon={AlertCircle}
          variant="danger"
        />
        <KPICard
          title="حقوق پرداختی"
          value="۴۵,۸۰۰,۰۰۰"
          change={{ value: "+۵٪", trend: "up" }}
          icon={Wallet}
          variant="warning"
        />
        <KPICard
          title="دانش‌آموزان فعال"
          value="۱۲۸"
          change={{ value: "+۸", trend: "up" }}
          icon={Users}
          variant="default"
        />
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Chart - 2 columns */}
        <div className="lg:col-span-2">
          <RevenueChart />
        </div>

        {/* Sidebar widgets */}
        <div className="space-y-6">
          <QuickActions />
          <DebtAlerts />
        </div>
      </div>

      {/* Recent payments */}
      <div className="mt-6">
        <RecentPaymentsTable />
      </div>
    </MainLayout>
  );
};

export default Dashboard;

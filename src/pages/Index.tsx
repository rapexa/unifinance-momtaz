import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { createStudent } from "@/api/studentsApi";
import { createPayment } from "@/api/paymentsApi";
import { listAdvisors } from "@/api/usersApi";
import { listActivePlans } from "@/api/plansApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatGroupedFaIntInput, parseLocalizedInt } from "@/lib/numberInput";

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
  const queryClient = useQueryClient();
  const { profile } = useCurrentUser();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [advisorId, setAdvisorId] = useState("none");
  const [planId, setPlanId] = useState("none");
  const [paymentType, setPaymentType] = useState<"SINGLE_SESSION" | "MONTHLY" | "COURSE">("MONTHLY");
  const [tuitionCents, setTuitionCents] = useState("");
  const [discountCents, setDiscountCents] = useState("");
  const [paidNowCents, setPaidNowCents] = useState("");

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
  const { data: advisors = [] } = useQuery({
    queryKey: ["advisors", "dashboard-quick-register"],
    queryFn: listAdvisors,
  });
  const { data: plans = [] } = useQuery({
    queryKey: ["plans-active", "dashboard-quick-register"],
    queryFn: listActivePlans,
  });

  const quickRegisterMutation = useMutation({
    mutationFn: createStudent,
    onSuccess: () => {
      setFirstName("");
      setLastName("");
      setPhone("");
      setAdvisorId("none");
      setPlanId("none");
      setPaymentType("MONTHLY");
      setTuitionCents("");
      setDiscountCents("");
      setPaidNowCents("");
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["students-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
  });

  const kpis = summary?.kpis;
  const totalDebtCents = (kpis?.pending_debt_cents ?? 0) + (kpis?.overdue_debt_cents ?? 0);

  const payableRegistrationCents = Math.max(
    parseLocalizedInt(tuitionCents) - parseLocalizedInt(discountCents),
    0
  );

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
            <h3 className="mb-3 font-bold text-foreground">ثبت‌نام سریع دانش‌آموز</h3>
            <div className="space-y-2">
              <Input placeholder="نام" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <Input placeholder="نام خانوادگی" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              <Input placeholder="موبایل (اختیاری)" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Select value={advisorId} onValueChange={setAdvisorId}>
                <SelectTrigger><SelectValue placeholder="انتخاب مشاور (اختیاری)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون مشاور</SelectItem>
                  {advisors.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.first_name} {a.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger><SelectValue placeholder="انتخاب پلن (اختیاری)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون پلن</SelectItem>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={paymentType} onValueChange={(v) => setPaymentType(v as "SINGLE_SESSION" | "MONTHLY" | "COURSE")}>
                <SelectTrigger><SelectValue placeholder="نوع ثبت‌نام" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SINGLE_SESSION">تک‌جلسه‌ای</SelectItem>
                  <SelectItem value="MONTHLY">ماهانه</SelectItem>
                  <SelectItem value="COURSE">دوره‌ای</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="مبلغ کل ثبت‌نام (ریال)"
                inputMode="numeric"
                dir="ltr"
                value={tuitionCents}
                onChange={(e) => setTuitionCents(formatGroupedFaIntInput(e.target.value))}
              />
              <Input
                placeholder="تخفیف (ریال)"
                inputMode="numeric"
                dir="ltr"
                value={discountCents}
                onChange={(e) => setDiscountCents(formatGroupedFaIntInput(e.target.value))}
              />
              <Input
                placeholder="مبلغ پرداختی الان (ریال)"
                inputMode="numeric"
                dir="ltr"
                value={paidNowCents}
                onChange={(e) => setPaidNowCents(formatGroupedFaIntInput(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                مبلغ قابل ثبت بعد از تخفیف: {formatCentsToToman(payableRegistrationCents)} تومان
              </p>
              <Button
                className="w-full"
                disabled={!firstName.trim() || !lastName.trim() || quickRegisterMutation.isPending}
                onClick={async () => {
                  const paidNow = parseLocalizedInt(paidNowCents);
                  const payable = payableRegistrationCents;
                  if (paidNow < 0 || paidNow > payable) return;
                  const student = await quickRegisterMutation.mutateAsync({
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    phone: phone.trim() || undefined,
                    advisor_id: advisorId === "none" ? undefined : Number(advisorId),
                    current_plan_id: planId === "none" ? undefined : Number(planId),
                    balance_cents: payable > 0 ? -payable : undefined,
                  });
                  if (paidNow > 0) {
                    await createPayment({
                      student_id: student.id,
                      amount_cents: paidNow,
                      method: "CASH",
                      status: "PAID",
                      payment_type: paymentType,
                      description: "پرداخت اولیه هنگام ثبت‌نام سریع",
                    });
                    queryClient.invalidateQueries({ queryKey: ["payments"] });
                    queryClient.invalidateQueries({ queryKey: ["students"] });
                    queryClient.invalidateQueries({ queryKey: ["students-summary"] });
                  }
                }}
              >
                {quickRegisterMutation.isPending ? "در حال ثبت..." : "ثبت‌نام دانش‌آموز"}
              </Button>
            </div>
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

import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  FileText,
  Settings,
  Calculator,
  Download,
  Send,
  MoreHorizontal,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getPayrollSummary,
  listPayrollEntries,
  createPayrollEntry,
  getPayrollEntry,
  type PayrollEntryApi,
  type CreatePayrollEntryPayload,
} from "@/api/payrollApi";
import { listUsers } from "@/api/usersApi";

const roleLabels: Record<string, string> = {
  ADMIN: "مدیر",
  ACCOUNTANT: "حسابدار",
  ADVISOR: "مشاور",
  OPERATOR: "اپراتور",
};

function formatCentsToToman(cents: number): string {
  const tomans = Math.floor(cents / 10);
  return tomans.toLocaleString("fa-IR");
}

function monthName(month: number): string {
  const names: Record<number, string> = {
    1: "فروردین", 2: "اردیبهشت", 3: "خرداد", 4: "تیر", 5: "مرداد", 6: "شهریور",
    7: "مهر", 8: "آبان", 9: "آذر", 10: "دی", 11: "بهمن", 12: "اسفند",
  };
  return names[month] ?? String(month);
}

const Payroll = () => {
  const queryClient = useQueryClient();
  const now = new Date();
  const [currentYear] = useState(now.getFullYear());
  const [currentMonth] = useState(now.getMonth() + 1);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailEntryId, setDetailEntryId] = useState<number | null>(null);

  // Create form
  const [createUserId, setCreateUserId] = useState("");
  const [createPeriodYear, setCreatePeriodYear] = useState(currentYear);
  const [createPeriodMonth, setCreatePeriodMonth] = useState(currentMonth);
  const [createBaseTomans, setCreateBaseTomans] = useState("");
  const [createVariableTomans, setCreateVariableTomans] = useState("");
  const [createStudentsCount, setCreateStudentsCount] = useState("0");
  const [createStatus, setCreateStatus] = useState("PENDING");

  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["payroll-summary", currentYear, currentMonth],
    queryFn: () => getPayrollSummary({ year: currentYear, month: currentMonth }),
  });

  const {
    data: entriesData,
    isLoading: isEntriesLoading,
    isError: isEntriesError,
    error: entriesError,
  } = useQuery({
    queryKey: ["payroll-entries", currentYear, currentMonth],
    queryFn: () =>
      listPayrollEntries({
        year: currentYear,
        month: currentMonth,
        page: 1,
        page_size: 100,
      }),
  });

  const { data: usersData } = useQuery({
    queryKey: ["users", "active"],
    queryFn: () =>
      listUsers({
        status: "active",
        page: 1,
        page_size: 200,
      }),
    enabled: isCreateOpen,
  });

  const { data: detailEntry, isLoading: isDetailLoading } = useQuery({
    queryKey: ["payroll-entry", detailEntryId],
    queryFn: () => getPayrollEntry(detailEntryId!),
    enabled: detailEntryId != null,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreatePayrollEntryPayload) => createPayrollEntry(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      setIsCreateOpen(false);
      resetCreateForm();
    },
  });

  function resetCreateForm() {
    setCreateUserId("");
    setCreateBaseTomans("");
    setCreateVariableTomans("");
    setCreateStudentsCount("0");
    setCreateStatus("PENDING");
    setCreatePeriodYear(currentYear);
    setCreatePeriodMonth(currentMonth);
  }

  const totalMonthCents =
    summary != null
      ? summary.total_base_cents + summary.total_variable_cents
      : 0;

  const handleCreateSubmit = useCallback(() => {
    const userId = parseInt(createUserId, 10);
    const baseTomans = parseInt(createBaseTomans.replace(/\D/g, ""), 10) || 0;
    const variableTomans = parseInt(createVariableTomans.replace(/\D/g, ""), 10) || 0;
    const studentsCount = parseInt(createStudentsCount.replace(/\D/g, ""), 10) || 0;
    if (!userId || baseTomans < 0) return;
    const payload: CreatePayrollEntryPayload = {
      user_id: userId,
      period_year: createPeriodYear,
      period_month: createPeriodMonth,
      base_salary_cents: baseTomans * 10,
      variable_salary_cents: variableTomans * 10,
      students_count: studentsCount,
      status: createStatus,
    };
    createMutation.mutate(payload);
  }, [
    createUserId,
    createBaseTomans,
    createVariableTomans,
    createStudentsCount,
    createStatus,
    createPeriodYear,
    createPeriodMonth,
    createMutation,
  ]);

  const handlePrintPdf = useCallback((entry: PayrollEntryApi) => {
    const w = window.open("", "_blank");
    if (!w) return;
    const name = `${entry.user_first_name} ${entry.user_last_name}`.trim() || "کارمند";
    w.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="fa">
      <head><meta charset="utf-8"><title>فیش حقوقی - ${name}</title></head>
      <body style="font-family: Tahoma, Arial; padding: 24px; max-width: 600px; margin: 0 auto;">
        <h2 style="text-align: center;">فیش حقوقی</h2>
        <p><strong>دوره:</strong> ${monthName(entry.period_month)} ${entry.period_year}</p>
        <p><strong>کارمند:</strong> ${name}</p>
        <p><strong>سمت:</strong> ${roleLabels[entry.user_role] ?? entry.user_role}</p>
        <hr/>
        <p><strong>حقوق ثابت:</strong> ${formatCentsToToman(entry.base_salary_cents)} تومان</p>
        <p><strong>حقوق متغیر:</strong> ${formatCentsToToman(entry.variable_salary_cents)} تومان</p>
        <p><strong>تعداد دانش‌آموزان:</strong> ${entry.students_count}</p>
        <hr/>
        <p><strong>جمع کل:</strong> ${formatCentsToToman(entry.total_salary_cents)} تومان</p>
        <p><strong>وضعیت:</strong> ${entry.status === "PAID" ? "پرداخت شده" : "در انتظار"}</p>
      </body>
      </html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
      w.close();
    }, 250);
  }, []);

  const entries: PayrollEntryApi[] = entriesData?.data ?? [];
  const users = usersData?.data ?? [];

  return (
    <MainLayout title="حقوق و دستمزد" subtitle="مدیریت ساختار حقوق و محاسبات">
      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">کل حقوق این ماه</p>
          <p className="text-2xl font-bold number-display text-foreground">
            {isSummaryLoading ? "—" : formatCentsToToman(totalMonthCents)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">تومان</p>
        </div>
        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">حقوق ثابت</p>
          <p className="text-2xl font-bold number-display text-foreground">
            {isSummaryLoading ? "—" : formatCentsToToman(summary?.total_base_cents ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">تومان</p>
        </div>
        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">حقوق متغیر</p>
          <p className="text-2xl font-bold number-display text-primary">
            {isSummaryLoading ? "—" : formatCentsToToman(summary?.total_variable_cents ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">تومان</p>
        </div>
        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">پرداخت شده</p>
          <p className="text-2xl font-bold number-display text-success">
            {isSummaryLoading ? "—" : formatCentsToToman(summary?.total_paid_cents ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">تومان</p>
        </div>
      </div>

      <Tabs defaultValue="employees" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="employees" className="data-[state=active]:bg-background">
              کارکنان
            </TabsTrigger>
            <TabsTrigger value="structure" className="data-[state=active]:bg-background">
              ساختار حقوق
            </TabsTrigger>
            <TabsTrigger value="payslips" className="data-[state=active]:bg-background">
              فیش‌های حقوقی
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="ml-2 h-4 w-4" />
              ثبت حقوق
            </Button>
          </div>
        </div>

        <TabsContent value="employees">
          <div className="card-elevated overflow-hidden">
            <div className="overflow-x-auto">
              {isEntriesLoading && (
                <div className="p-6 text-sm text-muted-foreground">
                  در حال بارگذاری...
                </div>
              )}
              {isEntriesError && (
                <div className="p-6 text-sm text-destructive">
                  {(entriesError as Error)?.message ?? "خطا در دریافت لیست"}
                </div>
              )}
              {!isEntriesLoading && !isEntriesError && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">کارمند</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">سمت</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">دانش‌آموزان</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">حقوق ثابت</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">حقوق متغیر</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">جمع کل</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">وضعیت</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-muted-foreground">
                          فیش حقوقی برای این ماه ثبت نشده است.
                        </td>
                      </tr>
                    ) : (
                      entries.map((entry) => {
                        const name = [entry.user_first_name, entry.user_last_name].filter(Boolean).join(" ") || "—";
                        return (
                          <tr
                            key={entry.id}
                            className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                                  {name.charAt(0)}
                                </div>
                                <span className="font-medium text-foreground">{name}</span>
                              </div>
                            </td>
                            <td className="p-4 text-muted-foreground">
                              {roleLabels[entry.user_role] ?? entry.user_role}
                            </td>
                            <td className="p-4 text-foreground">
                              {entry.students_count > 0 ? `${entry.students_count} نفر` : "—"}
                            </td>
                            <td className="p-4 number-display text-foreground">
                              {formatCentsToToman(entry.base_salary_cents)}
                            </td>
                            <td className="p-4 number-display text-primary">
                              {formatCentsToToman(entry.variable_salary_cents)}
                            </td>
                            <td className="p-4 font-bold number-display text-foreground">
                              {formatCentsToToman(entry.total_salary_cents)}
                            </td>
                            <td className="p-4">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                                  entry.status === "PAID" ? "status-paid" : "status-pending"
                                )}
                              >
                                {entry.status === "PAID" ? "پرداخت شده" : "در انتظار"}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="flex gap-1 flex-wrap">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1"
                                  onClick={() => setDetailEntryId(entry.id)}
                                  title="دیدن جزئیات فیش حقوق"
                                >
                                  <Eye className="h-4 w-4" />
                                  جزئیات
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1"
                                  onClick={() => handlePrintPdf(entry)}
                                  title="خروجی PDF فیش حقوق"
                                >
                                  <Download className="h-4 w-4" />
                                  PDF
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="structure">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card-elevated p-5">
              <h3 className="font-bold text-foreground mb-4">ساختار حقوق ثابت</h3>
              <p className="text-sm text-muted-foreground mb-4">
                ساختار بر اساس نقش از تب کارکنان و فیش‌های ثبت‌شده استخراج می‌شود. برای تنظیم به تنظیمات سیستم مراجعه کنید.
              </p>
              <Button variant="outline" className="w-full" disabled>
                <Settings className="ml-2 h-4 w-4" />
                ویرایش ساختار (از API schemes)
              </Button>
            </div>
            <div className="card-elevated p-5">
              <h3 className="font-bold text-foreground mb-4">ساختار حقوق متغیر</h3>
              <p className="text-sm text-muted-foreground mb-4">
                به ازای هر دانش‌آموز، درصد از دریافتی و پاداش ماهانه در سرویس schemes تعریف شده است.
              </p>
              <Button variant="outline" className="w-full" disabled>
                <Settings className="ml-2 h-4 w-4" />
                ویرایش ساختار (از API schemes)
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payslips">
          <div className="card-elevated p-8 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-bold text-foreground mb-2">فیش‌های حقوقی</h3>
            <p className="text-muted-foreground mb-4">
              فیش‌های حقوقی در تب کارکنان نمایش داده می‌شوند. برای صدور فیش جدید از دکمه «ثبت حقوق» استفاده کنید.
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="ml-2 h-4 w-4" />
              ثبت حقوق (صدور فیش جدید)
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Register Payroll Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ثبت حقوق</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">کارمند</label>
              <Select value={createUserId} onValueChange={setCreateUserId} required>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب کارمند" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <label className="text-sm font-medium">سال دوره</label>
                <Input
                  type="number"
                  min={1400}
                  max={1500}
                  value={createPeriodYear}
                  onChange={(e) => setCreatePeriodYear(parseInt(e.target.value, 10) || currentYear)}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">ماه دوره</label>
                <Select
                  value={String(createPeriodMonth)}
                  onValueChange={(v) => setCreatePeriodMonth(parseInt(v, 10))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {monthName(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">حقوق ثابت (تومان)</label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="مثال: ۱۵۰۰۰۰۰۰"
                value={createBaseTomans}
                onChange={(e) => setCreateBaseTomans(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">حقوق متغیر (تومان)</label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="مثال: ۸۵۰۰۰۰۰"
                value={createVariableTomans}
                onChange={(e) => setCreateVariableTomans(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">تعداد دانش‌آموزان</label>
              <Input
                type="text"
                inputMode="numeric"
                value={createStudentsCount}
                onChange={(e) => setCreateStudentsCount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">وضعیت</label>
              <Select value={createStatus} onValueChange={setCreateStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">در انتظار</SelectItem>
                  <SelectItem value="PAID">پرداخت شده</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              انصراف
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={!createUserId || !createBaseTomans || createMutation.isPending}
            >
              {createMutation.isPending ? "در حال ثبت..." : "ثبت"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payslip Detail Dialog */}
      <Dialog open={detailEntryId != null} onOpenChange={(open) => !open && setDetailEntryId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>جزئیات فیش حقوقی</DialogTitle>
          </DialogHeader>
          {isDetailLoading && <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>}
          {detailEntry && (
            <div className="space-y-3 py-2">
              <p><strong>دوره:</strong> {monthName(detailEntry.period_month)} {detailEntry.period_year}</p>
              <p><strong>کارمند:</strong> {[detailEntry.user_first_name, detailEntry.user_last_name].filter(Boolean).join(" ")}</p>
              <p><strong>سمت:</strong> {roleLabels[detailEntry.user_role] ?? detailEntry.user_role}</p>
              <p><strong>حقوق ثابت:</strong> {formatCentsToToman(detailEntry.base_salary_cents)} تومان</p>
              <p><strong>حقوق متغیر:</strong> {formatCentsToToman(detailEntry.variable_salary_cents)} تومان</p>
              <p><strong>تعداد دانش‌آموزان:</strong> {detailEntry.students_count}</p>
              <p><strong>جمع کل:</strong> {formatCentsToToman(detailEntry.total_salary_cents)} تومان</p>
              <p><strong>وضعیت:</strong> {detailEntry.status === "PAID" ? "پرداخت شده" : "در انتظار"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </MainLayout>
  );
};

export default Payroll;

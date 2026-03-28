import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  Pencil,
  Settings,
  Download,
  Eye,
  CheckCircle2,
  RefreshCw,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatGroupedFaIntInput, parseLocalizedInt } from "@/lib/numberInput";
import {
  getPayrollSummary,
  listPayrollEntries,
  createPayrollEntry,
  updatePayrollEntry,
  getPayrollEntry,
  getPayrollPreview,
  type PayrollEntryApi,
  type CreatePayrollEntryPayload,
  type UpdatePayrollEntryPayload,
} from "@/api/payrollApi";
import { listUsers } from "@/api/usersApi";
import { getPaymentsSummary } from "@/api/paymentsApi";
import { listRoles } from "@/api/rolesApi";

const roleLabels: Record<string, string> = {
  general_manager: "مدیرکل",
  advisor: "مشاور",
  secretary: "منشی",
  support: "پشتیبان",
  executive_manager: "مدیر اجرایی",
  advisor_lead: "سرپرست مشاوران",
  ADMIN: "مدیر",
  ACCOUNTANT: "حسابدار",
  ADVISOR: "مشاور",
  OPERATOR: "اپراتور",
};

function EditPayrollForm({
  entry,
  onSave,
  onRecalculate,
  onCancel,
  isSaving,
}: {
  entry: PayrollEntryApi;
  onSave: (p: UpdatePayrollEntryPayload) => void;
  onRecalculate: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [baseTomans, setBaseTomans] = useState(String(Math.floor(entry.base_salary_cents / 10)));
  const [variableTomans, setVariableTomans] = useState(String(Math.floor(entry.variable_salary_cents / 10)));
  const [studentsCount, setStudentsCount] = useState(String(entry.students_count));
  const [status, setStatus] = useState(entry.status);

  useEffect(() => {
    setBaseTomans(String(Math.floor(entry.base_salary_cents / 10)));
    setVariableTomans(String(Math.floor(entry.variable_salary_cents / 10)));
    setStudentsCount(String(entry.students_count));
    setStatus(entry.status);
  }, [entry.id, entry.base_salary_cents, entry.variable_salary_cents, entry.students_count, entry.status]);

  const handleSubmit = () => {
    const baseCents = parseLocalizedInt(baseTomans) * 10;
    const variableCents = parseLocalizedInt(variableTomans) * 10;
    const count = parseLocalizedInt(studentsCount);
    onSave({
      base_salary_cents: baseCents,
      variable_salary_cents: variableCents,
      students_count: count,
      status,
    });
  };

  return (
    <div className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground">
        {[entry.user_first_name, entry.user_last_name].filter(Boolean).join(" ")} — {monthName(entry.period_month)} {entry.period_year}
      </p>
      <div className="grid gap-2">
        <label className="text-sm font-medium">حقوق ثابت (تومان)</label>
        <Input
          type="text"
          inputMode="numeric"
          value={baseTomans}
          onChange={(e) => setBaseTomans(formatGroupedFaIntInput(e.target.value))}
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium">حقوق متغیر (تومان)</label>
        <Input
          type="text"
          inputMode="numeric"
          value={variableTomans}
          onChange={(e) => setVariableTomans(formatGroupedFaIntInput(e.target.value))}
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium">
          تعداد دانش‌آموزان (یکتا با پرداخت در این ماه، کل سازمان)
        </label>
        <Input
          type="text"
          inputMode="numeric"
          value={studentsCount}
          onChange={(e) => setStudentsCount(formatGroupedFaIntInput(e.target.value))}
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium">وضعیت</label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDING">در انتظار</SelectItem>
            <SelectItem value="PAID">پرداخت شده</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={onRecalculate}
          disabled={isSaving}
        >
          محاسبه مجدد از قوانین نقش و پرداخت‌ها
        </Button>
        <p className="text-xs text-muted-foreground">
          حقوق ثابت/متغیر از قوانین نقش و پرداخت‌های پرداخت‌شده در همین ماه دوباره محاسبه می‌شود. شمارش دانش‌آموزان برای همه نقش‌ها یکسان است: تعداد یکتای دانش‌آموزانی که در این ماه حداقل یک پرداخت پرداخت‌شده داشته‌اند.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>انصراف</Button>
        <Button onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? "در حال ذخیره..." : "ذخیره"}
        </Button>
      </DialogFooter>
    </div>
  );
}

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
  const [editEntryId, setEditEntryId] = useState<number | null>(null);

  // Create form
  const [createUserId, setCreateUserId] = useState("");
  const [createPeriodYear, setCreatePeriodYear] = useState(currentYear);
  const [createPeriodMonth, setCreatePeriodMonth] = useState(currentMonth);
  const [createAutoFromRole, setCreateAutoFromRole] = useState(true);
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

  const { data: rolesData = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: listRoles,
    enabled: isCreateOpen,
  });

  const { data: paymentsSummary } = useQuery({
    queryKey: ["payments-summary"],
    queryFn: getPaymentsSummary,
    enabled: isCreateOpen,
  });

  const createUserIdNum = parseInt(createUserId, 10);
  const { data: payrollPreview, isError: isPreviewError, error: previewError } = useQuery({
    queryKey: ["payroll-preview", createUserIdNum, createPeriodYear, createPeriodMonth],
    queryFn: () =>
      getPayrollPreview({
        user_id: createUserIdNum,
        year: createPeriodYear,
        month: createPeriodMonth,
      }),
    enabled:
      isCreateOpen &&
      createAutoFromRole &&
      Number.isFinite(createUserIdNum) &&
      createUserIdNum > 0,
  });

  const { data: detailEntry, isLoading: isDetailLoading } = useQuery({
    queryKey: ["payroll-entry", detailEntryId],
    queryFn: () => getPayrollEntry(detailEntryId!),
    enabled: detailEntryId != null,
  });

  const { data: editEntry, isLoading: isEditLoading } = useQuery({
    queryKey: ["payroll-entry", editEntryId],
    queryFn: () => getPayrollEntry(editEntryId!),
    enabled: editEntryId != null,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreatePayrollEntryPayload) => createPayrollEntry(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setIsCreateOpen(false);
      resetCreateForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdatePayrollEntryPayload }) =>
      updatePayrollEntry(id, payload),
    onSuccess: (_, { id, payload }) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entry", id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      if (!payload.recalculate_from_role_rules) {
        setEditEntryId(null);
      }
    },
  });

  const quickMarkPaidMutation = useMutation({
    mutationFn: (id: number) => updatePayrollEntry(id, { status: "PAID" }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entry", id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  const recalculateMutation = useMutation({
    mutationFn: (id: number) => updatePayrollEntry(id, { recalculate_from_role_rules: true }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entry", id] });
    },
  });

  function resetCreateForm() {
    setCreateUserId("");
    setCreateAutoFromRole(true);
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
    if (!userId) return;
    const payload: CreatePayrollEntryPayload = {
      user_id: userId,
      period_year: createPeriodYear,
      period_month: createPeriodMonth,
      status: createStatus,
    };
    if (createAutoFromRole && isGmRole) {
      // مدیرکل: حقوق = مجموع دریافت ماه - مجموع حقوق سایر کارمندان
      payload.base_salary_cents = gmSalaryCents;
      payload.variable_salary_cents = 0;
      payload.students_count = 0;
    } else if (createAutoFromRole) {
      payload.apply_role_rules = true;
    } else {
      const baseTomans = parseLocalizedInt(createBaseTomans);
      const variableTomans = parseLocalizedInt(createVariableTomans);
      const studentsCount = parseLocalizedInt(createStudentsCount);
      payload.base_salary_cents = baseTomans * 10;
      payload.variable_salary_cents = variableTomans * 10;
      payload.students_count = studentsCount;
    }
    createMutation.mutate(payload);
  }, [
    createUserId,
    createAutoFromRole,
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
        <p><strong>دانش‌آموزان یکتا (کل سازمان، این ماه):</strong> ${entry.students_count}</p>
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

  // تشخیص مدیرکل: نقشی با compensation_kind === "NET_REVENUE" یا full_access
  const selectedUser = users.find((u) => u.id === createUserIdNum);
  const selectedUserRole = rolesData.find((r) => r.id === selectedUser?.role_id);
  const isGmRole =
    selectedUserRole?.full_access === true ||
    selectedUserRole?.compensation_kind === "NET_REVENUE" ||
    payrollPreview?.compensation_kind === "NET_REVENUE";

  // حقوق مدیرکل = مجموع دریافت ماه − مجموع حقوق سایر کارمندان
  const gmSalaryCents =
    isGmRole && paymentsSummary && summary
      ? Math.max(
          0,
          paymentsSummary.this_month_received_cents -
            (summary.total_base_cents + summary.total_variable_cents)
        )
      : 0;

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

      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div />
          <div className="flex w-full gap-2 sm:w-auto">
            <Button size="sm" className="w-full sm:w-auto" onClick={() => setIsCreateOpen(true)}>
              <Plus className="ml-2 h-4 w-4" />
              ثبت حقوق
            </Button>
          </div>
        </div>

        <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">حقوق ثابت</span> از تعریف نقش کارمند گرفته می‌شود و از ابتدای ماه مشخص است.
            {" "}
            <span className="font-medium text-foreground">حقوق متغیر</span> با هر پرداخت دانش‌آموز به‌صورت خودکار انباشته می‌شود — برای بروزرسانی از دکمه «بروزرسانی» استفاده کنید.
            {" "}پس از پرداخت حقوق، وضعیت را با «پرداخت شد» ثبت کنید.
          </div>
        </div>
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
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">سمت / نوع حقوق</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">
                        دانش‌آموزان
                      </th>
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
                        const isVariable = entry.variable_salary_cents > 0 && entry.base_salary_cents === 0;
                        const isFixed = entry.base_salary_cents > 0 && entry.variable_salary_cents === 0;
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
                            <td className="p-4">
                              <p className="text-muted-foreground">
                                {roleLabels[entry.user_role] ?? entry.user_role}
                              </p>
                              <span
                                className={cn(
                                  "mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                                  isFixed
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                    : isVariable
                                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                {isFixed ? "ثابت" : isVariable ? "متغیر" : "ترکیبی"}
                              </span>
                            </td>
                            <td className="p-4 text-foreground">
                              {entry.students_count > 0 ? `${entry.students_count} نفر` : "—"}
                            </td>
                            <td className="p-4 number-display text-foreground">
                              {entry.base_salary_cents > 0 ? formatCentsToToman(entry.base_salary_cents) : "—"}
                            </td>
                            <td className="p-4 number-display text-primary">
                              {entry.variable_salary_cents > 0 ? formatCentsToToman(entry.variable_salary_cents) : "—"}
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
                                {entry.status !== "PAID" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="gap-1 text-success hover:text-success hover:bg-success/10"
                                    onClick={() => quickMarkPaidMutation.mutate(entry.id)}
                                    disabled={quickMarkPaidMutation.isPending}
                                    title="تأیید پرداخت حقوق"
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                    پرداخت شد
                                  </Button>
                                )}
                                {isVariable && entry.status !== "PAID" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="gap-1 text-muted-foreground"
                                    onClick={() => recalculateMutation.mutate(entry.id)}
                                    disabled={recalculateMutation.isPending}
                                    title="محاسبه مجدد از پرداخت‌های دانش‌آموزان"
                                  >
                                    <RefreshCw className="h-4 w-4" />
                                    بروزرسانی
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1"
                                  onClick={() => setEditEntryId(entry.id)}
                                  title="ویرایش فیش حقوق"
                                >
                                  <Pencil className="h-4 w-4" />
                                  ویرایش
                                </Button>
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

      </div>

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
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">محاسبه خودکار از قوانین نقش</p>
                <p className="text-xs text-muted-foreground">
                  بر اساس نوع حقوق نقش، پرداخت‌های پرداخت‌شدهٔ همین دوره و در صورت تعریف، سهم درصد از مبلغ کل هر پرداخت
                </p>
              </div>
              <Switch checked={createAutoFromRole} onCheckedChange={setCreateAutoFromRole} />
            </div>
            {createAutoFromRole && isGmRole && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm space-y-2">
                <p className="font-medium text-primary">محاسبه حقوق مدیرکل (درآمد خالص)</p>
                <p className="text-xs text-muted-foreground">
                  حقوق مدیرکل = مجموع پرداخت‌های دریافتی این ماه − مجموع حقوق سایر کارمندان
                </p>
                <div className="space-y-1 pt-1">
                  <p>
                    <span className="text-muted-foreground">مجموع دریافت این ماه:</span>{" "}
                    <span className="font-medium">{formatCentsToToman(paymentsSummary?.this_month_received_cents ?? 0)} تومان</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">مجموع حقوق سایر کارمندان این ماه:</span>{" "}
                    <span className="font-medium text-destructive">
                      − {formatCentsToToman((summary?.total_base_cents ?? 0) + (summary?.total_variable_cents ?? 0))} تومان
                    </span>
                  </p>
                  <div className="border-t border-primary/20 pt-1">
                    <p className="font-semibold">
                      <span className="text-muted-foreground">حقوق مدیرکل:</span>{" "}
                      <span className="text-primary">{formatCentsToToman(gmSalaryCents)} تومان</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
            {createAutoFromRole && !isGmRole && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                {!createUserId ? (
                  <p className="text-muted-foreground">ابتدا کارمند را انتخاب کنید.</p>
                ) : isPreviewError ? (
                  <p className="text-destructive">{(previewError as Error)?.message}</p>
                ) : payrollPreview ? (
                  <>
                    <p>
                      <span className="text-muted-foreground">حقوق ثابت:</span>{" "}
                      {formatCentsToToman(payrollPreview.base_salary_cents)} تومان
                    </p>
                    <p>
                      <span className="text-muted-foreground">حقوق متغیر:</span>{" "}
                      {formatCentsToToman(payrollPreview.variable_salary_cents)} تومان
                    </p>
                    <p>
                      <span className="text-muted-foreground">دانش‌آموزان یکتا (کل سازمان، با پرداخت در این ماه):</span>{" "}
                      {payrollPreview.students_count}
                    </p>
                    {payrollPreview.role_gross_share_cents != null &&
                      payrollPreview.role_gross_share_cents > 0 && (
                        <p>
                          <span className="text-muted-foreground">جمع سهم «درصد از مبلغ کل پرداخت» در این ماه:</span>{" "}
                          {formatCentsToToman(payrollPreview.role_gross_share_cents)} تومان
                        </p>
                      )}
                    <p className="text-xs text-muted-foreground pt-1">
                      حجم پرداخت دانش‌آموزان در دوره:{" "}
                      {formatCentsToToman(payrollPreview.revenue_volume_cents)} تومان
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">در حال محاسبهٔ پیش‌نمایش...</p>
                )}
              </div>
            )}
            {!createAutoFromRole && (
              <>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">حقوق ثابت (تومان)</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="مثال: ۱۵۰۰۰۰۰۰"
                    value={createBaseTomans}
                    onChange={(e) => setCreateBaseTomans(formatGroupedFaIntInput(e.target.value))}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">حقوق متغیر (تومان)</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="مثال: ۸۵۰۰۰۰۰"
                    value={createVariableTomans}
                    onChange={(e) => setCreateVariableTomans(formatGroupedFaIntInput(e.target.value))}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">
                    تعداد دانش‌آموزان (یکتا با پرداخت در این ماه، کل سازمان)
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={createStudentsCount}
                    onChange={(e) => setCreateStudentsCount(formatGroupedFaIntInput(e.target.value))}
                  />
                </div>
              </>
            )}
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
              disabled={
                !createUserId ||
                createMutation.isPending ||
                (!createAutoFromRole && !createBaseTomans)
              }
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
              <p><strong>دانش‌آموزان یکتا (کل سازمان، این ماه):</strong> {detailEntry.students_count}</p>
              <p><strong>جمع کل:</strong> {formatCentsToToman(detailEntry.total_salary_cents)} تومان</p>
              <p><strong>وضعیت:</strong> {detailEntry.status === "PAID" ? "پرداخت شده" : "در انتظار"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Payroll Entry Dialog */}
      <Dialog open={editEntryId != null} onOpenChange={(open) => !open && setEditEntryId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ویرایش فیش حقوقی</DialogTitle>
          </DialogHeader>
          {isEditLoading && <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>}
          {editEntry && (
            <EditPayrollForm
              entry={editEntry}
              onSave={(payload) => {
                if (editEntryId != null) {
                  updateMutation.mutate({ id: editEntryId, payload });
                }
              }}
              onRecalculate={() => {
                if (editEntryId != null) {
                  updateMutation.mutate({
                    id: editEntryId,
                    payload: { recalculate_from_role_rules: true },
                  });
                }
              }}
              onCancel={() => setEditEntryId(null)}
              isSaving={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

    </MainLayout>
  );
};

export default Payroll;

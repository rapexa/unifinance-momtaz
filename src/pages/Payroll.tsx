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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Pencil,
  Download,
  Eye,
  RefreshCw,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { formatGroupedFaIntInput, parseLocalizedInt } from "@/lib/numberInput";
import {
  getPayrollSummary,
  listPayrollEntries,
  createPayrollEntry,
  updatePayrollEntry,
  getPayrollEntry,
  getPayrollPreview,
  recalculatePayrollPeriod,
  listAdvisorOps,
  getAdvisorOpsUserDetail,
  type PayrollEntryApi,
  type CreatePayrollEntryPayload,
  type UpdatePayrollEntryPayload,
  type AdvisorOpsApi,
} from "@/api/payrollApi";
import { listUsers } from "@/api/usersApi";
import { getPaymentsSummary } from "@/api/paymentsApi";
import { listRoles } from "@/api/rolesApi";
import { billingModeLabel, parseBillingMode } from "@/components/students/enrollmentBillingUtils";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { studentsCountLabel, studentsCountTooltip } from "@/lib/payrollStudentsCount";
import {
  jalaliToGregorianIso,
  formatIsoDateShamsi,
  isoToJalaliString,
  todayJalaliString,
} from "@/lib/jalaliDate";

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

function StudentsCountFieldLabel({
  scope,
  className,
}: {
  scope?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {studentsCountLabel(scope)}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="توضیح">
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed" dir="rtl">
            {studentsCountTooltip(scope)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}

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
  const [paidAt, setPaidAt] = useState(isoToJalaliString(entry.paid_at) || todayJalaliString());

  useEffect(() => {
    setBaseTomans(String(Math.floor(entry.base_salary_cents / 10)));
    setVariableTomans(String(Math.floor(entry.variable_salary_cents / 10)));
    setStudentsCount(String(entry.students_count));
    setStatus(entry.status);
    setPaidAt(isoToJalaliString(entry.paid_at) || todayJalaliString());
  }, [entry.id, entry.base_salary_cents, entry.variable_salary_cents, entry.students_count, entry.status, entry.paid_at]);

  const handleSubmit = () => {
    const baseCents = parseLocalizedInt(baseTomans) * 10;
    const variableCents = parseLocalizedInt(variableTomans) * 10;
    const count = parseLocalizedInt(studentsCount);

    let paidAtGregorian: string | undefined;
    if (status === "PAID") {
      const paidTrimmed = paidAt.trim();
      if (!paidTrimmed) {
        toast({ variant: "destructive", title: "تاریخ پرداخت را وارد کنید" });
        return;
      }
      paidAtGregorian = jalaliToGregorianIso(paidTrimmed) || undefined;
      if (!paidAtGregorian) {
        toast({ variant: "destructive", title: "تاریخ پرداخت نامعتبر است" });
        return;
      }
    }

    onSave({
      base_salary_cents: baseCents,
      variable_salary_cents: variableCents,
      students_count: count,
      status,
      paid_at: status === "PAID" ? paidAtGregorian : null,
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
          <StudentsCountFieldLabel scope={entry.students_count_scope} />
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
      {status === "PAID" && (
        <div className="grid gap-2">
          <label className="text-sm font-medium">تاریخ پرداخت</label>
          <JalaliDatePicker value={paidAt} onChange={setPaidAt} clearable={false} />
        </div>
      )}
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
          حقوق ثابت/متغیر از قوانین نقش و پرداخت‌های پرداخت‌شده در همین ماه دوباره محاسبه می‌شود.{" "}
          {studentsCountLabel(entry.students_count_scope)} از روی نقش کاربر به‌روز می‌شود.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>انصراف</Button>
        <Button type="button" onClick={handleSubmit} disabled={isSaving}>
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

function registrationChannelLabel(channel?: string): string {
  if (channel === "SCHOOL") return "مدرسه‌ای";
  if (channel === "PRIVATE" || !channel) return "خصوصی";
  return channel;
}

function contractTypeLabel(billingMode?: string, _channel?: string): string {
  // School-channel students use the same billing modes / payroll path as private.
  return billingModeLabel(parseBillingMode(billingMode));
}

function rbacRoleLabel(row: Pick<AdvisorOpsApi, "role_name" | "role_code">): string {
  if (row.role_name?.trim()) return row.role_name;
  return roleLabels[row.role_code] ?? (row.role_code || "—");
}

const Payroll = () => {
  const queryClient = useQueryClient();
  const now = new Date();
  const [currentYear] = useState(now.getFullYear());
  const [currentMonth] = useState(now.getMonth() + 1);

  const [mainTab, setMainTab] = useState<"payslips" | "advisor-ops">("advisor-ops");
  const [selectedAdvisor, setSelectedAdvisor] = useState<AdvisorOpsApi | null>(null);

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

  /** هر بار ورود به صفحه: بازمحاسبهٔ فیش‌های در انتظار (مدیر کل)؛ سپس بارگذاری جدول. */
  const { data: bootstrapAt, isFetching: isBootstrapFetching } = useQuery({
    queryKey: ["payroll-bootstrap", currentYear, currentMonth],
    queryFn: async () => {
      try {
        await recalculatePayrollPeriod({ year: currentYear, month: currentMonth });
      } catch {
        /* کاربر غیرمدیر / خطا — لیست همچنان از GET لود می‌شود */
      }
      return Date.now();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["payroll-summary", currentYear, currentMonth, bootstrapAt],
    queryFn: () => getPayrollSummary({ year: currentYear, month: currentMonth }),
    enabled: bootstrapAt != null,
  });

  const {
    data: entriesData,
    isLoading: isEntriesLoading,
    isError: isEntriesError,
    error: entriesError,
  } = useQuery({
    queryKey: ["payroll-entries", currentYear, currentMonth, bootstrapAt],
    queryFn: () =>
      listPayrollEntries({
        year: currentYear,
        month: currentMonth,
        page: 1,
        page_size: 100,
      }),
    enabled: bootstrapAt != null,
  });

  const summaryCardsLoading =
    bootstrapAt == null || isBootstrapFetching || isSummaryLoading;
  const payrollTableLoading =
    bootstrapAt == null || isBootstrapFetching || isEntriesLoading;

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

  const {
    data: advisorOpsData,
    isLoading: isAdvisorOpsLoading,
    isError: isAdvisorOpsError,
    error: advisorOpsError,
  } = useQuery({
    queryKey: ["payroll-advisor-ops", currentYear, currentMonth],
    queryFn: () => listAdvisorOps({ year: currentYear, month: currentMonth }),
    enabled: mainTab === "advisor-ops",
  });

  const {
    data: advisorDetail,
    isLoading: isAdvisorDetailLoading,
    isError: isAdvisorDetailError,
    error: advisorDetailError,
  } = useQuery({
    queryKey: [
      "payroll-advisor-ops-detail",
      selectedAdvisor?.user_id,
      currentYear,
      currentMonth,
    ],
    queryFn: () =>
      getAdvisorOpsUserDetail(selectedAdvisor!.user_id, {
        year: currentYear,
        month: currentMonth,
      }),
    enabled: selectedAdvisor != null,
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
      if (payload.recalculate_from_role_rules) {
        toast({ title: "محاسبه مجدد انجام شد" });
      } else {
        toast({ title: "ذخیره شد", description: "فیش حقوقی به‌روزرسانی شد." });
      }
      if (!payload.recalculate_from_role_rules) {
        setEditEntryId(null);
      }
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "خطا در ذخیره",
        description: err?.message ?? "درخواست ناموفق بود",
      });
    },
  });

  const recalculateMutation = useMutation({
    mutationFn: (id: number) => updatePayrollEntry(id, { recalculate_from_role_rules: true }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entry", id] });
      toast({ title: "محاسبه مجدد انجام شد" });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "خطا در محاسبه",
        description: err?.message ?? "درخواست ناموفق بود",
      });
    },
  });

  const recalculateAllMutation = useMutation({
    mutationFn: () => recalculatePayrollPeriod({ year: currentYear, month: currentMonth }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entry"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast({
        title: "بازمحاسبه انجام شد",
        description: "همهٔ فیش‌های در انتظار این ماه از پرداخت‌ها و قوانین به‌روز شدند (مدیرکل در انتها).",
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "خطا در بازمحاسبه کلی",
        description: err?.message ?? "درخواست ناموفق بود",
      });
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
      // مدیرکل: حقوق = مجموع دریافت ماه - مجموع حقوق سایر کارمندان؛ شمارش دانش‌آموز از بک‌اند (ORG_TOTAL)
      payload.base_salary_cents = gmSalaryCents;
      payload.variable_salary_cents = 0;
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
        <p><strong>${studentsCountLabel(entry.students_count_scope)}:</strong> ${entry.students_count}</p>
        <hr/>
        <p><strong>جمع کل:</strong> ${formatCentsToToman(entry.total_salary_cents)} تومان</p>
        <p><strong>وضعیت:</strong> ${entry.status === "PAID" ? "پرداخت شده" : "در انتظار"}</p>
        ${entry.status === "PAID" && entry.paid_at ? `<p><strong>تاریخ پرداخت:</strong> ${formatIsoDateShamsi(entry.paid_at)}</p>` : ""}
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
    <MainLayout title="حقوق و دستمزد" subtitle="مشاهده حساب‌کتاب کاربران سازمانی و دانش‌آموزان">
      <div
        dir="rtl"
        className="space-y-0 text-right [unicode-bidi:isolate] [&_table]:w-full [&_table]:text-right [&_th]:text-right [&_td]:text-right"
      >
      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">کل حقوق این ماه</p>
          <p className="text-2xl font-bold number-display text-foreground">
            {summaryCardsLoading ? "—" : formatCentsToToman(totalMonthCents)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">تومان</p>
        </div>
        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">حقوق ثابت</p>
          <p className="text-2xl font-bold number-display text-foreground">
            {summaryCardsLoading ? "—" : formatCentsToToman(summary?.total_base_cents ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">تومان</p>
        </div>
        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">حقوق متغیر</p>
          <p className="text-2xl font-bold number-display text-primary">
            {summaryCardsLoading ? "—" : formatCentsToToman(summary?.total_variable_cents ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">تومان</p>
        </div>
        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">پرداخت شده</p>
          <p className="text-2xl font-bold number-display text-success">
            {summaryCardsLoading ? "—" : formatCentsToToman(summary?.total_paid_cents ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">تومان</p>
        </div>
      </div>

      <Tabs
        value={mainTab}
        onValueChange={(v) => setMainTab(v as "payslips" | "advisor-ops")}
        className="space-y-4"
      >
        <div className="overflow-x-auto">
          <TabsList className="min-w-max bg-muted/50">
            <TabsTrigger value="advisor-ops" className="data-[state=active]:bg-background">
              حساب‌کتاب کاربران
            </TabsTrigger>
            <TabsTrigger value="payslips" className="data-[state=active]:bg-background">
              فیش حقوقی
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="payslips" className="mt-0 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div />
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full sm:w-auto gap-1.5"
              onClick={() => recalculateAllMutation.mutate()}
              disabled={
                recalculateAllMutation.isPending ||
                recalculateMutation.isPending ||
                isBootstrapFetching
              }
              title="همان بازمحاسبهٔ خودکار هنگام ورود؛ برای تکرار دستی پس از تغییر پرداخت‌ها."
            >
              <RefreshCw
                className={`h-4 w-4 ${recalculateAllMutation.isPending || isBootstrapFetching ? "animate-spin" : ""}`}
              />
              بروزرسانی همه
            </Button>
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
            <span className="font-medium text-foreground">حقوق متغیر</span> از سهم‌های ثبت‌شده روی پرداخت‌هاست (سهم نقش روی دانش‌آموز و در صورت تنظیم، سهم قرارداد مشاور).{" "}
            <span className="font-medium text-foreground">حقوق مدیرکل</span> به‌صورت «مجموع پرداخت‌های ماه − سهم‌های تخصیص‌یافته به نقش‌ها» در ستون حقوق متغیر محاسبه می‌شود. با هر بار ورود به این صفحه، فیش‌های{" "}
            <span className="font-medium text-foreground">در انتظار</span> از روی پرداخت‌ها تا همان لحظه به‌روز می‌شوند.
            {" "}
            <span className="font-medium text-foreground">فیش پرداخت‌شده</span> با این بازمحاسبه عوض نمی‌شود.
            {" "}این صفحه برای مشاهده حساب‌کتاب است؛ ثبت وضعیت پرداخت حقوق از اینجا انجام نمی‌شود.
          </div>
        </div>
        <div className="card-elevated overflow-hidden">
            <div className="overflow-x-auto" dir="rtl">
              {payrollTableLoading && (
                <div className="p-6 text-sm text-muted-foreground">
                  {isBootstrapFetching ? "همگام‌سازی با پرداخت‌ها…" : "در حال بارگذاری..."}
                </div>
              )}
              {isEntriesError && (
                <div className="p-6 text-sm text-destructive">
                  {(entriesError as Error)?.message ?? "خطا در دریافت لیست"}
                </div>
              )}
              {!payrollTableLoading && !isEntriesError && (
                <table className="w-full text-right" dir="rtl">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">کارمند</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">نقش (RBAC) / نوع حقوق</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          دانش‌آموزان
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" className="text-muted-foreground" aria-label="توضیح">
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed" dir="rtl">
                                برای مدیرکل/دسترسی کامل: کل دانش‌آموزان فعال مرکز. برای بقیه: دانش‌آموزان منتسب به همان کاربر.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </span>
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
                              {entry.students_count > 0 ? (
                                <span title={studentsCountTooltip(entry.students_count_scope)}>
                                  {entry.students_count.toLocaleString("fa-IR")} نفر
                                  {entry.students_count_scope === "ORG_TOTAL" ? (
                                    <span className="mr-1 text-[10px] text-muted-foreground">(کل)</span>
                                  ) : null}
                                </span>
                              ) : (
                                "—"
                              )}
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
                              <div className="flex flex-col gap-1">
                                <span
                                  className={cn(
                                    "inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                                    entry.status === "PAID" ? "status-paid" : "status-pending"
                                  )}
                                >
                                  {entry.status === "PAID" ? "پرداخت شده" : "در انتظار"}
                                </span>
                                {entry.status === "PAID" && entry.paid_at && (
                                  <span className="text-[11px] text-muted-foreground">
                                    {formatIsoDateShamsi(entry.paid_at)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex gap-1 flex-wrap">
                                {entry.status !== "PAID" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="gap-1 text-muted-foreground"
                                    onClick={() => recalculateMutation.mutate(entry.id)}
                                    disabled={recalculateMutation.isPending}
                                    title="محاسبه مجدد از پرداخت‌ها و قوانین نقش"
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
        </TabsContent>

        <TabsContent value="advisor-ops" className="mt-0 space-y-4">
          <div
            dir="rtl"
            className="rounded-lg border border-border bg-muted/30 p-3 flex flex-row items-start gap-2.5 text-right"
          >
            <Info className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
            <div className="text-xs text-muted-foreground leading-relaxed text-right">
              هر ردیف یک{" "}
              <span className="font-medium text-foreground">کاربر سازمانی</span>{" "}
              (مشاور، حسابدار و …) با دانش‌آموز فعال است. روی ردیف کلیک کنید تا دانش‌آموزان، پرداخت‌ها، حقوق‌ها و KPIها را ببینید.
            </div>
          </div>
          <div className="card-elevated overflow-hidden">
            <div className="overflow-x-auto" dir="rtl">
              {isAdvisorOpsLoading && (
                <div className="p-6 text-sm text-muted-foreground">در حال بارگذاری...</div>
              )}
              {isAdvisorOpsError && (
                <div className="p-6 text-sm text-destructive">
                  {(advisorOpsError as Error)?.message ?? "خطا در دریافت خلاصه"}
                </div>
              )}
              {!isAdvisorOpsLoading && !isAdvisorOpsError && (
                <table className="w-full text-right" dir="rtl">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">نام</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">نقش کاربر</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">دانش‌آموزان</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">مدرسه / خصوصی</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">آنلاین / حضوری</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">پرداخت‌شده این ماه</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">بدون پرداخت این ماه</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">مبلغ مورد انتظار</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">پرداخت‌شده (کل)</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">مانده</th>
                      <th className="p-4 text-right text-xs font-semibold text-muted-foreground">حقوق (فیش)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(advisorOpsData?.data ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-6 text-center text-muted-foreground">
                          کاربری با دانش‌آموز فعال یافت نشد.
                        </td>
                      </tr>
                    ) : (
                      (advisorOpsData?.data ?? []).map((row) => {
                        const name =
                          [row.first_name, row.last_name].filter(Boolean).join(" ") || "—";
                        return (
                          <tr
                            key={row.user_id}
                            className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => setSelectedAdvisor(row)}
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
                              <span className="font-medium text-foreground">
                                {rbacRoleLabel(row)}
                              </span>
                            </td>
                            <td className="p-4 number-display text-foreground">
                              {row.students_total.toLocaleString("fa-IR")}
                            </td>
                            <td className="p-4 text-sm text-muted-foreground">
                              {row.students_school.toLocaleString("fa-IR")} /{" "}
                              {row.students_private.toLocaleString("fa-IR")}
                            </td>
                            <td className="p-4 text-sm text-muted-foreground">
                              {row.students_online.toLocaleString("fa-IR")} /{" "}
                              {row.students_in_person.toLocaleString("fa-IR")}
                            </td>
                            <td className="p-4 number-display text-success">
                              {row.paid_count_this_month.toLocaleString("fa-IR")}
                            </td>
                            <td className="p-4 number-display text-destructive">
                              {row.unpaid_count_this_month.toLocaleString("fa-IR")}
                            </td>
                            <td className="p-4 number-display text-foreground">
                              {formatCentsToToman(row.expected_total_cents)}
                            </td>
                            <td className="p-4 number-display text-foreground">
                              {formatCentsToToman(row.paid_total_cents)}
                            </td>
                            <td className="p-4 number-display text-foreground">
                              {formatCentsToToman(row.remaining_cents)}
                            </td>
                            <td className="p-4">
                              {row.salary_total_cents > 0 ? (
                                <div>
                                  <p className="number-display font-medium text-primary">
                                    {formatCentsToToman(row.salary_total_cents)}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {row.salary_status === "PAID"
                                      ? "پرداخت شده"
                                      : row.salary_status === "PENDING"
                                        ? "در انتظار"
                                        : ""}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
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
      </Tabs>

      <Dialog
        open={selectedAdvisor != null}
        onOpenChange={(open) => {
          if (!open) setSelectedAdvisor(null);
        }}
      >
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">
              حساب‌کتاب{" "}
              {selectedAdvisor
                ? [selectedAdvisor.first_name, selectedAdvisor.last_name]
                    .filter(Boolean)
                    .join(" ")
                : ""}
              {selectedAdvisor ? (
                <span className="mr-2 text-sm font-normal text-muted-foreground">
                  ({rbacRoleLabel(selectedAdvisor)})
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>
          {isAdvisorDetailLoading && (
            <p className="text-sm text-muted-foreground py-4 text-right">در حال بارگذاری...</p>
          )}
          {isAdvisorDetailError && (
            <p className="text-sm text-destructive py-4 text-right">
              {(advisorDetailError as Error)?.message ?? "خطا در دریافت جزئیات"}
            </p>
          )}
          {!isAdvisorDetailLoading && !isAdvisorDetailError && advisorDetail && (
            <div className="space-y-6 text-right" dir="rtl">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">
                    <StudentsCountFieldLabel scope={advisorDetail.students_count_scope} className="text-xs" />
                  </p>
                  <p className="mt-1 text-xl font-bold number-display">
                    {advisorDetail.students_total.toLocaleString("fa-IR")}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">تعداد پرداخت‌ها</p>
                  <p className="mt-1 text-xl font-bold number-display">
                    {advisorDetail.payments_count.toLocaleString("fa-IR")}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">مجموع پرداخت دانش‌آموزان</p>
                  <p className="mt-1 text-xl font-bold number-display text-success">
                    {formatCentsToToman(advisorDetail.payments_total_cents)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">تومان</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">مانده ثبت‌نام</p>
                  <p className="mt-1 text-xl font-bold number-display">
                    {formatCentsToToman(advisorDetail.remaining_cents)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">تومان</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">تعداد فیش حقوق</p>
                  <p className="mt-1 text-xl font-bold number-display">
                    {advisorDetail.salaries_count.toLocaleString("fa-IR")}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">حقوق پرداخت‌شده</p>
                  <p className="mt-1 text-xl font-bold number-display text-primary">
                    {formatCentsToToman(advisorDetail.salaries_paid_cents)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {advisorDetail.salaries_paid_count.toLocaleString("fa-IR")} فیش · تومان
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">جمع کل حقوق (همه فیش‌ها)</p>
                  <p className="mt-1 text-xl font-bold number-display">
                    {formatCentsToToman(advisorDetail.salaries_total_cents)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">تومان</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">مبلغ مورد انتظار ثبت‌نام</p>
                  <p className="mt-1 text-xl font-bold number-display">
                    {formatCentsToToman(advisorDetail.expected_total_cents)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">تومان</p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">دانش‌آموزان</h3>
                <div className="overflow-x-auto rounded-lg border" dir="rtl">
                  <table className="w-full text-right" dir="rtl">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">نام</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">نام خانوادگی</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">نوع قرارداد</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">نوع ثبت‌نام</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">مدرسه</th>
                      </tr>
                    </thead>
                    <tbody>
                      {advisorDetail.students.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-muted-foreground">
                            دانش‌آموزی ثبت نشده است.
                          </td>
                        </tr>
                      ) : (
                        advisorDetail.students.map((st) => (
                          <tr key={st.student_id} className="border-b last:border-0">
                            <td className="p-3 font-medium text-foreground">{st.first_name || "—"}</td>
                            <td className="p-3 font-medium text-foreground">{st.last_name || "—"}</td>
                            <td className="p-3 text-muted-foreground">
                              {contractTypeLabel(st.enrollment_billing_mode, st.registration_channel)}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {registrationChannelLabel(st.registration_channel)}
                            </td>
                            <td className="p-3 text-muted-foreground">{st.school_name?.trim() || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">حقوق‌های پرداختی به کاربر</h3>
                <div className="overflow-x-auto rounded-lg border" dir="rtl">
                  <table className="w-full text-right" dir="rtl">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">دوره</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">حقوق ثابت</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">حقوق متغیر</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">جمع</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">وضعیت</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">تاریخ پرداخت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {advisorDetail.salaries.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-muted-foreground">
                            فیش حقوقی ثبت نشده است.
                          </td>
                        </tr>
                      ) : (
                        advisorDetail.salaries.map((sal) => (
                          <tr key={sal.id} className="border-b last:border-0">
                            <td className="p-3 text-foreground">
                              {monthName(sal.period_month)} {sal.period_year}
                            </td>
                            <td className="p-3 number-display">
                              {formatCentsToToman(sal.base_salary_cents)}
                            </td>
                            <td className="p-3 number-display text-primary">
                              {formatCentsToToman(sal.variable_salary_cents)}
                            </td>
                            <td className="p-3 number-display font-medium">
                              {formatCentsToToman(sal.total_salary_cents)}
                            </td>
                            <td className="p-3">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                                  sal.status === "PAID" ? "status-paid" : "status-pending",
                                )}
                              >
                                {sal.status === "PAID" ? "پرداخت شده" : "در انتظار"}
                              </span>
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {sal.paid_at ? formatIsoDateShamsi(sal.paid_at) : "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">پرداخت‌های دانش‌آموزان</h3>
                <div className="overflow-x-auto rounded-lg border" dir="rtl">
                  <table className="w-full text-right" dir="rtl">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">دانش‌آموز</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">مبلغ</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">تاریخ</th>
                        <th className="p-3 text-right text-xs font-semibold text-muted-foreground">توضیح</th>
                      </tr>
                    </thead>
                    <tbody>
                      {advisorDetail.payments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-muted-foreground">
                            پرداختی ثبت نشده است.
                          </td>
                        </tr>
                      ) : (
                        advisorDetail.payments.map((pay) => (
                          <tr key={pay.id} className="border-b last:border-0">
                            <td className="p-3 font-medium text-foreground">
                              {pay.student_name || "—"}
                            </td>
                            <td className="p-3 number-display text-success">
                              {formatCentsToToman(pay.amount_cents)}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {pay.paid_at ? formatIsoDateShamsi(pay.paid_at) : "—"}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {pay.description?.trim() || "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedAdvisor(null)}>
              بستن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            {createAutoFromRole && isGmRole && payrollPreview && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">
                    {studentsCountLabel(payrollPreview.students_count_scope)}:
                  </span>{" "}
                  {payrollPreview.students_count.toLocaleString("fa-IR")}
                </p>
                <p className="text-xs text-muted-foreground">{studentsCountTooltip(payrollPreview.students_count_scope)}</p>
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
                      <span className="text-muted-foreground">
                        {studentsCountLabel(payrollPreview.students_count_scope)}:
                      </span>{" "}
                      {payrollPreview.students_count}
                    </p>
                    {payrollPreview.role_gross_share_cents != null &&
                      payrollPreview.role_gross_share_cents > 0 && (
                        <p>
                          <span className="text-muted-foreground">جمع سهم «درصد از مبلغ کل پرداخت» در این ماه:</span>{" "}
                          {formatCentsToToman(payrollPreview.role_gross_share_cents)} تومان
                        </p>
                      )}
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
                    <StudentsCountFieldLabel scope={payrollPreview?.students_count_scope} />
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
              <p>
                <strong>
                  <StudentsCountFieldLabel scope={detailEntry.students_count_scope} />:
                </strong>{" "}
                {detailEntry.students_count}
              </p>
              <p><strong>جمع کل:</strong> {formatCentsToToman(detailEntry.total_salary_cents)} تومان</p>
              <p><strong>وضعیت:</strong> {detailEntry.status === "PAID" ? "پرداخت شده" : "در انتظار"}</p>
              {detailEntry.status === "PAID" && (
                <p><strong>تاریخ پرداخت:</strong> {formatIsoDateShamsi(detailEntry.paid_at)}</p>
              )}
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
      </div>
    </MainLayout>
  );
};

export default Payroll;

import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  Download,
  Eye,
  RefreshCw,
  Info,
  ChevronRight,
  ChevronLeft,
  Banknote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { formatGroupedFaIntInput, parseLocalizedInt } from "@/lib/numberInput";
import { toUserError } from "@/lib/apiError";
import {
  getPayrollSummary,
  listPayrollEntries,
  createPayrollEntry,
  updatePayrollEntry,
  getPayrollEntry,
  getPayrollPreview,
  recalculatePayrollPeriod,
  recalculatePayrollUser,
  getPayrollUserBreakdown,
  createStaffPayout,
  type PayrollEntryApi,
  type CreatePayrollEntryPayload,
  type UpdatePayrollEntryPayload,
  type PayrollBreakdownApi,
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
  todayJalaliString,
  todayJalaliPeriod,
  jalaliPeriodToGregorianYYYYMM,
  JALALI_MONTH_NAMES,
  jalaliYearOptions,
  currentPeriodKey,
  addPeriodKeyMonths,
} from "@/lib/jalaliDate";
import { BalanceBadge } from "@/components/payroll/BalanceBadge";
import { balanceTone } from "@/lib/payrollBalance";
import { ExpensesOverview } from "@/components/payroll/ExpensesOverview";
import { BankAccountSelect } from "@/components/payments/BankAccountSelect";
import { formatPayrollPeriod } from "@/lib/payrollDisplay";

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

  useEffect(() => {
    setBaseTomans(String(Math.floor(entry.base_salary_cents / 10)));
    setVariableTomans(String(Math.floor(entry.variable_salary_cents / 10)));
    setStudentsCount(String(entry.students_count));
  }, [entry.id, entry.base_salary_cents, entry.variable_salary_cents, entry.students_count]);

  const handleSubmit = () => {
    const baseCents = parseLocalizedInt(baseTomans) * 10;
    const variableCents = parseLocalizedInt(variableTomans) * 10;
    const count = parseLocalizedInt(studentsCount);

    onSave({
      base_salary_cents: baseCents,
      variable_salary_cents: variableCents,
      students_count: count,
    });
  };

  return (
    <div className="space-y-4 py-2">
      <p className="text-sm text-muted-foreground">
        {[entry.user_first_name, entry.user_last_name].filter(Boolean).join(" ")} —{" "}
        {formatPayrollPeriod(entry.period_year, entry.period_month)}
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
      <p className="text-xs text-muted-foreground">
        مبالغی که دستی ذخیره شوند ثابت می‌مانند و با پرداخت‌های بعدی دانش‌آموزان تغییر نمی‌کنند؛
        برای برگشت به محاسبهٔ خودکار «محاسبه فیش» را بزنید. تفاوت مبلغ با پرداخت‌های انجام‌شده
        در مانده حساب کارمند منظور می‌شود.
      </p>
      {entry.manual_override && (
        <p className="text-xs text-amber-700 dark:text-amber-400">این فیش در حال حاضر دستی ویرایش شده است.</p>
      )}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={onRecalculate}
          disabled={isSaving}
        >
          محاسبه فیش از قوانین نقش و پرداخت‌ها
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

/** Text form of a signed balance for print views. */
function formatSignedToman(cents: number): string {
  if (!cents) return "۰ تومان";
  const abs = formatCentsToToman(Math.abs(cents));
  return cents > 0 ? `${abs} تومان (بدهی ما)` : `${abs} تومان (بدهی کارمند)`;
}

/** Signed amount cell: positive = we owe, negative = staff owes. */
function SignedAmount({ cents }: { cents: number }) {
  if (!cents) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "number-display",
        cents > 0 ? "text-amber-700 dark:text-amber-400" : "text-destructive",
      )}
      title={cents > 0 ? "بدهی سازمان به کارمند" : "بدهی کارمند به سازمان"}
      dir="ltr"
    >
      {cents < 0 ? "−" : ""}
      {formatCentsToToman(Math.abs(cents))}
    </span>
  );
}

const Payroll = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // API period keys stand for exact Jalali months (see lib/jalaliDate).
  const [period, setPeriod] = useState(currentPeriodKey);
  const currentYear = period.year;
  const currentMonth = period.month;
  const isCurrentPeriod = (() => {
    const k = currentPeriodKey();
    return k.year === currentYear && k.month === currentMonth;
  })();
  const currentJalali = todayJalaliPeriod();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailEntryId, setDetailEntryId] = useState<number | null>(null);
  const [editEntryId, setEditEntryId] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<PayrollBreakdownApi | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [payoutEntry, setPayoutEntry] = useState<PayrollEntryApi | null>(null);
  const [payoutTomans, setPayoutTomans] = useState("");
  const [payoutDate, setPayoutDate] = useState(todayJalaliString());
  const [payoutNote, setPayoutNote] = useState("");
  const [payoutAccountId, setPayoutAccountId] = useState("");

  const openPayout = (entry: PayrollEntryApi) => {
    const due = Math.max(0, entry.closing_cents ?? entry.total_salary_cents);
    setPayoutTomans(due > 0 ? formatGroupedFaIntInput(String(Math.floor(due / 10))) : "");
    setPayoutDate(todayJalaliString());
    setPayoutNote("");
    setPayoutEntry(entry);
  };

  // Create form — Jalali year/month in UI, converted to Gregorian on submit
  const [createUserId, setCreateUserId] = useState("");
  const [createJalaliYear, setCreateJalaliYear] = useState(currentJalali.year);
  const [createJalaliMonth, setCreateJalaliMonth] = useState(currentJalali.month);
  const [createAutoFromRole, setCreateAutoFromRole] = useState(true);
  const [createBaseTomans, setCreateBaseTomans] = useState("");
  const [createVariableTomans, setCreateVariableTomans] = useState("");
  const [createStudentsCount, setCreateStudentsCount] = useState("0");

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

  const { data: paymentsSummary } = useQuery({
    queryKey: ["payments-summary"],
    queryFn: getPaymentsSummary,
    enabled: isCreateOpen,
  });

  const createUserIdNum = parseInt(createUserId, 10);
  const createGregorianPeriod = (() => {
    const ym = jalaliPeriodToGregorianYYYYMM(createJalaliYear, createJalaliMonth);
    const [gy, gm] = ym.split("-").map(Number);
    return { year: gy, month: gm };
  })();
  const { data: payrollPreview, isError: isPreviewError, error: previewError } = useQuery({
    queryKey: ["payroll-preview", createUserIdNum, createGregorianPeriod.year, createGregorianPeriod.month],
    queryFn: () =>
      getPayrollPreview({
        user_id: createUserIdNum,
        year: createGregorianPeriod.year,
        month: createGregorianPeriod.month,
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
    mutationFn: (entry: PayrollEntryApi) =>
      recalculatePayrollUser({
        user_id: entry.user_id,
        year: entry.period_year,
        month: entry.period_month,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["payroll-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entry"] });
      setBreakdown(data.breakdown);
      setBreakdownOpen(true);
      toast({
        title: "محاسبه فیش انجام شد",
        description: data.breakdown.accrual_share_lines?.length
          ? "سهم قرارداد سالانه (قسط ماهانه) در شکست محاسبه آمده است."
          : "مبالغ از قوانین نقش و پرداخت‌ها به‌روز شد.",
      });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "خطا در محاسبه فیش",
        description: err?.message ?? "درخواست ناموفق بود",
      });
    },
  });

  const payoutMutation = useMutation({
    mutationFn: (p: {
      user_id: number;
      amount_cents: number;
      paid_at: string;
      note?: string;
      bank_account_id?: number;
    }) =>
      createStaffPayout(p.user_id, {
        amount_cents: p.amount_cents,
        paid_at: p.paid_at,
        note: p.note,
        bank_account_id: p.bank_account_id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entry"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-user-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setPayoutEntry(null);
      toast({ title: "پرداخت ثبت شد", description: "مانده حساب کارمند به‌روز شد." });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: "خطا در ثبت پرداخت",
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
        description: "فیش‌ها و مانده حساب همهٔ کارکنان از پرداخت‌ها و قوانین نقش به‌روز شد.",
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
    const j = todayJalaliPeriod();
    setCreateJalaliYear(j.year);
    setCreateJalaliMonth(j.month);
  }

  const totalMonthCents =
    summary != null
      ? summary.total_base_cents + summary.total_variable_cents
      : 0;

  const handleCreateSubmit = useCallback(() => {
    const userId = parseInt(createUserId, 10);
    if (!userId) return;
    const ym = jalaliPeriodToGregorianYYYYMM(createJalaliYear, createJalaliMonth);
    const [gy, gm] = ym.split("-").map(Number);
    const payload: CreatePayrollEntryPayload = {
      user_id: userId,
      period_year: gy,
      period_month: gm,
      status: "PENDING",
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
    createJalaliYear,
    createJalaliMonth,
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
        <p><strong>دوره:</strong> ${formatPayrollPeriod(entry.period_year, entry.period_month)}</p>
        <p><strong>کارمند:</strong> ${name}</p>
        <p><strong>سمت:</strong> ${roleLabels[entry.user_role] ?? entry.user_role}</p>
        <hr/>
        <p><strong>حقوق ثابت:</strong> ${formatCentsToToman(entry.base_salary_cents)} تومان</p>
        <p><strong>حقوق متغیر:</strong> ${formatCentsToToman(entry.variable_salary_cents)} تومان</p>
        <p><strong>${studentsCountLabel(entry.students_count_scope)}:</strong> ${entry.students_count}</p>
        <hr/>
        <p><strong>جمع کل:</strong> ${formatCentsToToman(entry.total_salary_cents)} تومان</p>
        <p><strong>مانده از ماه قبل:</strong> ${formatSignedToman(entry.opening_cents ?? 0)}</p>
        <p><strong>پرداختی این ماه:</strong> ${formatCentsToToman(entry.paid_out_cents ?? 0)} تومان</p>
        <p><strong>مانده کل:</strong> ${formatSignedToman(entry.closing_cents ?? 0)}</p>
        <p><strong>وضعیت:</strong> ${entry.status === "PAID" ? "تسویه شده" : "تسویه نشده"}</p>
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
      {/* Cost centers & expenses overview (salary, rent, ... this month / to date) */}
      <ExpensesOverview year={currentYear} month={currentMonth} />

      {/* Period navigation */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPeriod((p) => addPeriodKeyMonths(p.year, p.month, -1))}
            aria-label="ماه قبل"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="min-w-[7rem] text-center font-bold">{formatPayrollPeriod(currentYear, currentMonth)}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPeriod((p) => addPeriodKeyMonths(p.year, p.month, 1))}
            aria-label="ماه بعد"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {!isCurrentPeriod && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setPeriod(currentPeriodKey())}>
              ماه جاری
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">حقوق و سهم این ماه</p>
          <p className="text-2xl font-bold number-display text-foreground">
            {summaryCardsLoading ? "—" : formatCentsToToman(totalMonthCents)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            ثابت {summaryCardsLoading ? "—" : formatCentsToToman(summary?.total_base_cents ?? 0)} · متغیر{" "}
            {summaryCardsLoading ? "—" : formatCentsToToman(summary?.total_variable_cents ?? 0)} تومان
          </p>
        </div>
        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">پرداختی این ماه به کارکنان</p>
          <p className="text-2xl font-bold number-display text-success">
            {summaryCardsLoading ? "—" : formatCentsToToman(summary?.total_paid_out_cents ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">تومان</p>
        </div>
        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">مانده قابل پرداخت (بدهی ما)</p>
          <p className="text-2xl font-bold number-display text-amber-600 dark:text-amber-400">
            {summaryCardsLoading ? "—" : formatCentsToToman(summary?.total_outstanding_cents ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">تا پایان این ماه، شامل مانده ماه‌های قبل</p>
        </div>
        <div className="card-elevated p-5">
          <p className="text-sm text-muted-foreground">پرداخت اضافه (بدهی کارکنان به ما)</p>
          <p className="text-2xl font-bold number-display text-destructive">
            {summaryCardsLoading ? "—" : formatCentsToToman(summary?.total_credit_cents ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">از حقوق ماه‌های بعد کم می‌شود</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold">پرداخت به مشاوران و کارکنان</h2>
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
              ایجاد فیش
            </Button>
          </div>
        </div>

        <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            هر پرداخت دانش‌آموز، سهم مشاور/نقش را به <span className="font-medium text-foreground">حقوق همان ماه</span> اضافه می‌کند
            (حقوق ثابت نقش و قسط ماهانه قراردادهای سالانه هم در همان ماه حساب می‌شود).
            {" "}<span className="font-medium text-foreground">مانده کل</span> = مانده از ماه قبل + حقوق این ماه − پرداختی این ماه.
            اگر کمتر پرداخت شود، باقی‌مانده به ماه بعد منتقل می‌شود؛ اگر بیشتر پرداخت شود، کارمند به ما بدهکار می‌شود
            و از حقوق ماه‌های بعد کم می‌شود. پرداخت‌ها به ترتیب قدیمی‌ترین ماه تسویه می‌شوند.
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
                <table className="w-full min-w-[1080px] text-right" dir="rtl">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-right text-xs font-semibold text-muted-foreground">کارمند</th>
                      <th className="p-3 text-right text-xs font-semibold text-muted-foreground">
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
                      <th className="p-3 text-right text-xs font-semibold text-muted-foreground">مانده از ماه قبل</th>
                      <th className="p-3 text-right text-xs font-semibold text-muted-foreground">حقوق این ماه</th>
                      <th className="p-3 text-right text-xs font-semibold text-muted-foreground">پرداختی این ماه</th>
                      <th className="p-3 text-right text-xs font-semibold text-muted-foreground">مانده ماه</th>
                      <th className="p-3 text-right text-xs font-semibold text-muted-foreground">مانده کل</th>
                      <th className="p-3 text-right text-xs font-semibold text-muted-foreground">عملیات</th>
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
                        const closing = entry.closing_cents ?? 0;
                        return (
                          <tr
                            key={entry.id}
                            className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                          >
                            <td className="p-3">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                                  {name.charAt(0)}
                                </div>
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    className="font-medium text-foreground hover:text-primary hover:underline"
                                    onClick={() =>
                                      navigate(
                                        `/payroll/users/${entry.user_id}?year=${entry.period_year}&month=${entry.period_month}`,
                                      )
                                    }
                                  >
                                    {name}
                                  </button>
                                  <p className="text-xs text-muted-foreground">
                                    {roleLabels[entry.user_role] ?? entry.user_role}
                                    {entry.manual_override ? " · دستی" : ""}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-foreground">
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
                            <td className="p-3">
                              <SignedAmount cents={entry.opening_cents ?? 0} />
                            </td>
                            <td className="p-3">
                              <p className="font-bold number-display text-foreground">
                                {formatCentsToToman(entry.total_salary_cents)}
                              </p>
                              {(entry.base_salary_cents > 0 || entry.variable_salary_cents > 0) && (
                                <p className="text-[11px] text-muted-foreground">
                                  {entry.base_salary_cents > 0 && `ثابت ${formatCentsToToman(entry.base_salary_cents)}`}
                                  {entry.base_salary_cents > 0 && entry.variable_salary_cents > 0 && " + "}
                                  {entry.variable_salary_cents > 0 && `سهم ${formatCentsToToman(entry.variable_salary_cents)}`}
                                </p>
                              )}
                            </td>
                            <td className="p-3 number-display text-success">
                              {(entry.paid_out_cents ?? 0) > 0 ? formatCentsToToman(entry.paid_out_cents ?? 0) : "—"}
                            </td>
                            <td className="p-3">
                              <SignedAmount cents={entry.month_balance_cents ?? 0} />
                            </td>
                            <td className="p-3">
                              <BalanceBadge cents={closing} />
                            </td>
                            <td className="p-3">
                              <div className="flex gap-1 flex-wrap">
                                <Button
                                  size="sm"
                                  variant={balanceTone(closing) === "owed" ? "default" : "outline"}
                                  className="gap-1"
                                  onClick={() => openPayout(entry)}
                                  title="ثبت پرداخت به کارمند"
                                >
                                  <Banknote className="h-4 w-4" />
                                  پرداخت
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1"
                                  onClick={() =>
                                    navigate(
                                      `/payroll/users/${entry.user_id}?year=${entry.period_year}&month=${entry.period_month}`,
                                    )
                                  }
                                  title="صفحه جزئیات حساب‌کتاب کارمند"
                                >
                                  <Eye className="h-4 w-4" />
                                  جزئیات
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1 text-muted-foreground"
                                  onClick={() => recalculateMutation.mutate(entry)}
                                  disabled={recalculateMutation.isPending}
                                  title="محاسبه فیش این کارمند از پرداخت‌ها و قوانین نقش"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1 text-muted-foreground"
                                  onClick={() => setEditEntryId(entry.id)}
                                  title="ویرایش فیش حقوق"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1 text-muted-foreground"
                                  onClick={() => handlePrintPdf(entry)}
                                  title="خروجی PDF فیش حقوق"
                                >
                                  <Download className="h-4 w-4" />
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
            <DialogTitle>ایجاد فیش حقوقی</DialogTitle>
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
                <label className="text-sm font-medium">سال دوره (جلالی)</label>
                <Select
                  value={String(createJalaliYear)}
                  onValueChange={(v) => setCreateJalaliYear(parseInt(v, 10))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {jalaliYearOptions(1398, 1412).map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y.toLocaleString("fa-IR")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">ماه دوره (جلالی)</label>
                <Select
                  value={String(createJalaliMonth)}
                  onValueChange={(v) => setCreateJalaliMonth(parseInt(v, 10))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JALALI_MONTH_NAMES.map((name, idx) => (
                      <SelectItem key={name} value={String(idx + 1)}>
                        {name}
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
            <p className="text-xs text-muted-foreground">
              فیش جدید با وضعیت «در انتظار» ساخته می‌شود. پس از تسویه، از تیک «پرداخت شده» در لیست استفاده کنید.
            </p>
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

      {/* Payout Dialog */}
      <Dialog
        open={payoutEntry != null}
        onOpenChange={(open) => {
          if (!open) setPayoutEntry(null);
        }}
      >
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>ثبت پرداخت به کارمند</DialogTitle>
          </DialogHeader>
          {payoutEntry && (
            <div className="space-y-4 py-2 text-right">
              <p className="text-sm text-muted-foreground">
                {[payoutEntry.user_first_name, payoutEntry.user_last_name].filter(Boolean).join(" ")} —{" "}
                {formatPayrollPeriod(payoutEntry.period_year, payoutEntry.period_month)}
              </p>
              <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">مانده از ماه قبل</span>
                  <SignedAmount cents={payoutEntry.opening_cents ?? 0} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">حقوق این ماه</span>
                  <span className="number-display">{formatCentsToToman(payoutEntry.total_salary_cents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">پرداختی این ماه</span>
                  <span className="number-display">{formatCentsToToman(payoutEntry.paid_out_cents ?? 0)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-medium">
                  <span>مانده کل</span>
                  <BalanceBadge cents={payoutEntry.closing_cents ?? 0} />
                </div>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">مبلغ پرداخت (تومان)</label>
                <Input
                  inputMode="numeric"
                  value={payoutTomans}
                  onChange={(e) => setPayoutTomans(formatGroupedFaIntInput(e.target.value))}
                  placeholder="مثلاً ۵٬۰۰۰٬۰۰۰"
                />
                <p className="text-[11px] text-muted-foreground">
                  مبلغ پیش‌فرض = کل مانده قابل پرداخت. اگر کمتر بپردازید باقی‌مانده به ماه بعد می‌رود؛ اگر بیشتر، کارمند بدهکار می‌شود.
                </p>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">تاریخ پرداخت</label>
                <JalaliDatePicker value={payoutDate} onChange={setPayoutDate} clearable={false} />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">توضیح (اختیاری)</label>
                <Input value={payoutNote} onChange={(e) => setPayoutNote(e.target.value)} placeholder="مثلاً واریز به حساب" />
              </div>
              <BankAccountSelect value={payoutAccountId} onChange={setPayoutAccountId} label="پرداخت از حساب" />
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setPayoutEntry(null)}>
                  انصراف
                </Button>
                <Button
                  type="button"
                  disabled={payoutMutation.isPending}
                  onClick={() => {
                    const tomans = parseLocalizedInt(payoutTomans);
                    if (!tomans || tomans <= 0) {
                      toast({ variant: "destructive", title: "مبلغ نامعتبر است" });
                      return;
                    }
                    const iso = jalaliToGregorianIso(payoutDate.trim());
                    if (!iso) {
                      toast({ variant: "destructive", title: "تاریخ پرداخت نامعتبر است" });
                      return;
                    }
                    payoutMutation.mutate({
                      user_id: payoutEntry.user_id,
                      amount_cents: tomans * 10,
                      paid_at: iso,
                      note: payoutNote.trim() || undefined,
                      bank_account_id: payoutAccountId ? Number(payoutAccountId) : undefined,
                    });
                  }}
                >
                  {payoutMutation.isPending ? "در حال ذخیره..." : "ثبت پرداخت"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Breakdown Dialog */}
      <Dialog open={breakdownOpen} onOpenChange={(open) => { setBreakdownOpen(open); if (!open) setBreakdown(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>شکست محاسبه فیش</DialogTitle>
          </DialogHeader>
          {breakdown && (
            <div className="space-y-5 py-2 text-right">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">حقوق ثابت</p>
                  <p className="mt-1 font-bold number-display">{formatCentsToToman(breakdown.base_salary_cents)}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">حقوق متغیر</p>
                  <p className="mt-1 font-bold number-display text-primary">
                    {formatCentsToToman(breakdown.variable_salary_cents)}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">جمع کل</p>
                  <p className="mt-1 font-bold number-display">{formatCentsToToman(breakdown.total_salary_cents)}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {studentsCountLabel(breakdown.students_count_scope)}:{" "}
                {breakdown.students_count.toLocaleString("fa-IR")}
                {breakdown.entry_locked ? " · تسویه شده" : null}
              </p>

              <div>
                <h3 className="mb-2 text-sm font-semibold">
                  سهم از پرداخت‌های PAID این ماه ({formatCentsToToman(breakdown.payment_shares_cents)} تومان)
                </h3>
                {breakdown.payment_share_lines?.length ? (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="p-2 text-right text-xs">دانش‌آموز</th>
                          <th className="p-2 text-right text-xs">نوع</th>
                          <th className="p-2 text-right text-xs">مبلغ پرداخت</th>
                          <th className="p-2 text-right text-xs">سهم</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.payment_share_lines.map((line) => (
                          <tr key={line.share_id} className="border-b last:border-0">
                            <td className="p-2">{line.student_name || "—"}</td>
                            <td className="p-2 text-muted-foreground">
                              {billingModeLabel(parseBillingMode(line.enrollment_billing_mode))}
                              {line.kind === "ADVISOR_CONTRACT" ? " · مشاور" : " · نقش"}
                            </td>
                            <td className="p-2 number-display">{formatCentsToToman(line.payment_amount_cents)}</td>
                            <td className="p-2 number-display font-medium">{formatCentsToToman(line.share_cents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">سهم پرداختی برای این ماه ثبت نشده است.</p>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-semibold">
                  سهم قرارداد سالانه — قسط ماهانه حقوق ({formatCentsToToman(breakdown.accrual_shares_cents)} تومان)
                </h3>
                {breakdown.accrual_share_lines?.length ? (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="p-2 text-right text-xs">دانش‌آموز</th>
                          <th className="p-2 text-right text-xs">روند</th>
                          <th className="p-2 text-right text-xs">کل سهم قرارداد</th>
                          <th className="p-2 text-right text-xs">این ماه</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.accrual_share_lines.map((line) => (
                          <tr key={line.student_id} className="border-b last:border-0">
                            <td className="p-2">
                              <p>{line.student_name || "—"}</p>
                              <p className="text-[11px] text-amber-700 dark:text-amber-400">{line.label}</p>
                            </td>
                            <td className="p-2 text-muted-foreground text-xs">
                              ماه {line.accrual_month_index.toLocaleString("fa-IR")} از{" "}
                              {line.accrual_months_total.toLocaleString("fa-IR")}
                              {line.remaining_months > 0
                                ? ` · باقی‌مانده ${line.remaining_months.toLocaleString("fa-IR")} ماه`
                                : " · آخرین قسط"}
                            </td>
                            <td className="p-2 number-display">
                              {formatCentsToToman(line.contract_share_total_cents)}
                            </td>
                            <td className="p-2 number-display font-medium text-primary">
                              {formatCentsToToman(line.share_cents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    دانش‌آموز سالانه‌ای با سهم این ماه برای این کارمند نیست.
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBreakdownOpen(false)}>
              بستن
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
              <p><strong>دوره:</strong> {formatPayrollPeriod(detailEntry.period_year, detailEntry.period_month)}</p>
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
              <p><strong>وضعیت:</strong> {detailEntry.status === "PAID" ? "تسویه شده" : "تسویه نشده"}</p>
              {detailEntry.status === "PAID" && (
                <p><strong>تاریخ تسویه:</strong> {formatIsoDateShamsi(detailEntry.paid_at)}</p>
              )}
              <p><strong>مانده کل پایان ماه:</strong> <BalanceBadge cents={detailEntry.closing_cents ?? 0} /></p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    openPayout(detailEntry);
                    setDetailEntryId(null);
                  }}
                >
                  ثبت پرداخت
                </Button>
              </div>
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
                if (editEntry) {
                  recalculateMutation.mutate(editEntry);
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

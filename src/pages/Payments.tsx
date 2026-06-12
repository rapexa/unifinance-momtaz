import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus,
  Search,
  Link2,
  Download,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Copy,
  Eye,
  Pencil,
  ChevronsUpDown,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatGroupedFaIntInput, parseLocalizedInt } from "@/lib/numberInput";
import { formatIsoDateShamsi, jalaliToGregorianIso, isoToJalaliString, todayJalaliString } from "@/lib/jalaliDate";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import {
  listPayments,
  getPaymentsSummary,
  getPayment,
  createPayment,
  updatePayment,
  exportPayments,
  generatePaymentLink,
  type PaymentApi,
  type CreatePaymentPayload,
  type UpdatePaymentPayload,
} from "@/api/paymentsApi";
import { listStudents } from "@/api/studentsApi";

const statusLabels: Record<string, string> = {
  PAID: "پرداخت شده",
  PENDING: "در انتظار",
  OVERDUE: "معوق",
};

const statusStyles: Record<string, string> = {
  PAID: "status-paid",
  PENDING: "status-pending",
  OVERDUE: "status-debt",
};

const methodLabels: Record<string, string> = {
  CARD_TO_CARD: "کارت به کارت",
  GATEWAY: "درگاه آنلاین",
  CASH: "نقدی",
  INSTALLMENT: "اقساط",
  OTHER: "سایر",
};

const paymentTypeLabels: Record<string, string> = {
  SINGLE_SESSION: "تک‌جلسه",
  MONTHLY: "ماهانه",
  COURSE: "دوره‌ای",
};

function formatCentsToToman(cents: number): string {
  const tomans = Math.floor(cents / 10);
  return tomans.toLocaleString("fa-IR");
}

function formatDate(iso: string | null | undefined): string {
  return formatIsoDateShamsi(iso);
}

const SMALL_NUMS = [
  "", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه",
  "ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده",
];
const TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
const HUNDREDS = ["", "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"];
const THOUSANDS = ["", "هزار", "میلیون", "میلیارد", "تریلیون"];


function threeDigitsToWords(n: number): string {
  if (n === 0) return "";
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]);
  if (rem > 0) {
    if (rem < 20) {
      parts.push(SMALL_NUMS[rem]);
    } else {
      const t = Math.floor(rem / 10);
      const o = rem % 10;
      parts.push(TENS[t]);
      if (o > 0) parts.push(SMALL_NUMS[o]);
    }
  }
  return parts.join(" و ");
}

function numberToPersianWords(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "صفر";
  let value = Math.floor(n);
  const parts: string[] = [];
  let group = 0;
  while (value > 0 && group < THOUSANDS.length) {
    const chunk = value % 1000;
    if (chunk > 0) {
      const chunkWords = threeDigitsToWords(chunk);
      const unit = THOUSANDS[group];
      parts.unshift(unit ? `${chunkWords} ${unit}` : chunkWords);
    }
    value = Math.floor(value / 1000);
    group++;
  }
  return parts.join(" و ");
}

function parseTomansInput(raw: string): number {
  return parseLocalizedInt(raw);
}

function isoDateOnly(iso: string | null | undefined): string {
  return isoToJalaliString(iso);
}

interface EditPaymentFormProps {
  payment: PaymentApi;
  onSave: (payload: UpdatePaymentPayload) => void;
  onCancel: () => void;
  isSaving: boolean;
  formatCentsToToman: (c: number) => string;
  statusLabels: Record<string, string>;
  methodLabels: Record<string, string>;
}

function EditPaymentForm({
  payment,
  onSave,
  onCancel,
  isSaving,
  statusLabels,
  methodLabels,
}: EditPaymentFormProps) {
  const [amountTomans, setAmountTomans] = useState(
    () => String(Math.floor(payment.amount_cents / 10))
  );
  const [method, setMethod] = useState(payment.method);
  const [status, setStatus] = useState(payment.status);
  const [description, setDescription] = useState(payment.description ?? "");
  const [dueDate, setDueDate] = useState(isoDateOnly(payment.due_date));
  const [paidAt, setPaidAt] = useState(isoDateOnly(payment.paid_at));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = parseTomansInput(amountTomans) * 10 || payment.amount_cents;

    let dueDateGregorian: string | undefined;
    const dueTrimmed = dueDate.trim();
    if (dueTrimmed) {
      dueDateGregorian = jalaliToGregorianIso(dueTrimmed) || undefined;
      if (!dueDateGregorian) return;
    }

    let paidAtGregorian: string | undefined;
    const paidTrimmed = paidAt.trim();
    if (paidTrimmed) {
      paidAtGregorian = jalaliToGregorianIso(paidTrimmed) || undefined;
      if (!paidAtGregorian) return;
    }

    const payload: UpdatePaymentPayload = {
      amount_cents: amountCents,
      method: method,
      status: status,
      description: description.trim() || undefined,
      due_date: dueDateGregorian,
      paid_at: paidAtGregorian,
    };
    onSave(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 py-4">
      <p className="text-sm text-muted-foreground">دانش‌آموز: {payment.student_name || "—"}</p>
      <div className="grid gap-2">
        <label className="text-sm font-medium">مبلغ (تومان)</label>
        <Input
          type="text"
          inputMode="numeric"
          placeholder="مثال: ۲۵۰۰۰۰۰"
          value={amountTomans}
          onChange={(e) => setAmountTomans(formatGroupedFaIntInput(e.target.value))}
        />
        <p className="text-xs text-muted-foreground">
          به حروف: {numberToPersianWords(parseTomansInput(amountTomans))} تومان
        </p>
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium">روش پرداخت</label>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(methodLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium">وضعیت</label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PAID">{statusLabels.PAID}</SelectItem>
            <SelectItem value="PENDING">{statusLabels.PENDING}</SelectItem>
            <SelectItem value="OVERDUE">{statusLabels.OVERDUE}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium">سررسید</label>
        <JalaliDatePicker value={dueDate} onChange={setDueDate} placeholder="انتخاب تاریخ سررسید" />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium">تاریخ پرداخت</label>
        <JalaliDatePicker value={paidAt} onChange={setPaidAt} placeholder="انتخاب تاریخ پرداخت" />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium">شرح</label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="مثال: شهریه آذر"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          انصراف
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "در حال ذخیره..." : "ذخیره"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const Payments = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isLinkOpen, setIsLinkOpen] = useState(false);
  const [linkPaymentId, setLinkPaymentId] = useState<number | null>(null);
  const [linkResult, setLinkResult] = useState<{
    payment_link: string;
    expires_at: string;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [detailPaymentId, setDetailPaymentId] = useState<number | null>(null);
  const [editPaymentId, setEditPaymentId] = useState<number | null>(null);

  // Create form state
  const [createStudentId, setCreateStudentId] = useState("");
  const [createAmountTomans, setCreateAmountTomans] = useState("");
  const [createMethod, setCreateMethod] = useState("");
  const [createStatus, setCreateStatus] = useState("PENDING");
  const [createPaymentType, setCreatePaymentType] = useState<"SINGLE_SESSION" | "MONTHLY" | "COURSE">("MONTHLY");
  const [createDescription, setCreateDescription] = useState("");
  const [createDueDate, setCreateDueDate] = useState("");
  const [createPaidAt, setCreatePaidAt] = useState(() => todayJalaliString());
  const [createError, setCreateError] = useState("");
  const [studentSearchInput, setStudentSearchInput] = useState("");
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState("");
  const [studentComboOpen, setStudentComboOpen] = useState(false);
  const [createStudentLabel, setCreateStudentLabel] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedStudentSearch(studentSearchInput), 300);
    return () => clearTimeout(t);
  }, [studentSearchInput]);

  useEffect(() => {
    if (isCreateOpen) {
      setStudentSearchInput("");
      setDebouncedStudentSearch("");
      setStudentComboOpen(false);
      setCreateStudentId("");
      setCreateStudentLabel("");
      setCreateError("");
    }
  }, [isCreateOpen]);

  const statusParam = activeTab === "all" ? undefined : activeTab.toUpperCase();

  const {
    data: listData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: [
      "payments",
      {
        search: searchQuery || undefined,
        status: statusParam,
      from_date: fromDate ? jalaliToGregorianIso(fromDate) || undefined : undefined,
      to_date: toDate ? jalaliToGregorianIso(toDate) || undefined : undefined,
        page: 1,
        page_size: 50,
      },
    ],
    queryFn: () =>
      listPayments({
        search: searchQuery || undefined,
        status: statusParam,
        from_date: fromDate ? jalaliToGregorianIso(fromDate) || undefined : undefined,
        to_date: toDate ? jalaliToGregorianIso(toDate) || undefined : undefined,
        page: 1,
        page_size: 50,
      }),
  });

  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["payments-summary"],
    queryFn: getPaymentsSummary,
  });

  const { data: studentsPickData } = useQuery({
    queryKey: ["students", "payment-picker", debouncedStudentSearch],
    queryFn: () =>
      listStudents({
        search: debouncedStudentSearch.trim() || undefined,
        page: 1,
        page_size: 50,
      }),
    enabled: isCreateOpen,
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreatePaymentPayload) => createPayment(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payments-summary"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["students-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setIsCreateOpen(false);
      setCreateStudentId("");
      setCreateAmountTomans("");
      setCreateMethod("");
      setCreateStatus("PENDING");
      setCreatePaymentType("MONTHLY");
      setCreateDescription("");
      setCreateDueDate("");
      setCreateStudentLabel("");
      setCreateError("");
    },
    onError: (e: Error) => setCreateError(e.message),
  });

  const { data: detailPayment, isLoading: isDetailLoading } = useQuery({
    queryKey: ["payment", detailPaymentId],
    queryFn: () => getPayment(detailPaymentId!),
    enabled: detailPaymentId != null,
  });

  const { data: editPaymentData, isLoading: isEditPaymentLoading } = useQuery({
    queryKey: ["payment", editPaymentId],
    queryFn: () => getPayment(editPaymentId!),
    enabled: editPaymentId != null,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdatePaymentPayload }) =>
      updatePayment(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payments-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payment", id] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["students-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setEditPaymentId(null);
    },
  });

  const quickPaidMutation = useMutation({
    mutationFn: ({ id }: { id: number }) =>
      updatePayment(id, {
        status: "PAID",
        paid_at: new Date().toISOString(),
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payments-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payment", id] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["students-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const { blob, filename } = await exportPayments({
        search: searchQuery || undefined,
        status: statusParam,
        from_date: fromDate ? jalaliToGregorianIso(fromDate) || undefined : undefined,
        to_date: toDate ? jalaliToGregorianIso(toDate) || undefined : undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  }, [searchQuery, statusParam, fromDate, toDate]);

  const handleOpenLink = useCallback(async (paymentId: number) => {
    setLinkPaymentId(paymentId);
    setLinkResult(null);
    setIsLinkOpen(true);
    try {
      const res = await generatePaymentLink(paymentId);
      setLinkResult(res);
    } catch (e) {
      console.error(e);
      setLinkResult({ payment_link: "", expires_at: "" });
    }
  }, []);

  const handleCopyLink = useCallback(() => {
    if (!linkResult?.payment_link) return;
    navigator.clipboard.writeText(linkResult.payment_link);
  }, [linkResult]);

  const handleCreateSubmit = useCallback(() => {
    setCreateError("");
    const studentId = parseInt(createStudentId, 10);
    const amountTomans = parseTomansInput(createAmountTomans);
    if (!studentId || amountTomans <= 0 || !createMethod || !createStatus) {
      setCreateError("دانش‌آموز، مبلغ، روش پرداخت و وضعیت الزامی هستند");
      return;
    }

    const dueDateTrimmed = createDueDate.trim();
    let dueDateGregorian: string | undefined;
    if (dueDateTrimmed) {
      dueDateGregorian = jalaliToGregorianIso(dueDateTrimmed) || undefined;
      if (!dueDateGregorian) {
        setCreateError("تاریخ سررسید نامعتبر است — از تقویم انتخاب کنید");
        return;
      }
    }

    let paidAtGregorian: string | undefined;
    if (createStatus === "PAID") {
      const paidTrimmed = createPaidAt.trim() || todayJalaliString();
      paidAtGregorian = jalaliToGregorianIso(paidTrimmed) || undefined;
      if (!paidAtGregorian) {
        setCreateError("تاریخ پرداخت نامعتبر است — از تقویم انتخاب کنید");
        return;
      }
    }

    const amountCents = amountTomans * 10; // تومان به ریال
    const payload: CreatePaymentPayload = {
      student_id: studentId,
      amount_cents: amountCents,
      method: createMethod,
      status: createStatus,
      payment_type: createPaymentType,
      description: createDescription.trim() || undefined,
      due_date: dueDateGregorian,
      paid_at: paidAtGregorian,
    };
    createMutation.mutate(payload);
  }, [
    createStudentId,
    createAmountTomans,
    createMethod,
    createStatus,
    createPaymentType,
    createDescription,
    createDueDate,
    createPaidAt,
    createMutation,
  ]);

  const payments: PaymentApi[] = listData?.data ?? [];
  const pickStudents = studentsPickData?.data ?? [];

  return (
    <MainLayout title="پرداخت‌ها" subtitle="مدیریت دریافت و ثبت پرداخت‌ها">
      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="card-elevated p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-success/10 p-3">
              <ArrowUpRight className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">دریافتی امروز</p>
              <p className="text-xl font-bold number-display text-foreground">
                {isSummaryLoading ? "—" : formatCentsToToman(summary?.today_received_cents ?? 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="card-elevated p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-warning/10 p-3">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">در انتظار پرداخت</p>
              <p className="text-xl font-bold number-display text-foreground">
                {isSummaryLoading ? "—" : formatCentsToToman(summary?.pending_cents ?? 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="card-elevated p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-destructive/10 p-3">
              <ArrowDownRight className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">معوقات</p>
              <p className="text-xl font-bold number-display text-destructive">
                {isSummaryLoading ? "—" : formatCentsToToman(summary?.overdue_cents ?? 0)}
              </p>
            </div>
          </div>
        </div>
        <div className="card-elevated p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3">
              <ArrowUpRight className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">دریافتی این ماه</p>
              <p className="text-xl font-bold number-display text-foreground">
                {isSummaryLoading ? "—" : formatCentsToToman(summary?.this_month_received_cents ?? 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full flex-1 sm:max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="جستجو در پرداخت‌ها..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9"
          />
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 sm:flex-none">
                <Filter className="ml-2 h-4 w-4" />
                فیلتر
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(20rem,calc(100vw-1rem))]" align="start">
              <div className="space-y-3">
                <p className="text-sm font-medium">بازه تاریخ سررسید</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">از</label>
                    <JalaliDatePicker
                      value={fromDate}
                      onChange={setFromDate}
                      placeholder="از تاریخ"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">تا</label>
                    <JalaliDatePicker
                      value={toDate}
                      onChange={setToDate}
                      placeholder="تا تاریخ"
                      className="mt-1"
                    />
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setFilterOpen(false)}>
                  اعمال
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={handleExport}
            className="flex-1 sm:flex-none"
          >
            <Download className="ml-2 h-4 w-4" />
            خروجی
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)} className="flex-1 sm:flex-none">
            <Plus className="ml-2 h-4 w-4" />
            ثبت پرداخت
          </Button>
        </div>
      </div>

      {/* Tabs & Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="overflow-x-auto">
        <TabsList className="min-w-max bg-muted/50 whitespace-nowrap">
          <TabsTrigger value="all" className="data-[state=active]:bg-background">
            همه
          </TabsTrigger>
          <TabsTrigger value="paid" className="data-[state=active]:bg-background">
            پرداخت شده
          </TabsTrigger>
          <TabsTrigger value="pending" className="data-[state=active]:bg-background">
            در انتظار
          </TabsTrigger>
          <TabsTrigger value="overdue" className="data-[state=active]:bg-background">
            معوق
          </TabsTrigger>
        </TabsList>
        </div>

        <div className="grid gap-3 md:hidden">
          {payments.map((payment) => (
            <div key={payment.id} className="card-elevated p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">
                    {payment.student_name || "—"} <span className="text-xs text-muted-foreground">#{payment.student_id}</span>
                  </p>
                  {payment.advisor_name ? (
                    <p className="text-xs text-muted-foreground">مشاور: {payment.advisor_name}</p>
                  ) : null}
                </div>
                <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs", statusStyles[payment.status] ?? "bg-muted")}>
                  {statusLabels[payment.status] ?? payment.status}
                </span>
              </div>
              <p className="mt-1 number-display text-sm">{formatCentsToToman(payment.amount_cents)} تومان</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {methodLabels[payment.method] ?? payment.method} | {formatDate(payment.due_date)} {payment.student_phone ? `| ${payment.student_phone}` : ""}
              </p>
              <div className="mt-3 flex gap-2 flex-wrap">
                {payment.status !== "PAID" && (
                  <Button
                    size="sm"
                    className="flex-1 gap-1 bg-success/10 text-success hover:bg-success/20 border-0"
                    variant="outline"
                    onClick={() => quickPaidMutation.mutate({ id: payment.id })}
                    disabled={quickPaidMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    پرداخت شد
                  </Button>
                )}
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setDetailPaymentId(payment.id)}>
                  <Eye className="ml-1 h-4 w-4" />
                  جزئیات
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditPaymentId(payment.id)}>
                  <Pencil className="ml-1 h-4 w-4" />
                  ویرایش
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="card-elevated hidden overflow-hidden md:block">
          <div className="overflow-x-auto">
            {isLoading && (
              <div className="p-6 text-sm text-muted-foreground">
                در حال بارگذاری پرداخت‌ها...
              </div>
            )}
            {isError && (
              <div className="p-6 text-sm text-destructive">
                {(error as Error)?.message ?? "خطا در دریافت لیست پرداخت‌ها"}
              </div>
            )}
            {!isLoading && !isError && (
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-4 text-right text-xs font-semibold text-muted-foreground">
                      دانش‌آموز
                    </th>
                    <th className="p-4 text-right text-xs font-semibold text-muted-foreground">
                      شرح
                    </th>
                    <th className="p-4 text-right text-xs font-semibold text-muted-foreground">
                      مبلغ (تومان)
                    </th>
                    <th className="p-4 text-right text-xs font-semibold text-muted-foreground">
                      سررسید
                    </th>
                    <th className="p-4 text-right text-xs font-semibold text-muted-foreground">
                      تاریخ پرداخت
                    </th>
                    <th className="p-4 text-right text-xs font-semibold text-muted-foreground">
                      روش
                    </th>
                    <th className="p-4 text-right text-xs font-semibold text-muted-foreground">
                      وضعیت
                    </th>
                    <th className="p-4 text-right text-xs font-semibold text-muted-foreground">
                      عملیات
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-muted-foreground">
                        پرداختی یافت نشد.
                      </td>
                    </tr>
                  ) : (
                    payments.map((payment) => (
                      <tr
                        key={payment.id}
                        className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                              {(payment.student_name || "—").charAt(0)}
                            </div>
                            <div>
                              <span className="font-medium text-foreground">
                                {payment.student_name || "—"} <span className="text-xs text-muted-foreground">#{payment.student_id}</span>
                              </span>
                              {payment.advisor_name ? (
                                <p className="text-xs text-muted-foreground">مشاور: {payment.advisor_name}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {payment.description || "—"}
                        </td>
                        <td className="p-4 font-bold number-display text-foreground">
                          {formatCentsToToman(payment.amount_cents)}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {formatDate(payment.due_date)}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {formatDate(payment.paid_at)}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {methodLabels[payment.method] ?? payment.method}
                        </td>
                        <td className="p-4">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                              statusStyles[payment.status] ?? "bg-muted"
                            )}
                          >
                            {statusLabels[payment.status] ?? payment.status}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-1 flex-wrap">
                            {payment.status !== "PAID" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1 text-success hover:text-success hover:bg-success/10"
                                onClick={() => quickPaidMutation.mutate({ id: payment.id })}
                                disabled={quickPaidMutation.isPending}
                                title="تأیید پرداخت"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                پرداخت شد
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1"
                              onClick={() => setDetailPaymentId(payment.id)}
                              title="جزئیات پرداخت"
                            >
                              <Eye className="h-4 w-4" />
                              جزئیات
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1"
                              onClick={() => setEditPaymentId(payment.id)}
                              title="ویرایش پرداخت"
                            >
                              <Pencil className="h-4 w-4" />
                              ویرایش
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1"
                              onClick={() => handleOpenLink(payment.id)}
                              title="لینک پرداخت"
                            >
                              <Link2 className="h-4 w-4" />
                              لینک
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Tabs>

      {/* Payment Detail Dialog */}
      <Dialog open={detailPaymentId != null} onOpenChange={(open) => !open && setDetailPaymentId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>جزئیات پرداخت</DialogTitle>
          </DialogHeader>
          {isDetailLoading && <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>}
          {detailPayment && (
            <div className="space-y-3 text-sm">
              <p><span className="text-muted-foreground">دانش‌آموز:</span> {detailPayment.student_name || "—"}</p>
              <p><span className="text-muted-foreground">مشاور:</span> {detailPayment.advisor_name || "—"}</p>
              <p><span className="text-muted-foreground">شناسه دانش‌آموز:</span> #{detailPayment.student_id}</p>
              <p><span className="text-muted-foreground">شماره تماس:</span> {detailPayment.student_phone || "—"}</p>
              <p><span className="text-muted-foreground">مبلغ:</span> {formatCentsToToman(detailPayment.amount_cents)} تومان</p>
              <p><span className="text-muted-foreground">وضعیت:</span> {statusLabels[detailPayment.status] ?? detailPayment.status}</p>
              <p><span className="text-muted-foreground">نوع:</span> {paymentTypeLabels[detailPayment.payment_type] ?? detailPayment.payment_type}</p>
              <p><span className="text-muted-foreground">روش:</span> {methodLabels[detailPayment.method] ?? detailPayment.method}</p>
              <p><span className="text-muted-foreground">سررسید:</span> {formatDate(detailPayment.due_date)}</p>
              <p><span className="text-muted-foreground">تاریخ پرداخت:</span> {formatDate(detailPayment.paid_at)}</p>
              <p><span className="text-muted-foreground">شرح:</span> {detailPayment.description || "—"}</p>
              <p><span className="text-muted-foreground">کد پیگیری:</span> {detailPayment.reference_code || "—"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Payment Dialog */}
      <Dialog open={editPaymentId != null} onOpenChange={(open) => !open && setEditPaymentId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ویرایش پرداخت</DialogTitle>
          </DialogHeader>
          {isEditPaymentLoading && <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>}
          {editPaymentData && (
            <EditPaymentForm
              payment={editPaymentData}
              onSave={(payload) => {
                if (editPaymentId != null) updateMutation.mutate({ id: editPaymentId, payload });
              }}
              onCancel={() => setEditPaymentId(null)}
              isSaving={updateMutation.isPending}
              formatCentsToToman={formatCentsToToman}
              statusLabels={statusLabels}
              methodLabels={methodLabels}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Register Payment Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ثبت پرداخت</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateSubmit();
            }}
          >
            <div className="grid gap-2">
              <label className="text-sm font-medium">دانش‌آموز</label>
              <Popover open={studentComboOpen} onOpenChange={setStudentComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={studentComboOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className={cn(!createStudentLabel && "text-muted-foreground")}>
                      {createStudentLabel || "جستجو و انتخاب دانش‌آموز"}
                    </span>
                    <ChevronsUpDown className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <div className="flex items-center border-b px-2">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Input
                      className="border-0 shadow-none focus-visible:ring-0"
                      placeholder="نام، موبایل یا ایمیل..."
                      value={studentSearchInput}
                      onChange={(e) => setStudentSearchInput(e.target.value)}
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto p-1">
                    {pickStudents.length === 0 ? (
                      <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                        دانش‌آموزی یافت نشد
                      </p>
                    ) : (
                      pickStudents.map((s) => {
                        const label =
                          [s.first_name, s.last_name].filter(Boolean).join(" ") ||
                          `دانش‌آموز ${s.id}`;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className={cn(
                              "flex w-full flex-col gap-0.5 rounded-sm px-2 py-2 text-right text-sm hover:bg-muted",
                              createStudentId === String(s.id) && "bg-muted"
                            )}
                            onClick={() => {
                              setCreateStudentId(String(s.id));
                              setCreateStudentLabel(
                                s.phone ? `${label} — ${s.phone}` : label
                              );
                              setStudentComboOpen(false);
                            }}
                          >
                            <span>{label}</span>
                            {s.phone ? (
                              <span className="text-xs text-muted-foreground" dir="ltr">
                                {s.phone}
                              </span>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">مبلغ (تومان)</label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="مثال: ۲۵۰۰۰۰۰"
                value={createAmountTomans}
                onChange={(e) => setCreateAmountTomans(formatGroupedFaIntInput(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                به حروف: {numberToPersianWords(parseTomansInput(createAmountTomans))} تومان
              </p>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">روش پرداخت</label>
              <Select value={createMethod} onValueChange={setCreateMethod} required>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب روش" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(methodLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">نوع پرداخت</label>
              <Select value={createPaymentType} onValueChange={(v) => setCreatePaymentType(v as "SINGLE_SESSION" | "MONTHLY" | "COURSE")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SINGLE_SESSION">تک‌جلسه</SelectItem>
                  <SelectItem value="MONTHLY">ماهانه</SelectItem>
                  <SelectItem value="COURSE">دوره‌ای</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">وضعیت</label>
              <Select value={createStatus} onValueChange={setCreateStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PAID">{statusLabels.PAID}</SelectItem>
                  <SelectItem value="PENDING">{statusLabels.PENDING}</SelectItem>
                  <SelectItem value="OVERDUE">{statusLabels.OVERDUE}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">سررسید (اختیاری)</label>
              <JalaliDatePicker
                value={createDueDate}
                onChange={setCreateDueDate}
                placeholder="انتخاب تاریخ سررسید"
              />
            </div>
            {createStatus === "PAID" && (
              <div className="grid gap-2">
                <label className="text-sm font-medium">تاریخ پرداخت</label>
                <JalaliDatePicker
                  value={createPaidAt}
                  onChange={setCreatePaidAt}
                  placeholder="انتخاب تاریخ پرداخت"
                  clearable={false}
                />
              </div>
            )}
            <div className="grid gap-2">
              <label className="text-sm font-medium">شرح (اختیاری)</label>
              <Input
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="مثال: شهریه آذر"
              />
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                انصراف
              </Button>
              <Button
                type="submit"
                disabled={
                  !createStudentId ||
                  !createAmountTomans ||
                  !createMethod ||
                  createMutation.isPending
                }
              >
                {createMutation.isPending ? "در حال ثبت..." : "ثبت"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Link Dialog */}
      <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>لینک پرداخت آنلاین</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {linkResult?.payment_link ? (
              <>
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="text-sm break-all font-mono text-foreground">
                    {linkResult.payment_link}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-2 w-full">
                  <Copy className="h-4 w-4" />
                  کپی لینک و ارسال به دانش‌آموز
                </Button>
              </>
            ) : linkPaymentId !== null && !linkResult ? (
              <p className="text-sm text-muted-foreground">در حال ایجاد لینک...</p>
            ) : (
              <p className="text-sm text-destructive">خطا در ایجاد لینک.</p>
            )}
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 mb-1">یادداشت — اتصال به درگاه پرداخت</p>
              <p className="text-xs text-amber-700 dark:text-amber-500 leading-relaxed">
                برای فعال‌سازی پرداخت آنلاین، سیستم باید به <span className="font-semibold">درگاه زرین‌پال</span> متصل شود.
                لطفاً کد پذیرنده (Merchant ID) زرین‌پال خود را به تیم فنی بدهید تا API پرداخت در بک‌اند تنظیم شود.
                پس از اتصال، دانش‌آموزان می‌توانند مستقیماً از طریق این لینک پرداخت آنلاین انجام دهند.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Payments;

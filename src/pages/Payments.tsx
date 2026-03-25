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
} from "lucide-react";
import { cn } from "@/lib/utils";
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

function formatCentsToToman(cents: number): string {
  const tomans = Math.floor(cents / 10);
  return tomans.toLocaleString("fa-IR");
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("fa-IR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "—";
  }
}

function isoDateOnly(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
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
    const amountCents = parseInt(amountTomans.replace(/\D/g, ""), 10) * 10 || payment.amount_cents;
    const payload: UpdatePaymentPayload = {
      amount_cents: amountCents,
      method: method,
      status: status,
      description: description || undefined,
      due_date: dueDate || undefined,
      paid_at: paidAt || undefined,
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
          onChange={(e) => setAmountTomans(e.target.value)}
        />
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
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium">تاریخ پرداخت</label>
        <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
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
  const [createDescription, setCreateDescription] = useState("");
  const [createDueDate, setCreateDueDate] = useState("");
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
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        page: 1,
        page_size: 50,
      },
    ],
    queryFn: () =>
      listPayments({
        search: searchQuery || undefined,
        status: statusParam,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
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
      setIsCreateOpen(false);
      setCreateStudentId("");
      setCreateAmountTomans("");
      setCreateMethod("");
      setCreateStatus("PENDING");
      setCreateDescription("");
      setCreateDueDate("");
      setCreateStudentLabel("");
    },
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
      setEditPaymentId(null);
    },
  });

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const { blob, filename } = await exportPayments({
        search: searchQuery || undefined,
        status: statusParam,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
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
    const studentId = parseInt(createStudentId, 10);
    const amountTomans = parseInt(createAmountTomans.replace(/\D/g, ""), 10) || 0;
    if (!studentId || amountTomans <= 0 || !createMethod || !createStatus) return;
    const amountCents = amountTomans * 10; // تومان به ریال
    const payload: CreatePaymentPayload = {
      student_id: studentId,
      amount_cents: amountCents,
      method: createMethod,
      status: createStatus,
      description: createDescription || undefined,
      due_date: createDueDate || undefined,
    };
    createMutation.mutate(payload);
  }, [
    createStudentId,
    createAmountTomans,
    createMethod,
    createStatus,
    createDescription,
    createDueDate,
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
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="جستجو در پرداخت‌ها..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9"
          />
        </div>
        <div className="flex gap-2">
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="ml-2 h-4 w-4" />
                فیلتر
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-3">
                <p className="text-sm font-medium">بازه تاریخ سررسید</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">از</label>
                    <Input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">تا</label>
                    <Input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
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
          >
            <Download className="ml-2 h-4 w-4" />
            خروجی
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="ml-2 h-4 w-4" />
            ثبت پرداخت
          </Button>
        </div>
      </div>

      {/* Tabs & Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/50">
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

        <div className="card-elevated overflow-hidden">
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
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                              {(payment.student_name || "—").charAt(0)}
                            </div>
                            <span className="font-medium text-foreground">
                              {payment.student_name || "—"}
                            </span>
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
                              لینک پرداخت
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
              <p><span className="text-muted-foreground">مبلغ:</span> {formatCentsToToman(detailPayment.amount_cents)} تومان</p>
              <p><span className="text-muted-foreground">وضعیت:</span> {statusLabels[detailPayment.status] ?? detailPayment.status}</p>
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
          <div className="grid gap-4 py-4">
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
                onChange={(e) => setCreateAmountTomans(e.target.value)}
              />
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
              <Input
                type="date"
                value={createDueDate}
                onChange={(e) => setCreateDueDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">شرح (اختیاری)</label>
              <Input
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder="مثال: شهریه آذر"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              انصراف
            </Button>
            <Button
              onClick={handleCreateSubmit}
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
        </DialogContent>
      </Dialog>

      {/* Payment Link Dialog */}
      <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>لینک پرداخت</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {linkResult?.payment_link ? (
              <>
                <p className="text-sm text-muted-foreground break-all">
                  {linkResult.payment_link}
                </p>
                <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-2">
                  <Copy className="h-4 w-4" />
                  کپی لینک
                </Button>
              </>
            ) : linkPaymentId !== null && !linkResult ? (
              <p className="text-sm text-muted-foreground">در حال ایجاد لینک...</p>
            ) : (
              <p className="text-sm text-destructive">خطا در ایجاد لینک.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Payments;

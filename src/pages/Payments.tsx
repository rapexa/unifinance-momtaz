import { useState, useCallback } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listPayments,
  getPaymentsSummary,
  createPayment,
  exportPayments,
  generatePaymentLink,
  type PaymentApi,
  type CreatePaymentPayload,
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

  // Create form state
  const [createStudentId, setCreateStudentId] = useState("");
  const [createAmountTomans, setCreateAmountTomans] = useState("");
  const [createMethod, setCreateMethod] = useState("");
  const [createStatus, setCreateStatus] = useState("PENDING");
  const [createDescription, setCreateDescription] = useState("");
  const [createDueDate, setCreateDueDate] = useState("");

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

  const { data: studentsData } = useQuery({
    queryKey: ["students", { forSelect: true }],
    queryFn: () => listStudents({ page: 1, page_size: 500 }),
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
  const students = studentsData?.data ?? [];

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
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            onClick={() => handleOpenLink(payment.id)}
                          >
                            <Link2 className="h-4 w-4" />
                            لینک پرداخت
                          </Button>
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

      {/* Register Payment Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ثبت پرداخت</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">دانش‌آموز</label>
              <Select
                value={createStudentId}
                onValueChange={setCreateStudentId}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب دانش‌آموز" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem
                      key={s.id}
                      value={String(s.id)}
                    >
                      {[s.first_name, s.last_name].filter(Boolean).join(" ") || `دانش‌آموز ${s.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

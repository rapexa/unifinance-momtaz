import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Layers, Plus, Receipt, Trash2, Wallet } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { formatGroupedFaIntInput, parseLocalizedInt } from "@/lib/numberInput";
import { formatIsoDateShamsi, jalaliToGregorianIso, todayJalaliString } from "@/lib/jalaliDate";
import { formatPayrollPeriod } from "@/lib/payrollDisplay";
import { BankAccountSelect } from "@/components/payments/BankAccountSelect";
import {
  createCostCenter,
  createExpense,
  deleteCostCenter,
  deleteExpense,
  getExpenseSummary,
  listCostCenters,
  listExpenseLines,
  updateCostCenter,
  type CostCenterApi,
  type CostCenterTotalApi,
} from "@/api/expensesApi";

function toman(cents: number): string {
  return Math.floor((cents || 0) / 10).toLocaleString("fa-IR");
}

type Detail = { centerId?: number; title: string };

/**
 * Top of the payroll page: salary paid, rent and every other cost center — this month and
 * "to date" (since the fiscal year start). Cards open the underlying payments.
 */
export function ExpensesOverview({ year, month }: { year: number; month: number }) {
  const { profile } = useCurrentUser();
  const isAdmin = profile?.full_access === true;
  const queryClient = useQueryClient();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailScope, setDetailScope] = useState<"month" | "to_date">("month");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [centersOpen, setCentersOpen] = useState(false);

  const { data: summary, isLoading } = useQuery({
    queryKey: ["expense-summary", year, month],
    queryFn: () => getExpenseSummary(year, month),
    enabled: isAdmin,
  });

  const { data: lines, isLoading: linesLoading } = useQuery({
    queryKey: ["expense-lines", year, month, detail?.centerId ?? 0, detailScope],
    queryFn: () =>
      listExpenseLines({ year, month, cost_center_id: detail?.centerId, scope: detailScope }),
    enabled: isAdmin && detail != null,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["expense-summary"] });
    queryClient.invalidateQueries({ queryKey: ["expense-lines"] });
    queryClient.invalidateQueries({ queryKey: ["cost-centers"] });
    queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
    queryClient.invalidateQueries({ queryKey: ["reports-pnl"] });
  };

  const deleteLine = useMutation({
    mutationFn: (id: number) => deleteExpense(id),
    onSuccess: () => {
      invalidate();
      toast({ title: "هزینه حذف شد" });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "خطا", description: e.message }),
  });

  if (!isAdmin) return null;

  const centers = summary?.centers ?? [];
  const periodLabel = formatPayrollPeriod(year, month);

  return (
    <section className="mb-6 space-y-3" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">هزینه‌ها و پرداخت‌ها — {periodLabel}</h2>
          <p className="text-xs text-muted-foreground">
            «تا کنون» = از ابتدای سال مالی تا پایان همین ماه. روی هر کارت بزنید تا ریز پرداخت‌ها را ببینید.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setCentersOpen(true)}>
            <Layers className="h-4 w-4" />
            مراکز هزینه
          </Button>
          <Button size="sm" className="gap-1" onClick={() => setExpenseOpen(true)}>
            <Plus className="h-4 w-4" />
            ثبت هزینه
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card-elevated h-[104px] animate-pulse bg-muted/30" />
            ))
          : centers.map((c) => (
              <CenterCard
                key={c.id}
                center={c}
                onClick={() => {
                  setDetailScope("month");
                  setDetail({ centerId: c.id, title: c.kind === "SALARY" ? "حقوق پرداختی" : c.name });
                }}
              />
            ))}
        <button
          type="button"
          onClick={() => {
            setDetailScope("month");
            setDetail({ title: "همه هزینه‌ها" });
          }}
          className="card-elevated p-4 text-right transition-colors hover:border-primary/50"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">کل هزینه‌های این ماه</p>
            <Receipt className="h-4 w-4 text-destructive" />
          </div>
          <p className="mt-1 text-2xl font-bold number-display text-destructive">
            {isLoading ? "—" : toman(summary?.total_month_cents ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            تا کنون: <span className="number-display">{toman(summary?.total_to_date_cents ?? 0)}</span> تومان
          </p>
        </button>
      </div>

      <Dialog open={detail != null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
          </DialogHeader>
          <Tabs value={detailScope} onValueChange={(v) => setDetailScope(v as "month" | "to_date")}>
            <TabsList>
              <TabsTrigger value="month">{periodLabel}</TabsTrigger>
              <TabsTrigger value="to_date">تا کنون</TabsTrigger>
            </TabsList>
          </Tabs>
          {linesLoading ? (
            <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>
          ) : !lines?.data.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">پرداختی ثبت نشده است.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="p-2 text-right text-xs">تاریخ</th>
                    <th className="p-2 text-right text-xs">مرکز هزینه</th>
                    <th className="p-2 text-right text-xs">شرح</th>
                    <th className="p-2 text-right text-xs">حساب</th>
                    <th className="p-2 text-right text-xs">مبلغ</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.data.map((l) => (
                    <tr key={`${l.kind}-${l.id}`} className="border-b last:border-0">
                      <td className="p-2 text-muted-foreground">{formatIsoDateShamsi(l.paid_at)}</td>
                      <td className="p-2">{l.cost_center_name}</td>
                      <td className="p-2">
                        {l.kind === "PAYOUT" ? (
                          <span>
                            {l.user_name}
                            {l.description ? ` — ${l.description}` : ""}
                          </span>
                        ) : (
                          l.description || "—"
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground">{l.bank_account_title || "—"}</td>
                      <td className="p-2 number-display font-medium">{toman(l.amount_cents)}</td>
                      <td className="p-2 text-left">
                        {l.kind === "EXPENSE" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            title="حذف"
                            onClick={() => {
                              if (window.confirm("این هزینه حذف شود؟")) deleteLine.mutate(l.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30 font-bold">
                    <td className="p-2" colSpan={4}>
                      جمع
                    </td>
                    <td className="p-2 number-display">{toman(lines.total_cents)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            پرداخت‌های حقوق از بخش «پرداخت به مشاوران و کارکنان» ثبت و ویرایش می‌شوند.
          </p>
        </DialogContent>
      </Dialog>

      <RecordExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} onSaved={invalidate} />
      <CostCentersDialog open={centersOpen} onOpenChange={setCentersOpen} onChanged={invalidate} />
    </section>
  );
}

function CenterCard({ center, onClick }: { center: CostCenterTotalApi; onClick: () => void }) {
  const isSalary = center.kind === "SALARY";
  const Icon = isSalary ? Wallet : Building2;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "card-elevated p-4 text-right transition-colors hover:border-primary/50",
        !center.is_active && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm text-muted-foreground">
          {isSalary ? "حقوق پرداختی این ماه" : `${center.name} — این ماه`}
        </p>
        <Icon className={cn("h-4 w-4 shrink-0", isSalary ? "text-primary" : "text-amber-600")} />
      </div>
      <p className="mt-1 text-2xl font-bold number-display text-foreground">{toman(center.month_cents)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {isSalary ? "حقوق تا کنون" : "تا کنون"}: <span className="number-display">{toman(center.to_date_cents)}</span> تومان
      </p>
    </button>
  );
}

export function RecordExpenseDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [centerId, setCenterId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayJalaliString());
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState("");

  const { data: centers = [] } = useQuery({
    queryKey: ["cost-centers"],
    queryFn: listCostCenters,
    enabled: open,
  });
  const selectable = useMemo(() => centers.filter((c) => c.kind !== "SALARY" && c.is_active), [centers]);

  const mutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      onSaved();
      toast({ title: "هزینه ثبت شد" });
      setAmount("");
      setDescription("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "خطا در ثبت هزینه", description: e.message }),
  });

  const submit = () => {
    const tomans = parseLocalizedInt(amount);
    if (!centerId) return toast({ variant: "destructive", title: "مرکز هزینه را انتخاب کنید" });
    if (!tomans || tomans <= 0) return toast({ variant: "destructive", title: "مبلغ نامعتبر است" });
    const iso = jalaliToGregorianIso(date.trim());
    if (!iso) return toast({ variant: "destructive", title: "تاریخ نامعتبر است" });
    mutation.mutate({
      cost_center_id: Number(centerId),
      amount_cents: tomans * 10,
      paid_at: iso,
      description: description.trim() || undefined,
      bank_account_id: accountId ? Number(accountId) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>ثبت هزینه</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2 text-right">
          <div className="grid gap-2">
            <label className="text-sm font-medium">مرکز هزینه</label>
            <Select value={centerId} onValueChange={setCenterId}>
              <SelectTrigger>
                <SelectValue placeholder="مثلاً اجاره دفتر" />
              </SelectTrigger>
              <SelectContent>
                {selectable.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectable.length === 0 && (
              <p className="text-xs text-muted-foreground">ابتدا از «مراکز هزینه» یک مرکز تعریف کنید.</p>
            )}
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">مبلغ (تومان)</label>
            <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(formatGroupedFaIntInput(e.target.value))} />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">تاریخ پرداخت</label>
            <JalaliDatePicker value={date} onChange={setDate} clearable={false} />
          </div>
          <BankAccountSelect value={accountId} onChange={setAccountId} label="پرداخت از حساب" />
          <div className="grid gap-2">
            <label className="text-sm font-medium">شرح</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثلاً اجاره مهر" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "در حال ثبت..." : "ثبت هزینه"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CostCentersDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const { data: centers = [] } = useQuery({
    queryKey: ["cost-centers"],
    queryFn: listCostCenters,
    enabled: open,
  });

  const onError = (e: Error) => toast({ variant: "destructive", title: "خطا", description: e.message });
  const createMut = useMutation({
    mutationFn: () => createCostCenter({ name: newName.trim(), sort_order: centers.length }),
    onSuccess: () => {
      setNewName("");
      onChanged();
    },
    onError,
  });
  const updateMut = useMutation({
    mutationFn: (c: CostCenterApi) =>
      updateCostCenter(c.id, {
        name: c.name,
        description: c.description,
        is_active: c.is_active,
        sort_order: c.sort_order,
        recurring_amount_cents: c.recurring_amount_cents ?? 0,
        due_day: c.due_day ?? 0,
      }),
    onSuccess: onChanged,
    onError,
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteCostCenter(id),
    onSuccess: onChanged,
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>مراکز هزینه</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          هر نوع هزینه (اجاره دفتر، قبوض، تبلیغات، …) را به‌عنوان مرکز هزینه تعریف کنید تا مبلغ ماه و «تا کنون» آن
          بالای صفحه حقوق نمایش داده شود. «حقوق و دستمزد» خودکار از پرداخت‌های ثبت‌شده به کارکنان پر می‌شود. برای
          هزینه‌های ثابت (مثل اجاره) مبلغ ماهانه و روز سررسید را وارد کنید تا در «سررسیدهای پیش رو» داشبورد بیاید.
        </p>
        <div className="space-y-2">
          {centers.map((c) => (
            <CostCenterRow
              key={c.id}
              center={c}
              onSave={(next) => updateMut.mutate(next)}
              onDelete={() => {
                if (window.confirm(`مرکز هزینه «${c.name}» حذف شود؟`)) deleteMut.mutate(c.id);
              }}
            />
          ))}
        </div>
        <div className="flex gap-2 border-t pt-3">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="نام مرکز هزینه جدید" />
          <Button onClick={() => newName.trim() && createMut.mutate()} disabled={createMut.isPending || !newName.trim()}>
            افزودن
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CostCenterRow({
  center,
  onSave,
  onDelete,
}: {
  center: CostCenterApi;
  onSave: (c: CostCenterApi) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(center.name);
  const [recurring, setRecurring] = useState(
    center.recurring_amount_cents ? formatGroupedFaIntInput(String(Math.floor(center.recurring_amount_cents / 10))) : "",
  );
  const [dueDay, setDueDay] = useState(center.due_day ? String(center.due_day) : "");
  const isSalary = center.kind === "SALARY";

  const saveRecurring = () => {
    const cents = (parseLocalizedInt(recurring) || 0) * 10;
    const day = Math.min(31, Math.max(0, parseLocalizedInt(dueDay) || 0));
    if (cents === (center.recurring_amount_cents ?? 0) && day === (center.due_day ?? 0)) return;
    onSave({ ...center, name: name.trim() || center.name, recurring_amount_cents: cents, due_day: day });
  };

  return (
    <div className="space-y-2 rounded-lg border p-2">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== center.name && onSave({ ...center, name: name.trim() })}
          className="h-8"
        />
        {center.is_system ? (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">سیستمی</span>
        ) : (
          <>
            <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              فعال
              <Switch checked={center.is_active} onCheckedChange={(v) => onSave({ ...center, name, is_active: v })} />
            </label>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={onDelete} title="حذف">
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      {!isSalary && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>مبلغ ثابت ماهانه</span>
          <Input
            inputMode="numeric"
            value={recurring}
            onChange={(e) => setRecurring(formatGroupedFaIntInput(e.target.value))}
            onBlur={saveRecurring}
            placeholder="اختیاری"
            className="h-7 w-32"
          />
          <span>تومان — سررسید روز</span>
          <Input
            inputMode="numeric"
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value.replace(/[^0-9۰-۹]/g, "").slice(0, 2))}
            onBlur={saveRecurring}
            placeholder="۱"
            className="h-7 w-14"
          />
          <span>هر ماه</span>
        </div>
      )}
    </div>
  );
}

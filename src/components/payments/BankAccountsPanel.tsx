import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatGroupedFaIntInput, parseLocalizedInt } from "@/lib/numberInput";
import {
  createBankAccount,
  deleteBankAccount,
  formatCardNumber,
  listBankAccounts,
  updateBankAccount,
  type BankAccountApi,
  type BankAccountPayload,
} from "@/api/bankAccountsApi";

function toman(cents: number): string {
  return Math.floor(Math.abs(cents) / 10).toLocaleString("fa-IR");
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: `${label} کپی شد` });
  } catch {
    toast({ variant: "destructive", title: "کپی انجام نشد" });
  }
}

interface FormState {
  title: string;
  bank_name: string;
  owner_name: string;
  card_number: string;
  account_number: string;
  iban: string;
  opening_tomans: string;
  is_active: boolean;
  show_to_students: boolean;
  notes: string;
}

const emptyForm: FormState = {
  title: "",
  bank_name: "",
  owner_name: "",
  card_number: "",
  account_number: "",
  iban: "",
  opening_tomans: "",
  is_active: true,
  show_to_students: true,
  notes: "",
};

function formFromAccount(a: BankAccountApi): FormState {
  return {
    title: a.title,
    bank_name: a.bank_name ?? "",
    owner_name: a.owner_name ?? "",
    card_number: a.card_number ?? "",
    account_number: a.account_number ?? "",
    iban: a.iban ?? "",
    opening_tomans: a.opening_balance_cents
      ? formatGroupedFaIntInput(String(Math.floor(a.opening_balance_cents / 10)))
      : "",
    is_active: a.is_active,
    show_to_students: a.show_to_students,
    notes: a.notes ?? "",
  };
}

/** Bank accounts of the organization: balances, card/IBAN for students, CRUD. */
export function BankAccountsPanel({ canEdit = true }: { canEdit?: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<BankAccountApi | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => listBankAccounts(),
  });
  const accounts = data?.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: BankAccountPayload) =>
      editing ? updateBankAccount(editing.id, payload) : createBankAccount(payload),
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast({ title: editing ? "حساب ویرایش شد" : "حساب ثبت شد" });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "خطا", description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteBankAccount(id),
    onSuccess: () => {
      invalidate();
      toast({ title: "حساب حذف شد" });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "خطا", description: err.message }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };
  const openEdit = (a: BankAccountApi) => {
    setEditing(a);
    setForm(formFromAccount(a));
    setOpen(true);
  };

  const submit = () => {
    if (!form.title.trim() && !form.bank_name.trim()) {
      toast({ variant: "destructive", title: "عنوان یا نام بانک را وارد کنید" });
      return;
    }
    saveMutation.mutate({
      title: form.title.trim(),
      bank_name: form.bank_name.trim(),
      owner_name: form.owner_name.trim(),
      card_number: form.card_number,
      account_number: form.account_number,
      iban: form.iban,
      opening_balance_cents: parseLocalizedInt(form.opening_tomans) * 10,
      is_active: form.is_active,
      show_to_students: form.show_to_students,
      notes: form.notes.trim(),
    });
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <section className="card-elevated mb-6 p-4 sm:p-5" dir="rtl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-foreground">حساب‌های بانکی</h2>
          {accounts.length > 0 && (
            <span className="text-sm text-muted-foreground">
              · موجودی کل{" "}
              <span className="font-bold number-display text-foreground">{toman(data?.total_balance_cents ?? 0)}</span>{" "}
              تومان
            </span>
          )}
        </div>
        {canEdit && (
          <Button size="sm" className="gap-1" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            افزودن حساب
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          هنوز حسابی تعریف نشده است. شماره کارت و شبا را ثبت کنید تا در صفحه پرداخت دانش‌آموز نمایش داده شود.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => (
            <div
              key={a.id}
              className={cn(
                "rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-4",
                !a.is_active && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{a.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[a.bank_name, a.owner_name].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)} title="ویرایش">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      title="حذف"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`حساب «${a.title}» حذف شود؟ پرداخت‌های ثبت‌شده حذف نمی‌شوند.`)) {
                          deleteMutation.mutate(a.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-1 text-sm">
                {a.card_number && (
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 hover:bg-muted"
                    onClick={() => copyText(a.card_number!, "شماره کارت")}
                  >
                    <span className="text-xs text-muted-foreground">کارت</span>
                    <span className="flex items-center gap-1 font-mono tracking-wider" dir="ltr">
                      {formatCardNumber(a.card_number)}
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    </span>
                  </button>
                )}
                {a.iban && (
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 hover:bg-muted"
                    onClick={() => copyText(a.iban!, "شماره شبا")}
                  >
                    <span className="text-xs text-muted-foreground">شبا</span>
                    <span className="flex items-center gap-1 font-mono text-xs" dir="ltr">
                      {a.iban}
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    </span>
                  </button>
                )}
              </div>
              <div className="mt-3 flex items-end justify-between border-t pt-2">
                <div className="text-[11px] text-muted-foreground">
                  <p>دریافتی: {toman(a.inflow_cents)}</p>
                  <p>پرداختی: {toman(a.outflow_cents)}</p>
                </div>
                <div className="text-left">
                  <p className="text-[11px] text-muted-foreground">موجودی</p>
                  <p
                    className={cn(
                      "font-bold number-display",
                      a.balance_cents < 0 ? "text-destructive" : "text-foreground",
                    )}
                    dir="ltr"
                  >
                    {a.balance_cents < 0 ? "−" : ""}
                    {toman(a.balance_cents)}
                  </p>
                </div>
              </div>
              {!a.show_to_students && (
                <p className="mt-1 text-[10px] text-muted-foreground">به دانش‌آموز نمایش داده نمی‌شود</p>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "ویرایش حساب بانکی" : "افزودن حساب بانکی"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2 text-right sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <label className="text-sm font-medium">عنوان حساب</label>
              <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="مثلاً حساب اصلی ملت" />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">نام بانک</label>
              <Input value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="ملت" />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">نام صاحب حساب</label>
              <Input value={form.owner_name} onChange={(e) => set("owner_name", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">شماره کارت</label>
              <Input dir="ltr" inputMode="numeric" value={form.card_number} onChange={(e) => set("card_number", e.target.value)} placeholder="6037-9900-0000-0000" />
            </div>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium">شماره حساب</label>
              <Input dir="ltr" value={form.account_number} onChange={(e) => set("account_number", e.target.value)} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <label className="text-sm font-medium">شماره شبا</label>
              <Input dir="ltr" value={form.iban} onChange={(e) => set("iban", e.target.value)} placeholder="IR000000000000000000000000" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <label className="text-sm font-medium">موجودی اولیه (تومان)</label>
              <Input
                inputMode="numeric"
                value={form.opening_tomans}
                onChange={(e) => set("opening_tomans", formatGroupedFaIntInput(e.target.value))}
                placeholder="۰"
              />
              <p className="text-[11px] text-muted-foreground">
                موجودی حساب در زمان ثبت؛ دریافتی‌ها و پرداختی‌های ثبت‌شده به آن اضافه/کم می‌شود.
              </p>
            </div>
            <label className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
              فعال
              <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
            </label>
            <label className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
              نمایش به دانش‌آموز
              <Switch checked={form.show_to_students} onCheckedChange={(v) => set("show_to_students", v)} />
            </label>
            <div className="grid gap-1.5 sm:col-span-2">
              <label className="text-sm font-medium">توضیحات</label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button onClick={submit} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "در حال ذخیره..." : "ذخیره"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

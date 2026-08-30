import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, RefreshCw } from "lucide-react";
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
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { studentsCountLabel, studentsCountTooltip } from "@/lib/payrollStudentsCount";
import {
  formatCentsToToman,
  formatPayrollPeriod,
  registrationChannelLabel,
  contractTypeLabel,
  rbacRoleLabel,
} from "@/lib/payrollDisplay";
import { billingModeLabel, parseBillingMode } from "@/components/students/enrollmentBillingUtils";
import { formatGroupedFaIntInput, parseLocalizedInt } from "@/lib/numberInput";
import {
  jalaliToGregorianIso,
  formatIsoDateShamsi,
  todayJalaliString,
} from "@/lib/jalaliDate";
import {
  getPayrollUserLedger,
  recalculatePayrollUser,
  markPayrollEntryPaid,
  markPayrollEntryPending,
  createStaffPayout,
  type PayrollUserLedgerApi,
  type PaymentShareLineApi,
  type AccrualShareLineApi,
} from "@/api/payrollApi";

export default function PayrollUserDetail() {
  const { userId: userIdParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = Number(userIdParam);
  const now = new Date();
  const year = Number(searchParams.get("year")) || now.getFullYear();
  const month = Number(searchParams.get("month")) || now.getMonth() + 1;

  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [markPaidDate, setMarkPaidDate] = useState(todayJalaliString());
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutAmountTomans, setPayoutAmountTomans] = useState("");
  const [payoutDate, setPayoutDate] = useState(todayJalaliString());
  const [payoutNote, setPayoutNote] = useState("");

  const {
    data: ledger,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["payroll-user-ledger", userId, year, month],
    queryFn: () => getPayrollUserLedger({ user_id: userId, year, month }),
    enabled: Number.isFinite(userId) && userId > 0,
  });

  const shareByStudent = useMemo(() => {
    const map = new Map<number, number>();
    for (const line of ledger?.payment_share_lines ?? []) {
      if (!line.student_id) continue;
      map.set(line.student_id, (map.get(line.student_id) ?? 0) + line.share_cents);
    }
    for (const line of ledger?.accrual_share_lines ?? []) {
      map.set(line.student_id, (map.get(line.student_id) ?? 0) + line.share_cents);
    }
    return map;
  }, [ledger]);

  const currentSalary = useMemo(() => {
    if (!ledger?.salaries?.length) return null;
    return ledger.salaries.find((s) => s.period_year === year && s.period_month === month) ?? null;
  }, [ledger, year, month]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["payroll-user-ledger", userId] });
    queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
    queryClient.invalidateQueries({ queryKey: ["payroll-summary"] });
  };

  const recalcMutation = useMutation({
    mutationFn: () => recalculatePayrollUser({ user_id: userId, year, month }),
    onSuccess: () => {
      invalidate();
      toast({ title: "محاسبه فیش انجام شد" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "خطا در محاسبه فیش", description: err.message });
    },
  });

  const entryId = ledger?.entry_id ?? currentSalary?.id;

  const markPaidMutation = useMutation({
    mutationFn: (paid_at: string) => {
      if (!entryId) {
        return Promise.reject(new Error("ابتدا فیش این ماه را محاسبه کنید"));
      }
      return markPayrollEntryPaid(entryId, { paid_at });
    },
    onSuccess: () => {
      setMarkPaidOpen(false);
      invalidate();
      toast({ title: "پرداخت ثبت شد", description: "فیش قفل شد." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "خطا در ثبت پرداخت", description: err.message });
    },
  });

  const markPendingMutation = useMutation({
    mutationFn: () => {
      if (!entryId) return Promise.reject(new Error("فیش یافت نشد"));
      return markPayrollEntryPending(entryId);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "به در انتظار برگشت" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "خطا", description: err.message });
    },
  });

  const payoutMutation = useMutation({
    mutationFn: (payload: { amount_cents: number; paid_at: string; note?: string }) =>
      createStaffPayout(userId, payload),
    onSuccess: () => {
      setPayoutOpen(false);
      setPayoutAmountTomans("");
      setPayoutNote("");
      invalidate();
      toast({ title: "پرداخت ثبت شد", description: "مانده تسویه به‌روز شد." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "خطا در ثبت پرداخت", description: err.message });
    },
  });

  const entryStatus = ledger?.entry_status ?? currentSalary?.status ?? "";
  const isPaid = entryStatus === "PAID" || !!ledger?.entry_locked;

  const handlePrint = () => {
    if (!ledger) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const name = `${ledger.first_name} ${ledger.last_name}`.trim() || "کارمند";
    w.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="fa">
      <head><meta charset="utf-8"><title>فیش حقوقی - ${name}</title></head>
      <body style="font-family: Tahoma, Arial; padding: 24px; max-width: 600px; margin: 0 auto;">
        <h2 style="text-align: center;">فیش حقوقی</h2>
        <p><strong>دوره:</strong> ${formatPayrollPeriod(year, month)}</p>
        <p><strong>کارمند:</strong> ${name}</p>
        <p><strong>سمت:</strong> ${rbacRoleLabel(ledger.role_name, ledger.role_code)}</p>
        <hr/>
        <p><strong>حقوق ثابت:</strong> ${formatCentsToToman(ledger.base_salary_cents)} تومان</p>
        <p><strong>حقوق متغیر:</strong> ${formatCentsToToman(ledger.variable_salary_cents)} تومان</p>
        <p><strong>${studentsCountLabel(ledger.students_count_scope)}:</strong> ${ledger.students_count}</p>
        <hr/>
        <p><strong>جمع کل:</strong> ${formatCentsToToman(ledger.total_salary_cents)} تومان</p>
        <p><strong>وضعیت:</strong> ${isPaid ? "پرداخت شده" : "در انتظار"}</p>
      </body>
      </html>
    `);
    w.document.close();
    setTimeout(() => {
      w.print();
      w.close();
    }, 250);
  };

  if (!Number.isFinite(userId) || userId <= 0) {
    return (
      <MainLayout title="جزئیات حقوق" subtitle="">
        <p className="text-sm text-destructive" dir="rtl">
          شناسه کاربر نامعتبر است.
        </p>
      </MainLayout>
    );
  }

  const displayName = ledger
    ? `${ledger.first_name} ${ledger.last_name}`.trim()
    : `کاربر #${userId}`;

  return (
    <MainLayout title={displayName || "جزئیات حقوق"} subtitle="حساب‌کتاب کارمند">
      <div className="space-y-6 text-right" dir="rtl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" className="w-fit gap-2" onClick={() => navigate("/payroll")}>
            <ArrowRight className="h-4 w-4" />
            بازگشت به فیش‌ها
          </Button>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">دوره:</span>
            <span className="font-medium">
              {formatPayrollPeriod(year, month)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date(year, month - 2, 1);
                setSearchParams({ year: String(d.getFullYear()), month: String(d.getMonth() + 1) });
              }}
            >
              ماه قبل
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date(year, month, 1);
                setSearchParams({ year: String(d.getFullYear()), month: String(d.getMonth() + 1) });
              }}
            >
              ماه بعد
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">محاسبه فیش</span> سند حقوق ماه را می‌سازد یا به‌روز می‌کند.{" "}
          <span className="font-medium text-foreground">تیک پرداخت شده</span> یعنی فیش ماه قفل می‌شود.{" "}
          <span className="font-medium text-foreground">تسویه با کارمند</span> پرداخت نقدی واقعی به کارمند را ثبت می‌کند
          و مانده بدهکار/بستانکار را نشان می‌دهد.
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>}
        {isError && (
          <p className="text-sm text-destructive">
            {(error as Error)?.message || "خطا در دریافت جزئیات"}
          </p>
        )}

        {ledger && (
          <>
            <p className="text-sm text-muted-foreground">
              {rbacRoleLabel(ledger.role_name, ledger.role_code)}
              {" · "}
              <span title={studentsCountTooltip(ledger.students_count_scope)}>
                {studentsCountLabel(ledger.students_count_scope)}:{" "}
                {ledger.students_total.toLocaleString("fa-IR")}
              </span>
            </p>

            <section className="space-y-3">
              <h2 className="text-base font-semibold">خلاصه ماه</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="حقوق ثابت" value={formatCentsToToman(ledger.base_salary_cents)} />
                <SummaryCard
                  label="حقوق متغیر"
                  value={formatCentsToToman(ledger.variable_salary_cents)}
                  accent
                />
                <SummaryCard label="جمع کل" value={formatCentsToToman(ledger.total_salary_cents)} />
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">پرداخت شده</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Switch
                      checked={!!isPaid}
                      disabled={
                        markPaidMutation.isPending ||
                        markPendingMutation.isPending ||
                        recalcMutation.isPending
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          if (!entryId) {
                            toast({
                              variant: "destructive",
                              title: "فیش وجود ندارد",
                              description: "ابتدا محاسبه فیش را بزنید.",
                            });
                            return;
                          }
                          setMarkPaidDate(todayJalaliString());
                          setMarkPaidOpen(true);
                        } else if (window.confirm("فیش از حالت پرداخت‌شده خارج شود؟")) {
                          markPendingMutation.mutate();
                        }
                      }}
                    />
                    <span className="text-sm font-medium">{isPaid ? "بله" : "خیر"}</span>
                  </div>
                  {isPaid && currentSalary?.paid_at && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatIsoDateShamsi(currentSalary.paid_at)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="gap-2"
                  disabled={!!isPaid || recalcMutation.isPending}
                  onClick={() => recalcMutation.mutate()}
                >
                  <RefreshCw className={cn("h-4 w-4", recalcMutation.isPending && "animate-spin")} />
                  محاسبه فیش
                </Button>
                <Button size="sm" variant="outline" className="gap-2" onClick={handlePrint}>
                  <Download className="h-4 w-4" />
                  چاپ فیش
                </Button>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">تسویه با کارمند</h2>
                <Button size="sm" onClick={() => {
                  setPayoutDate(todayJalaliString());
                  setPayoutOpen(true);
                }}>
                  ثبت پرداخت
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryCard
                  label="حقوق تجمعی (سهم از پرداخت‌ها)"
                  value={formatCentsToToman(ledger.settlement_accrued_cents ?? 0)}
                />
                <SummaryCard
                  label="پرداخت‌های ثبت‌شده به کارمند"
                  value={formatCentsToToman(ledger.settlement_paid_out_cents ?? 0)}
                />
                <SettlementBalanceCard balanceCents={ledger.settlement_balance_cents ?? 0} />
              </div>
              <div className="card-elevated overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-right text-xs text-muted-foreground">تاریخ</th>
                      <th className="p-3 text-right text-xs text-muted-foreground">مبلغ</th>
                      <th className="p-3 text-right text-xs text-muted-foreground">توضیح</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!ledger.settlement_payouts?.length ? (
                      <tr>
                        <td colSpan={3} className="p-6 text-center text-muted-foreground">
                          پرداختی به کارمند ثبت نشده است.
                        </td>
                      </tr>
                    ) : (
                      ledger.settlement_payouts.map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="p-3 text-muted-foreground">
                            {formatIsoDateShamsi(p.paid_at)}
                          </td>
                          <td className="p-3 number-display font-medium">
                            {formatCentsToToman(p.amount_cents)}
                          </td>
                          <td className="p-3 text-muted-foreground">{p.note || "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold">شکست محاسبه</h2>
              <BreakdownBlock ledger={ledger} />
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold">دانش‌آموزان مرتبط</h2>
              <div className="card-elevated overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-right text-xs text-muted-foreground">نام</th>
                      <th className="p-3 text-right text-xs text-muted-foreground">کانال</th>
                      <th className="p-3 text-right text-xs text-muted-foreground">نوع پرداخت</th>
                      <th className="p-3 text-right text-xs text-muted-foreground">ثبت‌نامی</th>
                      <th className="p-3 text-right text-xs text-muted-foreground">پرداخت‌شده</th>
                      <th className="p-3 text-right text-xs text-muted-foreground">مانده</th>
                      <th className="p-3 text-right text-xs text-muted-foreground">سهم این ماه</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!ledger.students?.length ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-muted-foreground">
                          دانش‌آموزی منتسب به این کاربر نیست.
                        </td>
                      </tr>
                    ) : (
                      ledger.students.map((st) => (
                        <tr key={st.student_id} className="border-b last:border-0">
                          <td className="p-3">
                            {st.first_name} {st.last_name}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {registrationChannelLabel(st.registration_channel)}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {contractTypeLabel(st.enrollment_billing_mode)}
                          </td>
                          <td className="p-3 number-display">
                            {formatCentsToToman(st.enrollment_amount_cents)}
                          </td>
                          <td className="p-3 number-display">
                            {formatCentsToToman(st.paid_total_cents)}
                          </td>
                          <td className="p-3 number-display">
                            {formatCentsToToman(st.remaining_balance_cents)}
                          </td>
                          <td className="p-3 number-display text-primary">
                            {formatCentsToToman(shareByStudent.get(st.student_id) ?? 0)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold">تاریخچه حقوق</h2>
              <div className="card-elevated overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 text-right text-xs text-muted-foreground">دوره</th>
                      <th className="p-3 text-right text-xs text-muted-foreground">ثابت</th>
                      <th className="p-3 text-right text-xs text-muted-foreground">متغیر</th>
                      <th className="p-3 text-right text-xs text-muted-foreground">جمع</th>
                      <th className="p-3 text-right text-xs text-muted-foreground">پرداخت شده</th>
                      <th className="p-3 text-right text-xs text-muted-foreground">تاریخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!ledger.salaries?.length ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-muted-foreground">
                          فیش حقوقی ثبت نشده است.
                        </td>
                      </tr>
                    ) : (
                      ledger.salaries.map((sal) => (
                        <tr
                          key={sal.id}
                          className={cn(
                            "border-b last:border-0",
                            sal.period_year === year &&
                              sal.period_month === month &&
                              "bg-primary/5",
                          )}
                        >
                          <td className="p-3">
                            <Link
                              className="text-primary hover:underline"
                              to={`/payroll/users/${userId}?year=${sal.period_year}&month=${sal.period_month}`}
                            >
                              {formatPayrollPeriod(sal.period_year, sal.period_month)}
                            </Link>
                          </td>
                          <td className="p-3 number-display">
                            {formatCentsToToman(sal.base_salary_cents)}
                          </td>
                          <td className="p-3 number-display">
                            {formatCentsToToman(sal.variable_salary_cents)}
                          </td>
                          <td className="p-3 number-display font-medium">
                            {formatCentsToToman(sal.total_salary_cents)}
                          </td>
                          <td className="p-3">{sal.status === "PAID" ? "بله" : "خیر"}</td>
                          <td className="p-3 text-muted-foreground">
                            {sal.paid_at ? formatIsoDateShamsi(sal.paid_at) : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>

      <Dialog open={markPaidOpen} onOpenChange={setMarkPaidOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>ثبت پرداخت فیش</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-right">
            <div className="grid gap-2">
              <label className="text-sm font-medium">تاریخ پرداخت</label>
              <JalaliDatePicker value={markPaidDate} onChange={setMarkPaidDate} clearable={false} />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setMarkPaidOpen(false)}>
                انصراف
              </Button>
              <Button
                disabled={markPaidMutation.isPending}
                onClick={() => {
                  const iso = jalaliToGregorianIso(markPaidDate.trim());
                  if (!iso) {
                    toast({ variant: "destructive", title: "تاریخ نامعتبر است" });
                    return;
                  }
                  markPaidMutation.mutate(iso);
                }}
              >
                تأیید پرداخت
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>ثبت پرداخت به کارمند</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-right">
            <div className="grid gap-2">
              <label className="text-sm font-medium">مبلغ (تومان)</label>
              <Input
                inputMode="numeric"
                value={payoutAmountTomans}
                onChange={(e) => setPayoutAmountTomans(formatGroupedFaIntInput(e.target.value))}
                placeholder="مثلاً ۵٬۰۰۰٬۰۰۰"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">تاریخ پرداخت</label>
              <JalaliDatePicker value={payoutDate} onChange={setPayoutDate} clearable={false} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">توضیح (اختیاری)</label>
              <Input
                value={payoutNote}
                onChange={(e) => setPayoutNote(e.target.value)}
                placeholder="مثلاً واریز به حساب"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPayoutOpen(false)}>
                انصراف
              </Button>
              <Button
                disabled={payoutMutation.isPending}
                onClick={() => {
                  const tomans = parseLocalizedInt(payoutAmountTomans);
                  if (!tomans || tomans <= 0) {
                    toast({ variant: "destructive", title: "مبلغ نامعتبر است" });
                    return;
                  }
                  const iso = jalaliToGregorianIso(payoutDate.trim());
                  if (!iso) {
                    toast({ variant: "destructive", title: "تاریخ نامعتبر است" });
                    return;
                  }
                  payoutMutation.mutate({
                    amount_cents: tomans * 10,
                    paid_at: iso,
                    note: payoutNote.trim() || undefined,
                  });
                }}
              >
                ثبت پرداخت
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-bold number-display", accent && "text-primary")}>{value}</p>
    </div>
  );
}

function SettlementBalanceCard({ balanceCents }: { balanceCents: number }) {
  const isZero = balanceCents === 0;
  const orgOwes = balanceCents > 0;
  const label = isZero
    ? "تسویه کامل"
    : orgOwes
      ? "مانده بدهکار سازمان"
      : "مانده بستانکار سازمان";
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        isZero && "bg-muted/20",
        orgOwes && "border-amber-500/40 bg-amber-500/5",
        !isZero && !orgOwes && "border-emerald-500/40 bg-emerald-500/5",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-bold number-display",
          orgOwes && "text-amber-700 dark:text-amber-400",
          !isZero && !orgOwes && "text-emerald-700 dark:text-emerald-400",
        )}
      >
        {formatCentsToToman(Math.abs(balanceCents))}
      </p>
    </div>
  );
}

function BreakdownBlock({ ledger }: { ledger: PayrollUserLedgerApi }) {
  return (
    <div className="space-y-4">
      <PaymentSharesTable
        cents={ledger.payment_shares_cents}
        lines={ledger.payment_share_lines ?? []}
      />
      <AccrualSharesTable
        cents={ledger.accrual_shares_cents}
        lines={ledger.accrual_share_lines ?? []}
      />
    </div>
  );
}

function PaymentSharesTable({
  cents,
  lines,
}: {
  cents: number;
  lines: PaymentShareLineApi[];
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">
        سهم پرداخت‌های PAID ({formatCentsToToman(cents)} تومان)
      </h3>
      {lines.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="p-2 text-right text-xs">دانش‌آموز</th>
                <th className="p-2 text-right text-xs">نوع</th>
                <th className="p-2 text-right text-xs">پرداخت</th>
                <th className="p-2 text-right text-xs">سهم</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
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
        <p className="text-xs text-muted-foreground">سهم پرداختی برای این ماه نیست.</p>
      )}
    </div>
  );
}

function AccrualSharesTable({
  cents,
  lines,
}: {
  cents: number;
  lines: AccrualShareLineApi[];
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">
        سهم قرارداد سالانه — قسط ماهانه ({formatCentsToToman(cents)} تومان)
      </h3>
      {lines.length ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="p-2 text-right text-xs">دانش‌آموز</th>
                <th className="p-2 text-right text-xs">روند</th>
                <th className="p-2 text-right text-xs">این ماه</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.student_id} className="border-b last:border-0">
                  <td className="p-2">
                    <p>{line.student_name}</p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">{line.label}</p>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    ماه {line.accrual_month_index.toLocaleString("fa-IR")} از{" "}
                    {line.accrual_months_total.toLocaleString("fa-IR")}
                    {line.remaining_months > 0
                      ? ` · باقی ${line.remaining_months.toLocaleString("fa-IR")}`
                      : " · آخرین"}
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
        <p className="text-xs text-muted-foreground">سهم سالانه برای این ماه نیست.</p>
      )}
    </div>
  );
}

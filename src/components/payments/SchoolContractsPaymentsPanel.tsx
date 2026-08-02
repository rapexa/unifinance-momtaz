import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listSchoolContracts, type SchoolContractApi } from "@/api/schoolContractsApi";

function formatTomansFromCents(cents: number): string {
  return Math.round(cents / 10).toLocaleString("fa-IR");
}

function paymentStatusSummary(c: SchoolContractApi): string {
  const registered = c.registered_student_count ?? 0;
  const settled = c.students_settled_count ?? 0;
  const debt = c.students_debt_count ?? 0;
  const other = Math.max(0, registered - settled - debt);
  const parts: string[] = [];
  if (settled > 0) parts.push(`${settled.toLocaleString("fa-IR")} تسویه`);
  if (debt > 0) parts.push(`${debt.toLocaleString("fa-IR")} بدهکار`);
  if (other > 0) parts.push(`${other.toLocaleString("fa-IR")} بدون مبلغ ثبت‌نامی`);
  if (parts.length === 0) {
    return registered > 0 ? "هنوز پرداختی ثبت نشده" : "بدون دانش‌آموز";
  }
  return parts.join(" · ");
}

export function SchoolContractsPaymentsPanel({
  search,
  onRegisterPayment,
}: {
  search?: string;
  onRegisterPayment?: (contract: SchoolContractApi) => void;
}) {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["school-contracts", "payments-tab", { search, page }],
    queryFn: () =>
      listSchoolContracts({
        search: search || undefined,
        page,
        page_size: 20,
        sort: "newest",
      }),
  });

  const rows = data?.data ?? [];
  const totalPages = data?.meta.total_pages ?? 1;

  const emptyHint = useMemo(() => {
    if (search) return "مدرسه‌ای با این جستجو یافت نشد.";
    return "هنوز مدرسه‌ای ثبت نشده است. از منوی دانش‌آموزان ← مدارس، قرارداد مدرسه را اضافه کنید؛ سپس دانش‌آموز مدرسه‌ای و پرداخت را ثبت کنید.";
  }, [search]);

  return (
    <div className="space-y-3" dir="rtl">
      <p className="text-xs text-muted-foreground">
        خلاصه مالی قرارداد بر اساس پرداخت دانش‌آموزان همان مدرسه است (نه پرداخت مستقیم قرارداد). برای ثبت
        پرداخت: مدرسه → دانش‌آموز → مبلغ. اگر جمع مبالغ ثبت‌نامی با قرارداد جور نباشد فقط هشدار می‌بینید.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right font-medium">مدرسه</th>
              <th className="px-3 py-2 text-right font-medium">ثبت‌شده / توافق</th>
              <th className="px-3 py-2 text-right font-medium">مبلغ کل</th>
              <th className="px-3 py-2 text-right font-medium">پرداخت‌شده</th>
              <th className="px-3 py-2 text-right font-medium">مانده</th>
              <th className="px-3 py-2 text-right font-medium">وضعیت پرداختی‌ها</th>
              <th className="px-3 py-2 text-right font-medium">وضعیت</th>
              <th className="px-3 py-2 text-right font-medium">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  در حال بارگذاری...
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-destructive">
                  {(error as Error)?.message || "خطا در دریافت مدارس"}
                </td>
              </tr>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  {emptyHint}
                </td>
              </tr>
            )}
            {rows.map((c) => {
              const registered = c.registered_student_count ?? 0;
              return (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">
                    <div className="flex flex-col gap-0.5">
                      <span>{c.school_name}</span>
                      {c.enrollment_mismatch && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          جمع ثبت‌نامی{" "}
                          {formatTomansFromCents(c.students_enrollment_sum_cents ?? 0)} ≠ قرارداد{" "}
                          {formatTomansFromCents(c.total_amount_cents)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 number-display">
                    {registered.toLocaleString("fa-IR")} / {c.student_count.toLocaleString("fa-IR")}
                  </td>
                  <td className="px-3 py-2 number-display">
                    {formatTomansFromCents(c.total_amount_cents)}
                  </td>
                  <td className="px-3 py-2 number-display">
                    <div className="flex flex-col gap-0.5">
                      <span>{formatTomansFromCents(c.paid_total_cents)}</span>
                      {(c.legacy_paid_total_cents ?? 0) > 0 && (
                        <span className="text-[11px] text-amber-700 dark:text-amber-400">
                          + تاریخی {formatTomansFromCents(c.legacy_paid_total_cents ?? 0)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 number-display">
                    {formatTomansFromCents(c.remaining_balance_cents)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {paymentStatusSummary(c)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {c.status === "ACTIVE" ? "فعال" : c.status === "SETTLED" ? "تسویه" : "غیرفعال"}
                  </td>
                  <td className="px-3 py-2">
                    {onRegisterPayment && (
                      <Button size="sm" variant="outline" onClick={() => onRegisterPayment(c)}>
                        ثبت پرداخت
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            قبلی
          </Button>
          <span className="text-xs text-muted-foreground">
            صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            بعدی
          </Button>
        </div>
      )}
    </div>
  );
}

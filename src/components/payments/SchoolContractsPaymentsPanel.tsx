import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { listSchoolContracts, type SchoolContractApi } from "@/api/schoolContractsApi";

function formatTomansFromCents(cents: number): string {
  return Math.round(cents / 10).toLocaleString("fa-IR");
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

  const emptyHint = useMemo(
    () => (search ? "مدرسه‌ای با این جستجو یافت نشد." : "هنوز مدرسه‌ای ثبت نشده است."),
    [search],
  );

  return (
    <div className="space-y-3" dir="rtl">
      <p className="text-xs text-muted-foreground">
        خلاصه مالی قراردادهای مدرسه. برای ثبت قسط، از «ثبت پرداخت» با نوع مدرسه استفاده کنید یا روی
        دکمهٔ همان ردیف بزنید.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[780px] text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right font-medium">مدرسه</th>
              <th className="px-3 py-2 text-right font-medium">تعداد توافق</th>
              <th className="px-3 py-2 text-right font-medium">مبلغ واحد</th>
              <th className="px-3 py-2 text-right font-medium">مبلغ کل</th>
              <th className="px-3 py-2 text-right font-medium">پرداخت‌شده</th>
              <th className="px-3 py-2 text-right font-medium">مانده</th>
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
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{c.school_name}</td>
                <td className="px-3 py-2 number-display">
                  {c.student_count.toLocaleString("fa-IR")}
                </td>
                <td className="px-3 py-2 number-display">{formatTomansFromCents(c.unit_price_cents)}</td>
                <td className="px-3 py-2 number-display">{formatTomansFromCents(c.total_amount_cents)}</td>
                <td className="px-3 py-2 number-display">{formatTomansFromCents(c.paid_total_cents)}</td>
                <td className="px-3 py-2 number-display">
                  {formatTomansFromCents(c.remaining_balance_cents)}
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
            ))}
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

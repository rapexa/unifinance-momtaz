import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface DashboardPaymentItem {
  id: number;
  student_name: string;
  amount_cents: number;
  status: string;
  method: string;
  paid_at: string | null;
  created_at: string;
}

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
  GATEWAY: "درگاه",
  CASH: "نقدی",
  INSTALLMENT: "قسطی",
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
    return d.toLocaleDateString("fa-IR", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return "—";
  }
}

interface RecentPaymentsTableProps {
  payments?: DashboardPaymentItem[];
  isLoading?: boolean;
}

export function RecentPaymentsTable({ payments = [], isLoading }: RecentPaymentsTableProps) {
  return (
    <div className="card-elevated overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between border-b p-4">
        <h3 className="font-bold text-foreground">آخرین پرداخت‌ها</h3>
        <Link to="/payments" className="text-sm font-medium text-primary hover:underline">
          مشاهده همه
        </Link>
      </div>
      {isLoading && (
        <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
      )}
      {!isLoading && payments.length === 0 && (
        <div className="p-6 text-center text-sm text-muted-foreground">پرداختی ثبت نشده است.</div>
      )}
      {!isLoading && payments.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-right text-xs font-semibold text-muted-foreground">دانش‌آموز</th>
                <th className="p-3 text-right text-xs font-semibold text-muted-foreground">مبلغ (تومان)</th>
                <th className="p-3 text-right text-xs font-semibold text-muted-foreground">تاریخ</th>
                <th className="p-3 text-right text-xs font-semibold text-muted-foreground">روش</th>
                <th className="p-3 text-right text-xs font-semibold text-muted-foreground">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment, index) => (
                <tr
                  key={payment.id}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {(payment.student_name || "—").charAt(0)}
                      </div>
                      <span className="font-medium text-foreground">{payment.student_name || "—"}</span>
                    </div>
                  </td>
                  <td className="p-3 number-display text-foreground">
                    {formatCentsToToman(payment.amount_cents)}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {formatDate(payment.paid_at || payment.created_at)}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {methodLabels[payment.method] ?? payment.method}
                  </td>
                  <td className="p-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                        statusStyles[payment.status] ?? "bg-muted"
                      )}
                    >
                      {statusLabels[payment.status] ?? payment.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

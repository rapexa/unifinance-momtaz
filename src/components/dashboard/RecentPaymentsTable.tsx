import { cn } from "@/lib/utils";

interface Payment {
  id: string;
  student: string;
  amount: string;
  date: string;
  status: "paid" | "pending" | "debt";
  method: string;
}

const mockPayments: Payment[] = [
  { id: "1", student: "علی احمدی", amount: "۲,۵۰۰,۰۰۰", date: "۱۴۰۳/۰۹/۱۵", status: "paid", method: "کارت به کارت" },
  { id: "2", student: "مریم رضایی", amount: "۱,۸۰۰,۰۰۰", date: "۱۴۰۳/۰۹/۱۴", status: "pending", method: "درگاه" },
  { id: "3", student: "محمد حسینی", amount: "۳,۲۰۰,۰۰۰", date: "۱۴۰۳/۰۹/۱۳", status: "paid", method: "نقدی" },
  { id: "4", student: "زهرا کریمی", amount: "۹۵۰,۰۰۰", date: "۱۴۰۳/۰۹/۱۲", status: "debt", method: "قسطی" },
  { id: "5", student: "امیر محمدی", amount: "۲,۱۰۰,۰۰۰", date: "۱۴۰۳/۰۹/۱۱", status: "paid", method: "درگاه" },
];

const statusLabels = {
  paid: "پرداخت شده",
  pending: "در انتظار",
  debt: "بدهکار",
};

const statusStyles = {
  paid: "status-paid",
  pending: "status-pending",
  debt: "status-debt",
};

export function RecentPaymentsTable() {
  return (
    <div className="card-elevated overflow-hidden animate-fade-in">
      <div className="flex items-center justify-between border-b p-4">
        <h3 className="font-bold text-foreground">آخرین پرداخت‌ها</h3>
        <button className="text-sm font-medium text-primary hover:underline">
          مشاهده همه
        </button>
      </div>
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
            {mockPayments.map((payment, index) => (
              <tr
                key={payment.id}
                className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {payment.student.charAt(0)}
                    </div>
                    <span className="font-medium text-foreground">{payment.student}</span>
                  </div>
                </td>
                <td className="p-3 number-display text-foreground">{payment.amount}</td>
                <td className="p-3 text-muted-foreground">{payment.date}</td>
                <td className="p-3 text-muted-foreground">{payment.method}</td>
                <td className="p-3">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      statusStyles[payment.status]
                    )}
                  >
                    {statusLabels[payment.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DebtAlertItem {
  student_id: number;
  student_name: string;
  amount_cents: number;
  days_overdue: number;
}

function formatCentsToToman(cents: number): string {
  const tomans = Math.floor(cents / 10);
  return tomans.toLocaleString("fa-IR");
}

interface DebtAlertsProps {
  alerts?: DebtAlertItem[];
  isLoading?: boolean;
}

export function DebtAlerts({ alerts = [], isLoading }: DebtAlertsProps) {
  return (
    <div className="card-elevated overflow-hidden animate-fade-in">
      <div className="flex items-center gap-2 border-b bg-destructive/5 p-4">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <h3 className="font-bold text-foreground">هشدار بدهی‌ها</h3>
        <span className="mr-auto rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
          {alerts.length}
        </span>
      </div>
      {isLoading && (
        <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
      )}
      {!isLoading && alerts.length === 0 && (
        <div className="p-6 text-center text-sm text-muted-foreground">هشدار بدهی‌ای وجود ندارد.</div>
      )}
      {!isLoading && alerts.length > 0 && (
        <div className="divide-y">
          {alerts.map((alert) => (
            <div
              key={`${alert.student_id}-${alert.amount_cents}`}
              className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                  <span className="text-sm font-bold text-destructive">
                    {(alert.student_name || "—").charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-foreground">{alert.student_name || "—"}</p>
                  <p className="text-sm text-muted-foreground">
                    {alert.days_overdue} روز تأخیر
                  </p>
                </div>
              </div>
              <div className="text-left">
                <p className="font-bold number-display text-destructive">
                  {formatCentsToToman(alert.amount_cents)}
                </p>
                <p className="text-xs text-muted-foreground">تومان</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="border-t p-3">
        <Button variant="ghost" className="w-full justify-between text-primary" asChild>
          <Link to="/reports">
            مشاهده همه بدهی‌ها
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

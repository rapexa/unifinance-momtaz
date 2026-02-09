import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DebtAlert {
  id: string;
  student: string;
  amount: string;
  daysOverdue: number;
}

const mockAlerts: DebtAlert[] = [
  { id: "1", student: "زهرا کریمی", amount: "۹۵۰,۰۰۰", daysOverdue: 15 },
  { id: "2", student: "رضا نوری", amount: "۱,۲۰۰,۰۰۰", daysOverdue: 8 },
  { id: "3", student: "فاطمه علوی", amount: "۲,۸۰۰,۰۰۰", daysOverdue: 3 },
];

export function DebtAlerts() {
  return (
    <div className="card-elevated overflow-hidden animate-fade-in">
      <div className="flex items-center gap-2 border-b bg-destructive/5 p-4">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <h3 className="font-bold text-foreground">هشدار بدهی‌ها</h3>
        <span className="mr-auto rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
          {mockAlerts.length}
        </span>
      </div>
      <div className="divide-y">
        {mockAlerts.map((alert) => (
          <div key={alert.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <span className="text-sm font-bold text-destructive">{alert.student.charAt(0)}</span>
              </div>
              <div>
                <p className="font-medium text-foreground">{alert.student}</p>
                <p className="text-sm text-muted-foreground">
                  {alert.daysOverdue} روز تأخیر
                </p>
              </div>
            </div>
            <div className="text-left">
              <p className="font-bold number-display text-destructive">{alert.amount}</p>
              <p className="text-xs text-muted-foreground">تومان</p>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t p-3">
        <Button variant="ghost" className="w-full justify-between text-primary">
          مشاهده همه بدهی‌ها
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

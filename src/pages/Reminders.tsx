import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Search,
  Bell,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Reminder {
  id: string;
  student: string;
  type: "before" | "due" | "overdue";
  daysOffset: number;
  amount: string;
  lastSent: string | null;
  status: "sent" | "pending" | "failed";
  channel: "telegram" | "sms";
}

const mockReminders: Reminder[] = [
  { id: "1", student: "علی احمدی", type: "before", daysOffset: 3, amount: "۲,۵۰۰,۰۰۰", lastSent: "۱۴۰۳/۰۹/۱۲", status: "sent", channel: "telegram" },
  { id: "2", student: "مریم رضایی", type: "due", daysOffset: 0, amount: "۱,۸۰۰,۰۰۰", lastSent: null, status: "pending", channel: "telegram" },
  { id: "3", student: "زهرا کریمی", type: "overdue", daysOffset: 15, amount: "۹۵۰,۰۰۰", lastSent: "۱۴۰۳/۰۹/۰۵", status: "sent", channel: "telegram" },
  { id: "4", student: "فاطمه علوی", type: "overdue", daysOffset: 3, amount: "۲,۸۰۰,۰۰۰", lastSent: "۱۴۰۳/۰۹/۱۰", status: "failed", channel: "sms" },
];

const typeLabels = {
  before: "قبل از سررسید",
  due: "روز سررسید",
  overdue: "پس از تأخیر",
};

const typeColors = {
  before: "bg-success/10 text-success",
  due: "bg-warning/10 text-warning",
  overdue: "bg-destructive/10 text-destructive",
};

const statusIcons = {
  sent: CheckCircle,
  pending: Clock,
  failed: XCircle,
};

const statusColors = {
  sent: "text-success",
  pending: "text-warning",
  failed: "text-destructive",
};

const Reminders = () => {
  return (
    <MainLayout title="یادآوری‌ها" subtitle="مدیریت یادآوری و ارسال لینک پرداخت">
      {/* Settings Card */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card-elevated p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-success/10 p-3">
                <Bell className="h-5 w-5 text-success" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">۳ روز قبل</h3>
                <p className="text-sm text-muted-foreground">ارسال یادآور</p>
              </div>
            </div>
            <Switch defaultChecked />
          </div>
          <p className="text-xs text-muted-foreground">ارسال لینک پرداخت ۳ روز قبل از سررسید</p>
        </div>

        <div className="card-elevated p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-warning/10 p-3">
                <Calendar className="h-5 w-5 text-warning" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">روز سررسید</h3>
                <p className="text-sm text-muted-foreground">ارسال یادآور</p>
              </div>
            </div>
            <Switch defaultChecked />
          </div>
          <p className="text-xs text-muted-foreground">ارسال لینک پرداخت در روز سررسید</p>
        </div>

        <div className="card-elevated p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-destructive/10 p-3">
                <Clock className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">پس از تأخیر</h3>
                <p className="text-sm text-muted-foreground">ارسال یادآور</p>
              </div>
            </div>
            <Switch defaultChecked />
          </div>
          <p className="text-xs text-muted-foreground">ارسال یادآور در صورت عدم پرداخت</p>
        </div>
      </div>

      {/* Actions */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="جستجو..." className="pr-9" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Send className="ml-2 h-4 w-4" />
            ارسال گروهی
          </Button>
          <Button size="sm">
            <Plus className="ml-2 h-4 w-4" />
            یادآور جدید
          </Button>
        </div>
      </div>

      {/* Reminders Table */}
      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">دانش‌آموز</th>
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">نوع</th>
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">مبلغ</th>
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">آخرین ارسال</th>
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">کانال</th>
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">وضعیت</th>
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {mockReminders.map((reminder) => {
                const StatusIcon = statusIcons[reminder.status];
                return (
                  <tr key={reminder.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {reminder.student.charAt(0)}
                        </div>
                        <span className="font-medium text-foreground">{reminder.student}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", typeColors[reminder.type])}>
                        {typeLabels[reminder.type]}
                        {reminder.type !== "due" && ` (${reminder.daysOffset} روز)`}
                      </span>
                    </td>
                    <td className="p-4 font-bold number-display text-foreground">{reminder.amount}</td>
                    <td className="p-4 text-muted-foreground">{reminder.lastSent || "-"}</td>
                    <td className="p-4">
                      <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                        {reminder.channel === "telegram" ? "تلگرام" : "پیامک"}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className={cn("flex items-center gap-1.5", statusColors[reminder.status])}>
                        <StatusIcon className="h-4 w-4" />
                        <span className="text-sm">
                          {reminder.status === "sent" ? "ارسال شده" : reminder.status === "pending" ? "در صف" : "ناموفق"}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="ارسال مجدد">
                          <Send className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
};

export default Reminders;

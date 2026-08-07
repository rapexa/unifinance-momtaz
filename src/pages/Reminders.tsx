import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bell, Clock, Search, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  listReminderLogs,
  listReminderRules,
  runRemindersNow,
  type ReminderLogApi,
  type ReminderRuleApi,
} from "@/api/remindersApi";
import { formatIsoDateShamsi } from "@/lib/jalaliDate";

const typeLabels: Record<string, string> = {
  BEFORE_DUE: "قبل از سررسید",
  DUE_DAY: "روز سررسید",
  OVERDUE: "پس از تأخیر",
};
const typeColors: Record<string, string> = {
  BEFORE_DUE: "bg-success/10 text-success",
  DUE_DAY: "bg-warning/10 text-warning",
  OVERDUE: "bg-destructive/10 text-destructive",
};
const statusLabel: Record<string, string> = {
  SENT: "ارسال شده",
  PENDING: "در صف",
  FAILED: "ناموفق",
};
const statusColor: Record<string, string> = {
  SENT: "text-success",
  PENDING: "text-warning",
  FAILED: "text-destructive",
};

function formatCentsToToman(cents: number): string {
  return Math.floor((cents || 0) / 10).toLocaleString("fa-IR");
}

function ruleIcon(type: string) {
  if (type === "OVERDUE") return Clock;
  return Bell;
}

function ruleDesc(rule: ReminderRuleApi): string {
  if (rule.type === "BEFORE_DUE") {
    return `ارسال یادآوری ${rule.days_offset.toLocaleString("fa-IR")} روز قبل از تاریخ پرداخت دانش‌آموز`;
  }
  if (rule.type === "OVERDUE") {
    return "یک‌بار، دقیقاً ۲ روز پس از سررسید معوق (بدون تکرار روزانه)";
  }
  return rule.label;
}

export default function Reminders() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: rules = [] } = useQuery<ReminderRuleApi[]>({
    queryKey: ["reminder-rules"],
    queryFn: listReminderRules,
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery<ReminderLogApi[]>({
    queryKey: ["reminder-logs", search],
    queryFn: () => listReminderLogs(search || undefined),
  });

  const runMutation = useMutation({
    mutationFn: runRemindersNow,
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ["reminder-logs"] });
      toast({
        title: "اجرای یادآوری‌ها",
        description: n > 0 ? `${n.toLocaleString("fa-IR")} مورد ثبت شد.` : "مورد جدیدی برای ارسال نبود.",
      });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "خطا", description: err.message });
    },
  });

  return (
    <MainLayout title="یادآوری‌ها" subtitle="قوانین و لاگ یادآوری پرداخت دانش‌آموزان">
      <div className="space-y-6 text-right" dir="rtl">
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          یادآوری فقط برای پرداخت‌های دانش‌آموز دارای تاریخ سررسید نمایش داده می‌شود.
        </div>

        {/* Student rules */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold">قوانین دانش‌آموز</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(rules.length
              ? rules
              : ([
                  { type: "BEFORE_DUE", days_offset: 7, body_id: 0, label: "۷ روز قبل از سررسید" },
                  { type: "BEFORE_DUE", days_offset: 3, body_id: 0, label: "۳ روز قبل از سررسید" },
                  { type: "BEFORE_DUE", days_offset: 1, body_id: 0, label: "۱ روز قبل از سررسید" },
                  { type: "OVERDUE", days_offset: 2, body_id: 0, label: "۲ روز بعد از سررسید (یک‌بار)" },
                ] as ReminderRuleApi[])
            ).map((r) => {
              const Icon = ruleIcon(r.type);
              return (
                <div key={`${r.type}-${r.days_offset}`} className="card-elevated flex items-start gap-3 p-4">
                  <div className="mt-0.5 rounded-xl bg-primary/10 p-2.5">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground">{r.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{ruleDesc(r)}</p>
                    <p className="mt-1.5 text-xs text-blue-600 dark:text-blue-400">
                      پیامک به دانش‌آموز + پدر + مادر
                      {r.body_id <= 0 ? " · الگوی پنل هنوز ثبت نشده" : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Student logs */}
        <section className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold">لاگ یادآوری دانش‌آموز</h2>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-md">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="جستجوی دانش‌آموز..."
                  className="pr-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                className="w-full gap-2 sm:w-auto"
                onClick={() => runMutation.mutate()}
                disabled={runMutation.isPending}
              >
                <Send className="h-4 w-4" />
                {runMutation.isPending ? "در حال ارسال..." : "ارسال الان"}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:hidden">
            {logsLoading ? (
              <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>
            ) : logs.length === 0 ? (
              <p className="card-elevated p-4 text-sm text-muted-foreground">موردی برای نمایش وجود ندارد.</p>
            ) : (
              logs.map((row) => (
                <div key={row.id} className="card-elevated p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{row.student || "—"}</p>
                    <span className={cn("text-xs", statusColor[row.status])}>{statusLabel[row.status]}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {typeLabels[row.type] ?? row.type}{" "}
                    {row.type !== "DUE_DAY" ? `(${row.days_offset.toLocaleString("fa-IR")} روز)` : ""}
                  </p>
                  <p className="mt-1 text-sm">مبلغ: {formatCentsToToman(row.amount_cents)} تومان</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatIsoDateShamsi(row.last_sent)}</p>
                </div>
              ))
            )}
          </div>

          <div className="card-elevated hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-right text-xs font-semibold text-muted-foreground">دانش‌آموز</th>
                  <th className="p-3 text-right text-xs font-semibold text-muted-foreground">نوع یادآوری</th>
                  <th className="p-3 text-right text-xs font-semibold text-muted-foreground">مبلغ</th>
                  <th className="p-3 text-right text-xs font-semibold text-muted-foreground">زمان ارسال</th>
                  <th className="p-3 text-right text-xs font-semibold text-muted-foreground">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                      موردی برای نمایش وجود ندارد.
                    </td>
                  </tr>
                ) : (
                  logs.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="p-3">{row.student || "—"}</td>
                      <td className="p-3">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs", typeColors[row.type])}>
                          {typeLabels[row.type] ?? row.type}{" "}
                          {row.type !== "DUE_DAY"
                            ? `(${row.days_offset.toLocaleString("fa-IR")} روز)`
                            : ""}
                        </span>
                      </td>
                      <td className="p-3 number-display">{formatCentsToToman(row.amount_cents)} تومان</td>
                      <td className="p-3 text-muted-foreground">{formatIsoDateShamsi(row.last_sent)}</td>
                      <td className={cn("p-3", statusColor[row.status])}>{statusLabel[row.status]}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}

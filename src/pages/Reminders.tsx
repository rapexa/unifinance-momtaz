import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bell, Clock, Search, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { listReminderLogs, runRemindersNow, type ReminderLogApi } from "@/api/remindersApi";
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
const statusLabel: Record<string, string> = { SENT: "ارسال شده", PENDING: "در صف", FAILED: "ناموفق" };
const statusColor: Record<string, string> = { SENT: "text-success", PENDING: "text-warning", FAILED: "text-destructive" };

function formatCentsToToman(cents: number): string {
  return Math.floor((cents || 0) / 10).toLocaleString("fa-IR");
}

// Hard-coded display of the 3 fixed rules (mirrors backend HardCodedRules).
const HARD_RULES = [
  { icon: Bell,  label: "۳ روز قبل از سررسید", desc: "ارسال یادآوری ۳ روز قبل از تاریخ پرداخت" },
  { icon: Bell,  label: "۱ روز قبل از سررسید", desc: "ارسال یادآوری ۱ روز قبل از تاریخ پرداخت" },
  { icon: Clock, label: "۲ روز بعد از سررسید", desc: "ارسال یادآوری پس از گذشت ۲ روز از سررسید معوق" },
] as const;

export default function Reminders() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: logs = [], isLoading: logsLoading } = useQuery<ReminderLogApi[]>({
    queryKey: ["reminder-logs", search],
    queryFn: () => listReminderLogs(search || undefined),
  });

  const runMutation = useMutation({
    mutationFn: runRemindersNow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminder-logs"] }),
  });

  return (
    <MainLayout title="یادآوری‌ها" subtitle="مدیریت قوانین یادآوری و ارسال خودکار">
      {/* Fixed rules info cards */}
      <div className="mb-4 grid gap-3 sm:mb-6 sm:grid-cols-3">
        {HARD_RULES.map((r) => {
          const Icon = r.icon;
          return (
            <div key={r.label} className="card-elevated flex items-start gap-3 p-4 sm:p-5">
              <div className="rounded-xl bg-primary/10 p-2.5 mt-0.5">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-bold text-foreground">{r.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.desc}</p>
                <p className="mt-1.5 text-xs text-blue-600 dark:text-blue-400">پیامک به دانش‌آموز + پدر + مادر</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search + Run Now */}
      <div className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
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

      {/* Log – mobile cards */}
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
                {typeLabels[row.type]} {row.type !== "DUE_DAY" ? `(${row.days_offset} روز)` : ""}
              </p>
              <p className="mt-1 text-sm">مبلغ: {formatCentsToToman(row.amount_cents)} تومان</p>
            </div>
          ))
        )}
      </div>

      {/* Log – desktop table */}
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
                      {typeLabels[row.type]} {row.type !== "DUE_DAY" ? `(${row.days_offset} روز)` : ""}
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
    </MainLayout>
  );
}

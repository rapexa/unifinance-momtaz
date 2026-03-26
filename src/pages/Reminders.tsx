import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Bell, Calendar, Clock, Search, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { listReminderLogs, listReminderRules, runRemindersNow, saveReminderRules, type ReminderRuleApi } from "@/api/remindersApi";
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
const channelLabel: Record<string, string> = { TELEGRAM: "تلگرام", SMS: "پیامک" };
const statusLabel: Record<string, string> = { SENT: "ارسال شده", PENDING: "در صف", FAILED: "ناموفق" };
const statusColor: Record<string, string> = { SENT: "text-success", PENDING: "text-warning", FAILED: "text-destructive" };

function formatCentsToToman(cents: number): string {
  return Math.floor((cents || 0) / 10).toLocaleString("fa-IR");
}

export default function Reminders() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [localRules, setLocalRules] = useState<ReminderRuleApi[]>([]);

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ["reminder-rules"],
    queryFn: listReminderRules,
  });
  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["reminder-logs", search],
    queryFn: () => listReminderLogs(search || undefined),
  });

  const saveRulesMutation = useMutation({
    mutationFn: (rows: ReminderRuleApi[]) =>
      saveReminderRules(rows.map((r) => ({ type: r.type, days_offset: r.days_offset, channel: r.channel, enabled: r.enabled }))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminder-rules"] }),
  });
  const runMutation = useMutation({
    mutationFn: runRemindersNow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reminder-logs"] }),
  });

  const editableRules = useMemo(() => (localRules.length ? localRules : rules), [localRules, rules]);

  const toggleRule = (rule: ReminderRuleApi, enabled: boolean) => {
    setLocalRules((prev) => {
      const base = prev.length ? prev : rules;
      return base.map((r) => (r.id === rule.id ? { ...r, enabled } : r));
    });
  };

  return (
    <MainLayout title="یادآوری‌ها" subtitle="مدیریت قوانین یادآوری و ارسال خودکار">
      <div className="mb-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs sm:text-sm text-foreground">
        <span className="font-semibold">TODO پیامک واقعی:</span>{" "}
        اتصال Provider پیامک/تلگرام هنوز انجام نشده و فعلاً ارسال‌ها در سیستم به‌صورت داخلی ثبت می‌شوند.
      </div>

      <div className="mb-4 grid gap-3 sm:mb-6 lg:grid-cols-3">
        {[
          { type: "BEFORE_DUE", icon: Bell, note: "ارسال لینک پرداخت قبل از سررسید" },
          { type: "DUE_DAY", icon: Calendar, note: "ارسال در روز سررسید" },
          { type: "OVERDUE", icon: Clock, note: "ارسال بعد از سررسید" },
        ].map((cfg) => {
          const r = editableRules.find((x) => x.type === cfg.type && x.channel === "TELEGRAM") || null;
          const Icon = cfg.icon;
          return (
            <div key={cfg.type} className="card-elevated p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-primary/10 p-2.5">
                    <Icon className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{typeLabels[cfg.type]}</h3>
                    <p className="text-xs text-muted-foreground">{r ? `${r.days_offset} روز` : "—"}</p>
                  </div>
                </div>
                <Switch checked={!!r?.enabled} disabled={!r || rulesLoading} onCheckedChange={(v) => r && toggleRule(r, v)} />
              </div>
              <p className="text-xs text-muted-foreground">{cfg.note}</p>
            </div>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="جستجوی دانش‌آموز..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button className="flex-1 sm:flex-none" variant="outline" disabled={saveRulesMutation.isPending || !localRules.length} onClick={() => saveRulesMutation.mutate(editableRules)}>
            ذخیره قوانین
          </Button>
          <Button className="flex-1 gap-2 sm:flex-none" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
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
                {typeLabels[row.type]} | {channelLabel[row.channel]}
              </p>
              <p className="mt-1 text-sm">مبلغ: {formatCentsToToman(row.amount_cents)} تومان</p>
            </div>
          ))
        )}
      </div>

      <div className="card-elevated hidden overflow-x-auto md:block">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">دانش‌آموز</th>
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">نوع</th>
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">مبلغ</th>
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">آخرین ارسال</th>
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">کانال</th>
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                  موردی برای نمایش وجود ندارد.
                </td>
              </tr>
            ) : logs.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="p-3">{row.student || "—"}</td>
                <td className="p-3">
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs", typeColors[row.type])}>
                    {typeLabels[row.type]} {row.type !== "DUE_DAY" ? `(${row.days_offset} روز)` : ""}
                  </span>
                </td>
                <td className="p-3 number-display">{formatCentsToToman(row.amount_cents)} تومان</td>
                <td className="p-3 text-muted-foreground">{formatIsoDateShamsi(row.last_sent)}</td>
                <td className="p-3">{channelLabel[row.channel]}</td>
                <td className={cn("p-3", statusColor[row.status])}>{statusLabel[row.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MainLayout>
  );
}

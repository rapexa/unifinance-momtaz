import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, CalendarClock, Clock, MessageSquare, Search, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  listDebtors,
  listMessageTemplates,
  listReminderLogs,
  previewReminder,
  runRemindersNow,
  sendReminders,
  updateMessageTemplate,
  type DebtorApi,
  type MessageTemplateApi,
  type ReminderLogApi,
} from "@/api/remindersApi";
import { formatIsoDateShamsi, formatIsoDateTimeShamsi } from "@/lib/jalaliDate";

function toman(cents: number): string {
  return Math.floor(Math.abs(cents || 0) / 10).toLocaleString("fa-IR");
}

type Bucket = "all" | "overdue" | "overdue30" | "due1" | "due7" | "due30";

const BUCKETS: { key: Bucket; label: string; hint: string }[] = [
  { key: "overdue", label: "سررسید گذشته", hint: "بدهی معوق" },
  { key: "overdue30", label: "بیش از ۳۰ روز معوق", hint: "پیگیری جدی" },
  { key: "due1", label: "سررسید تا ۱ روز", hint: "امروز و فردا" },
  { key: "due7", label: "سررسید تا ۷ روز", hint: "هفته پیش رو" },
  { key: "due30", label: "سررسید تا ۳۰ روز", hint: "ماه پیش رو" },
];

function inBucket(d: DebtorApi, b: Bucket): boolean {
  switch (b) {
    case "overdue":
      return d.overdue_cents > 0;
    case "overdue30":
      return d.overdue_cents > 0 && d.days_overdue > 30;
    case "due1":
      return !!d.next_due_date && d.days_until_due <= 1;
    case "due7":
      return !!d.next_due_date && d.days_until_due <= 7;
    case "due30":
      return !!d.next_due_date && d.days_until_due <= 30;
    default:
      return true;
  }
}

/** Amount relevant to a bucket: overdue debt, or the next installment. */
function bucketAmount(d: DebtorApi, b: Bucket): number {
  return b.startsWith("due") ? d.next_due_cents : d.overdue_cents;
}

const TEMPLATE_LABELS: Record<string, string> = {
  BEFORE_DUE_7: "۷ روز مانده",
  BEFORE_DUE_3: "۳ روز مانده",
  BEFORE_DUE_1: "۱ روز مانده",
  OVERDUE_2: "۲ روز معوق",
  OVERDUE_30: "۳۰ روز معوق",
  MANUAL: "دستی",
};

const statusLabel: Record<string, string> = { SENT: "ارسال شده", PENDING: "در صف", FAILED: "ناموفق" };
const statusColor: Record<string, string> = {
  SENT: "text-success",
  PENDING: "text-warning",
  FAILED: "text-destructive",
};

const SAMPLE_VARS: Record<string, string> = {
  "{نام}": "علی محمدی",
  "{مبلغ}": "۲٬۵۰۰٬۰۰۰",
  "{تاریخ}": "۱۴۰۵/۰۷/۲۰",
  "{روز}": "۳",
  "{مرکز}": "نام مجموعه شما",
};

function renderSample(body: string): string {
  return Object.entries(SAMPLE_VARS).reduce((s, [k, v]) => s.split(k).join(v), body);
}

export default function Reminders() {
  const { profile } = useCurrentUser();
  const isAdmin = profile?.full_access === true;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("debtors");

  const { data: templatesData } = useQuery({
    queryKey: ["reminder-templates"],
    queryFn: listMessageTemplates,
  });

  const runMutation = useMutation({
    mutationFn: runRemindersNow,
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ["reminder-logs"] });
      queryClient.invalidateQueries({ queryKey: ["reminder-debtors"] });
      toast({
        title: "اجرای یادآوری‌های خودکار",
        description: n > 0 ? `${n.toLocaleString("fa-IR")} پیامک ارسال شد.` : "مورد جدیدی برای ارسال نبود.",
      });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "خطا", description: err.message }),
  });

  return (
    <MainLayout title="یادآوری‌ها" subtitle="بدهکاران، سررسیدها و پیامک یادآوری">
      <div className="space-y-4 text-right" dir="rtl">
        <SmsStatusBanner customText={templatesData?.custom_text} configured={templatesData?.sms_configured} />
        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="debtors">بدهکاران و سررسیدها</TabsTrigger>
              <TabsTrigger value="templates">متن پیامک‌ها</TabsTrigger>
              <TabsTrigger value="logs">لاگ ارسال</TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              title="ارسال یادآوری‌های خودکار امروز (۷، ۳ و ۱ روز قبل و ۲ و ۳۰ روز بعد از سررسید)"
            >
              <Send className="h-4 w-4" />
              {runMutation.isPending ? "در حال اجرا..." : "اجرای یادآوری‌های امروز"}
            </Button>
          </div>
          <TabsContent value="debtors" className="mt-4">
            <DebtorsTab manualTemplate={templatesData?.data.find((t) => t.key === "MANUAL")} />
          </TabsContent>
          <TabsContent value="templates" className="mt-4">
            <TemplatesTab templates={templatesData?.data ?? []} canEdit={isAdmin} />
          </TabsContent>
          <TabsContent value="logs" className="mt-4">
            <LogsTab />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}

function SmsStatusBanner({ customText, configured }: { customText?: boolean; configured?: boolean }) {
  if (configured === undefined) return null;
  if (!configured) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        پنل پیامک (ملی پیامک) روی سرور تنظیم نشده است؛ لیست بدهکاران نمایش داده می‌شود ولی پیامکی ارسال نمی‌شود.
      </div>
    );
  }
  if (!customText) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        شماره خط ارسال (from) در تنظیمات سرور وارد نشده؛ فعلاً الگوهای ثابت ثبت‌شده در پنل ارسال می‌شوند و متن‌های
        ویرایش‌شده اینجا ارسال نمی‌شوند. با تنظیم شماره خط، همین متن‌ها ارسال خواهند شد.
      </div>
    );
  }
  return null;
}

function DebtorsTab({ manualTemplate }: { manualTemplate?: MessageTemplateApi }) {
  const queryClient = useQueryClient();
  const [bucket, setBucket] = useState<Bucket>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sendOpen, setSendOpen] = useState(false);

  const { data: debtors = [], isLoading } = useQuery({
    queryKey: ["reminder-debtors"],
    queryFn: () => listDebtors(30),
  });

  const counts = useMemo(() => {
    const m = {} as Record<Bucket, { n: number; sum: number }>;
    for (const b of BUCKETS) {
      const rows = debtors.filter((d) => inBucket(d, b.key));
      m[b.key] = { n: rows.length, sum: rows.reduce((s, d) => s + bucketAmount(d, b.key), 0) };
    }
    return m;
  }, [debtors]);

  const rows = useMemo(() => {
    const q = search.trim();
    return debtors.filter(
      (d) =>
        inBucket(d, bucket) &&
        (!q || d.name.includes(q) || (d.phone ?? "").includes(q) || (d.advisor_name ?? "").includes(q)),
    );
  }, [debtors, bucket, search]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.student_id));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) rows.forEach((r) => next.delete(r.student_id));
      else rows.forEach((r) => next.add(r.student_id));
      return next;
    });
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedRows = debtors.filter((d) => selected.has(d.student_id));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {BUCKETS.map((b) => {
          const isOverdue = b.key.startsWith("overdue");
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => setBucket((cur) => (cur === b.key ? "all" : b.key))}
              className={cn(
                "card-elevated p-4 text-right transition-colors hover:border-primary/50",
                bucket === b.key && "border-primary ring-1 ring-primary",
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{b.label}</p>
                {isOverdue ? (
                  <Clock className="h-4 w-4 text-destructive" />
                ) : (
                  <CalendarClock className="h-4 w-4 text-amber-600" />
                )}
              </div>
              <p className={cn("mt-1 text-xl font-bold number-display", isOverdue ? "text-destructive" : "text-amber-700 dark:text-amber-400")}>
                {isLoading ? "—" : toman(counts[b.key]?.sum ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">
                {(counts[b.key]?.n ?? 0).toLocaleString("fa-IR")} دانش‌آموز · {b.hint}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="جستجوی نام، موبایل یا مشاور..."
            className="pr-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          {bucket !== "all" && (
            <Button variant="ghost" size="sm" onClick={() => setBucket("all")}>
              نمایش همه
            </Button>
          )}
          <Button className="gap-2" disabled={selected.size === 0} onClick={() => setSendOpen(true)}>
            <MessageSquare className="h-4 w-4" />
            ارسال پیامک {selected.size > 0 ? `(${selected.size.toLocaleString("fa-IR")} نفر)` : ""}
          </Button>
        </div>
      </div>

      <div className="card-elevated overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-10 p-3">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="انتخاب همه" />
              </th>
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">دانش‌آموز</th>
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">مشاور</th>
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">بدهی معوق</th>
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">سررسید بعدی</th>
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">مانده کل</th>
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">آخرین یادآوری</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  در حال بارگذاری...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  دانش‌آموز بدهکار یا سررسید نزدیکی نیست.
                </td>
              </tr>
            ) : (
              rows.map((d) => (
                <tr key={d.student_id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3">
                    <Checkbox
                      checked={selected.has(d.student_id)}
                      onCheckedChange={() => toggle(d.student_id)}
                      aria-label={`انتخاب ${d.name}`}
                    />
                  </td>
                  <td className="p-3">
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {[d.phone, d.father_phone, d.mother_phone].filter(Boolean).join(" · ") || "بدون شماره"}
                    </p>
                  </td>
                  <td className="p-3 text-muted-foreground">{d.advisor_name || "—"}</td>
                  <td className="p-3">
                    {d.overdue_cents > 0 ? (
                      <>
                        <p className="font-bold number-display text-destructive">{toman(d.overdue_cents)}</p>
                        <p className="text-xs text-destructive/80">
                          {d.days_overdue.toLocaleString("fa-IR")} روز گذشته · از {formatIsoDateShamsi(d.oldest_due_date)}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {d.next_due_date ? (
                      <>
                        <p className="font-medium number-display">{toman(d.next_due_cents)}</p>
                        <p
                          className={cn(
                            "text-xs",
                            d.days_until_due <= 1 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                          )}
                        >
                          {formatIsoDateShamsi(d.next_due_date)} ·{" "}
                          {d.days_until_due === 0 ? "امروز" : `${d.days_until_due.toLocaleString("fa-IR")} روز مانده`}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 number-display">{d.total_remaining_cents > 0 ? toman(d.total_remaining_cents) : "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {d.last_reminder_at ? (
                      <>
                        {formatIsoDateShamsi(d.last_reminder_at)}
                        {d.last_reminder ? ` · ${TEMPLATE_LABELS[d.last_reminder] ?? d.last_reminder}` : ""}
                        {d.last_reminder_status === "FAILED" && <span className="block text-destructive">ناموفق</span>}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => {
                        setSelected(new Set([d.student_id]));
                        setSendOpen(true);
                      }}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      پیامک
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        بدهی از روی شهریه ماهانه/اقساط ثبت‌نام (از تاریخ ثبت‌نام، روز ثبت‌نام هر ماه) یا قبوض دارای تاریخ سررسید
        محاسبه می‌شود. پرداخت‌ها به ترتیب قدیمی‌ترین قسط کسر می‌شوند.
      </p>

      <SendDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        recipients={selectedRows}
        defaultText={manualTemplate?.body ?? ""}
        onSent={() => {
          setSelected(new Set());
          queryClient.invalidateQueries({ queryKey: ["reminder-debtors"] });
          queryClient.invalidateQueries({ queryKey: ["reminder-logs"] });
        }}
      />
    </div>
  );
}

function SendDialog({
  open,
  onOpenChange,
  recipients,
  defaultText,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: DebtorApi[];
  defaultText: string;
  onSent: () => void;
}) {
  const [text, setText] = useState(defaultText);
  const [preview, setPreview] = useState("");
  const first = recipients[0];

  useEffect(() => {
    if (open) setText(defaultText);
  }, [open, defaultText]);

  useEffect(() => {
    if (!open || !first) return;
    const t = setTimeout(() => {
      previewReminder({ student_id: first.student_id, text })
        .then(setPreview)
        .catch(() => setPreview(""));
    }, 300);
    return () => clearTimeout(t);
  }, [open, first, text]);

  const mutation = useMutation({
    mutationFn: () => sendReminders({ student_ids: recipients.map((r) => r.student_id), text }),
    onSuccess: (res) => {
      onSent();
      onOpenChange(false);
      const firstError = res.results.find((r) => r.status !== "SENT")?.error;
      toast({
        variant: res.failed > 0 && res.sent === 0 ? "destructive" : undefined,
        title: `${res.sent.toLocaleString("fa-IR")} پیامک ارسال شد`,
        description: res.failed > 0 ? `${res.failed.toLocaleString("fa-IR")} ناموفق${firstError ? `: ${firstError}` : ""}` : undefined,
      });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "خطا در ارسال", description: err.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>ارسال پیامک به {recipients.length.toLocaleString("fa-IR")} دانش‌آموز</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-right">
          <p className="text-xs text-muted-foreground">
            {recipients.slice(0, 6).map((r) => r.name).join("، ")}
            {recipients.length > 6 ? ` و ${(recipients.length - 6).toLocaleString("fa-IR")} نفر دیگر` : ""} — به شماره
            دانش‌آموز و والدین ارسال می‌شود.
          </p>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">متن پیامک</label>
            <Textarea dir="rtl" value={text} onChange={(e) => setText(e.target.value)} rows={5} />
            <p className="text-[11px] text-muted-foreground">
              متغیرها برای هر نفر جایگزین می‌شوند: {"{نام}"} {"{مبلغ}"} {"{تاریخ}"} {"{روز}"} {"{مرکز}"}
            </p>
          </div>
          {preview && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-line">
              <p className="mb-1 text-[11px] text-muted-foreground">پیش‌نمایش برای {first?.name}:</p>
              {preview}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || recipients.length === 0 || !text.trim()}>
            {mutation.isPending ? "در حال ارسال..." : "ارسال"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplatesTab({ templates, canEdit }: { templates: MessageTemplateApi[]; canEdit: boolean }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        یادآوری‌های خودکار در روز مشخص‌شده برای دانش‌آموز و والدین ارسال می‌شوند (هر یادآوری یک‌بار برای هر سررسید).
        متغیرها: {"{نام}"} نام دانش‌آموز، {"{مبلغ}"} مبلغ به تومان، {"{تاریخ}"} تاریخ سررسید، {"{روز}"} تعداد روز،{" "}
        {"{مرکز}"} نام مرکز.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {templates.map((t) => (
          <TemplateCard key={t.key} template={t} canEdit={canEdit} />
        ))}
      </div>
    </div>
  );
}

function TemplateCard({ template, canEdit }: { template: MessageTemplateApi; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState(template.body);
  const [enabled, setEnabled] = useState(template.enabled);
  const dirty = body !== template.body || enabled !== template.enabled;

  const mutation = useMutation({
    mutationFn: () => updateMessageTemplate(template.key, { body, enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminder-templates"] });
      toast({ title: "متن پیامک ذخیره شد" });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "خطا", description: err.message }),
  });

  return (
    <div className="card-elevated space-y-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold">{template.title}</p>
        {template.type !== "MANUAL" && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            ارسال خودکار
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canEdit} />
          </label>
        )}
      </div>
      <Textarea dir="rtl" value={body} onChange={(e) => setBody(e.target.value)} rows={4} disabled={!canEdit} />
      <div className="rounded-lg bg-muted/30 p-2 text-xs whitespace-pre-line text-muted-foreground">
        <span className="font-medium text-foreground">نمونه: </span>
        {renderSample(body)}
      </div>
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" disabled={!dirty || mutation.isPending || !body.trim()} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "در حال ذخیره..." : "ذخیره"}
          </Button>
        </div>
      )}
    </div>
  );
}

function LogsTab() {
  const [search, setSearch] = useState("");
  const { data: logs = [], isLoading } = useQuery<ReminderLogApi[]>({
    queryKey: ["reminder-logs", search],
    queryFn: () => listReminderLogs(search || undefined),
  });
  return (
    <div className="space-y-3">
      <div className="relative w-full sm:max-w-md">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="جستجوی دانش‌آموز..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="card-elevated overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">دانش‌آموز</th>
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">یادآوری</th>
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">مبلغ</th>
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">متن</th>
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">زمان</th>
              <th className="p-3 text-right text-xs font-semibold text-muted-foreground">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  در حال بارگذاری...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  موردی برای نمایش وجود ندارد.
                </td>
              </tr>
            ) : (
              logs.map((row) => (
                <tr key={row.id} className="border-b last:border-0 align-top">
                  <td className="p-3">{row.student || "—"}</td>
                  <td className="p-3 text-xs">
                    {row.template_key
                      ? TEMPLATE_LABELS[row.template_key] ?? row.template_key
                      : `${row.type === "OVERDUE" ? "معوق" : "قبل از سررسید"} (${row.days_offset.toLocaleString("fa-IR")} روز)`}
                    {row.due_date && (
                      <p className="text-muted-foreground">سررسید {formatIsoDateShamsi(row.due_date)}</p>
                    )}
                  </td>
                  <td className="p-3 number-display">{toman(row.amount_cents)}</td>
                  <td className="max-w-xs p-3 text-xs text-muted-foreground whitespace-pre-line">
                    {row.message || (row.status === "SENT" ? "الگوی ثابت پنل" : "—")}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{formatIsoDateTimeShamsi(row.last_sent)}</td>
                  <td className={cn("p-3 text-xs", statusColor[row.status])}>
                    {statusLabel[row.status] ?? row.status}
                    {row.error && <p className="text-[11px] text-destructive/80">{row.error}</p>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

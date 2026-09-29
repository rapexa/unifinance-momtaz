import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Phone, Trash2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { deleteLead, LEAD_STATUS_LABELS, listLeads, updateLead, type LeadApi, type LeadStatus } from "@/api/leadsApi";
import { SAAS_PLANS } from "@/config/saas";
import { formatIsoDateTimeShamsi, toPersianDigits } from "@/lib/jalaliDate";
import { cn } from "@/lib/utils";

const STATUS_CLS: Record<LeadStatus, string> = {
  NEW: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  CONTACTED: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  DEMO: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  WON: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  LOST: "bg-muted text-muted-foreground",
};

const HOSTING: Record<string, string> = { CLOUD: "ابری", ONPREM: "سرور خودشان", UNSURE: "نامشخص" };

function planName(code?: string) {
  return SAAS_PLANS.find((p) => p.code === code)?.name ?? code ?? "—";
}

function LeadRow({ lead }: { lead: LeadApi }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState(lead.note ?? "");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["leads"] });
  const onError = (e: Error) => toast({ variant: "destructive", title: "خطا", description: e.message });
  const save = useMutation({ mutationFn: (p: { status?: LeadStatus; note?: string }) => updateLead(lead.id, p), onSuccess: refresh, onError });
  const remove = useMutation({ mutationFn: () => deleteLead(lead.id), onSuccess: refresh, onError });

  return (
    <div className="card-elevated space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold">
            {lead.name}
            {lead.organization && <span className="mr-2 text-sm font-normal text-muted-foreground">— {lead.organization}</span>}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 font-bold text-primary" dir="ltr">
              <Phone className="h-3.5 w-3.5" />
              {toPersianDigits(lead.phone)}
            </a>
            {lead.city && <span>{lead.city}</span>}
            <span>{formatIsoDateTimeShamsi(lead.created_at)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={lead.status} onValueChange={(v) => save.mutate({ status: v as LeadStatus })}>
            <SelectTrigger className={cn("h-8 w-[150px] border-0 text-xs font-bold", STATUS_CLS[lead.status])}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {LEAD_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            title="حذف"
            onClick={() => window.confirm(`درخواست «${lead.name}» حذف شود؟`) && remove.mutate()}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-muted px-2.5 py-1">پلن: {planName(lead.plan)}</span>
        <span className="rounded-full bg-muted px-2.5 py-1">نصب: {HOSTING[lead.hosting ?? ""] ?? "—"}</span>
        {lead.students_range && <span className="rounded-full bg-muted px-2.5 py-1">دانش‌آموز: {lead.students_range}</span>}
      </div>
      {lead.message && <p className="rounded-lg bg-muted/40 p-3 text-sm leading-7">{lead.message}</p>}
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (lead.note ?? "") && save.mutate({ note })}
        placeholder="یادداشت پیگیری (خودکار ذخیره می‌شود)"
        rows={2}
        className="text-sm"
      />
    </div>
  );
}

/** Vendor inbox for demo requests from the sales page. */
const Leads = () => {
  const [status, setStatus] = useState("");
  const { data = [], isLoading, isError, error } = useQuery({
    queryKey: ["leads", status],
    queryFn: () => listLeads(status || undefined),
  });
  return (
    <MainLayout title="درخواست‌های دمو" subtitle="درخواست‌های ثبت‌شده از صفحه فروش">
      <div dir="rtl" className="space-y-4 text-right">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Inbox className="h-4 w-4" />
            {toPersianDigits(String(data.length))} درخواست
          </p>
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه وضعیت‌ها</SelectItem>
              {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {LEAD_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isLoading && <p className="py-10 text-center text-muted-foreground">در حال بارگذاری...</p>}
        {isError && <p className="py-10 text-center text-destructive">{(error as Error).message}</p>}
        {!isLoading && !isError && data.length === 0 && (
          <p className="py-10 text-center text-muted-foreground">هنوز درخواستی ثبت نشده است.</p>
        )}
        <div className="grid gap-3 xl:grid-cols-2">
          {data.map((l) => (
            <LeadRow key={`${l.id}-${l.updated_at}`} lead={l} />
          ))}
        </div>
      </div>
    </MainLayout>
  );
};

export default Leads;

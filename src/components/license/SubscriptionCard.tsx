import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, KeyRound, Lock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { getLicense, planLabel, updateLicense, type LicenseStatusApi } from "@/api/licenseApi";
import { formatIsoDateShamsi, toPersianDigits } from "@/lib/jalaliDate";
import { cn } from "@/lib/utils";

const STATE_LABEL: Record<string, { text: string; cls: string }> = {
  VALID: { text: "فعال", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400" },
  GRACE: { text: "مهلت تمدید", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" },
  EXPIRED: { text: "منقضی (فقط‌خواندنی)", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
  MISSING: { text: "ثبت نشده (فقط‌خواندنی)", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
  INVALID: { text: "نامعتبر (فقط‌خواندنی)", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" },
};

function Usage({ label, used, max }: { label: string; used: number; max?: number }) {
  const unlimited = !max;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / max) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-bold number-display">
          {toPersianDigits(String(used))} / {unlimited ? "نامحدود" : toPersianDigits(String(max))}
        </span>
      </div>
      {!unlimited && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", pct >= 90 ? "bg-red-500" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

/** Subscription details and renewal-key input (settings page, admins). */
export function SubscriptionCard() {
  const queryClient = useQueryClient();
  const [key, setKey] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["license"], queryFn: getLicense, retry: false });
  const mutation = useMutation({
    mutationFn: () => updateLicense(key.trim()),
    onSuccess: (st: LicenseStatusApi) => {
      queryClient.setQueryData(["license"], st);
      setKey("");
      toast({ title: "لایسنس ثبت شد", description: `اعتبار تا ${formatIsoDateShamsi(st.expires_at)}` });
    },
    onError: (e: Error) => toast({ variant: "destructive", title: "کلید پذیرفته نشد", description: e.message }),
  });

  if (isLoading || !data || !data.enabled) return null;
  const state = STATE_LABEL[data.state] ?? { text: data.state, cls: "bg-muted" };
  const Icon = data.read_only ? Lock : data.state === "VALID" ? BadgeCheck : ShieldAlert;

  return (
    <div className="card-elevated space-y-4 p-4 sm:p-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Icon className="h-5 w-5 text-primary" />
          اشتراک نرم‌افزار
        </h3>
        <span className={cn("rounded-full px-3 py-1 text-xs font-bold", state.cls)}>{state.text}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">مجموعه</dt>
          <dd className="font-medium">{data.customer || "—"}</dd>
          <dt className="text-muted-foreground">پلن</dt>
          <dd className="font-medium">{planLabel(data.plan)}</dd>
          <dt className="text-muted-foreground">اعتبار تا</dt>
          <dd className="font-medium">
            {data.expires_at ? formatIsoDateShamsi(data.expires_at) : "—"}
            {data.days_left != null && data.days_left >= 0 && (
              <span className="mr-1 text-xs text-muted-foreground">({toPersianDigits(String(data.days_left))} روز)</span>
            )}
          </dd>
          <dt className="text-muted-foreground">شناسه لایسنس</dt>
          <dd className="font-mono text-xs" dir="ltr">{data.license_id || "—"}</dd>
        </dl>
        <div className="space-y-3">
          <Usage label="دانش‌آموزان فعال" used={data.students} max={data.max_students} />
          <Usage label="کاربران فعال" used={data.users} max={data.max_users} />
        </div>
      </div>
      <div className="space-y-2 border-t pt-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="h-4 w-4" />
          ثبت کلید تمدید یا ارتقا
        </label>
        <Textarea
          dir="ltr"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="UF1.…"
          className="min-h-[72px] font-mono text-xs"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">کلید را پس از خرید یا تمدید از پشتیبانی دریافت کنید.</p>
          <Button onClick={() => mutation.mutate()} disabled={!key.trim() || mutation.isPending}>
            {mutation.isPending ? "در حال بررسی..." : "ثبت کلید"}
          </Button>
        </div>
      </div>
    </div>
  );
}

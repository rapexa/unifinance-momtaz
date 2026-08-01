import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatGroupedFaIntInput, parseLocalizedFloat, parseLocalizedInt } from "@/lib/numberInput";
import type { AdvisorCommissionKind, EnrollmentBillingMode } from "@/api/studentsApi";
import type { PlanApi } from "@/api/plansApi";
import type { RoleApi } from "@/api/rolesApi";
import type { UserApi } from "@/api/usersApi";
import {
  JALALI_MONTH_NAMES,
  accrualMonthCountFromMask,
  billingModeLabel,
  isPerPaymentBilling,
  switchBillingCommKind,
  toggleMonthInMask,
} from "./enrollmentBillingUtils";

export type PayoutAmountKind = "PERCENT" | "FIXED_PER_PAYMENT";

export interface RolePayoutFormRow {
  key: string;
  roleId: string;
  userId: string;
  amountKind: PayoutAmountKind;
  percent: string;
  fixedCents: string;
}

export function makeRolePayoutRow(seed?: Partial<RolePayoutFormRow>): RolePayoutFormRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    roleId: seed?.roleId ?? "",
    userId: seed?.userId ?? "",
    amountKind: seed?.amountKind ?? "PERCENT",
    percent: seed?.percent ?? "",
    fixedCents: seed?.fixedCents ?? "",
  };
}

const ROLE_PAYOUT_FIXED_HINT =
  "این رقم به ازای هر پرداخت «پرداخت‌شده» جداگانه در حقوق لحاظ می‌شود؛ اگر چند قسط در همان ماه ثبت شده باشد، جمع متغیر چند برابر می‌شود.";

const ROLE_PAYOUT_SINGLE_HINT =
  "در ثبت‌نام تک‌جلسه‌ای، با یک پرداخت «پرداخت‌شده» سهم نقش‌ها یک‌بار محاسبه می‌شود.";

const ROLE_PAYOUT_ANNUAL_HINT =
  "در ثبت‌نام سالانه، سهم «درصدی» از هر قسط پرداخت‌شده محاسبه می‌شود؛ «مبلغ ثابت» به ازای هر قسط است.";

function schoolMonthlyPreviewTomans(
  billing: EnrollmentBillingMode,
  kind: AdvisorCommissionKind,
  enrollmentTomans: number,
  percent: string,
  fixedTomans: string,
  accrualMonthCount: number,
): number {
  if (billing !== "SCHOOL_ENROLLMENT" || accrualMonthCount <= 0) return 0;
  const enrollmentCents = enrollmentTomans * 10;
  if (kind === "FIXED_MONTHLY") {
    return parseLocalizedInt(fixedTomans);
  }
  if (kind === "PERCENT_OF_CONTRACT") {
    const p = parseLocalizedFloat(percent);
    if (p <= 0 || enrollmentCents <= 0) return 0;
    const totalCents = Math.round(enrollmentCents * (p / 100));
    return Math.floor(totalCents / accrualMonthCount / 10);
  }
  return 0;
}

export interface EnrollmentRegistrationFieldsProps {
  billingMode: EnrollmentBillingMode;
  onBillingModeChange: (mode: EnrollmentBillingMode) => void;
  planId: string;
  onPlanIdChange: (id: string) => void;
  plans: PlanApi[];
  enrollmentAmount: string;
  onEnrollmentAmountChange: (v: string) => void;
  accrualMonthMask: number;
  onAccrualMonthMaskChange: (mask: number) => void;
  rolePayoutRows: RolePayoutFormRow[];
  onRolePayoutRowsChange: (rows: RolePayoutFormRow[]) => void;
  roles: RoleApi[];
  users: UserApi[];
  advisorId: string;
  onAdvisorIdChange: (id: string) => void;
  advisorOptions: UserApi[];
  advisorCommKind: AdvisorCommissionKind;
  onAdvisorCommKindChange: (k: AdvisorCommissionKind) => void;
  commPercent: string;
  onCommPercentChange: (v: string) => void;
  commFixed: string;
  onCommFixedChange: (v: string) => void;
  showEnrollmentWarning?: boolean;
}

export function EnrollmentRegistrationFields({
  billingMode,
  onBillingModeChange,
  planId,
  onPlanIdChange,
  plans,
  enrollmentAmount,
  onEnrollmentAmountChange,
  accrualMonthMask,
  onAccrualMonthMaskChange,
  rolePayoutRows,
  onRolePayoutRowsChange,
  roles,
  users,
  advisorId,
  onAdvisorIdChange,
  advisorOptions,
  advisorCommKind,
  onAdvisorCommKindChange,
  commPercent,
  onCommPercentChange,
  commFixed,
  onCommFixedChange,
  showEnrollmentWarning,
}: EnrollmentRegistrationFieldsProps) {
  const advisorSelected = advisorId !== "" && advisorId !== "none";
  const accrualCount = accrualMonthCountFromMask(accrualMonthMask);
  const monthlyPreview = schoolMonthlyPreviewTomans(
    billingMode,
    advisorCommKind,
    parseLocalizedInt(enrollmentAmount),
    commPercent,
    commFixed,
    accrualCount,
  );

  const rolePayoutHint =
    billingMode === "SINGLE_SESSION"
      ? ROLE_PAYOUT_SINGLE_HINT
      : billingMode === "SCHOOL_ENROLLMENT"
        ? ROLE_PAYOUT_ANNUAL_HINT
        : ROLE_PAYOUT_FIXED_HINT;

  return (
    <div className="space-y-4">
      {showEnrollmentWarning && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          پرداخت ثبت‌شده وجود دارد اما مبلغ ثبت‌نامی خالی است — لطفاً مبلغ را وارد کنید.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">نوع پرداخت</label>
          <Select
            value={billingMode}
            onValueChange={(v) => {
              const mode = v as EnrollmentBillingMode;
              onBillingModeChange(mode);
              onAdvisorCommKindChange(switchBillingCommKind(advisorCommKind, mode));
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SINGLE_SESSION">تک جلسه‌ای — یک پرداخت، سهم یک‌بار</SelectItem>
              <SelectItem value="MONTHLY">ماهانه — هر پرداخت = یک ماه</SelectItem>
              <SelectItem value="SCHOOL_ENROLLMENT">سالانه — قرارداد با اقساط</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {billingMode === "SINGLE_SESSION" &&
              "دانش‌آموز یک‌بار هزینه را پرداخت می‌کند؛ سهم مشاور و نقش‌ها از همان پرداخت محاسبه می‌شود."}
            {billingMode === "MONTHLY" &&
              "هر پرداخت «پرداخت‌شده» معادل یک ماه است و سهم‌ها از همان پرداخت محاسبه می‌شود."}
            {billingMode === "SCHOOL_ENROLLMENT" &&
              "مبلغ کل قرارداد ثبت می‌شود؛ اقساط در بخش پرداخت‌ها ثبت می‌گردد. حقوق مشاور در ماه‌های انتخاب‌شده محاسبه می‌شود."}
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">پلن</label>
          <Select value={planId || "none"} onValueChange={(v) => onPlanIdChange(v === "none" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="انتخاب نوع ثبت‌نام" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون پلن</SelectItem>
              {plans.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">مبلغ ثبت‌نامی (تومان)</label>
          <Input
            inputMode="numeric"
            value={enrollmentAmount}
            onChange={(e) => onEnrollmentAmountChange(formatGroupedFaIntInput(e.target.value))}
            placeholder="مثلاً 2,500,000"
            dir="ltr"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            {billingMode === "SCHOOL_ENROLLMENT"
              ? "مبلغ کل قرارداد سالانه"
              : billingMode === "SINGLE_SESSION"
                ? "مبلغ یک جلسه / ثبت‌نام تک‌جلسه‌ای"
                : "مبلغ ماهانه / ثبت‌نام"}
          </p>
        </div>

        {billingMode === "SCHOOL_ENROLLMENT" && (
          <div className="sm:col-span-2 rounded-lg border border-border bg-muted/10 p-3">
            <p className="mb-2 text-xs font-medium text-foreground">ماه‌های پرداختی به مشاور (و سایر نقش‌ها)</p>
            <p className="mb-3 text-[11px] text-muted-foreground">
              ماه‌هایی را که حقوق از این ثبت‌نام محاسبه می‌شود انتخاب کنید ({accrualCount} ماه انتخاب شده).
              سهم کل قرارداد ÷ {accrualCount || "—"} = حقوق هر ماه.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {JALALI_MONTH_NAMES.map((name, idx) => {
                const jm = idx + 1;
                const checked = (accrualMonthMask & (1 << (jm - 1))) !== 0;
                return (
                  <label
                    key={name}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        onAccrualMonthMaskChange(toggleMonthInMask(accrualMonthMask, jm, v === true))
                      }
                    />
                    <span>{name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">تقسیم مبلغ ثبت‌نام به نقش‌ها (اختیاری)</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRolePayoutRowsChange([...rolePayoutRows, makeRolePayoutRow()])}
          >
            افزودن نقش
          </Button>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">{rolePayoutHint}</p>
        {rolePayoutRows.length === 0 && (
          <p className="text-xs text-muted-foreground">هنوز سهمی تعریف نشده است.</p>
        )}
        {rolePayoutRows.map((row) => {
          const roleUsers = users.filter((u) => String(u.role_id) === row.roleId);
          return (
            <div key={row.key} className="space-y-2 rounded-md border border-border bg-background p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Select
                  value={row.roleId || "none"}
                  onValueChange={(v) =>
                    onRolePayoutRowsChange(
                      rolePayoutRows.map((x) =>
                        x.key === row.key ? { ...x, roleId: v === "none" ? "" : v, userId: "" } : x,
                      ),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="نقش" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">انتخاب نقش</SelectItem>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={row.userId || "none"}
                  onValueChange={(v) =>
                    onRolePayoutRowsChange(
                      rolePayoutRows.map((x) =>
                        x.key === row.key ? { ...x, userId: v === "none" ? "" : v } : x,
                      ),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="کاربر" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">انتخاب کاربر</SelectItem>
                    {roleUsers.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.first_name} {u.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={row.amountKind}
                  onValueChange={(v) =>
                    onRolePayoutRowsChange(
                      rolePayoutRows.map((x) =>
                        x.key === row.key ? { ...x, amountKind: v as PayoutAmountKind } : x,
                      ),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT">درصدی از مبلغ پرداخت</SelectItem>
                    <SelectItem value="FIXED_PER_PAYMENT">مبلغ ثابت به ازای هر پرداخت پرداخت‌شده</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {row.amountKind === "PERCENT" ? (
                <Input
                  value={row.percent}
                  onChange={(e) =>
                    onRolePayoutRowsChange(
                      rolePayoutRows.map((x) =>
                        x.key === row.key ? { ...x, percent: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="درصد (مثلاً ۲۰)"
                  inputMode="decimal"
                  dir="ltr"
                />
              ) : (
                <Input
                  value={row.fixedCents}
                  onChange={(e) =>
                    onRolePayoutRowsChange(
                      rolePayoutRows.map((x) =>
                        x.key === row.key
                          ? { ...x, fixedCents: formatGroupedFaIntInput(e.target.value) }
                          : x,
                      ),
                    )
                  }
                  placeholder="تومان، هر بار پرداخت ثبت شود"
                  inputMode="numeric"
                  dir="ltr"
                />
              )}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRolePayoutRowsChange(rolePayoutRows.filter((x) => x.key !== row.key))}
                >
                  حذف
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
        <label className="block text-xs font-medium text-muted-foreground">کاربر سازمانی (اختیاری)</label>
        <Select
          value={advisorId || "none"}
          onValueChange={(val) => {
            onAdvisorIdChange(val === "none" ? "" : val);
            if (val === "none") {
              onAdvisorCommKindChange("NONE");
              onCommPercentChange("");
              onCommFixedChange("");
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="انتخاب کاربر" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">بدون انتساب</SelectItem>
            {advisorOptions.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.first_name} {a.last_name}
                {a.role_name ? ` — ${a.role_name}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {advisorSelected && (
          <div className="space-y-3 pt-1">
            <p className="text-xs font-medium text-muted-foreground">
              {billingMode === "SCHOOL_ENROLLMENT"
                ? "سهم مشاور از قرارداد (محاسبه در ماه‌های انتخاب‌شده)"
                : billingMode === "SINGLE_SESSION"
                  ? "سهم مشاور از پرداخت تک‌جلسه‌ای"
                  : "سهم مشاور از هر پرداخت ماهانه"}
            </p>
            <Select
              value={advisorCommKind}
              onValueChange={(v) => onAdvisorCommKindChange(v as AdvisorCommissionKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">بدون سهم</SelectItem>
                {billingMode === "SCHOOL_ENROLLMENT" ? (
                  <>
                    <SelectItem value="PERCENT_OF_CONTRACT">درصد از کل قرارداد (تقسیم ماهانه)</SelectItem>
                    <SelectItem value="FIXED_MONTHLY">مبلغ ماهانه ثابت</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem value="PERCENT">درصدی از مبلغ پرداخت</SelectItem>
                    <SelectItem value="FIXED_PER_PAYMENT">مبلغ ثابت به ازای هر پرداخت</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            {advisorCommKind === "PERCENT" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">درصد از مبلغ پرداخت</label>
                <Input
                  value={commPercent}
                  onChange={(e) => onCommPercentChange(e.target.value)}
                  placeholder="مثلاً ۱۰"
                  inputMode="decimal"
                  dir="ltr"
                />
              </div>
            )}
            {advisorCommKind === "PERCENT_OF_CONTRACT" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">درصد از کل مبلغ ثبت‌نامی</label>
                <Input
                  value={commPercent}
                  onChange={(e) => onCommPercentChange(e.target.value)}
                  placeholder="مثلاً ۵۰"
                  inputMode="decimal"
                  dir="ltr"
                />
              </div>
            )}
            {(advisorCommKind === "FIXED_PER_PAYMENT" || advisorCommKind === "FIXED_MONTHLY") && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {billingMode === "SCHOOL_ENROLLMENT" ? "سهم ماهانه مشاور (تومان)" : "مبلغ ثابت (تومان)"}
                </label>
                <Input
                  value={commFixed}
                  onChange={(e) => onCommFixedChange(formatGroupedFaIntInput(e.target.value))}
                  placeholder="مبلغ به تومان"
                  inputMode="numeric"
                  dir="ltr"
                />
              </div>
            )}
            {billingMode === "SCHOOL_ENROLLMENT" && advisorCommKind !== "NONE" && monthlyPreview > 0 && (
              <p className="text-xs text-primary">
                سهم ماهانه در حقوق: {monthlyPreview.toLocaleString("fa-IR")} تومان ({billingModeLabel(billingMode)})
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { schoolMonthlyPreviewTomans };

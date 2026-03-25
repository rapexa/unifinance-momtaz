import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  MoreHorizontal,
  Calendar,
  Users,
  Tag,
  Check,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createPlan,
  deactivatePlan,
  getPlansSummary,
  listPlans,
  PlanApi,
  PlanSummary,
  updatePlan,
} from "@/api/plansApi";

interface PlanRow {
  id: number;
  name: string;
  typeCode?: string;
  typeLabel: string;
  priceCents: number;
  priceDisplay: string;
  features: string[];
  isActive: boolean;
  discountApplyOnEnrollment: boolean;
  discountPercent: number | null;
  enrollmentPriceDisplay: string;
}

const typeLabels: Record<string, string> = {
  MONTHLY: "ماهانه",
  YEARLY: "سالانه",
  WORKSHOP: "کارگاه",
  COURSE: "دوره‌ای",
};

const typeColors: Record<string, string> = {
  MONTHLY: "bg-chart-1/20 text-chart-1",
  YEARLY: "bg-chart-2/20 text-chart-2",
  WORKSHOP: "bg-chart-3/20 text-chart-3",
  COURSE: "bg-chart-5/20 text-chart-5",
};

function formatPrice(cents: number): string {
  const amount = Math.round(cents / 10); // فرض: cents بر اساس ریال و نمایش بر اساس تومان
  return new Intl.NumberFormat("fa-IR").format(amount);
}

function effectiveEnrollmentPriceCents(
  priceCents: number,
  pct: number | null | undefined,
  apply: boolean,
): number {
  if (!apply || pct == null || pct <= 0) return priceCents;
  if (pct >= 100) return 0;
  return Math.round((priceCents * (100 - pct)) / 100);
}

function mapPlan(api: PlanApi): PlanRow {
  const typeCode = api.type?.toUpperCase();
  const typeLabel = typeCode ? typeLabels[typeCode] ?? typeCode : "سایر";
  const applyDisc = api.discount_apply_on_enrollment ?? false;
  const discPct =
    api.discount_percent != null && !Number.isNaN(api.discount_percent)
      ? api.discount_percent
      : null;
  const enrollCents = effectiveEnrollmentPriceCents(api.price_cents, discPct, applyDisc);
  return {
    id: api.id,
    name: api.name,
    typeCode,
    typeLabel,
    priceCents: api.price_cents,
    priceDisplay: formatPrice(api.price_cents),
    features: api.features ?? [],
    isActive: api.is_active,
    discountApplyOnEnrollment: applyDisc,
    discountPercent: discPct,
    enrollmentPriceDisplay: formatPrice(enrollCents),
  };
}

const Plans = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [viewPlan, setViewPlan] = useState<PlanRow | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanRow | null>(null);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [typeCode, setTypeCode] = useState<string>("MONTHLY");
  const [featuresText, setFeaturesText] = useState("");
  const [discountApplyOnEnrollment, setDiscountApplyOnEnrollment] = useState(false);
  const [discountPercent, setDiscountPercent] = useState("");

  const queryClient = useQueryClient();

  const {
    data: summary,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
  } = useQuery<PlanSummary>({
    queryKey: ["plans-summary"],
    queryFn: getPlansSummary,
  });

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["plans", { search: searchQuery }],
    queryFn: () =>
      listPlans({
        search: searchQuery || undefined,
        status: undefined,
        page: 1,
        page_size: 50,
      }),
  });

  const plans: PlanRow[] = (data?.data || []).map(mapPlan);

  const createMutation = useMutation({
    mutationFn: createPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plans-summary"] });
      setIsCreateOpen(false);
      setName("");
      setPrice("");
      setInterval("monthly");
      setTypeCode("MONTHLY");
      setFeaturesText("");
      setDiscountApplyOnEnrollment(false);
      setDiscountPercent("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: number; data: any }) =>
      updatePlan(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plans-summary"] });
      setIsEditOpen(false);
      setSelectedPlan(null);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => deactivatePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plans-summary"] });
    },
  });

  const openEdit = (plan: PlanRow) => {
    setSelectedPlan(plan);
    setName(plan.name);
    setPrice(String(Math.round(plan.priceCents / 10)));
    setInterval("monthly"); // ذخیره جدا نداریم؛ برای UI
    setTypeCode(plan.typeCode || "MONTHLY");
    setFeaturesText(plan.features.join("\n"));
    setDiscountApplyOnEnrollment(plan.discountApplyOnEnrollment);
    setDiscountPercent(
      plan.discountPercent != null ? String(plan.discountPercent) : "",
    );
    setIsEditOpen(true);
  };

  const openView = (plan: PlanRow) => {
    setViewPlan(plan);
  };

  return (
    <MainLayout
      title="پلن‌ها و خدمات"
      subtitle="مدیریت پلن‌های مالی و خدمات مشاوره"
    >
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="جستجوی پلن..."
            className="pr-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus className="ml-2 h-4 w-4" />
          پلن جدید
        </Button>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">کل پلن‌ها</p>
          <p className="text-2xl font-bold text-foreground">
            {isSummaryLoading || isSummaryError
              ? "—"
              : summary?.total_plans ?? 0}
          </p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">پلن‌های فعال</p>
          <p className="text-2xl font-bold text-success">
            {isSummaryLoading || isSummaryError
              ? "—"
              : summary?.active_plans ?? 0}
          </p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">ثبت‌نام فعال</p>
          <p className="text-2xl font-bold text-foreground">
            {isSummaryLoading || isSummaryError
              ? "—"
              : summary?.active_enrollments ?? 0}
          </p>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && (
          <div className="card-elevated p-5 col-span-full text-sm text-muted-foreground">
            در حال بارگذاری پلن‌ها...
          </div>
        )}
        {isError && (
          <div className="card-elevated p-5 col-span-full text-sm text-destructive">
            {(error as Error)?.message || "خطا در دریافت پلن‌ها"}
          </div>
        )}
        {!isLoading && !isError && plans.length === 0 && (
          <div className="card-elevated p-5 col-span-full text-sm text-muted-foreground">
            هیچ پلنی ثبت نشده است.
          </div>
        )}
        {!isLoading &&
          !isError &&
          plans.map((plan) => (
            <div
              key={plan.id}
              className="card-elevated p-5 hover:border-primary/50 transition-colors"
            >
            <div className="flex items-start justify-between mb-4">
              <div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium mb-2",
                    plan.typeCode
                      ? typeColors[plan.typeCode] || "bg-secondary text-secondary-foreground"
                      : "bg-secondary text-secondary-foreground",
                  )}
                >
                  {plan.typeLabel}
                </span>
                <h3 className="font-bold text-foreground text-lg">
                  {plan.name}
                </h3>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openEdit(plan)}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => {
                    if (
                      window.confirm(
                        "آیا از غیرفعال کردن این پلن مطمئن هستید؟",
                      )
                    ) {
                      deactivateMutation.mutate(plan.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-2xl font-bold number-display text-foreground">
                {plan.priceDisplay}
              </span>
              <span className="text-sm text-muted-foreground">تومان</span>
              {!plan.isActive && (
                <Badge
                  variant="secondary"
                  className="bg-muted text-muted-foreground mr-2"
                >
                  غیرفعال
                </Badge>
              )}
            </div>
            {plan.discountApplyOnEnrollment && plan.discountPercent != null && plan.discountPercent > 0 && (
              <p className="text-xs text-primary mb-3">
                ثبت‌نام با تخفیف {plan.discountPercent}٪:{" "}
                <span className="font-semibold number-display">{plan.enrollmentPriceDisplay}</span> تومان
              </p>
            )}

            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>دانش‌آموز: —</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{plan.typeLabel}</span>
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">امکانات:</p>
              <ul className="space-y-1.5">
                {plan.features.map((feature, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <Check className="h-4 w-4 text-success shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 pt-4 border-t flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => openEdit(plan)}
              >
                ویرایش
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => openView(plan)}
              >
                مشاهده
              </Button>
            </div>
          </div>
        ))}

        {/* Add New Plan Card */}
        <div
          className="card-elevated p-5 border-dashed flex flex-col items-center justify-center text-center min-h-[320px] cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => setIsCreateOpen(true)}
        >
          <div className="rounded-full bg-muted p-4 mb-4">
            <Plus className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="font-bold text-foreground mb-1">پلن جدید</h3>
          <p className="text-sm text-muted-foreground">یک پلن مالی جدید تعریف کنید</p>
        </div>
      </div>

      {/* Create plan dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>پلن جدید</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  نام پلن
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثلاً مشاوره ماهانه"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  قیمت (تومان)
                </label>
                <Input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="مثلاً 2500000"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  دوره پرداخت
                </label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={interval}
                  onChange={(e) =>
                    setInterval(e.target.value as "monthly" | "yearly")
                  }
                >
                  <option value="monthly">ماهانه</option>
                  <option value="yearly">سالانه</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  نوع پلن
                </label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={typeCode}
                  onChange={(e) => setTypeCode(e.target.value)}
                >
                  <option value="MONTHLY">ماهانه</option>
                  <option value="YEARLY">سالانه</option>
                  <option value="WORKSHOP">کارگاه</option>
                  <option value="COURSE">دوره‌ای</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                امکانات (هر خط یک مورد)
              </label>
              <textarea
                className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
                placeholder="مثلاً:&#10;۴ جلسه مشاوره&#10;پشتیبانی تلگرام"
              />
            </div>
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">اعمال تخفیف در ثبت‌نام</p>
                  <p className="text-xs text-muted-foreground">
                    در صورت فعال بودن، مبلغ ثبت‌نام دانش‌آموز با این پلن از قیمت پس از تخفیف محاسبه می‌شود.
                  </p>
                </div>
                <Switch
                  checked={discountApplyOnEnrollment}
                  onCheckedChange={setDiscountApplyOnEnrollment}
                />
              </div>
              {discountApplyOnEnrollment && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    درصد تخفیف (۱ تا ۱۰۰)
                  </label>
                  <Input
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    placeholder="مثلاً ۱۰"
                    inputMode="decimal"
                    dir="ltr"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={createMutation.isPending}
            >
              انصراف
            </Button>
            <Button
              onClick={() => {
                const pct = parseFloat(discountPercent.replace(/,/g, "."));
                const discInvalid =
                  discountApplyOnEnrollment &&
                  (!Number.isFinite(pct) || pct <= 0 || pct > 100);
                if (discInvalid) return;
                createMutation.mutate({
                  name: name.trim(),
                  price_cents: Number(price) * 10,
                  interval,
                  type: typeCode,
                  is_active: true,
                  discount_apply_on_enrollment: discountApplyOnEnrollment,
                  ...(discountApplyOnEnrollment && Number.isFinite(pct)
                    ? { discount_percent: pct }
                    : {}),
                  features: featuresText
                    .split("\n")
                    .map((f) => f.trim())
                    .filter(Boolean),
                });
              }}
              disabled={
                createMutation.isPending ||
                !name.trim() ||
                !price.trim() ||
                isNaN(Number(price)) ||
                (discountApplyOnEnrollment &&
                  (() => {
                    const pct = parseFloat(discountPercent.replace(/,/g, "."));
                    return !Number.isFinite(pct) || pct <= 0 || pct > 100;
                  })())
              }
            >
              {createMutation.isPending ? "در حال ثبت..." : "ثبت پلن"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit plan dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ویرایش پلن</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  نام پلن
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  قیمت (تومان)
                </label>
                <Input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  دوره پرداخت
                </label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={interval}
                  onChange={(e) =>
                    setInterval(e.target.value as "monthly" | "yearly")
                  }
                >
                  <option value="monthly">ماهانه</option>
                  <option value="yearly">سالانه</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  نوع پلن
                </label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={typeCode}
                  onChange={(e) => setTypeCode(e.target.value)}
                >
                  <option value="MONTHLY">ماهانه</option>
                  <option value="YEARLY">سالانه</option>
                  <option value="WORKSHOP">کارگاه</option>
                  <option value="COURSE">دوره‌ای</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                امکانات (هر خط یک مورد)
              </label>
              <textarea
                className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
              />
            </div>
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">اعمال تخفیف در ثبت‌نام</p>
                  <p className="text-xs text-muted-foreground">
                    مبلغ ثبت‌نام (enrollment) برای دانش‌آموزان با این پلن بر این اساس به‌روز می‌شود.
                  </p>
                </div>
                <Switch
                  checked={discountApplyOnEnrollment}
                  onCheckedChange={setDiscountApplyOnEnrollment}
                />
              </div>
              {discountApplyOnEnrollment && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    درصد تخفیف (۱ تا ۱۰۰)
                  </label>
                  <Input
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(e.target.value)}
                    inputMode="decimal"
                    dir="ltr"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditOpen(false)}
              disabled={updateMutation.isPending}
            >
              انصراف
            </Button>
            <Button
              onClick={() => {
                if (!selectedPlan) return;
                const pct = parseFloat(discountPercent.replace(/,/g, "."));
                const discInvalid =
                  discountApplyOnEnrollment &&
                  (!Number.isFinite(pct) || pct <= 0 || pct > 100);
                if (discInvalid) return;
                updateMutation.mutate({
                  id: selectedPlan.id,
                  data: {
                    name: name.trim(),
                    price_cents: price ? Number(price) * 10 : undefined,
                    interval,
                    type: typeCode,
                    discount_apply_on_enrollment: discountApplyOnEnrollment,
                    ...(discountApplyOnEnrollment && Number.isFinite(pct)
                      ? { discount_percent: pct }
                      : {}),
                    features: featuresText
                      .split("\n")
                      .map((f) => f.trim())
                      .filter(Boolean),
                  },
                });
              }}
              disabled={
                updateMutation.isPending ||
                !selectedPlan ||
                !name.trim() ||
                !price.trim() ||
                isNaN(Number(price)) ||
                (discountApplyOnEnrollment &&
                  (() => {
                    const pct = parseFloat(discountPercent.replace(/,/g, "."));
                    return !Number.isFinite(pct) || pct <= 0 || pct > 100;
                  })())
              }
            >
              {updateMutation.isPending ? "در حال ذخیره..." : "ذخیره تغییرات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View plan dialog */}
      <Dialog open={!!viewPlan} onOpenChange={() => setViewPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewPlan?.name ?? "جزئیات پلن"}</DialogTitle>
          </DialogHeader>
          {viewPlan && (
            <div className="space-y-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">نوع</span>
                <span>{viewPlan.typeLabel}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">قیمت</span>
                <span className="number-display">
                  {viewPlan.priceDisplay} تومان
                </span>
              </div>
              {viewPlan.discountApplyOnEnrollment &&
                viewPlan.discountPercent != null &&
                viewPlan.discountPercent > 0 && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">تخفیف ثبت‌نام</span>
                      <span>{viewPlan.discountPercent}٪</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">مبلغ ثبت‌نام پس از تخفیف</span>
                      <span className="number-display">
                        {viewPlan.enrollmentPriceDisplay} تومان
                      </span>
                    </div>
                  </>
                )}
              <div className="pt-2 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  امکانات
                </p>
                <ul className="space-y-1.5">
                  {viewPlan.features.map((feature, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 text-sm text-foreground"
                    >
                      <Check className="h-4 w-4 text-success" />
                      {feature}
                    </li>
                  ))}
                  {viewPlan.features.length === 0 && (
                    <li className="text-xs text-muted-foreground">
                      امکانی ثبت نشده است.
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewPlan(null)}>
              بستن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Plans;

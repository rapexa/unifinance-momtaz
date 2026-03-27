import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  PlanType,
  PLAN_TYPE_LABELS,
  updatePlan,
} from "@/api/plansApi";

const TYPE_COLORS: Record<PlanType, string> = {
  MONTHLY: "bg-chart-1/20 text-chart-1",
  YEARLY: "bg-chart-2/20 text-chart-2",
  SINGLE_SESSION: "bg-chart-3/20 text-chart-3",
  COURSE: "bg-chart-5/20 text-chart-5",
};

const Plans = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [viewPlan, setViewPlan] = useState<PlanApi | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanApi | null>(null);

  const [name, setName] = useState("");
  const [typeCode, setTypeCode] = useState<PlanType>("MONTHLY");
  const [featuresText, setFeaturesText] = useState("");

  const queryClient = useQueryClient();

  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } =
    useQuery<PlanSummary>({
      queryKey: ["plans-summary"],
      queryFn: getPlansSummary,
    });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["plans", { search: searchQuery }],
    queryFn: () => listPlans({ search: searchQuery || undefined, page: 1, page_size: 50 }),
  });

  const plans: PlanApi[] = data?.data || [];

  const resetForm = () => {
    setName("");
    setTypeCode("MONTHLY");
    setFeaturesText("");
  };

  const createMutation = useMutation({
    mutationFn: createPlan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plans-summary"] });
      queryClient.invalidateQueries({ queryKey: ["plans-active"] });
      setIsCreateOpen(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: number; data: any }) =>
      updatePlan(payload.id, payload.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plans-summary"] });
      queryClient.invalidateQueries({ queryKey: ["plans-active"] });
      setIsEditOpen(false);
      setSelectedPlan(null);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => deactivatePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plans-summary"] });
      queryClient.invalidateQueries({ queryKey: ["plans-active"] });
    },
  });

  const openEdit = (plan: PlanApi) => {
    setSelectedPlan(plan);
    setName(plan.name);
    setTypeCode((plan.type as PlanType) || "MONTHLY");
    setFeaturesText((plan.features ?? []).join("\n"));
    setIsEditOpen(true);
  };

  const handleCreate = () => {
    createMutation.mutate({
      name: name.trim(),
      type: typeCode,
      is_active: true,
      features: featuresText.split("\n").map((f) => f.trim()).filter(Boolean),
    });
  };

  const handleUpdate = () => {
    if (!selectedPlan) return;
    updateMutation.mutate({
      id: selectedPlan.id,
      data: {
        name: name.trim(),
        type: typeCode,
        features: featuresText.split("\n").map((f) => f.trim()).filter(Boolean),
      },
    });
  };

  const PlanFormFields = () => (
    <div className="space-y-4 py-2">
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
          نوع پلن (دوره پرداخت)
        </label>
        <select
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={typeCode}
          onChange={(e) => setTypeCode(e.target.value as PlanType)}
        >
          <option value="MONTHLY">ماهانه — محاسبه ماه به ماه</option>
          <option value="YEARLY">سالانه — محاسبه سالی</option>
          <option value="SINGLE_SESSION">تک‌جلسه — محاسبه هر جلسه</option>
          <option value="COURSE">دوره‌ای — پرداخت قسطی تا پایان دوره</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          امکانات (هر خط یک مورد)
        </label>
        <textarea
          className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={featuresText}
          onChange={(e) => setFeaturesText(e.target.value)}
          placeholder={"مثلاً:\n۴ جلسه مشاوره\nپشتیبانی تلگرام"}
        />
      </div>
    </div>
  );

  return (
    <MainLayout title="پلن‌ها و خدمات" subtitle="مدیریت پلن‌های مشاوره">
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
        <Button size="sm" onClick={() => { resetForm(); setIsCreateOpen(true); }}>
          <Plus className="ml-2 h-4 w-4" />
          پلن جدید
        </Button>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">کل پلن‌ها</p>
          <p className="text-2xl font-bold text-foreground">
            {isSummaryLoading || isSummaryError ? "—" : summary?.total_plans ?? 0}
          </p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">پلن‌های فعال</p>
          <p className="text-2xl font-bold text-success">
            {isSummaryLoading || isSummaryError ? "—" : summary?.active_plans ?? 0}
          </p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">ثبت‌نام فعال</p>
          <p className="text-2xl font-bold text-foreground">
            {isSummaryLoading || isSummaryError ? "—" : summary?.active_enrollments ?? 0}
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
        {!isLoading && !isError && plans.map((plan) => {
          const typeKey = (plan.type as PlanType) || "MONTHLY";
          const typeLabel = PLAN_TYPE_LABELS[typeKey] ?? typeKey;
          const typeColor = TYPE_COLORS[typeKey] || "bg-secondary text-secondary-foreground";
          return (
            <div
              key={plan.id}
              className="card-elevated p-5 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium mb-2", typeColor)}>
                    {typeLabel}
                  </span>
                  <h3 className="font-bold text-foreground text-lg">{plan.name}</h3>
                  {!plan.is_active && (
                    <Badge variant="secondary" className="mt-1 bg-muted text-muted-foreground">
                      غیرفعال
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8" onClick={() => openEdit(plan)}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-destructive sm:h-8 sm:w-8"
                    onClick={() => {
                      if (window.confirm("آیا از غیرفعال کردن این پلن مطمئن هستید؟")) {
                        deactivateMutation.mutate(plan.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>{typeLabel}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span>مبلغ: در ثبت‌نام مشخص می‌شود</span>
                </div>
              </div>

              {(plan.features ?? []).length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">امکانات:</p>
                  <ul className="space-y-1.5">
                    {(plan.features ?? []).map((feature, index) => (
                      <li key={index} className="flex items-center gap-2 text-sm text-foreground">
                        <Check className="h-4 w-4 text-success shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex gap-2 border-t pt-4">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(plan)}>
                  ویرایش
                </Button>
                <Button size="sm" className="flex-1" onClick={() => setViewPlan(plan)}>
                  مشاهده
                </Button>
              </div>
            </div>
          );
        })}

        {/* Add New Plan Card */}
        <div
          className="card-elevated p-5 border-dashed flex flex-col items-center justify-center text-center min-h-[280px] cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => { resetForm(); setIsCreateOpen(true); }}
        >
          <div className="rounded-full bg-muted p-4 mb-4">
            <Plus className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="font-bold text-foreground mb-1">پلن جدید</h3>
          <p className="text-sm text-muted-foreground">یک پلن مشاوره جدید تعریف کنید</p>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>پلن جدید</DialogTitle>
          </DialogHeader>
          <PlanFormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} disabled={createMutation.isPending}>
              انصراف
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !name.trim()}>
              {createMutation.isPending ? "در حال ثبت..." : "ثبت پلن"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ویرایش پلن</DialogTitle>
          </DialogHeader>
          <PlanFormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)} disabled={updateMutation.isPending}>
              انصراف
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending || !name.trim()}>
              {updateMutation.isPending ? "در حال ذخیره..." : "ذخیره"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewPlan} onOpenChange={() => setViewPlan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewPlan?.name ?? "جزئیات پلن"}</DialogTitle>
          </DialogHeader>
          {viewPlan && (
            <div className="space-y-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">نوع</span>
                <span>{PLAN_TYPE_LABELS[(viewPlan.type as PlanType)] ?? viewPlan.type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">مبلغ</span>
                <span className="text-muted-foreground text-xs">در هنگام ثبت‌نام دانش‌آموز تعیین می‌شود</span>
              </div>
              {(viewPlan.features ?? []).length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs font-medium text-muted-foreground mb-2">امکانات</p>
                  <ul className="space-y-1.5">
                    {(viewPlan.features ?? []).map((f, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-success" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Plans;

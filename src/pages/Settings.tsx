import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { SubscriptionCard } from "@/components/license/SubscriptionCard";
import { OrganizationCard } from "@/components/settings/OrganizationCard";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Lock, CheckCircle2, AlertTriangle, Download, RotateCcw, HistoryIcon, Trash2, Pencil } from "lucide-react";
import {
  listFiscalYears,
  getCurrentFiscalYear,
  createFiscalYear,
  updateFiscalYear,
  closeFiscalYear,
  reopenFiscalYear,
  restoreFiscalYear,
  purgeFiscalYear,
  absoluteUploadUrl,
  type FiscalYear,
} from "@/api/settingsApi";
import { gregorianIsoToJalali, jalaliToGregorianIso, todayJalaliString } from "@/lib/jalaliDate";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { SHAMSI_MONTH_NAMES } from "@/lib/shamsi";

const Settings = () => {
  const { profile } = useCurrentUser();
  const queryClient = useQueryClient();

  const [newFYName, setNewFYName] = useState("");
  const [newFYStartJalali, setNewFYStartJalali] = useState(() => todayJalaliString());
  const [showNewFYDialog, setShowNewFYDialog] = useState(false);
  const [showCloseFYDialog, setShowCloseFYDialog] = useState(false);
  const [closedFY, setClosedFY] = useState<FiscalYear | null>(null);
  const [reopenTarget, setReopenTarget] = useState<FiscalYear | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<FiscalYear | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<FiscalYear | null>(null);
  const [editNameTarget, setEditNameTarget] = useState<FiscalYear | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const [fyError, setFyError] = useState("");

  const { data: fiscalYears = [], isLoading: fyLoading } = useQuery({
    queryKey: ["fiscal-years"],
    queryFn: listFiscalYears,
  });
  const { data: currentFY } = useQuery({
    queryKey: ["fiscal-year-current"],
    queryFn: getCurrentFiscalYear,
  });

  const createFYMutation = useMutation({
    mutationFn: (p: { name: string; start_date: string }) => createFiscalYear(p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fiscal-years"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal-year-current"] });
      setShowNewFYDialog(false);
      setNewFYName("");
      setNewFYStartJalali(todayJalaliString());
      setFyError("");
    },
    onError: (e: Error) => setFyError(e.message),
  });

  const updateFYNameMutation = useMutation({
    mutationFn: (p: { id: number; name: string }) => updateFiscalYear(p.id, { name: p.name }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["fiscal-years"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal-year-current"] });
      setClosedFY((prev) => (prev?.id === updated.id ? { ...prev, name: updated.name } : prev));
      setEditNameTarget(null);
      setEditNameValue("");
      setFyError("");
    },
    onError: (e: Error) => setFyError(e.message),
  });

  const closeFYMutation = useMutation({
    mutationFn: (id: number) => closeFiscalYear(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["fiscal-years"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal-year-current"] });
      setShowCloseFYDialog(false);
      setClosedFY(data);
    },
    onError: (e: Error) => setFyError(e.message),
  });

  const reopenFYMutation = useMutation({
    mutationFn: (id: number) => reopenFiscalYear(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fiscal-years"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal-year-current"] });
      setReopenTarget(null);
      setClosedFY(null);
      setFyError("");
    },
    onError: (e: Error) => setFyError(e.message),
  });

  const restoreFYMutation = useMutation({
    mutationFn: (id: number) => restoreFiscalYear(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fiscal-years"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal-year-current"] });
      setRestoreTarget(null);
      setClosedFY(null);
      setFyError("");
    },
    onError: (e: Error) => setFyError(e.message),
  });

  const purgeFYMutation = useMutation({
    mutationFn: (id: number) => purgeFiscalYear(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["fiscal-years"] });
      queryClient.invalidateQueries({ queryKey: ["fiscal-year-current"] });
      setPurgeTarget(null);
      setClosedFY((prev) => (prev?.id === id ? null : prev));
      setFyError("");
    },
    onError: (e: Error) => setFyError(e.message),
  });

  // The most-recently-created fiscal year; restore is only valid for this one.
  const mostRecentFYId = fiscalYears.length > 0 ? fiscalYears[0].id : null;

  const handleCreateFY = () => {
    setFyError("");
    if (!newFYName.trim()) {
      setFyError("نام سال مالی الزامی است");
      return;
    }
    if (!newFYStartJalali.trim()) {
      setFyError("تاریخ شروع الزامی است");
      return;
    }
    const gregorianStart = jalaliToGregorianIso(newFYStartJalali);
    if (!gregorianStart) {
      setFyError("تاریخ شروع نامعتبر است — از تقویم انتخاب کنید");
      return;
    }
    createFYMutation.mutate({ name: newFYName.trim(), start_date: gregorianStart });
  };

  const openEditNameDialog = (fy: FiscalYear) => {
    setEditNameTarget(fy);
    setEditNameValue(fy.name);
    setFyError("");
  };

  const handleUpdateFYName = () => {
    if (!editNameTarget) return;
    setFyError("");
    if (!editNameValue.trim()) {
      setFyError("نام سال مالی الزامی است");
      return;
    }
    updateFYNameMutation.mutate({ id: editNameTarget.id, name: editNameValue.trim() });
  };

  const openNewFYDialog = () => {
    setFyError("");
    if (!newFYStartJalali.trim()) {
      setNewFYStartJalali(todayJalaliString());
    }
    setShowNewFYDialog(true);
  };

  const fyMonthName = (iso: string | null) => {
    if (!iso) return "—";
    const jalali = gregorianIsoToJalali(iso.slice(0, 10));
    if (!jalali) return "—";
    const [jy, jm] = jalali.split("/").map(Number);
    const monthName = SHAMSI_MONTH_NAMES[jm] ?? "";
    return `${monthName} ${jy}`;
  };

  /** سال هدف برای ویرایش/حذف — جاری، یا اولین باز، یا اولین رکورد */
  const actionFy: FiscalYear | null =
    currentFY ??
    fiscalYears.find((f) => f.status === "OPEN") ??
    (fiscalYears.length > 0 ? fiscalYears[0] : null);

  return (
    <MainLayout title="مدیریت سال مالی" subtitle="تعریف سال مالی جاری، بستن دوره و دانلود خروجی">
      <div className="space-y-6">
        {profile?.full_access && <SubscriptionCard />}
        {profile?.full_access && <OrganizationCard />}
        {/* همیشه نمایش داده می‌شود — بدون شرط */}
        <div className="card-elevated border-2 border-primary/25 p-4 sm:p-5">
          <p className="mb-3 text-sm font-bold text-foreground">عملیات سال مالی</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              variant="default"
              size="lg"
              className="w-full gap-2 sm:w-auto"
              disabled={fyLoading || !actionFy}
              onClick={() => actionFy && openEditNameDialog(actionFy)}
            >
              <Pencil className="h-4 w-4" />
              ویرایش نام سال مالی
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="w-full gap-2 sm:w-auto"
              disabled={fyLoading || !actionFy}
              onClick={() => {
                if (actionFy) {
                  setPurgeTarget(actionFy);
                  setFyError("");
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              حذف سال مالی
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full gap-2 sm:w-auto"
              onClick={openNewFYDialog}
            >
              <Plus className="h-4 w-4" />
              سال مالی جدید
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {fyLoading
              ? "در حال بارگذاری..."
              : actionFy
                ? `سال فعال: ${actionFy.name} (#${actionFy.id})`
                : "هنوز سال مالی تعریف نشده — «سال مالی جدید» را بزنید."}
          </p>
        </div>

        <div className="card-elevated p-6">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-bold text-foreground">سال مالی جاری</h3>
          </div>

          {fyLoading && <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>}

          {!fyLoading && !currentFY && (
            <div className="space-y-4 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4 sm:p-5">
              <div>
                <p className="font-semibold text-foreground">تعریف سال مالی جدید</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  نام و تاریخ شروع را وارد کنید — تاریخ را از تقویم شمسی انتخاب کنید.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">نام سال مالی</label>
                <Input
                  value={newFYName}
                  onChange={(e) => setNewFYName(e.target.value)}
                  placeholder="مثال: سال مالی ۱۴۰۵"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">تاریخ شروع (شمسی)</label>
                <JalaliDatePicker
                  value={newFYStartJalali}
                  onChange={setNewFYStartJalali}
                  placeholder="انتخاب از تقویم"
                  clearable={false}
                />
              </div>
              {fyError && <p className="text-sm text-destructive">{fyError}</p>}
              <Button
                type="button"
                size="lg"
                className="w-full sm:w-auto"
                onClick={handleCreateFY}
                disabled={createFYMutation.isPending}
              >
                {createFYMutation.isPending ? "در حال ذخیره..." : "شروع سال مالی"}
              </Button>
            </div>
          )}

          {currentFY && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground">{currentFY.name}</p>
                  <p className="text-sm text-muted-foreground">
                    از {fyMonthName(currentFY.start_date)} — هنوز باز است
                  </p>
                </div>
                <Badge variant="outline" className="text-green-700 border-green-500 bg-green-50 dark:bg-green-950 shrink-0">
                  باز
                </Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="p-4 rounded-lg bg-muted/40 text-center">
                  <p className="text-xs text-muted-foreground mb-1">تاریخ شروع</p>
                  <p className="font-bold text-foreground">{gregorianIsoToJalali(currentFY.start_date)}</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/40 text-center">
                  <p className="text-xs text-muted-foreground mb-1">وضعیت</p>
                  <p className="font-bold text-green-600">فعال و باز</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/40 text-center">
                  <p className="text-xs text-muted-foreground mb-1">شناسه</p>
                  <p className="font-bold text-foreground">#{currentFY.id}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-amber-800 dark:text-amber-300">بستن سال مالی</p>
                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                      با بستن سال مالی، یک فایل CSV (بازکردن با اکسل) از داده‌های سال روی سرور ذخیره می‌شود و سپس
                      دانش‌آموزها، پلن‌ها، پرداخت‌ها، حقوق‌ها، نقش‌های سفارشی و کاربران غیرادمین پاک می‌شوند تا سال جدید
                      از صفر تعریف شود.
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  className="mt-3"
                  onClick={() => {
                    setShowCloseFYDialog(true);
                    setFyError("");
                  }}
                >
                  <Lock className="ml-2 h-4 w-4" />
                  بستن سال مالی {currentFY.name}
                </Button>
              </div>
            </div>
          )}

          {closedFY && (
            <div className="mt-4 flex flex-col gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <Download className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-blue-800 dark:text-blue-300">{closedFY.name} بسته شد</p>
                  {closedFY.export_url && absoluteUploadUrl(closedFY.export_url) ? (
                    <a
                      href={absoluteUploadUrl(closedFY.export_url)!}
                      download={`${closedFY.name.replace(/\s+/g, "_")}.csv`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 underline mt-1 inline-block"
                    >
                      دانلود خروجی CSV سال مالی
                    </a>
                  ) : (
                    <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">سال مالی با موفقیت بسته شد.</p>
                  )}
                  <p className="text-xs text-blue-700/90 dark:text-blue-400/90 mt-2">
                    تا قبل از شروع سال مالی جدید می‌توانید همه داده‌ها را بازگردانی کنید.
                  </p>
                </div>
              </div>
              {!currentFY && closedFY.id === mostRecentFYId && (
                <div className="flex flex-wrap gap-2 self-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-blue-300 text-blue-800 dark:text-blue-200"
                    onClick={() => {
                      setReopenTarget(closedFY);
                      setFyError("");
                    }}
                  >
                    <RotateCcw className="ml-2 h-4 w-4" />
                    باز کردن بدون بازگردانی
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => {
                      setRestoreTarget(closedFY);
                      setFyError("");
                    }}
                  >
                    <HistoryIcon className="ml-2 h-4 w-4" />
                    بازگردانی کامل سال مالی
                  </Button>
                </div>
              )}
              {!currentFY && closedFY.id !== mostRecentFYId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-end border-blue-300 text-blue-800 dark:text-blue-200"
                  onClick={() => {
                    setReopenTarget(closedFY);
                    setFyError("");
                  }}
                >
                  <RotateCcw className="ml-2 h-4 w-4" />
                  باز کردن مجدد
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="card-elevated p-6">
          <h3 className="text-lg font-bold text-foreground mb-1">تاریخچه سال‌های مالی</h3>
          <p className="text-xs text-muted-foreground mb-4">
            برای هر سال، ویرایش نام و حذف در همان ردیف در دسترس است.
          </p>
          {fiscalYears.length === 0 && !fyLoading && (
            <p className="text-sm text-muted-foreground py-4 text-center">هنوز سال مالی ثبت نشده است.</p>
          )}
          {fyLoading && (
            <p className="text-sm text-muted-foreground py-4 text-center">در حال بارگذاری...</p>
          )}
          <div className="space-y-3">
            {fiscalYears.map((fy) => (
                <div key={fy.id} className="flex flex-col gap-3 p-4 rounded-lg bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    {fy.status === "OPEN" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    ) : (
                      <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{fy.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {fyMonthName(fy.start_date)}
                        {fy.end_date ? ` تا ${fyMonthName(fy.end_date)}` : " — ادامه دارد"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="h-9 min-w-[7rem] text-xs gap-1"
                      onClick={() => openEditNameDialog(fy)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      ویرایش نام
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-9 min-w-[5rem] text-xs gap-1"
                      onClick={() => {
                        setPurgeTarget(fy);
                        setFyError("");
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف
                    </Button>
                    {fy.status === "CLOSED" && !currentFY && fy.id === mostRecentFYId && (
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => {
                          setRestoreTarget(fy);
                          setFyError("");
                        }}
                      >
                        <HistoryIcon className="ml-1 h-3 w-3" />
                        بازگردانی کامل
                      </Button>
                    )}
                    {fy.status === "CLOSED" && !currentFY && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setReopenTarget(fy);
                          setFyError("");
                        }}
                      >
                        <RotateCcw className="ml-1 h-3 w-3" />
                        باز کردن
                      </Button>
                    )}
                    {fy.export_url && absoluteUploadUrl(fy.export_url) && (
                      <a
                        href={absoluteUploadUrl(fy.export_url)!}
                        download={`${fy.name.replace(/\s+/g, "_")}.csv`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 underline flex items-center gap-1 h-8 px-2"
                      >
                        <Download className="h-3 w-3" />
                        دانلود CSV
                      </a>
                    )}
                    <Badge variant={fy.status === "OPEN" ? "default" : "secondary"}>
                      {fy.status === "OPEN" ? "باز" : "بسته"}
                    </Badge>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="card-elevated p-6">
          <h3 className="text-lg font-bold text-foreground mb-4">راهنما</h3>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">•</span>
              <p>
                حقوق کارمندان ماه به ماه از بخش <strong className="text-foreground">حقوق</strong> ثبت و پرداخت می‌شود.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">•</span>
              <p>
                واریزی‌های دانش‌آموزان در بخش <strong className="text-foreground">پرداخت‌ها</strong> رصد می‌شود.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">•</span>
              <p>
                گزارش‌ها از بخش <strong className="text-foreground">گزارش‌ها</strong> قابل مشاهده است.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">•</span>
              <p>پس از بستن سال مالی، فایل CSV روی سرور ذخیره می‌شود و با همان دکمه دانلود قابل دریافت است (بازکردن با اکسل).</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-primary font-bold mt-0.5">•</span>
              <p>
                سال مالی را می‌توانید با دکمه <strong className="text-foreground">«حذف»</strong> از لیست پاک کنید — برای سال تست یا سال باز بدون نیاز به بستن.
                قبل از حذف سال بسته، در صورت نیاز CSV را دانلود کنید.
              </p>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog
        open={editNameTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setEditNameTarget(null);
            setEditNameValue("");
            setFyError("");
          }
        }}
      >
        <AlertDialogContent className="max-w-md" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ویرایش نام سال مالی</AlertDialogTitle>
            <AlertDialogDescription>
              نام جدید در هدر، لیست تاریخچه و گزارش‌ها نمایش داده می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">نام سال مالی</label>
            <Input
              value={editNameValue}
              onChange={(e) => setEditNameValue(e.target.value)}
              placeholder="مثال: سال مالی ۱۴۰۵"
              autoFocus
            />
            {fyError && <p className="text-sm text-destructive">{fyError}</p>}
          </div>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={updateFYNameMutation.isPending}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleUpdateFYName();
              }}
              disabled={updateFYNameMutation.isPending}
            >
              {updateFYNameMutation.isPending ? "در حال ذخیره..." : "ذخیره نام"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showNewFYDialog} onOpenChange={setShowNewFYDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>شروع سال مالی جدید</DialogTitle>
            <DialogDescription>
              نام و تاریخ شروع را از تقویم شمسی انتخاب کنید.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">نام سال مالی</label>
              <Input
                value={newFYName}
                onChange={(e) => setNewFYName(e.target.value)}
                placeholder="مثال: سال مالی ۱۴۰۵"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">تاریخ شروع (شمسی)</label>
              <JalaliDatePicker
                value={newFYStartJalali}
                onChange={setNewFYStartJalali}
                placeholder="انتخاب از تقویم"
                clearable={false}
              />
            </div>
            {fyError && <p className="text-sm text-destructive">{fyError}</p>}
          </div>
          <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
            <Button
              type="button"
              onClick={handleCreateFY}
              disabled={createFYMutation.isPending}
            >
              {createFYMutation.isPending ? "در حال ذخیره..." : "شروع سال مالی"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowNewFYDialog(false)}>
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showCloseFYDialog} onOpenChange={setShowCloseFYDialog}>
        <AlertDialogContent className="max-w-md" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              بستن سال مالی {currentFY?.name}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-right text-foreground">
              <span className="block">
                با تأیید، یک فایل <strong>CSV</strong> (قابل باز کردن در اکسل) از دانش‌آموزان، پرداخت‌ها و حقوق روی سرور ذخیره
                می‌شود و لینک آن را می‌گیرید.
              </span>
              <span className="block">
                سپس دانش‌آموزها، پلن‌ها، پرداخت‌ها، حقوق‌ها، نقش‌های سفارشی و کاربران غیرادمین حذف می‌شوند.
              </span>
              <span className="block">
                تا قبل از شروع سال مالی جدید می‌توانید{" "}
                <strong>بازگردانی کامل</strong> کنید و همه داده‌ها را برگردانید.
              </span>
              <span className="block mt-2 text-amber-700 dark:text-amber-400 font-medium">آیا بستن سال مالی را تأیید می‌کنید؟</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {fyError && <p className="text-sm text-destructive px-1">{fyError}</p>}
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (currentFY) closeFYMutation.mutate(currentFY.id);
              }}
              disabled={closeFYMutation.isPending}
            >
              {closeFYMutation.isPending ? "در حال پردازش..." : "بله، سال مالی را ببند"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={restoreTarget != null} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent className="max-w-md" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <HistoryIcon className="h-5 w-5" />
              بازگردانی کامل {restoreTarget?.name}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-right text-foreground">
              <span className="block">
                تمام داده‌های پاک‌شده هنگام بستن سال مالی برمی‌گردند: دانش‌آموزها، پلن‌ها، پرداخت‌ها، حقوق‌ها، نقش‌های سفارشی
                و کاربران.
              </span>
              <span className="block">سال مالی دوباره به حالت «باز» تغییر می‌کند.</span>
              <span className="block text-amber-700 dark:text-amber-400">
                این عملیات فقط تا قبل از ایجاد سال مالی جدید ممکن است.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {fyError && <p className="text-sm text-destructive px-1">{fyError}</p>}
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={(e) => {
                e.preventDefault();
                if (restoreTarget) restoreFYMutation.mutate(restoreTarget.id);
              }}
              disabled={restoreFYMutation.isPending}
            >
              {restoreFYMutation.isPending ? "در حال بازگردانی..." : "تأیید بازگردانی"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reopenTarget != null} onOpenChange={(open) => !open && setReopenTarget(null)}>
        <AlertDialogContent className="max-w-md" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              باز کردن مجدد {reopenTarget?.name}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-right text-foreground">
              <span className="block">وضعیت این سال به «باز» برمی‌گردد و می‌توانید دوباره روی آن کار کنید.</span>
              <span className="block text-amber-700 dark:text-amber-400">
                داده‌هایی که هنگام بستن سال پاک شده‌اند به‌طور خودکار برنمی‌گردند و باید دوباره تعریف شوند.
              </span>
              <span className="block">اگر الان سال مالی دیگری باز است، ابتدا آن را ببندید.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {fyError && <p className="text-sm text-destructive px-1">{fyError}</p>}
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (reopenTarget) reopenFYMutation.mutate(reopenTarget.id);
              }}
              disabled={reopenFYMutation.isPending}
            >
              {reopenFYMutation.isPending ? "در حال انجام..." : "تأیید باز کردن"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={purgeTarget != null} onOpenChange={(open) => !open && setPurgeTarget(null)}>
        <AlertDialogContent className="max-w-md" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              حذف کامل {purgeTarget?.name}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-right text-foreground">
              <span className="block">
                این سال مالی برای همیشه از لیست حذف می‌شود
                {purgeTarget?.status === "CLOSED" ? " و فایل CSV ذخیره‌شده روی سرور (در صورت وجود) پاک می‌گردد" : ""}.
              </span>
              {purgeTarget?.status === "OPEN" && (
                <span className="block text-amber-700 dark:text-amber-400">
                  سال مالی «باز» است — با حذف، فقط رکورد سال پاک می‌شود؛ داده‌های دانش‌آموز و پرداخت‌ها دست‌نخورده می‌مانند.
                  برای پاک کردن داده‌ها ابتدا «بستن سال مالی» را بزنید.
                </span>
              )}
              <span className="block text-destructive font-medium">
                این عمل غیرقابل بازگشت است. قبل از حذف، در صورت نیاز فایل CSV را دانلود کنید.
              </span>
              <span className="block text-muted-foreground text-sm">
                بازگردانی داده‌های عملیاتی بعد از حذف ممکن نیست — فقط برای سال‌های تست یا آرشیو اضافی.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {fyError && <p className="text-sm text-destructive px-1">{fyError}</p>}
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel disabled={purgeFYMutation.isPending}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (purgeTarget) purgeFYMutation.mutate(purgeTarget.id);
              }}
              disabled={purgeFYMutation.isPending}
            >
              {purgeFYMutation.isPending ? "در حال حذف..." : "حذف کامل و غیرقابل بازگشت"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default Settings;

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { CalendarDays, Plus, Lock, CheckCircle2, AlertTriangle, Download, RotateCcw } from "lucide-react";
import {
  listFiscalYears,
  getCurrentFiscalYear,
  createFiscalYear,
  closeFiscalYear,
  reopenFiscalYear,
  absoluteUploadUrl,
  type FiscalYear,
} from "@/api/settingsApi";
import { gregorianIsoToJalali, jalaliToGregorianIso } from "@/lib/jalaliDate";
import { SHAMSI_MONTH_NAMES } from "@/lib/shamsi";

const Settings = () => {
  const queryClient = useQueryClient();

  const [newFYName, setNewFYName] = useState("");
  const [newFYStartJalali, setNewFYStartJalali] = useState("");
  const [showNewFYDialog, setShowNewFYDialog] = useState(false);
  const [showCloseFYDialog, setShowCloseFYDialog] = useState(false);
  const [closedFY, setClosedFY] = useState<FiscalYear | null>(null);
  const [reopenTarget, setReopenTarget] = useState<FiscalYear | null>(null);
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
      setNewFYStartJalali("");
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
      setFyError("فرمت تاریخ اشتباه است. مثال: ۱۴۰۴/۰۱/۰۱");
      return;
    }
    createFYMutation.mutate({ name: newFYName.trim(), start_date: gregorianStart });
  };

  const fyMonthName = (iso: string | null) => {
    if (!iso) return "—";
    const jalali = gregorianIsoToJalali(iso.slice(0, 10));
    if (!jalali) return "—";
    const [jy, jm] = jalali.split("/").map(Number);
    const monthName = SHAMSI_MONTH_NAMES[jm] ?? "";
    return `${monthName} ${jy}`;
  };

  return (
    <MainLayout title="مدیریت سال مالی" subtitle="تعریف سال مالی جاری، بستن دوره و دانلود خروجی">
      <div className="space-y-6">
        <div className="card-elevated p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-foreground">سال مالی جاری</h3>
            {!currentFY && !fyLoading && (
              <Button
                onClick={() => {
                  setShowNewFYDialog(true);
                  setFyError("");
                }}
                size="sm"
              >
                <Plus className="ml-2 h-4 w-4" />
                شروع سال مالی جدید
              </Button>
            )}
          </div>

          {fyLoading && <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>}

          {!fyLoading && !currentFY && (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <CalendarDays className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground font-medium">هیچ سال مالی فعالی وجود ندارد</p>
              <p className="text-sm text-muted-foreground">برای شروع کار، یک سال مالی جدید تعریف کنید</p>
              <Button
                className="mt-2"
                onClick={() => {
                  setShowNewFYDialog(true);
                  setFyError("");
                }}
              >
                <Plus className="ml-2 h-4 w-4" />
                شروع سال مالی جدید
              </Button>
            </div>
          )}

          {currentFY && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
                <div className="flex-1">
                  <p className="font-bold text-foreground">{currentFY.name}</p>
                  <p className="text-sm text-muted-foreground">
                    از {fyMonthName(currentFY.start_date)} — هنوز باز است
                  </p>
                </div>
                <Badge variant="outline" className="text-green-700 border-green-500 bg-green-50 dark:bg-green-950">
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
                      با بستن سال مالی، یک فایل CSV (بازکردن با اکسل) از داده‌های سال روی سرور ذخیره می‌شود. پس از دانلود،
                      می‌توانید سال مالی جدید شروع کنید؛ در صورت اشتباه، تا وقتی سال جدید نزده‌اید می‌توانید همین سال را از
                      تاریخچه دوباره باز کنید.
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
                    اگر اشتباه بسته‌اید و هنوز سال مالی جدید شروع نکرده‌اید، از بخش تاریخچه می‌توانید همین سال را دوباره باز کنید.
                  </p>
                </div>
              </div>
              {!currentFY && (
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
                  باز کردن مجدد همین سال
                </Button>
              )}
            </div>
          )}
        </div>

        {fiscalYears.length > 0 && (
          <div className="card-elevated p-6">
            <h3 className="text-lg font-bold text-foreground mb-4">تاریخچه سال‌های مالی</h3>
            <div className="space-y-3">
              {fiscalYears.map((fy) => (
                <div key={fy.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/40">
                  <div className="flex items-center gap-3">
                    {fy.status === "OPEN" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Lock className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium text-foreground">{fy.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {fyMonthName(fy.start_date)}
                        {fy.end_date ? ` تا ${fyMonthName(fy.end_date)}` : " — ادامه دارد"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
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
                        className="text-xs text-blue-600 underline flex items-center gap-1"
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
        )}

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
          </div>
        </div>
      </div>

      <AlertDialog open={showNewFYDialog} onOpenChange={setShowNewFYDialog}>
        <AlertDialogContent className="max-w-md" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>شروع سال مالی جدید</AlertDialogTitle>
            <AlertDialogDescription>
              نام و تاریخ شروع سال مالی را وارد کنید. تمام ثبت‌ها از این تاریخ به بعد در این سال مالی ذخیره می‌شوند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">نام سال مالی</label>
              <Input
                value={newFYName}
                onChange={(e) => setNewFYName(e.target.value)}
                placeholder="مثال: سال مالی ۱۴۰۴"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">تاریخ شروع (شمسی)</label>
              <Input
                value={newFYStartJalali}
                onChange={(e) => setNewFYStartJalali(e.target.value)}
                placeholder="مثال: ۱۴۰۴/۰۲/۰۱"
                dir="ltr"
                className="text-right"
              />
              <p className="text-xs text-muted-foreground">فرمت: سال/ماه/روز — مثلاً ۱۴۰۴/۰۲/۰۱ = اول اردیبهشت ۱۴۰۴</p>
            </div>
            {fyError && <p className="text-sm text-destructive">{fyError}</p>}
          </div>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCreateFY();
              }}
              disabled={createFYMutation.isPending}
            >
              {createFYMutation.isPending ? "در حال ذخیره..." : "شروع سال مالی"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              <span className="block">موجودی ledger دانش‌آموزان فعال به صفر بازنشانی می‌شود.</span>
              <span className="block">
                اگر هنوز سال مالی جدیدی شروع نکرده باشید، می‌توانید همین سال را از تاریخچه دوباره{" "}
                <strong>باز کنید</strong>؛ مانده‌های صفرشده خودکار برنمی‌گردند.
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
                ماندهٔ صفر شدهٔ دانش‌آموزان هنگام بستن سال به‌طور خودکار برنمی‌گردد؛ در صورت نیاز باید دستی اصلاح شود.
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
    </MainLayout>
  );
};

export default Settings;

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Lock } from "lucide-react";
import { getLicense } from "@/api/licenseApi";
import { toPersianDigits } from "@/lib/jalaliDate";
import { cn } from "@/lib/utils";

/** Subscription warning shown above every page: renew soon / grace period / read-only. */
export function LicenseBanner() {
  const { data } = useQuery({
    queryKey: ["license"],
    queryFn: getLicense,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: false,
  });
  if (!data || !data.enabled) return null;

  let text = "";
  let severe = false;
  const days = data.days_left ?? 0;
  switch (data.state) {
    case "VALID":
      if (days > 14) return null;
      text = `اشتراک شما ${toPersianDigits(String(Math.max(days, 0)))} روز دیگر به پایان می‌رسد. برای جلوگیری از توقف ثبت اطلاعات، تمدید کنید.`;
      break;
    case "GRACE": {
      const left = Math.max(0, data.grace_days + days);
      text = `اشتراک شما به پایان رسیده است. تا ${toPersianDigits(String(left))} روز دیگر همه امکانات فعال است و پس از آن سیستم فقط‌خواندنی می‌شود.`;
      severe = true;
      break;
    }
    case "EXPIRED":
      text = "اشتراک شما به پایان رسیده و سیستم فقط‌خواندنی است. اطلاعات قابل مشاهده است اما ثبت و ویرایش تا تمدید ممکن نیست.";
      severe = true;
      break;
    case "MISSING":
      text = "لایسنسی برای این مجموعه ثبت نشده و سیستم فقط‌خواندنی است. کلید لایسنس را در صفحه تنظیمات وارد کنید.";
      severe = true;
      break;
    case "INVALID":
      text = "کلید لایسنس معتبر نیست و سیستم فقط‌خواندنی است. کلید صحیح را در صفحه تنظیمات وارد کنید.";
      severe = true;
      break;
    default:
      return null;
  }
  const Icon = data.read_only ? Lock : AlertTriangle;
  return (
    <div
      dir="rtl"
      className={cn(
        "mb-4 flex flex-wrap items-center gap-2 rounded-lg border px-4 py-3 text-sm",
        severe
          ? "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
          : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{text}</span>
      <Link to="/settings" className="font-bold underline underline-offset-2">
        وضعیت اشتراک
      </Link>
    </div>
  );
}

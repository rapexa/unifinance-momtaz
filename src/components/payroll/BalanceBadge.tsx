import { cn } from "@/lib/utils";
import { balanceTone } from "@/lib/payrollBalance";

function toman(cents: number): string {
  return Math.floor(Math.abs(cents) / 10).toLocaleString("fa-IR");
}

/** Running staff balance: amount + who owes whom. */
export function BalanceBadge({ cents, className }: { cents: number; className?: string }) {
  const tone = balanceTone(cents);
  return (
    <span className={cn("inline-flex flex-col items-start leading-tight", className)}>
      <span
        className={cn(
          "font-bold number-display",
          tone === "owed" && "text-amber-700 dark:text-amber-400",
          tone === "credit" && "text-destructive",
          tone === "settled" && "text-emerald-700 dark:text-emerald-400",
        )}
      >
        {tone === "settled" ? "۰" : toman(cents)}
      </span>
      <span
        className={cn(
          "mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
          tone === "owed" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
          tone === "credit" && "bg-destructive/10 text-destructive",
          tone === "settled" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        )}
      >
        {tone === "owed" ? "بستانکار (بدهی ما)" : tone === "credit" ? "بدهکار (پرداخت اضافه)" : "تسویه"}
      </span>
    </span>
  );
}

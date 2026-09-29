import type { SchoolContractApi } from "@/api/schoolContractsApi";

/** Contract period label for list rows: term name or "۹ ماه". */
export function schoolContractPeriodLabel(c: SchoolContractApi): string {
  if (c.payment_type === "TERM" && c.term) {
    return c.term === "SUMMER" ? "تابستان" : "مهر تا خرداد";
  }
  if (c.duration_months) return `${c.duration_months.toLocaleString("fa-IR")} ماه`;
  return "—";
}

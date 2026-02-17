/**
 * Minimal Shamsi (Jalali) ↔ Gregorian conversion for month/year only.
 * Used for Reports date range picker. Approximate conversion for display and API (YYYY-MM).
 */

export const SHAMSI_MONTH_NAMES: Record<number, string> = {
  1: "فروردین", 2: "اردیبهشت", 3: "خرداد", 4: "تیر", 5: "مرداد", 6: "شهریور",
  7: "مهر", 8: "آبان", 9: "آذر", 10: "دی", 11: "بهمن", 12: "اسفند",
};

/** Shamsi (year, month 1–12) → Gregorian YYYY-MM. 1400/1 (Farvardin) ≈ 2021-03 */
export function shamsiToGregorianYYYYMM(sYear: number, sMonth: number): string {
  const gMonth = ((sMonth + 1) % 12) + 1;
  const gYear = sMonth >= 11 ? sYear + 622 : sYear + 621;
  return `${gYear}-${String(gMonth).padStart(2, "0")}`;
}

/** Gregorian YYYY-MM → Shamsi (year, month 1–12) */
export function gregorianYYYYMMToShamsi(ym: string): { year: number; month: number } {
  const [yStr, mStr] = ym.split("-");
  const gYear = parseInt(yStr!, 10);
  const gMonth = parseInt(mStr!, 10);
  const sMonth = ((gMonth - 2 + 11) % 12) + 1;
  const sYear = gMonth >= 3 ? gYear - 621 : gYear - 622;
  return { year: sYear, month: sMonth };
}

/** List of Shamsi years for selector (e.g. 1398–1412) */
export function shamsiYearOptions(): number[] {
  const from = 1398;
  const to = 1412;
  const arr: number[] = [];
  for (let y = to; y >= from; y--) arr.push(y);
  return arr;
}

function div(a: number, b: number): number {
  return Math.floor(a / b);
}

export function gregorianToJalali(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy: number;
  if (gy > 1600) {
    jy = 979;
    gy -= 1600;
  } else {
    jy = 0;
    gy -= 621;
  }
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    div(gy2 + 3, 4) -
    div(gy2 + 99, 100) +
    div(gy2 + 399, 400) -
    80 +
    gd +
    g_d_m[gm - 1];

  jy += 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    jy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? (days % 31) : ((days - 186) % 30));
  return { jy, jm, jd };
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  let gy: number;
  if (jy > 979) {
    gy = 1600;
    jy -= 979;
  } else {
    gy = 621;
  }

  let days =
    365 * jy +
    div(jy, 33) * 8 +
    div((jy % 33) + 3, 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);

  gy += 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  if (days > 365) {
    gy += div(days - 1, 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 1; gm <= 12; gm++) {
    if (gd <= sal_a[gm]) break;
    gd -= sal_a[gm];
  }
  return { gy, gm, gd };
}

export function gregorianIsoToJalali(iso: string | undefined): string {
  if (!iso) return "";
  const g = parseIsoToLocalGregorian(iso);
  if (!g) return "";
  const j = gregorianToJalali(g.gy, g.gm, g.gd);
  return formatJalaliParts(j);
}

/** Parse API ISO / date-only strings to local Gregorian parts (timezone-safe for timestamps). */
export function parseIsoToLocalGregorian(iso: string): { gy: number; gm: number; gd: number } | null {
  const trimmed = iso.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number);
    if (!y || !m || !d) return null;
    return { gy: y, gm: m, gd: d };
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return {
    gy: date.getFullYear(),
    gm: date.getMonth() + 1,
    gd: date.getDate(),
  };
}

export function jalaliToGregorianIso(jalali: string): string {
  const parts = parseJalaliParts(jalali);
  if (!parts) return "";
  const g = jalaliToGregorian(parts.jy, parts.jm, parts.jd);
  return `${g.gy}-${String(g.gm).padStart(2, "0")}-${String(g.gd).padStart(2, "0")}`;
}

export function formatIsoDateShamsi(iso: string | null | undefined): string {
  const jalali = isoToJalaliString(iso);
  return jalali || "—";
}

export function formatIsoDateTimeShamsi(iso: string | null | undefined): string {
  if (!iso) return "—";
  const jalali = isoToJalaliString(iso);
  if (!jalali) return "—";
  const timePart = iso.length >= 16 ? iso.slice(11, 16) : "";
  return timePart ? `${jalali} ${timePart}` : jalali;
}

export const JALALI_MONTH_NAMES = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

export const JALALI_WEEKDAY_LABELS = ["ش", "ی", "د", "س", "چ", "پ", "ج"] as const;

export interface JalaliParts {
  jy: number;
  jm: number;
  jd: number;
}

export function parseJalaliParts(jalali: string | undefined | null): JalaliParts | null {
  if (!jalali?.trim()) return null;
  const normalized = jalali
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\s+/g, "")
    .replace(/-/g, "/");
  const [jy, jm, jd] = normalized.split("/").map((v) => Number(v));
  if (!jy || !jm || !jd || jm < 1 || jm > 12 || jd < 1) return null;
  if (jd > jalaliMonthLength(jy, jm)) return null;
  return { jy, jm, jd };
}

export function formatJalaliParts({ jy, jm, jd }: JalaliParts): string {
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}

export function todayJalaliString(): string {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return gregorianIsoToJalali(iso);
}

export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  const g = jalaliToGregorian(jy, 12, 30);
  const back = gregorianToJalali(g.gy, g.gm, g.gd);
  return back.jm === 12 && back.jd === 30 ? 30 : 29;
}

/** Saturday = 0 … Friday = 6 (Iranian week). */
export function jalaliWeekday(jy: number, jm: number, jd: number): number {
  const g = jalaliToGregorian(jy, jm, jd);
  const date = new Date(g.gy, g.gm - 1, g.gd);
  return (date.getDay() + 1) % 7;
}

export function addJalaliMonths(jy: number, jm: number, delta: number): { jy: number; jm: number } {
  let newJm = jm + delta;
  let newJy = jy;
  while (newJm > 12) {
    newJm -= 12;
    newJy += 1;
  }
  while (newJm < 1) {
    newJm += 12;
    newJy -= 1;
  }
  return { jy: newJy, jm: newJm };
}

export function isoToJalaliString(iso: string | null | undefined): string {
  if (!iso) return "";
  const g = parseIsoToLocalGregorian(iso);
  if (!g) return "";
  return formatJalaliParts(gregorianToJalali(g.gy, g.gm, g.gd));
}

export function toPersianDigits(value: string): string {
  return value.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export function formatJalaliDisplay(jalali: string | null | undefined): string {
  if (!jalali?.trim()) return "";
  const parts = parseJalaliParts(jalali);
  if (!parts) return jalali;
  return toPersianDigits(formatJalaliParts(parts));
}

/**
 * Approximate Jalali ↔ Gregorian month mapping (Farvardin↔March), round-trip safe.
 * Used for period filters/payroll month selectors (API still stores Gregorian YYYY-MM).
 */
export function jalaliPeriodToGregorianYYYYMM(jYear: number, jMonth: number): string {
  const gMonth = ((jMonth + 1) % 12) + 1;
  const gYear = jMonth >= 11 ? jYear + 622 : jYear + 621;
  return `${gYear}-${String(gMonth).padStart(2, "0")}`;
}

export function gregorianYYYYMMToJalaliPeriod(ym: string): { year: number; month: number } {
  const [yStr, mStr] = ym.split("-");
  const gYear = parseInt(yStr!, 10);
  const gMonth = parseInt(mStr!, 10);
  const month = ((gMonth - 2 + 11) % 12) + 1;
  const year = gMonth >= 3 ? gYear - 621 : gYear - 622;
  return { year, month };
}

export function gregorianPeriodToJalali(gy: number, gm: number): { year: number; month: number } {
  return gregorianYYYYMMToJalaliPeriod(`${gy}-${String(gm).padStart(2, "0")}`);
}

/** Human-readable Jalali period label for a Gregorian API year/month. */
export function formatGregorianPeriodJalali(gy: number, gm: number): string {
  if (!gy || !gm || gm < 1 || gm > 12) return "—";
  const { year, month } = gregorianPeriodToJalali(gy, gm);
  return `${JALALI_MONTH_NAMES[month - 1] ?? month} ${year}`;
}

export function todayJalaliPeriod(): { year: number; month: number } {
  const d = new Date();
  return gregorianPeriodToJalali(d.getFullYear(), d.getMonth() + 1);
}

export function todayJalaliYear(): number {
  const parts = parseJalaliParts(todayJalaliString());
  return parts?.jy ?? todayJalaliPeriod().year;
}

export function jalaliYearOptions(from = 1398, to = 1412): number[] {
  const arr: number[] = [];
  for (let y = to; y >= from; y--) arr.push(y);
  return arr;
}


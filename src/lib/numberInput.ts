const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalizeDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

export function parseLocalizedInt(input: string): number {
  const normalized = normalizeDigits(input).replace(/\D/g, "");
  if (!normalized) return 0;
  return parseInt(normalized, 10) || 0;
}

export function parseLocalizedFloat(input: string): number {
  const normalized = normalizeDigits(input)
    .replace(/٬/g, "")
    .replace(/،/g, ".")
    .replace(/٫/g, ".")
    .replace(/,/g, ".")
    .replace(/[^0-9.]/g, "");
  if (!normalized) return 0;
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function formatGroupedFaIntInput(input: string): string {
  const n = parseLocalizedInt(input);
  if (!n) return "";
  return n.toLocaleString("fa-IR");
}


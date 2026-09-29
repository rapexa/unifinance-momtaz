export type BalanceTone = "owed" | "credit" | "settled";

/** positive = organization owes staff, negative = staff owes organization. */
export function balanceTone(cents: number): BalanceTone {
  if (cents > 0) return "owed";
  if (cents < 0) return "credit";
  return "settled";
}

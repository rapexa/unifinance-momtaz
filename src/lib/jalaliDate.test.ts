import { describe, expect, it } from "vitest";
import {
  addJalaliMonths,
  formatIsoDateShamsi,
  formatJalaliParts,
  gregorianIsoToJalali,
  gregorianToJalali,
  isoToJalaliString,
  jalaliMonthLength,
  jalaliToGregorian,
  jalaliToGregorianIso,
  jalaliWeekday,
  parseIsoToLocalGregorian,
  parseJalaliParts,
  toPersianDigits,
} from "./jalaliDate";

describe("jalaliDate conversions", () => {
  it("converts known Gregorian dates to Jalali", () => {
    expect(gregorianIsoToJalali("2024-03-20")).toBe("1403/01/01");
    expect(gregorianIsoToJalali("2025-03-21")).toBe("1404/01/01");
    expect(gregorianIsoToJalali("2024-03-19")).toBe("1402/12/29");
  });

  it("round-trips every day between 1395 and 1410", () => {
    for (let jy = 1395; jy <= 1410; jy++) {
      for (let jm = 1; jm <= 12; jm++) {
        const len = jalaliMonthLength(jy, jm);
        for (let jd = 1; jd <= len; jd++) {
          const jStr = formatJalaliParts({ jy, jm, jd });
          const gIso = jalaliToGregorianIso(jStr);
          expect(gIso).not.toBe("");
          expect(gregorianIsoToJalali(gIso)).toBe(jStr);
        }
      }
    }
  });

  it("detects Esfand length for leap and non-leap years", () => {
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1402, 12)).toBe(29);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
  });

  it("maps weekday columns to Iranian week (Sat=0 … Fri=6)", () => {
    // 1404/01/01 = 2025-03-21 (Friday)
    expect(jalaliWeekday(1404, 1, 1)).toBe(6);
    // 1403/01/01 = 2024-03-20 (Wednesday)
    expect(jalaliWeekday(1403, 1, 1)).toBe(4);
  });

  it("parses Persian and western digit Jalali strings", () => {
    expect(parseJalaliParts("1403/01/01")).toEqual({ jy: 1403, jm: 1, jd: 1 });
    expect(parseJalaliParts("۱۴۰۳/۰۱/۰۱")).toEqual({ jy: 1403, jm: 1, jd: 1 });
    expect(parseJalaliParts("1403/13/01")).toBeNull();
    expect(parseJalaliParts("1403/01/32")).toBeNull();
  });

  it("rejects invalid Jalali in jalaliToGregorianIso", () => {
    expect(jalaliToGregorianIso("1403/01/32")).toBe("");
    expect(jalaliToGregorianIso("")).toBe("");
  });

  it("parses ISO timestamps using local calendar day", () => {
    const g = parseIsoToLocalGregorian("2024-03-20");
    expect(g).toEqual({ gy: 2024, gm: 3, gd: 20 });
    expect(isoToJalaliString("2024-03-20")).toBe("1403/01/01");
    expect(formatIsoDateShamsi("2024-03-20")).toBe("1403/01/01");
  });

  it("addJalaliMonths crosses year boundaries", () => {
    expect(addJalaliMonths(1403, 1, -1)).toEqual({ jy: 1402, jm: 12 });
    expect(addJalaliMonths(1403, 12, 1)).toEqual({ jy: 1404, jm: 1 });
  });

  it("gregorianToJalali and jalaliToGregorian are inverses for sample dates", () => {
    const samples = [
      { gy: 2024, gm: 3, gd: 20 },
      { gy: 2025, gm: 6, gd: 11 },
      { gy: 2020, gm: 2, gd: 29 },
    ];
    for (const s of samples) {
      const j = gregorianToJalali(s.gy, s.gm, s.gd);
      const back = jalaliToGregorian(j.jy, j.jm, j.jd);
      expect(back).toEqual(s);
    }
  });

  it("formats Persian digits for display", () => {
    expect(toPersianDigits("1403/01/15")).toBe("۱۴۰۳/۰۱/۱۵");
  });
});

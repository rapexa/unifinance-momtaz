package jalali

import (
	"testing"
	"time"
)

func TestFromGregorian(t *testing.T) {
	cases := []struct {
		gy, gm, gd   int
		wantY, wantM int
	}{
		{2024, 3, 20, 1403, 1},
		{2025, 3, 21, 1404, 1},
		{2024, 3, 19, 1402, 12},
	}
	for _, c := range cases {
		got := FromGregorian(c.gy, c.gm, c.gd)
		if got.Year != c.wantY || got.Month != c.wantM {
			t.Fatalf("Gregorian %d-%d-%d => %+v want %d/%d", c.gy, c.gm, c.gd, got, c.wantY, c.wantM)
		}
	}
}

func TestToGregorianRoundTrip(t *testing.T) {
	start := time.Date(2015, 1, 1, 0, 0, 0, 0, time.UTC)
	for d := 0; d < 365*20; d++ {
		g := start.AddDate(0, 0, d)
		j := FromGregorian(g.Year(), int(g.Month()), g.Day())
		y, m, dd := ToGregorian(j.Year, j.Month, j.Day)
		if y != g.Year() || m != int(g.Month()) || dd != g.Day() {
			t.Fatalf("round trip %s -> %+v -> %d-%d-%d", g.Format("2006-01-02"), j, y, m, dd)
		}
	}
}

func TestPeriodKeysMatchJalaliMonthStart(t *testing.T) {
	for jy := 1395; jy <= 1415; jy++ {
		for jm := 1; jm <= 12; jm++ {
			gy, gm := KeyFromJalali(jy, jm)
			// The key is the Gregorian month in which the Jalali month starts.
			sy, sm, _ := ToGregorian(jy, jm, 1)
			if sy != gy || sm != gm {
				t.Fatalf("%d/%d: key %d-%d but month starts %d-%d", jy, jm, gy, gm, sy, sm)
			}
			bjy, bjm := JalaliFromKey(gy, gm)
			if bjy != jy || bjm != jm {
				t.Fatalf("%d/%d: key %d-%d maps back to %d/%d", jy, jm, gy, gm, bjy, bjm)
			}
		}
	}
}

func TestMonthBoundsAndKeyForTime(t *testing.T) {
	// Mehr 1405 = 2026-09-23 .. 2026-10-22 (key September 2026).
	gy, gm := KeyFromJalali(1405, 7)
	if gy != 2026 || gm != 9 {
		t.Fatalf("key for Mehr 1405 = %d-%d", gy, gm)
	}
	start, end := MonthBounds(gy, gm, time.UTC)
	if start.Format("2006-01-02") != "2026-09-23" || end.Format("2006-01-02") != "2026-10-23" {
		t.Fatalf("bounds %s .. %s", start.Format("2006-01-02"), end.Format("2006-01-02"))
	}
	// 2026-09-29 (7 Mehr) belongs to Mehr, 2026-09-20 (29 Shahrivar) to Shahrivar.
	if y, m := KeyForTime(time.Date(2026, 9, 29, 10, 0, 0, 0, time.UTC)); y != 2026 || m != 9 {
		t.Fatalf("7 Mehr key = %d-%d", y, m)
	}
	if y, m := KeyForTime(time.Date(2026, 9, 20, 10, 0, 0, 0, time.UTC)); y != 2026 || m != 8 {
		t.Fatalf("29 Shahrivar key = %d-%d", y, m)
	}
	// Keys are consecutive: Esfand -> next Farvardin.
	ey, em := KeyFromJalali(1404, 12)
	ny, nm := AddMonths(ey, em, 1)
	if jy, jm := JalaliFromKey(ny, nm); jy != 1405 || jm != 1 {
		t.Fatalf("Esfand+1 = %d/%d", jy, jm)
	}
	// Every day belongs to exactly the month whose bounds contain it.
	day := time.Date(2025, 1, 1, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 800; i++ {
		d := day.AddDate(0, 0, i)
		ky, km := KeyForTime(d)
		s, e := MonthBounds(ky, km, time.UTC)
		if d.Before(s) || !d.Before(e) {
			t.Fatalf("%s not inside its month %s..%s", d, s, e)
		}
	}
	if FormatKey(2026, 9) != "مهر 1405" {
		t.Fatalf("FormatKey = %s", FormatKey(2026, 9))
	}
}

func TestMonthLengthAndDateOf(t *testing.T) {
	if MonthLength(1405, 1) != 31 || MonthLength(1405, 7) != 30 {
		t.Fatal("month lengths")
	}
	// 1403 is a leap year (Esfand has 30 days), 1404 is not.
	if MonthLength(1403, 12) != 30 || MonthLength(1404, 12) != 29 {
		t.Fatalf("esfand 1403=%d 1404=%d", MonthLength(1403, 12), MonthLength(1404, 12))
	}
	d := DateOf(1405, 7, 31, time.UTC) // clamped to 30 Mehr
	if FormatDate(d) != "1405/07/30" {
		t.Fatalf("DateOf clamp = %s", FormatDate(d))
	}
}

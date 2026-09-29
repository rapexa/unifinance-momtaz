package jalali

import "time"

// Date holds a Jalali (Persian) calendar date.
type Date struct {
	Year  int
	Month int
	Day   int
}

func div(a, b int) int { return a / b }

// FromGregorian converts a Gregorian date to Jalali.
func FromGregorian(gy, gm, gd int) Date {
	gDM := []int{0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334}
	jy := 979
	if gy > 1600 {
		gy -= 1600
	} else {
		jy = 0
		gy -= 621
	}
	gy2 := gy
	if gm > 2 {
		gy2++
	}
	days := 365*gy + div(gy2+3, 4) - div(gy2+99, 100) + div(gy2+399, 400) - 80 + gd + gDM[gm-1]
	jy += 33 * div(days, 12053)
	days %= 12053
	jy += 4 * div(days, 1461)
	days %= 1461
	if days > 365 {
		jy += div(days-1, 365)
		days = (days - 1) % 365
	}
	jm := 1 + div(days, 31)
	if days >= 186 {
		jm = 7 + div(days-186, 30)
	}
	jd := 1 + days%31
	if days >= 186 {
		jd = 1 + (days-186)%30
	}
	return Date{Year: jy, Month: jm, Day: jd}
}

// ToGregorian converts a Jalali date to Gregorian (year, month, day).
func ToGregorian(jy, jm, jd int) (int, int, int) {
	gy := 621
	if jy > 979 {
		gy = 1600
		jy -= 979
	}
	days := 365*jy + div(jy, 33)*8 + div(jy%33+3, 4) + 78 + jd
	if jm < 7 {
		days += (jm - 1) * 31
	} else {
		days += (jm-7)*30 + 186
	}
	gy += 400 * div(days, 146097)
	days %= 146097
	if days > 36524 {
		days--
		gy += 100 * div(days, 36524)
		days %= 36524
		if days >= 365 {
			days++
		}
	}
	gy += 4 * div(days, 1461)
	days %= 1461
	if days > 365 {
		gy += div(days-1, 365)
		days = (days - 1) % 365
	}
	gd := days + 1
	leap := (gy%4 == 0 && gy%100 != 0) || gy%400 == 0
	monthDays := []int{0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
	if leap {
		monthDays[2] = 29
	}
	gm := 1
	for gm = 1; gm <= 12; gm++ {
		if gd <= monthDays[gm] {
			break
		}
		gd -= monthDays[gm]
	}
	return gy, gm, gd
}

// MonthFromGregorian returns the Jalali month (1–12) for a Gregorian year/month (day=1).
func MonthFromGregorian(gy, gm int) int {
	return FromGregorian(gy, gm, 1).Month
}

// Period keys
//
// Payroll entries, reports and the API identify a month by a (year, month) pair that
// historically looked Gregorian. The UI has always labelled that pair as the Jalali month
// that STARTS inside it (March ↔ Farvardin, September ↔ Mehr, January ↔ Bahman …).
// The helpers below keep that key format but make the boundaries exact: a key covers
// the real Jalali month from its 1st day to the 1st day of the next Jalali month.

// KeyFromJalali returns the period key for Jalali year/month.
func KeyFromJalali(jy, jm int) (int, int) {
	gm := (jm+1)%12 + 1
	gy := jy + 621
	if jm >= 11 {
		gy = jy + 622
	}
	return gy, gm
}

// JalaliFromKey returns the Jalali year/month a period key stands for.
func JalaliFromKey(gy, gm int) (int, int) {
	jm := (gm+9)%12 + 1
	jy := gy - 621
	if gm < 3 {
		jy = gy - 622
	}
	return jy, jm
}

// MonthBounds returns [start, endExclusive) of the Jalali month identified by a period key,
// at local midnight in loc.
func MonthBounds(gy, gm int, loc *time.Location) (time.Time, time.Time) {
	if loc == nil {
		loc = time.Local
	}
	jy, jm := JalaliFromKey(gy, gm)
	sy, sm, sd := ToGregorian(jy, jm, 1)
	ny, nm := jy, jm+1
	if nm > 12 {
		nm = 1
		ny++
	}
	ey, em, ed := ToGregorian(ny, nm, 1)
	start := time.Date(sy, time.Month(sm), sd, 0, 0, 0, 0, loc)
	end := time.Date(ey, time.Month(em), ed, 0, 0, 0, 0, loc)
	return start, end
}

// KeyForTime returns the period key of the Jalali month containing t (in t's location).
func KeyForTime(t time.Time) (int, int) {
	y, m, d := t.Date()
	j := FromGregorian(y, int(m), d)
	return KeyFromJalali(j.Year, j.Month)
}

// AddMonths moves a period key by delta Jalali months (keys are consecutive like months).
func AddMonths(gy, gm, delta int) (int, int) {
	idx := gy*12 + (gm - 1) + delta
	return idx / 12, idx%12 + 1
}

// KeyIndex returns a monotonically increasing index for a key (for ranges / comparisons).
func KeyIndex(gy, gm int) int {
	return gy*12 + gm
}

// MonthNames are the Persian Jalali month names, 1-based via MonthNames[jm-1].
var MonthNames = [12]string{
	"فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
	"مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
}

// FormatKey returns a human-readable Jalali label for a period key, e.g. "مهر 1405".
func FormatKey(gy, gm int) string {
	jy, jm := JalaliFromKey(gy, gm)
	return MonthNames[jm-1] + " " + itoa(jy)
}

// FormatDate formats t as a Jalali date "1405/07/09".
func FormatDate(t time.Time) string {
	y, m, d := t.Date()
	j := FromGregorian(y, int(m), d)
	return itoa(j.Year) + "/" + pad2(j.Month) + "/" + pad2(j.Day)
}

func pad2(n int) string {
	if n < 10 {
		return "0" + itoa(n)
	}
	return itoa(n)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

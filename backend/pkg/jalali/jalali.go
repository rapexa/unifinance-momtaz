package jalali

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

// MonthFromGregorian returns the Jalali month (1–12) for a Gregorian year/month (day=1).
func MonthFromGregorian(gy, gm int) int {
	return FromGregorian(gy, gm, 1).Month
}

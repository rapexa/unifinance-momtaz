package services

import (
	"time"

	"github.com/soheilsshh/unifinance-momtaz/pkg/jalali"
)

// Period (year, month) pairs used across payroll, reports and dashboards are period keys:
// each identifies one exact Jalali month (see pkg/jalali). These helpers keep call sites short.

// PeriodBounds returns [start, endExclusive) of the Jalali month for a period key (local time).
func PeriodBounds(year, month int) (time.Time, time.Time) {
	return jalali.MonthBounds(year, month, time.Local)
}

// PeriodOf returns the period key of the Jalali month containing t (local time).
func PeriodOf(t time.Time) (int, int) {
	return jalali.KeyForTime(t.In(time.Local))
}

// PeriodAdd moves a period key by delta months.
func PeriodAdd(year, month, delta int) (int, int) {
	return jalali.AddMonths(year, month, delta)
}

// PeriodIndex returns a comparable index for a period key.
func PeriodIndex(year, month int) int {
	return jalali.KeyIndex(year, month)
}

// FormatPeriodLabel returns the Jalali label of a period key, e.g. "مهر 1405".
func FormatPeriodLabel(year, month int) string {
	return jalali.FormatKey(year, month)
}

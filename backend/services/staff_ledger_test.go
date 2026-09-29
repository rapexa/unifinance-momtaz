package services

import (
	"testing"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/pkg/jalali"
)

func jdate(jy, jm, jd int) time.Time {
	y, m, d := jalali.ToGregorian(jy, jm, jd)
	return time.Date(y, time.Month(m), d, 12, 0, 0, 0, time.Local)
}

// The advisor earns shares every month; what is paid reduces the debt, any shortfall carries
// to the next month and an overpayment becomes the advisor's debt to the organization.
func TestBuildLedgerMonths_CarryOverAndOverpayment(t *testing.T) {
	mehrY, mehrM := jalali.KeyFromJalali(1405, 7)
	abanY, abanM := jalali.KeyFromJalali(1405, 8)
	azarY, azarM := jalali.KeyFromJalali(1405, 9)

	accruals := map[int]ledgerAccrual{
		PeriodIndex(mehrY, mehrM): {Variable: 10_000_000},
		PeriodIndex(abanY, abanM): {Variable: 8_000_000},
		PeriodIndex(azarY, azarM): {Base: 2_000_000, Variable: 3_000_000},
	}
	payouts := []ledgerPayout{
		{AmountCents: 6_000_000, PaidAt: jdate(1405, 7, 25)},
		{AmountCents: 15_000_000, PaidAt: jdate(1405, 8, 25)},
	}
	months := BuildLedgerMonths(mehrY, mehrM, azarY, azarM, 0, accruals, payouts)
	if len(months) != 3 {
		t.Fatalf("months=%d", len(months))
	}
	mehr, aban, azar := months[0], months[1], months[2]

	if mehr.OpeningCents != 0 || mehr.AccruedCents != 10_000_000 || mehr.PaidCents != 6_000_000 || mehr.ClosingCents != 4_000_000 {
		t.Fatalf("mehr %+v", mehr)
	}
	// 4M carried from Mehr + 8M earned − 15M paid → advisor owes 3M.
	if aban.OpeningCents != 4_000_000 || aban.ClosingCents != -3_000_000 {
		t.Fatalf("aban %+v", aban)
	}
	// Overpayment of 3M is absorbed by Azar's 5M → organization owes 2M.
	if azar.OpeningCents != -3_000_000 || azar.AccruedCents != 5_000_000 || azar.ClosingCents != 2_000_000 {
		t.Fatalf("azar %+v", azar)
	}

	// FIFO: the Aban payout settles Mehr and Aban; Azar is still open.
	if !mehr.Settled || mehr.SettledAt == nil || !mehr.SettledAt.Equal(payouts[1].PaidAt) {
		t.Fatalf("mehr settled=%v at=%v", mehr.Settled, mehr.SettledAt)
	}
	if !aban.Settled {
		t.Fatal("aban should be settled")
	}
	if azar.Settled {
		t.Fatal("azar should be open")
	}
}

func TestBuildLedgerMonths_PayoutsBeforeRangeCountInFirstMonth(t *testing.T) {
	y, m := jalali.KeyFromJalali(1405, 7)
	accruals := map[int]ledgerAccrual{PeriodIndex(y, m): {Base: 5_000_000}}
	payouts := []ledgerPayout{{AmountCents: 5_000_000, PaidAt: jdate(1405, 5, 1)}}
	months := BuildLedgerMonths(y, m, y, m, 0, accruals, payouts)
	if months[0].PaidCents != 5_000_000 || months[0].ClosingCents != 0 || !months[0].Settled {
		t.Fatalf("%+v", months[0])
	}
}

func TestBuildLedgerMonths_ZeroAccrualMonthIsNotMarkedPaid(t *testing.T) {
	y, m := jalali.KeyFromJalali(1405, 7)
	months := BuildLedgerMonths(y, m, y, m, 0, map[int]ledgerAccrual{}, nil)
	if months[0].Settled || months[0].ClosingCents != 0 {
		t.Fatalf("%+v", months[0])
	}
}

func TestStaffLedgerMonthAtCarriesBalanceOutsideRange(t *testing.T) {
	y, m := jalali.KeyFromJalali(1405, 7)
	l := &StaffLedger{Months: []StaffLedgerMonth{{PeriodYear: y, PeriodMonth: m, ClosingCents: 7}}}
	ny, nm := PeriodAdd(y, m, 2)
	got := l.MonthAt(ny, nm)
	if got.OpeningCents != 7 || got.ClosingCents != 7 {
		t.Fatalf("%+v", got)
	}
}

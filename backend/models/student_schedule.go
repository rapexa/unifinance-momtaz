package models

import (
	"time"

	"github.com/soheilsshh/unifinance-momtaz/pkg/jalali"
)

// StudentBillingPosition is what a student is expected to have paid by a given date,
// counted in Jalali months from the registration date (JoinDate, else CreatedAt).
//
//   - SINGLE_SESSION: the whole amount is due in the registration month.
//   - MONTHLY: the enrollment amount is the monthly fee; one fee per month since registration.
//   - SCHOOL_ENROLLMENT (annual): the contract is split evenly over the selected months
//     (advisor accrual month mask, else N consecutive months, default 10).
type StudentBillingPosition struct {
	InstallmentCents     int64 // amount billed for the month of asOf (0 outside the schedule)
	DueToDateCents       int64 // cumulative amount due through the month of asOf
	TotalObligationCents int64 // whole contract (monthly billing: same as DueToDateCents)
	MonthsElapsed        int   // Jalali months from registration through asOf (inclusive)
	ScheduleMonths       int   // installments in an annual contract
}

// BillingStart is the registration date used for billing.
func (st *Student) BillingStart() time.Time {
	if st.JoinDate != nil && !st.JoinDate.IsZero() {
		return *st.JoinDate
	}
	return st.CreatedAt
}

// billingUntil caps asOf for students who are no longer active.
func (st *Student) billingUntil(asOf time.Time) time.Time {
	if st.Status == StudentStatusActive || st.Status == "" {
		return asOf
	}
	if st.EndDate != nil && !st.EndDate.IsZero() {
		if st.EndDate.Before(asOf) {
			return *st.EndDate
		}
		return asOf
	}
	// Legacy rows deactivated before EndDate existed: the last edit is the best signal.
	if !st.UpdatedAt.IsZero() && st.UpdatedAt.Before(asOf) {
		return st.UpdatedAt
	}
	return asOf
}

// scheduleMonthsThrough counts annual-contract installment months from registration through the
// period key (year, month), and whether that period itself is an installment month.
func (st *Student) scheduleMonthsThrough(year, month, total int) (int, bool) {
	sy, sm := jalali.KeyForTime(st.BillingStart())
	target := jalali.KeyIndex(year, month)
	if target < jalali.KeyIndex(sy, sm) {
		return 0, false
	}
	mask := st.advisorAccrualMonthMask()
	count := 0
	current := false
	for y, m := sy, sm; jalali.KeyIndex(y, m) <= target && count < total; y, m = jalali.AddMonths(y, m, 1) {
		in := true
		if mask > 0 {
			_, jm := jalali.JalaliFromKey(y, m)
			in = isJalaliMonthInMask(mask, jm)
		}
		if in {
			count++
			if jalali.KeyIndex(y, m) == target {
				current = true
			}
		}
	}
	return count, current
}

// BillingPosition computes the student's schedule for enrollment amount enrollCents as of asOf.
func (st *Student) BillingPosition(enrollCents int64, asOf time.Time) StudentBillingPosition {
	var pos StudentBillingPosition
	if st == nil || enrollCents <= 0 {
		return pos
	}
	if st.BillingStart().IsZero() {
		// No registration date at all: fall back to "the whole amount is due".
		pos.DueToDateCents = enrollCents
		pos.TotalObligationCents = enrollCents
		return pos
	}
	until := st.billingUntil(asOf)
	sy, sm := jalali.KeyForTime(st.BillingStart())
	uy, um := jalali.KeyForTime(until)
	n := jalali.KeyIndex(uy, um) - jalali.KeyIndex(sy, sm) + 1
	if n < 0 {
		n = 0
	}
	pos.MonthsElapsed = n

	switch st.EnrollmentBillingMode {
	case EnrollmentBillingSingleSession:
		pos.TotalObligationCents = enrollCents
		if n >= 1 {
			pos.DueToDateCents = enrollCents
		}
		if n == 1 {
			pos.InstallmentCents = enrollCents
		}
	case EnrollmentBillingSchoolEnrollment:
		total := st.AdvisorAccrualMonthsCount()
		if total < 1 {
			total = 1
		}
		pos.ScheduleMonths = total
		pos.TotalObligationCents = enrollCents
		k, current := st.scheduleMonthsThrough(uy, um, total)
		switch {
		case k >= total:
			pos.DueToDateCents = enrollCents
		case k > 0:
			pos.DueToDateCents = enrollCents / int64(total) * int64(k)
		}
		if current {
			per := enrollCents / int64(total)
			if k == total {
				per = enrollCents - per*int64(total-1)
			}
			pos.InstallmentCents = per
		}
	default: // MONTHLY and legacy empty mode
		pos.DueToDateCents = enrollCents * int64(n)
		pos.TotalObligationCents = pos.DueToDateCents
		if n >= 1 {
			pos.InstallmentCents = enrollCents
		}
	}
	return pos
}

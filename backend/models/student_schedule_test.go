package models

import (
	"testing"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/pkg/jalali"
)

func jd(jy, jm, d int) time.Time {
	y, m, dd := jalali.ToGregorian(jy, jm, d)
	return time.Date(y, time.Month(m), dd, 10, 0, 0, 0, time.Local)
}

func TestBillingPosition_MonthlyCountsMonthsSinceRegistration(t *testing.T) {
	join := jd(1405, 5, 20) // 20 Mordad
	st := &Student{EnrollmentBillingMode: EnrollmentBillingMonthly, JoinDate: &join, Status: StudentStatusActive}
	// 7 Mehr: Mordad, Shahrivar, Mehr → 3 monthly fees due.
	pos := st.BillingPosition(5_000_000, jd(1405, 7, 7))
	if pos.MonthsElapsed != 3 || pos.DueToDateCents != 15_000_000 || pos.TotalObligationCents != 15_000_000 || pos.InstallmentCents != 5_000_000 {
		t.Fatalf("%+v", pos)
	}
	// Before registration nothing is due.
	if p := st.BillingPosition(5_000_000, jd(1405, 4, 30)); p.DueToDateCents != 0 {
		t.Fatalf("%+v", p)
	}
}

func TestBillingPosition_InactiveStopsAtEndDate(t *testing.T) {
	join := jd(1405, 1, 5)
	end := jd(1405, 3, 10)
	st := &Student{EnrollmentBillingMode: EnrollmentBillingMonthly, JoinDate: &join, EndDate: &end, Status: StudentStatusInactive}
	pos := st.BillingPosition(1_000_000, jd(1405, 7, 7))
	if pos.MonthsElapsed != 3 || pos.DueToDateCents != 3_000_000 {
		t.Fatalf("%+v", pos)
	}
}

func TestBillingPosition_AnnualSplitOverSelectedMonths(t *testing.T) {
	// Mehr..Khordad = 9 months.
	mask := 0
	for _, m := range []int{7, 8, 9, 10, 11, 12, 1, 2, 3} {
		mask |= 1 << (m - 1)
	}
	join := jd(1405, 6, 25) // registered late Shahrivar
	st := &Student{
		EnrollmentBillingMode:   EnrollmentBillingSchoolEnrollment,
		AdvisorAccrualMonthMask: &mask,
		JoinDate:                &join,
		Status:                  StudentStatusActive,
	}
	total := int64(90_000_000)
	// Shahrivar is not an installment month.
	if p := st.BillingPosition(total, jd(1405, 6, 30)); p.DueToDateCents != 0 || p.InstallmentCents != 0 || p.TotalObligationCents != total {
		t.Fatalf("shahrivar %+v", p)
	}
	// Aban: 2 of 9 installments.
	if p := st.BillingPosition(total, jd(1405, 8, 15)); p.DueToDateCents != 20_000_000 || p.InstallmentCents != 10_000_000 || p.ScheduleMonths != 9 {
		t.Fatalf("aban %+v", p)
	}
	// Tir 1406 (after Khordad): everything due, no installment this month.
	if p := st.BillingPosition(total, jd(1406, 4, 15)); p.DueToDateCents != total || p.InstallmentCents != 0 {
		t.Fatalf("tir %+v", p)
	}
}

func TestBillingPosition_SingleSession(t *testing.T) {
	join := jd(1405, 7, 1)
	st := &Student{EnrollmentBillingMode: EnrollmentBillingSingleSession, JoinDate: &join, Status: StudentStatusActive}
	if p := st.BillingPosition(2_000_000, jd(1405, 9, 1)); p.DueToDateCents != 2_000_000 || p.TotalObligationCents != 2_000_000 || p.InstallmentCents != 0 {
		t.Fatalf("%+v", p)
	}
}

func TestSchoolContract_InstallmentsFromPeriod(t *testing.T) {
	start := jd(1405, 7, 1)
	end := jd(1406, 3, 31) // Mehr .. Khordad = 9 months
	c := &SchoolContract{TotalAmountCents: 90_000_000, StartDate: &start, EndDate: &end, PaymentType: SchoolPaymentMonthly}
	if c.DurationMonths() != 9 || c.InstallmentCents() != 10_000_000 {
		t.Fatalf("months=%d installment=%d", c.DurationMonths(), c.InstallmentCents())
	}
	c.PaymentType = SchoolPaymentTerm
	if c.InstallmentCents() != 90_000_000 {
		t.Fatalf("term installment=%d", c.InstallmentCents())
	}
}

func TestInstallments_MonthlyOnRegistrationDay(t *testing.T) {
	join := jd(1405, 5, 20)
	st := &Student{EnrollmentBillingMode: EnrollmentBillingMonthly, JoinDate: &join, Status: StudentStatusActive}
	got := st.Installments(1_000, jd(1405, 7, 25))
	if len(got) != 3 {
		t.Fatalf("installments=%d", len(got))
	}
	want := []string{"1405/05/20", "1405/06/20", "1405/07/20"}
	for i, inst := range got {
		if jalali.FormatDate(inst.DueDate) != want[i] {
			t.Fatalf("#%d due %s want %s", i, jalali.FormatDate(inst.DueDate), want[i])
		}
	}
	// Registration on the 31st: Mehr only has 30 days.
	join31 := jd(1405, 6, 31)
	st.JoinDate = &join31
	got = st.Installments(1_000, jd(1405, 8, 1))
	if len(got) != 2 || jalali.FormatDate(got[1].DueDate) != "1405/07/30" {
		t.Fatalf("clamped %+v", got)
	}
}

func TestInstallments_AnnualOverMaskWithRemainder(t *testing.T) {
	mask := 0
	for _, m := range []int{7, 8, 9} {
		mask |= 1 << (m - 1)
	}
	join := jd(1405, 7, 10)
	st := &Student{EnrollmentBillingMode: EnrollmentBillingSchoolEnrollment, AdvisorAccrualMonthMask: &mask, JoinDate: &join, Status: StudentStatusActive}
	got := st.Installments(100, jd(1406, 1, 1))
	if len(got) != 3 || got[0].AmountCents != 33 || got[2].AmountCents != 34 {
		t.Fatalf("%+v", got)
	}
	if jalali.FormatDate(got[1].DueDate) != "1405/08/10" {
		t.Fatalf("second due %s", jalali.FormatDate(got[1].DueDate))
	}
}

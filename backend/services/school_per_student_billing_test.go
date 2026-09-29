package services

import (
	"testing"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
)

func TestResolveContractTotal_PrefersExplicitTotal(t *testing.T) {
	total, unit, err := resolveContractTotal(10, 1_000_000_000, 0)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if total != 1_000_000_000 {
		t.Fatalf("total=%d want 1000000000", total)
	}
	if unit != 0 {
		t.Fatalf("unit=%d want 0 (deprecated)", unit)
	}
}

func TestResolveContractTotal_LegacyUnitFallback(t *testing.T) {
	total, unit, err := resolveContractTotal(10, 0, 100_000_000)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if total != 1_000_000_000 {
		t.Fatalf("total=%d want 1000000000", total)
	}
	if unit != 100_000_000 {
		t.Fatalf("unit=%d want 100000000", unit)
	}
}

func TestResolveContractTotal_RequiresPositiveAmount(t *testing.T) {
	if _, _, err := resolveContractTotal(10, 0, 0); err == nil {
		t.Fatal("expected error when total and unit are zero")
	}
	if _, _, err := resolveContractTotal(0, 100, 0); err == nil {
		t.Fatal("expected error when student count is zero")
	}
}

func TestStudentRemainingBalance_SchoolChannelScenario(t *testing.T) {
	// Student A: enrollment 12M toman (= 120_000_000 cents), paid 8M (= 80_000_000)
	st := &models.Student{EnrollmentAmountCents: 120_000_000}
	rem := RemainingBalanceCents(st, 80_000_000, 0)
	if rem != 40_000_000 {
		t.Fatalf("remaining=%d want 40000000 (4M toman)", rem)
	}
	if StudentDebtCents(st, 80_000_000, 0) != 40_000_000 {
		t.Fatalf("debt mismatch")
	}

	// Student B: enrollment 8M, paid 8M → settled
	stB := &models.Student{EnrollmentAmountCents: 80_000_000}
	if RemainingBalanceCents(stB, 80_000_000, 0) != 0 {
		t.Fatalf("expected settled remaining 0")
	}
}

func TestStudentBalanceAt_MonthlyUsesMonthsSinceRegistration(t *testing.T) {
	// Monthly fee 2M toman, registered 3 Jalali months ago (Mordad → Mehr), paid 4M toman.
	join := time.Date(2026, 8, 5, 0, 0, 0, 0, time.Local)  // 14 Mordad 1405
	asOf := time.Date(2026, 9, 29, 0, 0, 0, 0, time.Local) // 7 Mehr 1405
	st := &models.Student{
		EnrollmentAmountCents: 20_000_000,
		EnrollmentBillingMode: models.EnrollmentBillingMonthly,
		JoinDate:              &join,
		Status:                models.StudentStatusActive,
	}
	b := StudentBalanceAt(st, 40_000_000, 0, asOf)
	if b.DueToDateCents != 60_000_000 || b.MonthRemainingCents != 20_000_000 || b.TotalRemainingCents != 20_000_000 {
		t.Fatalf("%+v", b)
	}
	// Previously the list showed enrollment − paid = −2M (credit) for this student.
}

func TestSchoolContractRemaining_FromStudentPaidSum(t *testing.T) {
	// Contract 100M toman, students paid 16M toman total
	c := &models.SchoolContract{TotalAmountCents: 1_000_000_000}
	paidFromStudents := int64(160_000_000)
	rem := c.RemainingBalanceCents(paidFromStudents)
	if rem != 840_000_000 {
		t.Fatalf("remaining=%d want 840000000 (84M toman)", rem)
	}
}

func TestLegacySchoolContractPayment_Detection(t *testing.T) {
	cid := uint(7)
	sid := uint(3)

	legacy := &models.Payment{SchoolContractID: &cid, StudentID: nil}
	if !legacy.IsLegacySchoolContractPayment() {
		t.Fatal("expected legacy when only school_contract_id set")
	}
	if !legacy.IsSchoolContractPayment() {
		t.Fatal("alias should match legacy")
	}

	studentPay := &models.Payment{StudentID: &sid}
	if studentPay.IsLegacySchoolContractPayment() {
		t.Fatal("student payment must not be legacy")
	}

	// Even if school_contract_id were also set, student_id means not legacy.
	both := &models.Payment{SchoolContractID: &cid, StudentID: &sid}
	if both.IsLegacySchoolContractPayment() {
		t.Fatal("payment with student_id must not be treated as legacy")
	}
}

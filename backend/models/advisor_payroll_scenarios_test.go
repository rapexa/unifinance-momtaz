package models

import (
	"testing"
	"time"
)

// Scenario 1 (phase 7): monthly student, 10% of each PAID payment.
func TestComputeAdvisorShareCents_MonthlyTenPercent(t *testing.T) {
	advisorID := uint(9)
	pct := 10.0
	st := &Student{
		AdvisorID:                &advisorID,
		EnrollmentBillingMode:    EnrollmentBillingMonthly,
		AdvisorCommissionKind:    StudentAdvisorCommPercent,
		AdvisorCommissionPercent: &pct,
		Status:                   StudentStatusActive,
	}
	// 50M toman = 500_000_000 cents → share 5M toman = 50_000_000 cents
	got := ComputeAdvisorShareCents(st, 500_000_000)
	if got != 50_000_000 {
		t.Fatalf("share=%d want 50000000 (5M toman)", got)
	}
}

// Scenario 2 (phase 7): annual SCHOOL_ENROLLMENT, 100M × 10% over 10 months → ~1M toman/month.
func TestAdvisorAccrualDueForPeriod_AnnualTenPercentTenMonths(t *testing.T) {
	advisorID := uint(9)
	pct := 10.0
	months := 10
	// 1404/11/05 (Bahman) → period key January 2026; Aban 1405 is key October 2026.
	join := time.Date(2026, 1, 25, 0, 0, 0, 0, time.Local)
	st := &Student{
		AdvisorID:                &advisorID,
		EnrollmentBillingMode:    EnrollmentBillingSchoolEnrollment,
		EnrollmentAmountCents:    1_000_000_000, // 100M toman
		AdvisorCommissionKind:    StudentAdvisorCommPercentOfContract,
		AdvisorCommissionPercent: &pct,
		AdvisorAccrualMonths:     &months,
		JoinDate:                 &join,
		Status:                   StudentStatusActive,
	}

	totalShare := AdvisorContractTotalShareCents(st)
	if totalShare != 100_000_000 { // 10M toman
		t.Fatalf("contract share=%d want 100000000", totalShare)
	}
	monthly := ComputeAdvisorMonthlyAccrualCents(st)
	if monthly != 10_000_000 { // 1M toman
		t.Fatalf("monthly slice=%d want 10000000", monthly)
	}

	// Month 1 (Jan 2026) should accrue
	due1 := AdvisorAccrualDueForPeriod(st, 2026, 1)
	if due1 != monthly {
		t.Fatalf("jan due=%d want %d", due1, monthly)
	}
	// Last month (month 10 = Oct 2026) gets remainder (same when divisible)
	due10 := AdvisorAccrualDueForPeriod(st, 2026, 10)
	if due10 != monthly {
		t.Fatalf("oct due=%d want %d", due10, monthly)
	}
	// Month 11 out of window
	if AdvisorAccrualDueForPeriod(st, 2026, 11) != 0 {
		t.Fatal("expected 0 outside accrual window")
	}
}

// Accrual months selected as Jalali months (Mehr..Tir) follow exact Jalali month keys.
func TestAdvisorAccrualDueForPeriod_JalaliMaskMehrToTir(t *testing.T) {
	advisorID := uint(9)
	fixed := int64(20_000_000)
	// Mehr..Tir = Jalali months 7..12 and 1..4 (10 months).
	mask := 0
	for _, jm := range []int{7, 8, 9, 10, 11, 12, 1, 2, 3, 4} {
		mask |= 1 << (jm - 1)
	}
	// 1405/07/05 (Mehr) — registered in Mehr.
	join := time.Date(2026, 9, 27, 0, 0, 0, 0, time.Local)
	st := &Student{
		AdvisorID:                   &advisorID,
		EnrollmentBillingMode:       EnrollmentBillingSchoolEnrollment,
		AdvisorCommissionKind:       StudentAdvisorCommFixedMonthly,
		AdvisorCommissionFixedCents: &fixed,
		AdvisorAccrualMonthMask:     &mask,
		JoinDate:                    &join,
		Status:                      StudentStatusActive,
	}
	// Shahrivar 1405 (key Aug 2026): before registration.
	if got := AdvisorAccrualDueForPeriod(st, 2026, 8); got != 0 {
		t.Fatalf("shahrivar due=%d want 0", got)
	}
	// Mehr 1405 = key Sep 2026: first accrual month.
	if got := AdvisorAccrualDueForPeriod(st, 2026, 9); got != fixed {
		t.Fatalf("mehr due=%d want %d", got, fixed)
	}
	if idx, ok := AdvisorAccrualMonthIndexForPeriod(st, 2026, 9); !ok || idx != 1 {
		t.Fatalf("mehr idx=%d ok=%v", idx, ok)
	}
	// Tir 1406 = key June 2027: 10th (last) month.
	if idx, ok := AdvisorAccrualMonthIndexForPeriod(st, 2027, 6); !ok || idx != 10 {
		t.Fatalf("tir idx=%d ok=%v", idx, ok)
	}
	// Mordad 1406 = key July 2027: not selected.
	if got := AdvisorAccrualDueForPeriod(st, 2027, 7); got != 0 {
		t.Fatalf("mordad due=%d want 0", got)
	}
}

func TestStudentsCountScope_Semantics(t *testing.T) {
	if StudentsCountScopeOrgTotal != "ORG_TOTAL" || StudentsCountScopeAssigned != "ASSIGNED" {
		t.Fatal("scope constants drifted")
	}
	if !(&Role{CompensationKind: CompNetRevenue}).HasOrgStudentsCountView() {
		t.Fatal("NET_REVENUE → ORG_TOTAL")
	}
	if (&Role{CompensationKind: CompVariable}).HasOrgStudentsCountView() {
		t.Fatal("VARIABLE → ASSIGNED")
	}
}

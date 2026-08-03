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
	join := time.Date(2026, 1, 15, 0, 0, 0, 0, time.Local)
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

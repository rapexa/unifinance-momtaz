package models

import "testing"

func TestStudentRolePayout_OneTimeOnlyOnFirstPaid(t *testing.T) {
	fee := int64(5_000_000)
	rp := &StudentRolePayout{AmountKind: StudentRolePayoutOneTime, FixedCents: &fee}
	if !rp.IsOneTime() {
		t.Fatal("expected IsOneTime")
	}
	if got := rp.ComputeShareCents(20_000_000, true); got != fee {
		t.Fatalf("first paid share=%d want %d", got, fee)
	}
	if got := rp.ComputeShareCents(20_000_000, false); got != 0 {
		t.Fatalf("later paid share=%d want 0", got)
	}
}

func TestStudentRolePayout_PerPaymentKindsIgnoreFirstPaid(t *testing.T) {
	fixed := int64(1_000_000)
	pct := 10.0
	fx := &StudentRolePayout{AmountKind: StudentAdvisorCommFixed, FixedCents: &fixed}
	pc := &StudentRolePayout{AmountKind: StudentAdvisorCommPercent, Percent: &pct}
	for _, first := range []bool{true, false} {
		if got := fx.ComputeShareCents(20_000_000, first); got != fixed {
			t.Fatalf("fixed first=%v share=%d want %d", first, got, fixed)
		}
		if got := pc.ComputeShareCents(20_000_000, first); got != 2_000_000 {
			t.Fatalf("percent first=%v share=%d want 2000000", first, got)
		}
	}
}

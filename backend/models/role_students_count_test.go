package models

import "testing"

func TestRole_HasOrgStudentsCountView(t *testing.T) {
	if (&Role{CompensationKind: CompNetRevenue}).HasOrgStudentsCountView() != true {
		t.Fatal("NET_REVENUE should see org total")
	}
	if (&Role{FullAccess: true, CompensationKind: CompFixed}).HasOrgStudentsCountView() != true {
		t.Fatal("full_access should see org total")
	}
	if (&Role{CompensationKind: CompVariable}).HasOrgStudentsCountView() != false {
		t.Fatal("VARIABLE without full_access should be ASSIGNED scope")
	}
	if (*Role)(nil).HasOrgStudentsCountView() != false {
		t.Fatal("nil role should be false")
	}
}

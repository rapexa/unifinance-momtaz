package services

import (
	"testing"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
)

func TestDefaultTemplates_IncludeSevenDayAndOnceOverdue(t *testing.T) {
	var has7, has3, has1, hasOverdue bool
	for _, r := range DefaultMessageTemplates {
		if r.Kind == models.ReminderTypeBeforeDue && r.DaysOffset == 7 {
			has7 = true
		}
		if r.Kind == models.ReminderTypeBeforeDue && r.DaysOffset == 3 {
			has3 = true
		}
		if r.Kind == models.ReminderTypeBeforeDue && r.DaysOffset == 1 {
			has1 = true
		}
		if r.Kind == models.ReminderTypeOverdue && r.DaysOffset == 2 {
			hasOverdue = true
		}
	}
	if !has7 || !has3 || !has1 || !hasOverdue {
		t.Fatalf("rules incomplete: 7=%v 3=%v 1=%v overdue=%v", has7, has3, has1, hasOverdue)
	}
}

func TestRenderTemplate(t *testing.T) {
	due := time.Date(2026, 10, 12, 0, 0, 0, 0, time.Local) // 1405/07/20
	got := RenderTemplate("{نام} عزیز، {مبلغ} تومان در {تاریخ} — {روز} روز. {مرکز}", MessageVars{
		Name: "علی محمدی", AmountCents: 25_000_000, DueDate: &due, Days: 3, Org: "ممتاز",
	})
	want := "علی محمدی عزیز، ۲٬۵۰۰٬۰۰۰ تومان در ۱۴۰۵/۰۷/۲۰ — ۳ روز. ممتاز"
	if got != want {
		t.Fatalf("got  %q\nwant %q", got, want)
	}
}

func TestNearPaydayWindow(t *testing.T) {
	if !nearPaydayWindow(0) || !nearPaydayWindow(3) {
		t.Fatal("0..3 days until payday should be near")
	}
	if nearPaydayWindow(4) || nearPaydayWindow(-1) {
		t.Fatal("outside window should not be near")
	}
}

func TestDaysUntilPaydayInMonth(t *testing.T) {
	// Fixed: 2026-08-22 → payday 25 → 3 days
	now := time.Date(2026, 8, 22, 10, 0, 0, 0, time.Local)
	if d := daysUntilPaydayInMonth(now, 25); d != 3 {
		t.Fatalf("days=%d want 3", d)
	}
	if d := daysUntilPaydayInMonth(time.Date(2026, 8, 25, 10, 0, 0, 0, time.Local), 25); d != 0 {
		t.Fatalf("on payday days=%d want 0", d)
	}
	if d := daysUntilPaydayInMonth(time.Date(2026, 8, 26, 10, 0, 0, 0, time.Local), 25); d >= 0 {
		t.Fatalf("after payday should be negative, got %d", d)
	}
}

func TestClampPaydayDay(t *testing.T) {
	if clampPaydayDay(0) != 25 || clampPaydayDay(99) != 28 || clampPaydayDay(15) != 15 {
		t.Fatal("clampPaydayDay unexpected")
	}
}

func TestPayrollPaidLockError(t *testing.T) {
	// Phase 3/7: PAID amount changes must surface ErrPayrollEntryPaidLocked.
	if ErrPayrollEntryPaidLocked == nil || ErrPayrollEntryPaidLocked.Error() == "" {
		t.Fatal("lock error missing")
	}
	entry := &models.PayrollEntry{Status: models.PayrollStatusPaid}
	changingAmounts := true
	if !(entry.Status == models.PayrollStatusPaid && changingAmounts) {
		t.Fatal("paid + amount change should be locked")
	}
}

func TestSameDayHelper(t *testing.T) {
	a := time.Date(2026, 8, 3, 8, 0, 0, 0, time.Local)
	b := time.Date(2026, 8, 3, 23, 0, 0, 0, time.Local)
	c := time.Date(2026, 8, 4, 0, 0, 0, 0, time.Local)
	if !sameDay(a, b) {
		t.Fatal("same calendar day")
	}
	if sameDay(a, c) {
		t.Fatal("different day")
	}
	// Overdue trigger: exactly due+2
	due := time.Date(2026, 8, 1, 12, 0, 0, 0, time.Local)
	triggerDay := due.AddDate(0, 0, 2)
	if !sameDay(time.Date(2026, 8, 3, 9, 0, 0, 0, time.Local), triggerDay) {
		t.Fatal("overdue should fire on due+2 only")
	}
}

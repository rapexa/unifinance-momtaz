package models

import (
	"time"

	"gorm.io/gorm"
)

// Staff payout sources.
const (
	StaffPayoutSourceManual   = "MANUAL"   // ثبت پرداخت دستی
	StaffPayoutSourcePayslip  = "PAYSLIP"  // از دکمه «پرداخت شد» روی فیش
	StaffPayoutSourceMigrated = "MIGRATED" // فیش‌های پرداخت‌شدهٔ قدیمی که به پرداخت تبدیل شدند
)

// StaffPayout records a cash payment from the organization to a staff member (advisor/employee).
// Accrued salary comes from payroll entries; payouts reduce the running settlement balance.
type StaffPayout struct {
	gorm.Model
	UserID      uint      `gorm:"not null;index"`
	User        User      `gorm:"constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`
	AmountCents int64     `gorm:"not null"`
	PaidAt      time.Time `gorm:"not null;index"`
	Note        string    `gorm:"size:512"`
	CreatedByID *uint
	CreatedBy   *User `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	// PayrollEntryID links payouts created from a payslip's "paid" action.
	PayrollEntryID *uint  `gorm:"index"`
	Source         string `gorm:"size:32;not null;default:'MANUAL'"`

	// BankAccountID is the account the payout was paid from (optional).
	BankAccountID *uint        `gorm:"index"`
	BankAccount   *BankAccount `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
}

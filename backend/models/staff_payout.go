package models

import (
	"time"

	"gorm.io/gorm"
)

// StaffPayout records a cash payment from the organization to a staff member (advisor/employee).
// Accrued salary comes from payroll entries; payouts reduce the settlement balance.
type StaffPayout struct {
	gorm.Model
	UserID      uint      `gorm:"not null;index"`
	User        User      `gorm:"constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`
	AmountCents int64     `gorm:"not null"`
	PaidAt      time.Time `gorm:"not null;index"`
	Note        string    `gorm:"size:512"`
	CreatedByID *uint
	CreatedBy   *User `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
}

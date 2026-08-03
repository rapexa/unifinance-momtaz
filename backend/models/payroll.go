package models

import (
	"time"

	"gorm.io/gorm"
)

type PayrollStatus string

const (
	PayrollStatusPaid    PayrollStatus = "PAID"
	PayrollStatusPending PayrollStatus = "PENDING"
)

// StudentsCountScope describes what students_count means on a payslip/KPI.
type StudentsCountScope string

const (
	StudentsCountScopeOrgTotal StudentsCountScope = "ORG_TOTAL" // all ACTIVE students (private + school)
	StudentsCountScopeAssigned StudentsCountScope = "ASSIGNED"  // advisor ∪ role payout
)


// PayrollEntry represents a monthly payslip (Payroll > فیش‌های حقوقی, Employees tab).
type PayrollEntry struct {
	gorm.Model
	UserID uint `gorm:"not null;index;uniqueIndex:idx_payroll_user_period"`
	User   User `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`

	PeriodYear  int `gorm:"not null;index;uniqueIndex:idx_payroll_user_period"`
	PeriodMonth int `gorm:"not null;index;uniqueIndex:idx_payroll_user_period"` // 1-12

	BaseSalaryCents     int64 `gorm:"not null;default:0"`
	VariableSalaryCents int64 `gorm:"not null;default:0"`
	TotalSalaryCents    int64 `gorm:"not null;default:0"`

	StudentsCount int `gorm:"not null;default:0"`

	Status PayrollStatus `gorm:"type:varchar(32);not null;index"`
	PaidAt *time.Time    `gorm:"index"`
}

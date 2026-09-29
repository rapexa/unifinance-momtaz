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

	// Status is derived from the staff ledger: PAID once cumulative payouts cover the
	// cumulative accrual up to and including this month (FIFO), PENDING otherwise.
	Status PayrollStatus `gorm:"type:varchar(32);not null;index"`
	PaidAt *time.Time    `gorm:"index"`

	// ManualOverride keeps amounts typed in by an admin; automatic recalculation skips them
	// until "محاسبه فیش" (recalculate from role rules) is requested again.
	ManualOverride bool `gorm:"not null;default:false"`
}

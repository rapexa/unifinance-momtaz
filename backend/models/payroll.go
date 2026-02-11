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

// PayrollEntry represents a monthly payslip (Payroll > فیش‌های حقوقی, Employees tab).
type PayrollEntry struct {
	gorm.Model
	UserID uint `gorm:"not null;index"`
	User   User `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`

	PeriodYear  int `gorm:"not null;index"`
	PeriodMonth int `gorm:"not null;index"` // 1-12

	BaseSalaryCents     int64 `gorm:"not null;default:0"`
	VariableSalaryCents int64 `gorm:"not null;default:0"`
	TotalSalaryCents    int64 `gorm:"not null;default:0"`

	StudentsCount int `gorm:"not null;default:0"`

	Status PayrollStatus `gorm:"type:varchar(32);not null;index"`
	PaidAt *time.Time    `gorm:"index"`
}

// PayrollScheme represents "ساختار حقوق ثابت/متغیر" per role.
type PayrollScheme struct {
	gorm.Model
	Role UserRole `gorm:"type:varchar(32);not null;uniqueIndex"`

	BaseSalaryCents   int64   `gorm:"not null;default:0"`
	PerStudentCents   int64   `gorm:"not null;default:0"`
	RevenuePercent    float64 `gorm:"not null;default:0"` // e.g. 15.0 = 15%
	MonthlyBonusCents int64   `gorm:"not null;default:0"`

	IsActive bool `gorm:"not null;default:true"`
}


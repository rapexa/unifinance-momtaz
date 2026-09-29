package models

import (
	"time"

	"gorm.io/gorm"
)

// Cost center kinds.
const (
	CostCenterKindSalary  = "SALARY"  // حقوق و دستمزد — amounts come from staff payouts
	CostCenterKindGeneral = "GENERAL" // any other expense (rent, bills, ...)
)

// CostCenter (مرکز هزینه) groups organization expenses, e.g. salaries, office rent.
type CostCenter struct {
	gorm.Model
	Name        string `gorm:"size:120;not null"`
	Kind        string `gorm:"size:16;not null;default:'GENERAL'"`
	Description string `gorm:"size:500"`
	IsSystem    bool   `gorm:"not null;default:false"`
	IsActive    bool   `gorm:"not null;default:true"`
	SortOrder   int    `gorm:"not null;default:0"`
	// Optional recurring monthly amount (e.g. rent) due on a Jalali day of month; shown in
	// the dashboard's upcoming dues until this month's expenses cover it.
	RecurringAmountCents int64 `gorm:"not null;default:0"`
	DueDay               int   `gorm:"not null;default:0"`
}

// Expense is money paid out by the organization under a cost center.
// Staff salaries are not stored here; they are staff payouts (see StaffPayout).
type Expense struct {
	gorm.Model
	CostCenterID  uint         `gorm:"not null;index"`
	CostCenter    *CostCenter  `gorm:"constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`
	AmountCents   int64        `gorm:"not null"`
	PaidAt        time.Time    `gorm:"not null;index"`
	Description   string       `gorm:"size:500"`
	BankAccountID *uint        `gorm:"index"`
	BankAccount   *BankAccount `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	CreatedByID   *uint
}

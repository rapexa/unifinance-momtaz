package models

import "gorm.io/gorm"

// How one PAID payment is split for payroll (advisor contract vs role % of gross).
const (
	ShareKindAdvisorContract = "ADVISOR_CONTRACT" // از قرارداد سهم مشاور روی دانش‌آموز
	ShareKindRoleGross       = "ROLE_GROSS"       // درصد از مبلغ کل پرداخت طبق نقش
)

// PaymentPayrollShare is one user's attributed share of a single payment for payroll aggregation.
type PaymentPayrollShare struct {
	gorm.Model
	PaymentID  uint   `gorm:"not null;uniqueIndex:idx_pps_alloc"`
	UserID     uint   `gorm:"not null;uniqueIndex:idx_pps_alloc"`
	Kind       string `gorm:"size:32;not null;uniqueIndex:idx_pps_alloc"`
	ShareCents int64  `gorm:"not null"`
	Payment    Payment `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	User       User    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`
}

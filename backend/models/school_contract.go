package models

import (
	"time"

	"github.com/soheilsshh/unifinance-momtaz/pkg/jalali"

	"gorm.io/gorm"
)

type SchoolContractStatus string

const (
	SchoolContractStatusActive   SchoolContractStatus = "ACTIVE"
	SchoolContractStatusInactive SchoolContractStatus = "INACTIVE"
	SchoolContractStatusSettled  SchoolContractStatus = "SETTLED"
)

// School contract payment types (نوع پرداخت قرارداد مدرسه).
const (
	SchoolPaymentMonthly = "MONTHLY" // ماهانه
	SchoolPaymentTerm    = "TERM"    // دوره‌ای (تابستان یا مهر تا خرداد)
	SchoolPaymentAnnual  = "ANNUAL"  // سالانه
)

// School contract terms for TERM payment type.
const (
	SchoolTermSummer   = "SUMMER"   // دوره تابستان: تیر تا شهریور
	SchoolTermAcademic = "ACADEMIC" // دوره تحصیلی: مهر تا خرداد
)

// SchoolContract is a bulk enrollment deal with a school.
// Individual pupils are Student rows with registration_channel=SCHOOL and school_contract_id set.
//
// Billing: TotalAmountCents is the contract ceiling. paid_total / remaining for the contract are
// derived from PAID payments on linked Student rows (not legacy school_contract_id payments).
// UnitPriceCents is deprecated and must not drive TotalAmountCents.
type SchoolContract struct {
	gorm.Model
	SchoolName       string               `gorm:"size:200;not null;index"`
	StudentCount     int                  `gorm:"not null"`
	UnitPriceCents   int64                `gorm:"not null"` // مبلغ هر دانش‌آموز (per student)
	TotalAmountCents int64                `gorm:"not null"` // source of truth for contract amount
	Status           SchoolContractStatus `gorm:"type:varchar(32);not null;default:'ACTIVE';index"`
	Notes            string               `gorm:"size:1000"`
	StartDate        *time.Time
	EndDate          *time.Time
	// PaymentType: MONTHLY | TERM | ANNUAL; Term (for TERM): SUMMER | ACADEMIC.
	PaymentType string `gorm:"type:varchar(16);not null;default:'ANNUAL'"`
	Term        string `gorm:"type:varchar(16)"`

	OrganizationID *uint         `gorm:"index"`
	Organization   *Organization `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	Payments []Payment `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

// Normalize clamps invalid student counts. Does not derive total from unit price.
func (c *SchoolContract) Normalize() {
	if c == nil {
		return
	}
	if c.StudentCount < 0 {
		c.StudentCount = 0
	}
}

// RecalcTotal is deprecated. TotalAmountCents is stored directly; this only normalizes count.
func (c *SchoolContract) RecalcTotal() {
	c.Normalize()
}

// DurationMonths is the number of Jalali months the contract covers (0 when dates are missing).
func (c *SchoolContract) DurationMonths() int {
	if c == nil || c.StartDate == nil || c.EndDate == nil || c.EndDate.Before(*c.StartDate) {
		return 0
	}
	sy, sm := jalali.KeyForTime(*c.StartDate)
	ey, em := jalali.KeyForTime(*c.EndDate)
	return jalali.KeyIndex(ey, em) - jalali.KeyIndex(sy, sm) + 1
}

// InstallmentCents is the expected amount per installment: monthly contracts are split over
// their months; term and annual contracts are a single amount for the period.
func (c *SchoolContract) InstallmentCents() int64 {
	if c == nil {
		return 0
	}
	if c.PaymentType == SchoolPaymentMonthly {
		if n := c.DurationMonths(); n > 0 {
			return c.TotalAmountCents / int64(n)
		}
	}
	return c.TotalAmountCents
}

// RemainingBalanceCents is total − paid (may be negative if overpaid).
func (c *SchoolContract) RemainingBalanceCents(paidSum int64) int64 {
	if c == nil {
		return 0
	}
	return c.TotalAmountCents - paidSum
}

package models

import (
	"time"

	"gorm.io/gorm"
)

type SchoolContractStatus string

const (
	SchoolContractStatusActive   SchoolContractStatus = "ACTIVE"
	SchoolContractStatusInactive SchoolContractStatus = "INACTIVE"
	SchoolContractStatusSettled  SchoolContractStatus = "SETTLED"
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
	UnitPriceCents   int64                `gorm:"not null"` // deprecated; kept for DB compat / legacy rows
	TotalAmountCents int64                `gorm:"not null"` // source of truth for contract amount
	Status           SchoolContractStatus `gorm:"type:varchar(32);not null;default:'ACTIVE';index"`
	Notes            string               `gorm:"size:1000"`
	StartDate        *time.Time

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

// RemainingBalanceCents is total − paid (may be negative if overpaid).
func (c *SchoolContract) RemainingBalanceCents(paidSum int64) int64 {
	if c == nil {
		return 0
	}
	return c.TotalAmountCents - paidSum
}

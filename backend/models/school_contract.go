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
// Payments for the deal attach to this contract (not to each student).
type SchoolContract struct {
	gorm.Model
	SchoolName       string               `gorm:"size:200;not null;index"`
	StudentCount     int                  `gorm:"not null"`
	UnitPriceCents   int64                `gorm:"not null"`
	TotalAmountCents int64                `gorm:"not null"`
	Status           SchoolContractStatus `gorm:"type:varchar(32);not null;default:'ACTIVE';index"`
	Notes            string               `gorm:"size:1000"`
	StartDate        *time.Time

	OrganizationID *uint         `gorm:"index"`
	Organization   *Organization `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	Payments []Payment `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

// RecalcTotal sets TotalAmountCents = StudentCount × UnitPriceCents.
func (c *SchoolContract) RecalcTotal() {
	if c == nil {
		return
	}
	if c.StudentCount < 0 {
		c.StudentCount = 0
	}
	c.TotalAmountCents = int64(c.StudentCount) * c.UnitPriceCents
}

// RemainingBalanceCents is total − paid (may be negative if overpaid).
func (c *SchoolContract) RemainingBalanceCents(paidSum int64) int64 {
	if c == nil {
		return 0
	}
	return c.TotalAmountCents - paidSum
}

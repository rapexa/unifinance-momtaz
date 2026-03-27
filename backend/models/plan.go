package models

import "gorm.io/gorm"

type PlanType string

const (
	PlanTypeMonthly      PlanType = "MONTHLY"
	PlanTypeYearly       PlanType = "YEARLY"
	PlanTypeSingleSession PlanType = "SINGLE_SESSION"
	PlanTypeCourse       PlanType = "COURSE"
)

// Plan is a template for the billing cycle type (no price — amount is set per-student enrollment).
type Plan struct {
	gorm.Model
	Name     string   `gorm:"size:255;not null"`
	Type     PlanType `gorm:"type:varchar(32);not null;index"`
	IsActive bool     `gorm:"not null;default:true;index"`

	OrganizationID *uint         `gorm:"index"`
	Organization   *Organization `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	Enrollments []Enrollment  `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Features    []PlanFeature `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

// PlanFeature represents entries under "امکانات" list in plan cards.
type PlanFeature struct {
	gorm.Model
	PlanID      uint   `gorm:"not null;index"`
	Plan        Plan   `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Description string `gorm:"size:255;not null"`
}

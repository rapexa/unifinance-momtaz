package models

import "gorm.io/gorm"

type PlanType string

const (
	PlanTypeMonthly  PlanType = "MONTHLY"
	PlanTypeYearly   PlanType = "YEARLY"
	PlanTypeWorkshop PlanType = "WORKSHOP"
	PlanTypeCourse   PlanType = "COURSE"
)

// Plan maps to frontend "پلن‌ها و خدمات" (/plans).
type Plan struct {
	gorm.Model
	Name   string   `gorm:"size:255;not null"`
	Type   PlanType `gorm:"type:varchar(32);not null;index"`
	// Price in smallest currency unit (e.g. rials or tomans*10)
	PriceCents int64 `gorm:"not null;default:0"`
	// Optional discount percentage (e.g. 10.0 = 10%)
	DiscountPercent *float64
	IsActive        bool `gorm:"not null;default:true;index"`

	OrganizationID *uint
	Organization   *Organization

	Enrollments []Enrollment
	Features    []PlanFeature
}

// PlanFeature represents entries under "امکانات" list in plan cards.
type PlanFeature struct {
	gorm.Model
	PlanID      uint   `gorm:"not null;index"`
	Plan        Plan
	Description string `gorm:"size:255;not null"`
}


package models

import (
	"math"

	"gorm.io/gorm"
)

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
	// Optional discount percentage (e.g. 10.0 = 10% off list price)
	DiscountPercent *float64
	// When true, EffectiveEnrollmentPriceCents uses DiscountPercent; otherwise list PriceCents is used for enrollments.
	DiscountApplyOnEnrollment bool `gorm:"not null;default:false;index"`
	IsActive                  bool `gorm:"not null;default:true;index"`
	// Optional limit on number of users/students for this plan
	MaxUsers *int

	OrganizationID *uint         `gorm:"index"`
	Organization   *Organization `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	// When a plan is deleted, it's safe to delete enrollments referencing it.
	Enrollments []Enrollment `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Features    []PlanFeature `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

// EffectiveEnrollmentPriceCents returns the price stored on enrollment rows when a student registers with this plan.
func EffectiveEnrollmentPriceCents(p *Plan) int64 {
	if p == nil {
		return 0
	}
	if !p.DiscountApplyOnEnrollment || p.DiscountPercent == nil || *p.DiscountPercent <= 0 {
		return p.PriceCents
	}
	pct := *p.DiscountPercent
	if pct >= 100 {
		return 0
	}
	return int64(math.Round(float64(p.PriceCents) * (100 - pct) / 100.0))
}

// PlanFeature represents entries under "امکانات" list in plan cards.
type PlanFeature struct {
	gorm.Model
	PlanID      uint `gorm:"not null;index"`
	Plan        Plan `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Description string `gorm:"size:255;not null"`
}


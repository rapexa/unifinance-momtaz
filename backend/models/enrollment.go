package models

import (
	"time"

	"gorm.io/gorm"
)

type EnrollmentStatus string

const (
	EnrollmentStatusActive    EnrollmentStatus = "ACTIVE"
	EnrollmentStatusCancelled EnrollmentStatus = "CANCELLED"
	EnrollmentStatusCompleted EnrollmentStatus = "COMPLETED"
)

// Enrollment links Students to Plans (active subscriptions / registrations).
type Enrollment struct {
	gorm.Model
	StudentID uint    `gorm:"not null;index"`
	Student   Student `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	PlanID    uint    `gorm:"not null;index"`
	Plan      Plan    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`

	StartDate time.Time
	EndDate   *time.Time

	Status     EnrollmentStatus `gorm:"type:varchar(32);not null;default:'ACTIVE';index"`
	PriceCents int64            `gorm:"not null;default:0"`
}


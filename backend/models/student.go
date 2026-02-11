package models

import (
	"time"

	"gorm.io/gorm"
)

type StudentStatus string

const (
	StudentStatusActive   StudentStatus = "ACTIVE"
	StudentStatusInactive StudentStatus = "INACTIVE"
)

// Student represents a student/client in the consulting group.
// Used by /students, /payments, /reminders, reports, etc.
type Student struct {
	gorm.Model
	FirstName string        `gorm:"size:100;not null"`
	LastName  string        `gorm:"size:100;not null"`
	Email     string        `gorm:"size:255;index"`
	Phone     string        `gorm:"size:20;index"`
	Status    StudentStatus `gorm:"type:varchar(32);not null;default:'ACTIVE';index"`
	JoinDate  *time.Time

	// Financial balance (in smallest unit, e.g. rials)
	BalanceCents int64 `gorm:"not null;default:0"`

	// Advisor is the user responsible for this student.
	AdvisorID *uint `gorm:"index"`
	Advisor   *User `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	CurrentPlanID *uint `gorm:"index"`
	CurrentPlan   *Plan `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	OrganizationID *uint         `gorm:"index"`
	Organization   *Organization `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	// When a student is deleted, related enrollments, payments, and reminders are removed.
	Enrollments []Enrollment    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Payments    []Payment       `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Reminders   []PaymentReminder `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}


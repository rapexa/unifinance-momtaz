package models

import (
	"math"
	"time"

	"gorm.io/gorm"
)

type StudentStatus string

const (
	StudentStatusActive   StudentStatus = "ACTIVE"
	StudentStatusInactive StudentStatus = "INACTIVE"
	StudentStatusDeleted  StudentStatus = "DELETED"
)

// StudentAdvisorCommissionKind defines how advisor earnings are computed per paid payment.
type StudentAdvisorCommissionKind string

const (
	StudentAdvisorCommNone    StudentAdvisorCommissionKind = "NONE"
	StudentAdvisorCommPercent StudentAdvisorCommissionKind = "PERCENT"
	StudentAdvisorCommFixed   StudentAdvisorCommissionKind = "FIXED_PER_PAYMENT"
)

// ComputeAdvisorShareCents returns the advisor's share for one payment amount from student contract rules.
func ComputeAdvisorShareCents(st *Student, amountCents int64) int64 {
	if st == nil || st.AdvisorID == nil || amountCents <= 0 {
		return 0
	}
	switch st.AdvisorCommissionKind {
	case StudentAdvisorCommPercent:
		if st.AdvisorCommissionPercent == nil {
			return 0
		}
		p := *st.AdvisorCommissionPercent
		if p <= 0 {
			return 0
		}
		return int64(math.Round(float64(amountCents) * p / 100.0))
	case StudentAdvisorCommFixed:
		if st.AdvisorCommissionFixedCents == nil {
			return 0
		}
		v := *st.AdvisorCommissionFixedCents
		if v < 0 {
			return 0
		}
		return v
	default:
		return 0
	}
}

// Student represents a student/client in the consulting group.
// Used by /students, /payments, /reminders, reports, etc.
type Student struct {
	gorm.Model
	FirstName string        `gorm:"size:100;not null"`
	LastName  string        `gorm:"size:100;not null"`
	Email     string        `gorm:"size:255;index"`
	Phone     string        `gorm:"size:20;index"`
	Status    StudentStatus `gorm:"type:varchar(32);not null;default:'ACTIVE';index"`
	// JoinDate is the advisory/consulting start date (calendar day; time is normalized to local midnight).
	JoinDate *time.Time

	// Parent contacts
	FatherPhone string `gorm:"size:20"`
	MotherPhone string `gorm:"size:20"`
	FatherJob   string `gorm:"size:120"`
	MotherJob   string `gorm:"size:120"`

	// Per-payment advisor commission (when AdvisorID is set)
	AdvisorCommissionKind       StudentAdvisorCommissionKind `gorm:"type:varchar(32);not null;default:'NONE'"`
	AdvisorCommissionPercent    *float64                     `gorm:""` // 0–100 when kind = PERCENT
	AdvisorCommissionFixedCents *int64                       `gorm:""` // per PAID payment when kind = FIXED_PER_PAYMENT

	// School info
	SchoolName    string `gorm:"size:200"`
	SchoolAddress string `gorm:"size:500"`

	// Home address
	HomeAddress string `gorm:"size:500"`

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
	Enrollments        []Enrollment        `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Payments           []Payment           `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Reminders          []PaymentReminder   `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	StudentRolePayouts []StudentRolePayout `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

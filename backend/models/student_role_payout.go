package models

import (
	"math"

	"gorm.io/gorm"
)

// StudentRolePayoutOneTime is a fixed amount paid once per student (e.g. sales acquisition fee / حق جذب).
// It is attributed only to the student's first PAID payment (earliest paid_at, then id).
const StudentRolePayoutOneTime StudentAdvisorCommissionKind = "ONE_TIME"

// StudentRolePayout defines an optional per-student payout for a specific user/role.
// PERCENT / FIXED_PER_PAYMENT apply on each PAID payment of that student; ONE_TIME only on the first one.
// Independent from global role/plan settings.
type StudentRolePayout struct {
	gorm.Model
	StudentID uint `gorm:"not null;index;uniqueIndex:idx_student_role_user"`
	RoleID    uint `gorm:"not null;index"`
	UserID    uint `gorm:"not null;index;uniqueIndex:idx_student_role_user"`

	AmountKind StudentAdvisorCommissionKind `gorm:"type:varchar(32);not null;default:'FIXED_PER_PAYMENT'"`
	Percent    *float64                     `gorm:""`
	FixedCents *int64                       `gorm:""`

	Student *Student `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Role    *Role    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`
	User    *User    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`
}

// IsOneTime reports a payout that is paid only on the student's first PAID payment.
func (s *StudentRolePayout) IsOneTime() bool {
	return s != nil && s.AmountKind == StudentRolePayoutOneTime
}

// ComputeShareCents returns this payout's share of one PAID payment.
// isFirstPaid tells whether the payment is the student's first PAID payment (needed for ONE_TIME).
func (s *StudentRolePayout) ComputeShareCents(amountCents int64, isFirstPaid bool) int64 {
	if s == nil || amountCents <= 0 {
		return 0
	}
	switch s.AmountKind {
	case StudentRolePayoutOneTime:
		if !isFirstPaid || s.FixedCents == nil || *s.FixedCents < 0 {
			return 0
		}
		return *s.FixedCents
	case StudentAdvisorCommPercent:
		if s.Percent == nil || *s.Percent <= 0 {
			return 0
		}
		return int64(math.Round(float64(amountCents) * (*s.Percent) / 100.0))
	case StudentAdvisorCommFixed:
		if s.FixedCents == nil || *s.FixedCents < 0 {
			return 0
		}
		return *s.FixedCents
	default:
		return 0
	}
}

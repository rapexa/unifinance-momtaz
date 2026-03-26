package models

import "gorm.io/gorm"

// StudentRolePayout defines an optional per-student payout for a specific user/role.
// It is applied on each PAID payment of that student, independent from global role/plan settings.
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

func (s *StudentRolePayout) ComputeShareCents(amountCents int64) int64 {
	if s == nil || amountCents <= 0 {
		return 0
	}
	switch s.AmountKind {
	case StudentAdvisorCommPercent:
		if s.Percent == nil || *s.Percent <= 0 {
			return 0
		}
		return int64(float64(amountCents) * (*s.Percent) / 100.0)
	case StudentAdvisorCommFixed:
		if s.FixedCents == nil || *s.FixedCents < 0 {
			return 0
		}
		return *s.FixedCents
	default:
		return 0
	}
}

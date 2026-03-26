package models

import "gorm.io/gorm"

type CompensationTargetKind string
type CompensationAmountKind string
type CompensationScopeKind string
type CompensationPaymentType string

const (
	CompTargetAdvisorContract CompensationTargetKind = "ADVISOR_CONTRACT"
	CompTargetRole            CompensationTargetKind = "ROLE"
	CompTargetUser            CompensationTargetKind = "USER"
)

const (
	CompAmountFixed   CompensationAmountKind = "FIXED"
	CompAmountPercent CompensationAmountKind = "PERCENT"
)

const (
	CompScopeAll      CompensationScopeKind = "ALL_STUDENTS"
	CompScopeSelected CompensationScopeKind = "SELECTED_STUDENTS"
	CompScopeCapacity CompensationScopeKind = "CAPACITY"
)

const (
	CompPaymentTypeAll           CompensationPaymentType = "ALL"
	CompPaymentTypeSingleSession CompensationPaymentType = "SINGLE_SESSION"
	CompPaymentTypeMonthly       CompensationPaymentType = "MONTHLY"
	CompPaymentTypeCourse        CompensationPaymentType = "COURSE"
)

type CompensationRule struct {
	gorm.Model
	Name        string `gorm:"size:200;not null"`
	IsActive    bool   `gorm:"not null;default:true;index"`
	Priority    int    `gorm:"not null;default:100;index"`
	TargetKind  CompensationTargetKind  `gorm:"type:varchar(32);not null;index"`
	AmountKind  CompensationAmountKind  `gorm:"type:varchar(32);not null"`
	ScopeKind   CompensationScopeKind   `gorm:"type:varchar(32);not null;default:'ALL_STUDENTS'"`
	PaymentType CompensationPaymentType `gorm:"type:varchar(32);not null;default:'ALL';index"`

	RoleID *uint `gorm:"index"`
	Role   *Role `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	UserID *uint `gorm:"index"`
	User   *User `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	FixedCents *int64
	Percent    *float64

	CapacityLimit *int

	Students []CompensationRuleStudent `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

type CompensationRuleStudent struct {
	gorm.Model
	CompensationRuleID uint             `gorm:"not null;uniqueIndex:idx_rule_student"`
	CompensationRule   CompensationRule `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	StudentID          uint             `gorm:"not null;uniqueIndex:idx_rule_student"`
	Student            Student          `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

// Keeps track of students already consumed by CAPACITY rules per user.
type CompensationRuleUserStudent struct {
	gorm.Model
	CompensationRuleID uint             `gorm:"not null;uniqueIndex:idx_rule_user_student"`
	CompensationRule   CompensationRule `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	UserID             uint             `gorm:"not null;uniqueIndex:idx_rule_user_student"`
	User               User             `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	StudentID          uint             `gorm:"not null;uniqueIndex:idx_rule_user_student"`
	Student            Student          `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}


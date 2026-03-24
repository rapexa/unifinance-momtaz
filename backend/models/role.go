package models

import "gorm.io/gorm"

// CompensationKind defines how payroll is calculated for users with this role.
// FIXED: monthly base in fixed_cents.
// PERCENT: variable = percent_of_student_payments × (sum of paid amounts for students assigned to the user in the period).
// PER_UNIT: variable = floor(student_paid_volume_cents / revenue_unit_cents) × amount_per_unit_cents.
type CompensationKind string

const (
	CompFixed    CompensationKind = "FIXED"
	CompPercent  CompensationKind = "PERCENT"
	CompPerUnit  CompensationKind = "PER_UNIT"
)

// Canonical role codes (slug). Display name is in Name (Persian).
const (
	RoleCodeGeneralManager    = "general_manager"    // مدیرکل
	RoleCodeAdvisor           = "advisor"            // مشاور
	RoleCodeSecretary         = "secretary"          // منشی
	RoleCodeSupport           = "support"            // پشتیبان
	RoleCodeExecutiveManager  = "executive_manager"  // مدیر اجرایی
	RoleCodeAdvisorLead       = "advisor_lead"       // سرپرست مشاوران
)

// Role is a configurable job role with RBAC template and compensation rules.
type Role struct {
	gorm.Model
	Code        string `gorm:"size:64;not null;uniqueIndex"`
	Name        string `gorm:"size:128;not null"`
	Description string `gorm:"size:500"`
	IsSystem    bool   `gorm:"not null;default:false"`
	// FullAccess grants all permissions (مدیرکل).
	FullAccess bool `gorm:"not null;default:false"`

	CompensationKind CompensationKind `gorm:"type:varchar(32);not null"`
	FixedCents       *int64             `gorm:""` // required when FIXED (can be 0)
	// PercentOfStudentPayments is 0–100 when CompensationKind is PERCENT.
	PercentOfStudentPayments *float64 `gorm:""`
	// PercentOfGrossStudentPayment: each user with this role gets this % of every PAID payment's amount_cents
	// (حقوق متغیر اضافه؛ جدا از نوع حقوق اصلی نقش). Optional; nil or 0 = disabled.
	PercentOfGrossStudentPayment *float64 `gorm:""`
	// RevenueUnitCents: volume step (e.g. 10_000_000 = 100M rials) for PER_UNIT.
	RevenueUnitCents *int64 `gorm:""`
	// AmountPerUnitCents: pay this many cents per full revenue unit when PER_UNIT.
	AmountPerUnitCents *int64 `gorm:""`

	Permissions []RolePermission `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;" json:"-"`
	Users       []User           `gorm:"constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;" json:"-"`
}

// RolePermission is the default permission set for a role (copied to users on create / role change).
type RolePermission struct {
	gorm.Model
	RoleID     uint       `gorm:"not null;uniqueIndex:idx_role_permission"`
	Permission Permission `gorm:"type:varchar(64);not null;uniqueIndex:idx_role_permission"`
	Role       *Role      `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

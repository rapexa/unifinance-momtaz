package models

import "gorm.io/gorm"

// CompensationKind defines how payroll is calculated for users with this role.
// FIXED: monthly base in fixed_cents.
// VARIABLE: salary is computed from the sum of StudentRolePayout shares attributed to the user's students in the period.
// NET_REVENUE: salary = total student payments this month − sum of all other employees' salaries (مدیرکل).
type CompensationKind string

const (
	CompFixed      CompensationKind = "FIXED"
	CompVariable   CompensationKind = "VARIABLE"
	CompNetRevenue CompensationKind = "NET_REVENUE"
)

// Canonical role codes (slug). Display name is in Name (Persian).
const (
	RoleCodeGeneralManager = "general_manager" // مدیرکل — تنها نقش سیستمی
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
	// FixedCents: required when CompensationKind = FIXED (can be 0).
	FixedCents *int64 `gorm:""`

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

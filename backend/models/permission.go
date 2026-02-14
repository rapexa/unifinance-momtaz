package models

import "gorm.io/gorm"

// Permission is a string constant for RBAC (e.g. DASHBOARD, STUDENTS, USERS).
type Permission string

const (
	PermDashboard Permission = "DASHBOARD"
	PermStudents  Permission = "STUDENTS"
	PermUsers     Permission = "USERS"
	PermPlans     Permission = "PLANS"
	PermPayments  Permission = "PAYMENTS"
	PermPayroll   Permission = "PAYROLL"
	PermReminders Permission = "REMINDERS"
	PermReports   Permission = "REPORTS"
	PermSettings  Permission = "SETTINGS"
)

// AllPermissions lists every permission for UI and validation.
var AllPermissions = []Permission{
	PermDashboard, PermStudents, PermUsers, PermPlans, PermPayments,
	PermPayroll, PermReminders, PermReports, PermSettings,
}

// UserPermission links a user to a permission (for RBAC).
type UserPermission struct {
	gorm.Model
	UserID     uint       `gorm:"not null;uniqueIndex:idx_user_permission"`
	Permission Permission `gorm:"type:varchar(64);not null;uniqueIndex:idx_user_permission"`
	User       *User      `gorm:"constraint:OnDelete:CASCADE"`
}

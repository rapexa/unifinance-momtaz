package models

import "gorm.io/gorm"

// Organization stores general settings for the consulting group (Settings > General tab).
type Organization struct {
	gorm.Model
	Name    string `gorm:"size:255;not null"`
	Phone   string `gorm:"size:20"`
	Address string `gorm:"size:500"`
	Email   string `gorm:"size:255"`
	// PaydayDay is the Jalali day-of-month (1–28) when employee salaries are typically paid.
	// Used for payroll pending reminders. Default 25.
	PaydayDay int `gorm:"not null;default:25"`

	// One organization can have many users, students, plans, settings and reminder rules.
	// Foreign keys are on the child models (OrganizationID).
	Users     []User            `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	Students  []Student         `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	Plans     []Plan            `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	Settings  []PaymentSettings `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Reminders []ReminderRule    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
}


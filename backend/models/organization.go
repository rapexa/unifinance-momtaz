package models

import "gorm.io/gorm"

// Organization stores general settings for the consulting group (Settings > General tab).
type Organization struct {
	gorm.Model
	Name    string `gorm:"size:255;not null"`
	Phone   string `gorm:"size:20"`
	Address string `gorm:"size:500"`
	Email   string `gorm:"size:255"`

	Users     []User
	Students  []Student
	Plans     []Plan
	Settings  []PaymentSettings
	Reminders []ReminderRule
}


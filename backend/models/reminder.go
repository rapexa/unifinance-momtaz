package models

import (
	"time"

	"gorm.io/gorm"
)

type ReminderType string

const (
	ReminderTypeBeforeDue ReminderType = "BEFORE_DUE" // "۳ روز قبل"
	ReminderTypeDueDay    ReminderType = "DUE_DAY"    // "روز سررسید"
	ReminderTypeOverdue   ReminderType = "OVERDUE"    // "پس از تأخیر"
)

type ReminderChannel string

const (
	ReminderChannelTelegram ReminderChannel = "TELEGRAM"
	ReminderChannelSMS      ReminderChannel = "SMS"
)

type ReminderStatus string

const (
	ReminderStatusSent    ReminderStatus = "SENT"
	ReminderStatusPending ReminderStatus = "PENDING"
	ReminderStatusFailed  ReminderStatus = "FAILED"
)

// ReminderRule corresponds to the three cards in /reminders settings.
type ReminderRule struct {
	gorm.Model
	Type       ReminderType    `gorm:"type:varchar(32);not null;uniqueIndex:idx_rule_type_channel_offset"`
	DaysOffset int             `gorm:"not null;default:0;uniqueIndex:idx_rule_type_channel_offset"`
	Channel    ReminderChannel `gorm:"type:varchar(32);not null;uniqueIndex:idx_rule_type_channel_offset"`
	Enabled    bool            `gorm:"not null;default:true"`

	OrganizationID *uint
	Organization   *Organization
}

// PaymentReminder is a log for actual reminder sends per student/payment.
type PaymentReminder struct {
	gorm.Model
	StudentID uint `gorm:"not null;index"`
	Student   Student

	PaymentID *uint `gorm:"index"`
	Payment   *Payment

	RuleID *uint `gorm:"index"`
	Rule   *ReminderRule

	AmountCents int64 `gorm:"not null;default:0"`

	Status  ReminderStatus  `gorm:"type:varchar(32);not null;index"`
	Channel ReminderChannel `gorm:"type:varchar(32);not null;index"`

	SentAt *time.Time `gorm:"index"`
}


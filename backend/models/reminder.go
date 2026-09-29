package models

import (
	"time"

	"gorm.io/gorm"
)

type ReminderType string

const (
	ReminderTypeBeforeDue       ReminderType = "BEFORE_DUE"       // قبل از سررسید پرداخت دانش‌آموز
	ReminderTypeDueDay          ReminderType = "DUE_DAY"          // روز سررسید
	ReminderTypeOverdue         ReminderType = "OVERDUE"          // پس از تأخیر
	ReminderTypePayrollPending  ReminderType = "PAYROLL_PENDING"  // فیش حقوقی در انتظار نزدیک موعد
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

	OrganizationID *uint         `gorm:"index"`
	Organization   *Organization `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
}

// PaymentReminder is a log for actual reminder sends per student/payment.
type PaymentReminder struct {
	gorm.Model
	StudentID uint    `gorm:"not null;index"`
	Student   Student `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`

	PaymentID *uint    `gorm:"index"`
	Payment   *Payment `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	// RuleType + DaysOffset replace the old nullable RuleID foreign key.
	// Rules are now hard-coded in the service; no reminder_rules table is needed.
	RuleType   string `gorm:"size:32;index"`
	DaysOffset int    `gorm:"not null;default:0"`

	AmountCents int64 `gorm:"not null;default:0"`

	Status  ReminderStatus  `gorm:"type:varchar(32);not null;index"`
	Channel ReminderChannel `gorm:"type:varchar(32);not null;index"`

	SentAt *time.Time `gorm:"index"`

	// DueDate is the installment/invoice due date the reminder was about (dedupe key).
	DueDate *time.Time `gorm:"index"`
	// TemplateKey is the message template used (e.g. BEFORE_DUE_7, MANUAL).
	TemplateKey string `gorm:"size:32;index"`
	// Message is the exact text sent (empty for panel patterns).
	Message string `gorm:"type:text"`
	// Recipients is a comma-separated list of phone numbers the SMS went to.
	Recipients string `gorm:"size:255"`
	Error      string `gorm:"size:500"`
}

// MessageTemplate is an editable SMS text (Reminders > متن پیامک‌ها).
// Placeholders: {نام} {مبلغ} {تاریخ} {روز} {مرکز}
type MessageTemplate struct {
	gorm.Model
	Key        string       `gorm:"size:32;not null;uniqueIndex"`
	Title      string       `gorm:"size:120;not null"`
	Kind       ReminderType `gorm:"type:varchar(32);not null"` // BEFORE_DUE | OVERDUE | MANUAL
	DaysOffset int          `gorm:"not null;default:0"`
	Body       string       `gorm:"type:text;not null"`
	Enabled    bool         `gorm:"not null;default:true"`
	SortOrder  int          `gorm:"not null;default:0"`
}

// ReminderTypeManual marks SMS sent by hand from the debtors list.
const ReminderTypeManual ReminderType = "MANUAL"

// PayrollReminder logs in-app (and optional SMS) reminders for unpaid employee payslips.
type PayrollReminder struct {
	gorm.Model
	UserID uint `gorm:"not null;index"`
	User   User `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`

	PayrollEntryID uint          `gorm:"not null;index"`
	PayrollEntry   PayrollEntry  `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`

	PeriodYear  int `gorm:"not null;index"`
	PeriodMonth int `gorm:"not null;index"`

	RuleType         string `gorm:"size:32;index"`
	DaysBeforePayday int    `gorm:"not null;default:0"`

	TotalSalaryCents int64 `gorm:"not null;default:0"`

	Status  ReminderStatus  `gorm:"type:varchar(32);not null;index"`
	Channel ReminderChannel `gorm:"type:varchar(32);not null;index"`

	SentAt *time.Time `gorm:"index"`
}


package models

import (
	"time"

	"gorm.io/gorm"
)

type PaymentStatus string

const (
	PaymentStatusPaid    PaymentStatus = "PAID"
	PaymentStatusPending PaymentStatus = "PENDING"
	PaymentStatusOverdue PaymentStatus = "OVERDUE"
	PaymentStatusCancelled PaymentStatus = "CANCELLED"
)

type PaymentMethod string

const (
	PaymentMethodCardToCard  PaymentMethod = "CARD_TO_CARD"
	PaymentMethodGateway     PaymentMethod = "GATEWAY"
	PaymentMethodCash        PaymentMethod = "CASH"
	PaymentMethodInstallment PaymentMethod = "INSTALLMENT"
	PaymentMethodOther       PaymentMethod = "OTHER"
)

type PaymentType string

const (
	PaymentTypeSingleSession PaymentType = "SINGLE_SESSION"
	PaymentTypeMonthly       PaymentType = "MONTHLY"
	PaymentTypeCourse        PaymentType = "COURSE"
)

// Payment supports data on /payments and dashboard recent payments.
type Payment struct {
	gorm.Model
	StudentID uint    `gorm:"not null;index"`
	Student   Student `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	// Optional link to an Enrollment
	EnrollmentID *uint
	Enrollment   *Enrollment `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	AmountCents int64  `gorm:"not null"`
	Currency    string `gorm:"size:3;not null;default:'IRR'"`

	Description string `gorm:"size:500"`

	Status PaymentStatus `gorm:"type:varchar(32);not null;index"`
	Method PaymentMethod `gorm:"type:varchar(32);not null;index"`
	Type   PaymentType   `gorm:"type:varchar(32);not null;default:'MONTHLY';index"`

	DueDate *time.Time `gorm:"index"`
	PaidAt  *time.Time `gorm:"index"`

	// AdvisorShareCents is set when status = PAID from the student's advisor commission rules.
	AdvisorShareCents int64 `gorm:"not null;default:0;index"`

	// For reconciliation with gateway or offline references
	ReferenceCode string `gorm:"size:255;index"`

	// ZarinpalAuthority stores the authority token from ZarinPal during an in-flight
	// payment so the callback can look up the payment record.
	ZarinpalAuthority string `gorm:"size:100;index"`
}


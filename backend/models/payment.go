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
// Either StudentID or SchoolContractID must be set (not both for school bulk payments).
type Payment struct {
	gorm.Model
	StudentID *uint    `gorm:"index"`
	Student   *Student `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	// Optional link to an Enrollment
	EnrollmentID *uint
	Enrollment   *Enrollment `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	// SchoolContractID links a payment to a school bulk contract (no Student row).
	SchoolContractID *uint
	SchoolContract   *SchoolContract `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	// ContractStudentCount is a snapshot of school_contract.student_count at payment time
	// (used for per-student display if the contract count is edited later).
	ContractStudentCount int `gorm:"not null;default:0"`

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

// IsLegacySchoolContractPayment reports a historical contract-only payment
// (school_contract_id set, no student_id). These are cash-collection-only and
// excluded from the new per-student school paid_total.
func (p *Payment) IsLegacySchoolContractPayment() bool {
	if p == nil || p.SchoolContractID == nil || *p.SchoolContractID == 0 {
		return false
	}
	return p.StudentID == nil || *p.StudentID == 0
}

// IsSchoolContractPayment is kept as an alias for legacy contract-only payments.
func (p *Payment) IsSchoolContractPayment() bool {
	return p.IsLegacySchoolContractPayment()
}

// PerStudentAmountCents returns amount / snapshot student count (0 if not applicable).
func (p *Payment) PerStudentAmountCents() int64 {
	if p == nil || p.ContractStudentCount <= 0 || p.AmountCents == 0 {
		return 0
	}
	return p.AmountCents / int64(p.ContractStudentCount)
}


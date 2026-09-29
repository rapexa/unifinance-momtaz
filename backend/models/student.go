package models

import (
	"math"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/pkg/jalali"
	"gorm.io/gorm"
)

type StudentStatus string

const (
	StudentStatusActive   StudentStatus = "ACTIVE"
	StudentStatusInactive StudentStatus = "INACTIVE"
	StudentStatusDeleted  StudentStatus = "DELETED"
)

// RegistrationChannel is whether the student enrolled privately or via a school contract.
type RegistrationChannel string

const (
	RegistrationChannelPrivate RegistrationChannel = "PRIVATE"
	RegistrationChannelSchool  RegistrationChannel = "SCHOOL"
)

// DeliveryMode is how private advisory sessions are held.
type DeliveryMode string

const (
	DeliveryModeOnline   DeliveryMode = "ONLINE"
	DeliveryModeInPerson DeliveryMode = "IN_PERSON"
)

// EnrollmentBillingMode distinguishes monthly cash-basis vs annual school enrollment (paid in installments).
type EnrollmentBillingMode string

const (
	EnrollmentBillingSingleSession    EnrollmentBillingMode = "SINGLE_SESSION"
	EnrollmentBillingMonthly          EnrollmentBillingMode = "MONTHLY"
	EnrollmentBillingSchoolEnrollment EnrollmentBillingMode = "SCHOOL_ENROLLMENT"
)

// StudentAdvisorCommissionKind defines how advisor earnings are computed.
// SINGLE_SESSION / MONTHLY billing: PERCENT / FIXED_PER_PAYMENT apply per PAID payment.
// SCHOOL_ENROLLMENT: PERCENT_OF_CONTRACT / FIXED_MONTHLY accrue in selected Jalali months from join date.
type StudentAdvisorCommissionKind string

const (
	StudentAdvisorCommNone               StudentAdvisorCommissionKind = "NONE"
	StudentAdvisorCommPercent              StudentAdvisorCommissionKind = "PERCENT"
	StudentAdvisorCommFixed                StudentAdvisorCommissionKind = "FIXED_PER_PAYMENT"
	StudentAdvisorCommPercentOfContract    StudentAdvisorCommissionKind = "PERCENT_OF_CONTRACT"
	StudentAdvisorCommFixedMonthly         StudentAdvisorCommissionKind = "FIXED_MONTHLY"
)

func (st *Student) IsSchoolEnrollment() bool {
	return st != nil && st.EnrollmentBillingMode == EnrollmentBillingSchoolEnrollment
}

// IsSchoolChannel reports whether this student belongs to a school contract (v2).
func (st *Student) IsSchoolChannel() bool {
	return st != nil && st.RegistrationChannel == RegistrationChannelSchool
}

// IsPrivateChannel reports private (individual) enrollment.
func (st *Student) IsPrivateChannel() bool {
	if st == nil {
		return false
	}
	return st.RegistrationChannel == RegistrationChannelPrivate || st.RegistrationChannel == ""
}

func (st *Student) IsSingleSession() bool {
	return st != nil && st.EnrollmentBillingMode == EnrollmentBillingSingleSession
}

func (st *Student) IsPerPaymentBilling() bool {
	return st != nil && (st.EnrollmentBillingMode == EnrollmentBillingMonthly || st.EnrollmentBillingMode == EnrollmentBillingSingleSession || st.EnrollmentBillingMode == "")
}

func popcountMask(mask int) int {
	n := 0
	for i := 0; i < 12; i++ {
		if mask&(1<<i) != 0 {
			n++
		}
	}
	return n
}

func isJalaliMonthInMask(mask, jm int) bool {
	if jm < 1 || jm > 12 {
		return false
	}
	return mask&(1<<(jm-1)) != 0
}

func (st *Student) advisorAccrualMonthMask() int {
	if st == nil || st.AdvisorAccrualMonthMask == nil || *st.AdvisorAccrualMonthMask <= 0 {
		return 0
	}
	return *st.AdvisorAccrualMonthMask & 0xFFF
}

// AdvisorAccrualMonthMaskCount returns how many Jalali months are selected in the mask.
func AdvisorAccrualMonthMaskCount(mask int) int {
	return popcountMask(mask & 0xFFF)
}

func (st *Student) AdvisorAccrualMonthsCount() int {
	if st == nil {
		return 10
	}
	if mask := st.advisorAccrualMonthMask(); mask > 0 {
		n := popcountMask(mask)
		if n > 0 {
			return n
		}
	}
	if st.AdvisorAccrualMonths != nil && *st.AdvisorAccrualMonths > 0 {
		return *st.AdvisorAccrualMonths
	}
	return 10
}

func advisorContractTotalShareCents(st *Student) int64 {
	if st == nil || st.AdvisorID == nil {
		return 0
	}
	switch st.AdvisorCommissionKind {
	case StudentAdvisorCommPercentOfContract:
		if st.EnrollmentAmountCents <= 0 || st.AdvisorCommissionPercent == nil {
			return 0
		}
		p := *st.AdvisorCommissionPercent
		if p <= 0 {
			return 0
		}
		return int64(math.Round(float64(st.EnrollmentAmountCents) * p / 100.0))
	default:
		return 0
	}
}

// AdvisorContractTotalShareCents exports total contract advisor share (PERCENT_OF_CONTRACT).
func AdvisorContractTotalShareCents(st *Student) int64 {
	return advisorContractTotalShareCents(st)
}

// AdvisorAccrualMonthIndexForPeriod returns 1-based accrual slice index for the calendar month.
func AdvisorAccrualMonthIndexForPeriod(st *Student, year, month int) (int, bool) {
	return accrualMonthIndexWithMask(st, year, month)
}

// ComputeAdvisorMonthlyAccrualCents is the regular monthly slice (before last-month remainder).
func ComputeAdvisorMonthlyAccrualCents(st *Student) int64 {
	if st == nil || st.AdvisorID == nil || !st.IsSchoolEnrollment() {
		return 0
	}
	switch st.AdvisorCommissionKind {
	case StudentAdvisorCommPercentOfContract:
		total := advisorContractTotalShareCents(st)
		if total <= 0 {
			return 0
		}
		months := int64(st.AdvisorAccrualMonthsCount())
		return total / months
	case StudentAdvisorCommFixedMonthly:
		if st.AdvisorCommissionFixedCents == nil || *st.AdvisorCommissionFixedCents <= 0 {
			return 0
		}
		return *st.AdvisorCommissionFixedCents
	default:
		return 0
	}
}

// accrualMonthIndex returns the 1-based position of period key (year, month) counted from the
// Jalali month that contains joinDate.
func accrualMonthIndex(joinDate time.Time, year, month int) (index int, ok bool) {
	sy, sm := jalali.KeyForTime(joinDate)
	idx := jalali.KeyIndex(year, month) - jalali.KeyIndex(sy, sm) + 1
	if idx < 1 {
		return 0, false
	}
	return idx, true
}

// accrualMonthIndexWithMask is accrualMonthIndex restricted to the Jalali months selected in the
// student's accrual mask (e.g. Mehr..Tir). Period keys map to exact Jalali months.
func accrualMonthIndexWithMask(st *Student, year, month int) (index int, ok bool) {
	if st == nil || st.JoinDate == nil {
		return 0, false
	}
	mask := st.advisorAccrualMonthMask()
	if mask == 0 {
		return accrualMonthIndex(*st.JoinDate, year, month)
	}
	sy, sm := jalali.KeyForTime(*st.JoinDate)
	if jalali.KeyIndex(year, month) < jalali.KeyIndex(sy, sm) {
		return 0, false
	}
	if _, jm := jalali.JalaliFromKey(year, month); !isJalaliMonthInMask(mask, jm) {
		return 0, false
	}
	idx := 0
	for y, m := sy, sm; jalali.KeyIndex(y, m) <= jalali.KeyIndex(year, month); y, m = jalali.AddMonths(y, m, 1) {
		if _, jm := jalali.JalaliFromKey(y, m); isJalaliMonthInMask(mask, jm) {
			idx++
		}
	}
	if idx < 1 {
		return 0, false
	}
	return idx, true
}

// AdvisorAccrualDueForPeriod returns advisor share accrued for one calendar month (school enrollment).
func AdvisorAccrualDueForPeriod(st *Student, year, month int) int64 {
	if st == nil || st.AdvisorID == nil || !st.IsSchoolEnrollment() || st.Status != StudentStatusActive {
		return 0
	}
	if st.JoinDate == nil {
		return 0
	}
	months := st.AdvisorAccrualMonthsCount()
	idx, ok := accrualMonthIndexWithMask(st, year, month)
	if !ok || idx > months {
		return 0
	}
	monthly := ComputeAdvisorMonthlyAccrualCents(st)
	if monthly <= 0 {
		return 0
	}
	if st.AdvisorCommissionKind == StudentAdvisorCommPercentOfContract && idx == months {
		total := advisorContractTotalShareCents(st)
		prior := monthly * int64(months-1)
		rem := total - prior
		if rem > 0 {
			return rem
		}
	}
	return monthly
}

// ComputeAdvisorShareCents returns the advisor's share for one payment amount (per-payment billing modes).
func ComputeAdvisorShareCents(st *Student, amountCents int64) int64 {
	if st == nil || st.AdvisorID == nil || amountCents <= 0 || st.IsSchoolEnrollment() {
		return 0
	}
	switch st.AdvisorCommissionKind {
	case StudentAdvisorCommPercent:
		if st.AdvisorCommissionPercent == nil {
			return 0
		}
		p := *st.AdvisorCommissionPercent
		if p <= 0 {
			return 0
		}
		return int64(math.Round(float64(amountCents) * p / 100.0))
	case StudentAdvisorCommFixed:
		if st.AdvisorCommissionFixedCents == nil {
			return 0
		}
		v := *st.AdvisorCommissionFixedCents
		if v < 0 {
			return 0
		}
		return v
	default:
		return 0
	}
}

// Student represents a student/client in the consulting group.
// Used by /students, /payments, /reminders, reports, etc.
type Student struct {
	gorm.Model
	FirstName string        `gorm:"size:100;not null"`
	LastName  string        `gorm:"size:100;not null"`
	Email     string        `gorm:"size:255;index"`
	Phone     string        `gorm:"size:20;index"`
	Status    StudentStatus `gorm:"type:varchar(32);not null;default:'ACTIVE';index"`
	// JoinDate is the advisory/consulting start date (calendar day; time is normalized to local midnight).
	JoinDate *time.Time

	// Parent contacts
	FatherName  string `gorm:"size:100"`
	MotherName  string `gorm:"size:100"`
	FatherPhone string `gorm:"size:20"`
	MotherPhone string `gorm:"size:20"`
	FatherJob   string `gorm:"size:120"`
	MotherJob   string `gorm:"size:120"`

	// SINGLE_SESSION = one payment; MONTHLY = per payment; SCHOOL_ENROLLMENT = annual contract in installments.
	EnrollmentBillingMode EnrollmentBillingMode `gorm:"type:varchar(32);not null;default:'MONTHLY';index"`
	// Months to spread advisor contract share (legacy consecutive months when mask is unset).
	AdvisorAccrualMonths *int `gorm:""`
	// Bitmask of Jalali months 1–12 (bit0=Farvardin … bit11=Esfand) for school enrollment payroll.
	AdvisorAccrualMonthMask *int `gorm:""`

	// Advisor commission (when AdvisorID is set)
	AdvisorCommissionKind       StudentAdvisorCommissionKind `gorm:"type:varchar(32);not null;default:'NONE'"`
	AdvisorCommissionPercent    *float64                     `gorm:""` // PERCENT or PERCENT_OF_CONTRACT
	AdvisorCommissionFixedCents *int64                       `gorm:""` // FIXED_PER_PAYMENT or FIXED_MONTHLY

	// School info (free-text; for SCHOOL channel also mirrored from SchoolContract.SchoolName)
	SchoolName    string `gorm:"size:200"`
	SchoolAddress string `gorm:"size:500"`

	// RegistrationChannel: PRIVATE (default) or SCHOOL (linked to SchoolContract).
	RegistrationChannel RegistrationChannel `gorm:"type:varchar(32);not null;default:'PRIVATE';index"`
	// SchoolContractID links a SCHOOL-channel student to their bulk school contract.
	SchoolContractID *uint           `gorm:"index"`
	SchoolContract   *SchoolContract `gorm:"constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`

	// Home address
	HomeAddress string `gorm:"size:500"`

	// DeliveryMode: ONLINE or IN_PERSON (private students). Empty for school-channel / legacy rows.
	DeliveryMode DeliveryMode `gorm:"type:varchar(32);index"`

	// Financial balance (in smallest unit, e.g. rials)
	BalanceCents int64 `gorm:"not null;default:0"`

	// Enrollment amount stored directly so it persists even without a plan selection.
	EnrollmentAmountCents int64 `gorm:"not null;default:0"`

	// Advisor is the user responsible for this student.
	AdvisorID *uint `gorm:"index"`
	Advisor   *User `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	CurrentPlanID *uint `gorm:"index"`
	CurrentPlan   *Plan `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	OrganizationID *uint         `gorm:"index"`
	Organization   *Organization `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	// When a student is deleted, related enrollments, payments, and reminders are removed.
	Enrollments        []Enrollment        `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Payments           []Payment           `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	Reminders          []PaymentReminder   `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	StudentRolePayouts []StudentRolePayout `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

package services

import (
	"context"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"gorm.io/gorm"
)

var (
	ErrPaymentNotFound = errors.New("payment not found")
)

type PaymentService struct {
	repo    repositories.PaymentRepository
	db      *gorm.DB
	payroll *PayrollService // optional: sync pending حقوق when payment shares change
}

func NewPaymentService(repo repositories.PaymentRepository, db *gorm.DB, payroll *PayrollService) *PaymentService {
	return &PaymentService{repo: repo, db: db, payroll: payroll}
}

func (s *PaymentService) recalcPendingPayrollForPaidAt(ctx context.Context, paidAt *time.Time) {
	if s.payroll == nil || paidAt == nil {
		return
	}
	y, m := PeriodOf(*paidAt)
	if err := s.payroll.RecalculateEntriesForPeriod(ctx, y, m); err != nil {
		log.Printf("payroll: recalc pending for %d-%02d failed: %v", y, m, err)
	}
}

func (s *PaymentService) recalcPendingPayrollForStudentPaidMonths(ctx context.Context, studentID uint) {
	if s.payroll == nil {
		return
	}
	var list []models.Payment
	if err := s.db.WithContext(ctx).Select("paid_at").
		Where("student_id = ? AND status = ?", studentID, models.PaymentStatusPaid).
		Find(&list).Error; err != nil {
		return
	}
	seen := make(map[[2]int]struct{})
	for i := range list {
		if list[i].PaidAt == nil {
			continue
		}
		y, mo := PeriodOf(*list[i].PaidAt)
		key := [2]int{y, mo}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		if err := s.payroll.RecalculateEntriesForPeriod(ctx, y, mo); err != nil {
			log.Printf("payroll: recalc pending for %d-%02d failed: %v", y, mo, err)
		}
	}
}

// rebuildPaymentPayrollShares replaces split rows for a payment from StudentRolePayout rows
// plus optional advisor contract share when advisor commission is set and not overridden by role payouts.
// It runs every write on the given db handle, so callers can pass a transaction for atomicity.
func (s *PaymentService) rebuildPaymentPayrollShares(ctx context.Context, db *gorm.DB, paymentID uint) error {
	var p models.Payment
	if err := db.WithContext(ctx).First(&p, paymentID).Error; err != nil {
		return err
	}
	// Clear existing shares
	if err := db.WithContext(ctx).Unscoped().
		Where("payment_id = ?", paymentID).
		Delete(&models.PaymentPayrollShare{}).Error; err != nil {
		return err
	}
	if p.Status != models.PaymentStatusPaid {
		return db.WithContext(ctx).Model(&models.Payment{}).
			Where("id = ?", paymentID).
			Update("advisor_share_cents", 0).Error
	}
	// Legacy school_contract_id-only payments: cash collection only — no payroll.
	// School-channel students billed via student_id get shares like private.
	if p.IsLegacySchoolContractPayment() || p.StudentID == nil {
		return db.WithContext(ctx).Model(&models.Payment{}).
			Where("id = ?", paymentID).
			Update("advisor_share_cents", 0).Error
	}
	// Load student with role payouts
	var st models.Student
	if err := db.WithContext(ctx).Preload("StudentRolePayouts").First(&st, *p.StudentID).Error; err != nil {
		return err
	}
	// Aggregate shares per user
	agg := map[uint]int64{}
	for _, rp := range st.StudentRolePayouts {
		share := rp.ComputeShareCents(p.AmountCents)
		if share <= 0 {
			continue
		}
		agg[rp.UserID] += share
	}
	for uid, share := range agg {
		row := models.PaymentPayrollShare{
			PaymentID:        p.ID,
			UserID:           uid,
			Kind:             models.ShareKindStudentRolePayout,
			ShareCents:       share,
			BasisAmountCents: p.AmountCents,
		}
		if err := db.WithContext(ctx).Create(&row).Error; err != nil {
			return err
		}
	}
	// سهم مشاور از قرارداد دانش‌آموز — وقتی برای همان کاربر ردیف «سهم نقش» نگذاشته باشند
	if st.AdvisorID != nil {
		hasRolePayoutForAdvisor := false
		for _, rp := range st.StudentRolePayouts {
			if rp.UserID == *st.AdvisorID {
				hasRolePayoutForAdvisor = true
				break
			}
		}
		if !hasRolePayoutForAdvisor {
			adv := models.ComputeAdvisorShareCents(&st, p.AmountCents)
			if adv > 0 && !st.IsSchoolEnrollment() {
				row := models.PaymentPayrollShare{
					PaymentID:        p.ID,
					UserID:           *st.AdvisorID,
					Kind:             models.ShareKindAdvisorContract,
					ShareCents:       adv,
					BasisAmountCents: p.AmountCents,
				}
				if err := db.WithContext(ctx).Create(&row).Error; err != nil {
					return err
				}
			}
		}
	}
	advisorShare := models.ComputeAdvisorShareCents(&st, p.AmountCents)
	return db.WithContext(ctx).Model(&models.Payment{}).
		Where("id = ?", paymentID).
		Update("advisor_share_cents", advisorShare).Error
}

// RebuildAllPaidPaymentPayrollShares recomputes split rows for every PAID payment.
func (s *PaymentService) RebuildAllPaidPaymentPayrollShares(ctx context.Context) error {
	var ids []uint
	if err := s.db.WithContext(ctx).Model(&models.Payment{}).
		Where("status = ?", models.PaymentStatusPaid).
		Pluck("id", &ids).Error; err != nil {
		return err
	}
	for _, id := range ids {
		if err := s.rebuildPaymentPayrollShares(ctx, s.db, id); err != nil {
			return err
		}
	}
	return nil
}

// RecalculatePaidSharesForStudent refreshes payroll shares on all PAID payments for a student.
func (s *PaymentService) RecalculatePaidSharesForStudent(ctx context.Context, studentID uint) error {
	var list []models.Payment
	if err := s.db.WithContext(ctx).
		Where("student_id = ? AND status = ?", studentID, models.PaymentStatusPaid).
		Find(&list).Error; err != nil {
		return err
	}
	for i := range list {
		if err := s.rebuildPaymentPayrollShares(ctx, s.db, list[i].ID); err != nil {
			return err
		}
	}
	s.recalcPendingPayrollForStudentPaidMonths(ctx, studentID)
	return s.recalcAccrualPayrollForStudent(ctx, studentID)
}

// PayrollPeriodsAffectedByStudent returns distinct local calendar (year, month) pairs
// that may need payroll recalculation after the student is permanently removed.
func (s *PaymentService) PayrollPeriodsAffectedByStudent(ctx context.Context, studentID uint) ([][2]int, error) {
	var st models.Student
	if err := s.db.WithContext(ctx).First(&st, studentID).Error; err != nil {
		return nil, err
	}
	seen := make(map[[2]int]struct{})
	var periods [][2]int
	add := func(y, m int) {
		key := [2]int{y, m}
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		periods = append(periods, key)
	}

	var list []models.Payment
	if err := s.db.WithContext(ctx).Select("paid_at").
		Where("student_id = ? AND status = ?", studentID, models.PaymentStatusPaid).
		Find(&list).Error; err != nil {
		return nil, err
	}
	for i := range list {
		if list[i].PaidAt == nil {
			continue
		}
		add(PeriodOf(*list[i].PaidAt))
	}

	if st.JoinDate != nil {
		sy, sm := PeriodOf(*st.JoinDate)
		for i := 0; i < 36; i++ {
			y, mo := PeriodAdd(sy, sm, i)
			if models.AdvisorAccrualDueForPeriod(&st, y, mo) > 0 {
				add(y, mo)
			}
		}
	}
	return periods, nil
}

// RecalculatePayrollPeriods refreshes pending payroll rows for the given calendar months.
func (s *PaymentService) RecalculatePayrollPeriods(ctx context.Context, periods [][2]int) {
	if s.payroll == nil {
		return
	}
	for _, p := range periods {
		_ = s.payroll.RecalculateEntriesForPeriod(ctx, p[0], p[1])
	}
}

func (s *PaymentService) recalcAccrualPayrollForStudent(ctx context.Context, studentID uint) error {
	if s.payroll == nil {
		return nil
	}
	var st models.Student
	if err := s.db.WithContext(ctx).First(&st, studentID).Error; err != nil {
		return err
	}
	return s.payroll.RecalculateAccrualForStudent(ctx, &st)
}

func (s *PaymentService) Summary(ctx context.Context, scopeUser *uint) (*repositories.PaymentSummary, error) {
	return s.repo.Summary(ctx, scopeUser)
}

func (s *PaymentService) List(
	ctx context.Context,
	limit, offset int,
	search, status, method string,
	from, to *time.Time,
	sort string,
	scopeUser *uint,
) ([]models.Payment, int64, error) {
	status = strings.ToUpper(status)
	method = strings.ToUpper(method)
	return s.repo.List(ctx, limit, offset, search, status, method, from, to, sort, scopeUser)
}

// IsPaymentVisibleToUser returns true if the payment's student is assigned to this user as advisor
// or the user has a student_role_payout row for that student.
func (s *PaymentService) IsPaymentVisibleToUser(ctx context.Context, studentID uint, userID uint) (bool, error) {
	var st models.Student
	if err := s.db.WithContext(ctx).Select("id", "advisor_id").First(&st, studentID).Error; err != nil {
		return false, err
	}
	if st.AdvisorID != nil && *st.AdvisorID == userID {
		return true, nil
	}
	var n int64
	if err := s.db.WithContext(ctx).Model(&models.StudentRolePayout{}).
		Where("student_id = ? AND user_id = ?", studentID, userID).
		Count(&n).Error; err != nil {
		return false, err
	}
	return n > 0, nil
}

// IsPaymentRecordVisibleToUser checks visibility for student or legacy school-contract payments.
// Legacy contract-only payments are visible to all users with payments permission (no advisor scope).
func (s *PaymentService) IsPaymentRecordVisibleToUser(ctx context.Context, p *models.Payment, userID uint) (bool, error) {
	if p == nil {
		return false, nil
	}
	if p.IsLegacySchoolContractPayment() {
		return true, nil
	}
	if p.StudentID == nil {
		return false, nil
	}
	return s.IsPaymentVisibleToUser(ctx, *p.StudentID, userID)
}

func (s *PaymentService) GetByID(ctx context.Context, id uint) (*models.Payment, error) {
	p, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPaymentNotFound
		}
		return nil, err
	}
	return p, nil
}

type CreatePaymentParams struct {
	StudentID        *uint
	SchoolContractID *uint
	AmountCents      int64
	PaidAt           *time.Time
	Method           string
	Description      string
	ReferenceCode    string
	Status           string
	EnrollmentID     *uint
	DueDate          *time.Time
	Currency         string
	Type             string
}

type UpdatePaymentParams struct {
	AmountCents   *int64
	PaidAt        *time.Time
	Method        *string
	Description   *string
	ReferenceCode *string
	Status        *string
	EnrollmentID  *uint
	DueDate       *time.Time
	Type          *string
}

func (s *PaymentService) Create(ctx context.Context, p CreatePaymentParams) (*models.Payment, error) {
	hasStudent := p.StudentID != nil && *p.StudentID > 0
	if !hasStudent {
		if p.SchoolContractID != nil && *p.SchoolContractID > 0 {
			return nil, errors.New("creating school_contract_id-only payments is deprecated; use student_id for school-channel students")
		}
		return nil, errors.New("student_id is required")
	}
	if p.AmountCents <= 0 {
		return nil, errors.New("amount must be greater than zero")
	}

	now := time.Now()
	status := models.PaymentStatus(strings.ToUpper(p.Status))
	method := models.PaymentMethod(strings.ToUpper(p.Method))
	paymentType := models.PaymentType(strings.ToUpper(p.Type))
	if paymentType == "" {
		paymentType = models.PaymentTypeMonthly
	}
	currency := p.Currency
	if currency == "" {
		currency = "IRR"
	}

	payment := &models.Payment{
		EnrollmentID:  p.EnrollmentID,
		AmountCents:   p.AmountCents,
		Currency:      currency,
		Description:   p.Description,
		Status:        status,
		Method:        method,
		Type:          paymentType,
		DueDate:       p.DueDate,
		ReferenceCode: p.ReferenceCode,
	}
	var st models.Student
	if err := s.db.WithContext(ctx).Select("id", "registration_channel", "school_contract_id").First(&st, *p.StudentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("student not found")
		}
		return nil, err
	}
	// Private and school-channel students both pay via student_id.
	// school_contract_id on create is ignored (legacy create path deprecated).
	payment.StudentID = p.StudentID

	if status == models.PaymentStatusPaid {
		if p.PaidAt != nil {
			payment.PaidAt = p.PaidAt
		} else {
			payment.PaidAt = &now
		}
	} else {
		payment.PaidAt = p.PaidAt
	}

	// Payment row, payroll split rows and the student balance must move together.
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := s.repo.WithTx(tx).Create(ctx, payment); err != nil {
			return err
		}
		if err := s.rebuildPaymentPayrollShares(ctx, tx, payment.ID); err != nil {
			return err
		}
		if hasStudent && payment.Status == models.PaymentStatusPaid && payment.AmountCents != 0 {
			if err := s.adjustStudentBalanceByPaidDelta(ctx, tx, *payment.StudentID, payment.AmountCents); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return nil, err
	}
	if hasStudent {
		s.recalcPendingPayrollForPaidAt(ctx, payment.PaidAt)
	}
	created, _ := s.repo.FindByID(ctx, payment.ID)
	if created != nil {
		return created, nil
	}
	return payment, nil
}

func (s *PaymentService) Update(ctx context.Context, id uint, p UpdatePaymentParams) (*models.Payment, error) {
	payment, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	oldPaidContribution := int64(0)
	if payment.Status == models.PaymentStatusPaid {
		oldPaidContribution = payment.AmountCents
	}
	oldStatus := payment.Status
	var oldPaidAtCopy *time.Time
	if payment.PaidAt != nil {
		t := *payment.PaidAt
		oldPaidAtCopy = &t
	}

	now := time.Now()

	if p.AmountCents != nil {
		payment.AmountCents = *p.AmountCents
	}
	if p.Method != nil {
		payment.Method = models.PaymentMethod(strings.ToUpper(*p.Method))
	}
	if p.Description != nil {
		payment.Description = *p.Description
	}
	if p.ReferenceCode != nil {
		payment.ReferenceCode = *p.ReferenceCode
	}
	if p.DueDate != nil {
		payment.DueDate = p.DueDate
	}
	if p.EnrollmentID != nil {
		payment.EnrollmentID = p.EnrollmentID
	}
	if p.Status != nil {
		newStatus := models.PaymentStatus(strings.ToUpper(*p.Status))
		payment.Status = newStatus
		if newStatus == models.PaymentStatusPaid && payment.PaidAt == nil {
			payment.PaidAt = &now
		}
	}
	if p.Type != nil {
		payment.Type = models.PaymentType(strings.ToUpper(*p.Type))
	}
	if p.PaidAt != nil {
		payment.PaidAt = p.PaidAt
	}

	newPaidContribution := int64(0)
	if payment.Status == models.PaymentStatusPaid {
		newPaidContribution = payment.AmountCents
	}
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := s.repo.WithTx(tx).Update(ctx, payment); err != nil {
			return err
		}
		if err := s.rebuildPaymentPayrollShares(ctx, tx, payment.ID); err != nil {
			return err
		}
		if payment.StudentID != nil {
			if delta := newPaidContribution - oldPaidContribution; delta != 0 {
				if err := s.adjustStudentBalanceByPaidDelta(ctx, tx, *payment.StudentID, delta); err != nil {
					return err
				}
			}
		}
		return nil
	}); err != nil {
		return nil, err
	}
	if s.payroll != nil && payment.StudentID != nil {
		months := make(map[[2]int]struct{})
		if oldStatus == models.PaymentStatusPaid && oldPaidAtCopy != nil {
			y, m := PeriodOf(*oldPaidAtCopy)
			months[[2]int{y, m}] = struct{}{}
		}
		if payment.Status == models.PaymentStatusPaid && payment.PaidAt != nil {
			y, m := PeriodOf(*payment.PaidAt)
			months[[2]int{y, m}] = struct{}{}
		}
		for k := range months {
			if err := s.payroll.RecalculateEntriesForPeriod(ctx, k[0], k[1]); err != nil {
				log.Printf("payroll: recalc pending for %d-%02d failed: %v", k[0], k[1], err)
			}
		}
	}
	return payment, nil
}

func (s *PaymentService) SoftDelete(ctx context.Context, id uint) error {
	payment, err := s.GetByID(ctx, id)
	if err != nil {
		return err
	}
	wasPaid := payment.Status == models.PaymentStatusPaid
	var delYear, delMonth int
	if wasPaid && payment.PaidAt != nil {
		delYear, delMonth = PeriodOf(*payment.PaidAt)
	}
	if err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Unscoped().Where("payment_id = ?", id).
			Delete(&models.PaymentPayrollShare{}).Error; err != nil {
			return err
		}
		if err := s.repo.WithTx(tx).SoftDelete(ctx, id); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPaymentNotFound
			}
			return err
		}
		if err := s.rebuildPaymentPayrollShares(ctx, tx, id); err != nil {
			return err
		}
		if payment.StudentID != nil && payment.Status == models.PaymentStatusPaid && payment.AmountCents != 0 {
			if err := s.adjustStudentBalanceByPaidDelta(ctx, tx, *payment.StudentID, -payment.AmountCents); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return err
	}
	if wasPaid && s.payroll != nil && payment.StudentID != nil {
		if err := s.payroll.RecalculateEntriesForPeriod(ctx, delYear, delMonth); err != nil {
			log.Printf("payroll: recalc pending for %d-%02d failed: %v", delYear, delMonth, err)
		}
	}
	return nil
}

func (s *PaymentService) adjustStudentBalanceByPaidDelta(ctx context.Context, db *gorm.DB, studentID uint, deltaCents int64) error {
	if deltaCents == 0 {
		return nil
	}
	return db.WithContext(ctx).Model(&models.Student{}).
		Where("id = ?", studentID).
		Update("balance_cents", gorm.Expr("balance_cents + ?", deltaCents)).Error
}

// PromotePendingPastDueToOverdue sets PENDING → OVERDUE when due_date is before the start of today
// in the server's local timezone. The full calendar day of the due date still counts as not overdue;
// from the first moment of the next calendar day onward the payment is overdue.
// Payments without due_date are unchanged (stay PENDING until edited or paid).
func (s *PaymentService) PromotePendingPastDueToOverdue(ctx context.Context) (updated int64, err error) {
	now := time.Now()
	loc := now.Location()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	res := s.db.WithContext(ctx).Model(&models.Payment{}).
		Where("status = ?", models.PaymentStatusPending).
		Where("due_date IS NOT NULL").
		Where("due_date < ?", todayStart).
		Update("status", models.PaymentStatusOverdue)
	return res.RowsAffected, res.Error
}

// PaymentTotalsByStudentIDs returns per student: sum of PAID amounts, and sum of PENDING+OVERDUE (open charges).
func (s *PaymentService) PaymentTotalsByStudentIDs(ctx context.Context, studentIDs []uint) (paid, open map[uint]int64, err error) {
	paid, open = make(map[uint]int64), make(map[uint]int64)
	if len(studentIDs) == 0 {
		return paid, open, nil
	}
	type aggRow struct {
		StudentID uint  `gorm:"column:student_id"`
		PaidSum   int64 `gorm:"column:paid_sum"`
		OpenSum   int64 `gorm:"column:open_sum"`
	}
	var rows []aggRow
	err = s.db.WithContext(ctx).Model(&models.Payment{}).
		Select(`student_id,
			COALESCE(SUM(CASE WHEN status = ? THEN amount_cents ELSE 0 END), 0) AS paid_sum,
			COALESCE(SUM(CASE WHEN status IN (?, ?) THEN amount_cents ELSE 0 END), 0) AS open_sum`,
			models.PaymentStatusPaid, models.PaymentStatusPending, models.PaymentStatusOverdue).
		Where("student_id IN ?", studentIDs).
		Group("student_id").
		Scan(&rows).Error
	if err != nil {
		return nil, nil, err
	}
	for _, r := range rows {
		paid[r.StudentID] = r.PaidSum
		open[r.StudentID] = r.OpenSum
	}
	return paid, open, nil
}

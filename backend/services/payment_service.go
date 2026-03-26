package services

import (
	"context"
	"errors"
	"math"
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
	repo repositories.PaymentRepository
	db   *gorm.DB
}

func NewPaymentService(repo repositories.PaymentRepository, db *gorm.DB) *PaymentService {
	return &PaymentService{repo: repo, db: db}
}

func (s *PaymentService) syncAdvisorShare(ctx context.Context, payment *models.Payment) error {
	var st models.Student
	if err := s.db.WithContext(ctx).First(&st, payment.StudentID).Error; err != nil {
		return err
	}
	if payment.Status == models.PaymentStatusPaid {
		payment.AdvisorShareCents = models.ComputeAdvisorShareCents(&st, payment.AmountCents)
	} else {
		payment.AdvisorShareCents = 0
	}
	return nil
}

// RecalculatePaidSharesForStudent refreshes advisor_share_cents on all PAID payments for a student (e.g. after contract change).
func (s *PaymentService) RecalculatePaidSharesForStudent(ctx context.Context, studentID uint) error {
	var st models.Student
	if err := s.db.WithContext(ctx).First(&st, studentID).Error; err != nil {
		return err
	}
	var list []models.Payment
	if err := s.db.WithContext(ctx).
		Where("student_id = ? AND status = ?", studentID, models.PaymentStatusPaid).
		Find(&list).Error; err != nil {
		return err
	}
	for i := range list {
		list[i].AdvisorShareCents = models.ComputeAdvisorShareCents(&st, list[i].AmountCents)
		if err := s.db.WithContext(ctx).Save(&list[i]).Error; err != nil {
			return err
		}
		if err := s.rebuildPaymentPayrollShares(ctx, list[i].ID); err != nil {
			return err
		}
	}
	return nil
}

// rebuildPaymentPayrollShares replaces split rows for a payment (advisor contract + per-role % of gross).
func (s *PaymentService) rebuildPaymentPayrollShares(ctx context.Context, paymentID uint) error {
	var p models.Payment
	if err := s.db.WithContext(ctx).First(&p, paymentID).Error; err != nil {
		return err
	}
	if err := s.db.WithContext(ctx).Unscoped().
		Where("payment_id = ?", paymentID).
		Delete(&models.PaymentPayrollShare{}).Error; err != nil {
		return err
	}
	if p.Status != models.PaymentStatusPaid {
		return nil
	}
	var st models.Student
	if err := s.db.WithContext(ctx).Preload("StudentRolePayouts").First(&st, p.StudentID).Error; err != nil {
		return err
	}
	var rules []models.CompensationRule
	if err := s.db.WithContext(ctx).
		Where("is_active = ? AND (payment_type = ? OR payment_type = ?)", true, mapPaymentTypeToComp(p.Type), models.CompPaymentTypeAll).
		Order("priority ASC, id ASC").
		Find(&rules).Error; err != nil {
		return err
	}

	for i := range rules {
		r := &rules[i]
		userIDs, err := s.resolveRuleUsers(ctx, r, &st)
		if err != nil {
			return err
		}
		for _, uid := range userIDs {
			ok, err := s.ruleAppliesToStudent(ctx, r, uid, st.ID)
			if err != nil {
				return err
			}
			if !ok {
				continue
			}
			share := s.computeRuleShareCents(r, &st, &p)
			if share <= 0 {
				continue
			}
			row := models.PaymentPayrollShare{
				PaymentID:          p.ID,
				UserID:             uid,
				Kind:               models.ShareKindCompRule,
				CompensationRuleID: &r.ID,
				ShareCents:         share,
				BasisAmountCents:   p.AmountCents,
			}
			if r.TargetKind == models.CompTargetAdvisorContract {
				row.Kind = models.ShareKindAdvisorContract
			}
			if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
				return err
			}
		}
	}
	if len(st.StudentRolePayouts) > 0 {
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
			if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func mapPaymentTypeToComp(t models.PaymentType) models.CompensationPaymentType {
	switch t {
	case models.PaymentTypeSingleSession:
		return models.CompPaymentTypeSingleSession
	case models.PaymentTypeCourse:
		return models.CompPaymentTypeCourse
	default:
		return models.CompPaymentTypeMonthly
	}
}

func (s *PaymentService) resolveRuleUsers(ctx context.Context, r *models.CompensationRule, st *models.Student) ([]uint, error) {
	switch r.TargetKind {
	case models.CompTargetAdvisorContract:
		if st.AdvisorID == nil {
			return nil, nil
		}
		return []uint{*st.AdvisorID}, nil
	case models.CompTargetUser:
		if r.UserID == nil {
			return nil, nil
		}
		return []uint{*r.UserID}, nil
	case models.CompTargetRole:
		if r.RoleID == nil {
			return nil, nil
		}
		var userIDs []uint
		if err := s.db.WithContext(ctx).Model(&models.User{}).
			Where("role_id = ? AND deleted_at IS NULL", *r.RoleID).
			Pluck("id", &userIDs).Error; err != nil {
			return nil, err
		}
		return userIDs, nil
	default:
		return nil, nil
	}
}

func (s *PaymentService) ruleAppliesToStudent(ctx context.Context, r *models.CompensationRule, userID, studentID uint) (bool, error) {
	switch r.ScopeKind {
	case models.CompScopeAll:
		return true, nil
	case models.CompScopeSelected:
		var count int64
		if err := s.db.WithContext(ctx).Model(&models.CompensationRuleStudent{}).
			Where("compensation_rule_id = ? AND student_id = ?", r.ID, studentID).
			Count(&count).Error; err != nil {
			return false, err
		}
		return count > 0, nil
	case models.CompScopeCapacity:
		if r.CapacityLimit == nil || *r.CapacityLimit <= 0 {
			return false, nil
		}
		var count int64
		if err := s.db.WithContext(ctx).Model(&models.CompensationRuleUserStudent{}).
			Where("compensation_rule_id = ? AND user_id = ? AND student_id = ?", r.ID, userID, studentID).
			Count(&count).Error; err != nil {
			return false, err
		}
		if count > 0 {
			return true, nil
		}
		var used int64
		if err := s.db.WithContext(ctx).Model(&models.CompensationRuleUserStudent{}).
			Where("compensation_rule_id = ? AND user_id = ?", r.ID, userID).
			Count(&used).Error; err != nil {
			return false, err
		}
		if used >= int64(*r.CapacityLimit) {
			return false, nil
		}
		link := models.CompensationRuleUserStudent{
			CompensationRuleID: r.ID,
			UserID:             userID,
			StudentID:          studentID,
		}
		if err := s.db.WithContext(ctx).FirstOrCreate(&link, models.CompensationRuleUserStudent{
			CompensationRuleID: r.ID,
			UserID:             userID,
			StudentID:          studentID,
		}).Error; err != nil {
			return false, err
		}
		return true, nil
	default:
		return false, nil
	}
}

func (s *PaymentService) computeRuleShareCents(r *models.CompensationRule, st *models.Student, p *models.Payment) int64 {
	if r.TargetKind == models.CompTargetAdvisorContract {
		return models.ComputeAdvisorShareCents(st, p.AmountCents)
	}
	if r.FixedCents != nil && *r.FixedCents > 0 {
		return *r.FixedCents
	}
	if r.Percent != nil && *r.Percent > 0 {
		return int64(math.Round(float64(p.AmountCents) * (*r.Percent) / 100.0))
	}
	return 0
}

// RebuildAllPaidPaymentPayrollShares recomputes split rows for every PAID payment (e.g. after role gross % change).
func (s *PaymentService) RebuildAllPaidPaymentPayrollShares(ctx context.Context) error {
	var ids []uint
	if err := s.db.WithContext(ctx).Model(&models.Payment{}).
		Where("status = ?", models.PaymentStatusPaid).
		Pluck("id", &ids).Error; err != nil {
		return err
	}
	for _, id := range ids {
		if err := s.rebuildPaymentPayrollShares(ctx, id); err != nil {
			return err
		}
	}
	return nil
}

func (s *PaymentService) Summary(ctx context.Context) (*repositories.PaymentSummary, error) {
	return s.repo.Summary(ctx)
}

func (s *PaymentService) List(
	ctx context.Context,
	limit, offset int,
	search, status, method string,
	from, to *time.Time,
	sort string,
) ([]models.Payment, int64, error) {
	status = strings.ToUpper(status)
	method = strings.ToUpper(method)
	return s.repo.List(ctx, limit, offset, search, status, method, from, to, sort)
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
	StudentID     uint
	AmountCents   int64
	PaidAt        *time.Time
	Method        string
	Description   string
	ReferenceCode string
	Status        string
	EnrollmentID  *uint
	DueDate       *time.Time
	Currency      string
	Type          string
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
		StudentID:     p.StudentID,
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

	if status == models.PaymentStatusPaid {
		if p.PaidAt != nil {
			payment.PaidAt = p.PaidAt
		} else {
			payment.PaidAt = &now
		}
	} else {
		payment.PaidAt = p.PaidAt
	}

	if err := s.syncAdvisorShare(ctx, payment); err != nil {
		return nil, err
	}

	if err := s.repo.Create(ctx, payment); err != nil {
		return nil, err
	}
	if err := s.rebuildPaymentPayrollShares(ctx, payment.ID); err != nil {
		return nil, err
	}
	if payment.Status == models.PaymentStatusPaid && payment.AmountCents != 0 {
		if err := s.adjustStudentBalanceByPaidDelta(ctx, payment.StudentID, payment.AmountCents); err != nil {
			return nil, err
		}
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

	if err := s.syncAdvisorShare(ctx, payment); err != nil {
		return nil, err
	}

	if err := s.repo.Update(ctx, payment); err != nil {
		return nil, err
	}
	if err := s.rebuildPaymentPayrollShares(ctx, payment.ID); err != nil {
		return nil, err
	}
	newPaidContribution := int64(0)
	if payment.Status == models.PaymentStatusPaid {
		newPaidContribution = payment.AmountCents
	}
	if delta := newPaidContribution - oldPaidContribution; delta != 0 {
		if err := s.adjustStudentBalanceByPaidDelta(ctx, payment.StudentID, delta); err != nil {
			return nil, err
		}
	}
	return payment, nil
}

func (s *PaymentService) SoftDelete(ctx context.Context, id uint) error {
	payment, err := s.GetByID(ctx, id)
	if err != nil {
		return err
	}
	_ = s.db.WithContext(ctx).Unscoped().Where("payment_id = ?", id).Delete(&models.PaymentPayrollShare{})
	if err := s.repo.SoftDelete(ctx, id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrPaymentNotFound
		}
		return err
	}
	if payment.Status == models.PaymentStatusPaid && payment.AmountCents != 0 {
		if err := s.adjustStudentBalanceByPaidDelta(ctx, payment.StudentID, -payment.AmountCents); err != nil {
			return err
		}
	}
	return nil
}

func (s *PaymentService) adjustStudentBalanceByPaidDelta(ctx context.Context, studentID uint, deltaCents int64) error {
	if deltaCents == 0 {
		return nil
	}
	return s.db.WithContext(ctx).Model(&models.Student{}).
		Where("id = ?", studentID).
		Update("balance_cents", gorm.Expr("balance_cents + ?", deltaCents)).Error
}

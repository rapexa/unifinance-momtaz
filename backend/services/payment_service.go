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
	if err := s.db.WithContext(ctx).First(&st, p.StudentID).Error; err != nil {
		return err
	}
	if st.AdvisorID != nil && p.AdvisorShareCents > 0 {
		row := models.PaymentPayrollShare{
			PaymentID:  p.ID,
			UserID:     *st.AdvisorID,
			Kind:       models.ShareKindAdvisorContract,
			ShareCents: p.AdvisorShareCents,
		}
		if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
			return err
		}
	}
	var roles []models.Role
	if err := s.db.WithContext(ctx).
		Where("percent_of_gross_student_payment IS NOT NULL AND percent_of_gross_student_payment > 0").
		Find(&roles).Error; err != nil {
		return err
	}
	for i := range roles {
		r := &roles[i]
		pct := *r.PercentOfGrossStudentPayment
		if pct <= 0 {
			continue
		}
		share := int64(math.Round(float64(p.AmountCents) * pct / 100.0))
		if share <= 0 {
			continue
		}
		var userIDs []uint
		if err := s.db.WithContext(ctx).Model(&models.User{}).
			Where("role_id = ? AND deleted_at IS NULL", r.ID).
			Pluck("id", &userIDs).Error; err != nil {
			return err
		}
		for _, uid := range userIDs {
			row := models.PaymentPayrollShare{
				PaymentID:  p.ID,
				UserID:     uid,
				Kind:       models.ShareKindRoleGross,
				ShareCents: share,
			}
			if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
				return err
			}
		}
	}
	return nil
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
	StudentID      uint
	AmountCents    int64
	PaidAt         *time.Time
	Method         string
	Description    string
	ReferenceCode  string
	Status         string
	EnrollmentID   *uint
	DueDate        *time.Time
	Currency       string
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
}

func (s *PaymentService) Create(ctx context.Context, p CreatePaymentParams) (*models.Payment, error) {
	now := time.Now()
	status := models.PaymentStatus(strings.ToUpper(p.Status))
	method := models.PaymentMethod(strings.ToUpper(p.Method))
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
	return payment, nil
}

func (s *PaymentService) Update(ctx context.Context, id uint, p UpdatePaymentParams) (*models.Payment, error) {
	payment, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
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
	return payment, nil
}

func (s *PaymentService) SoftDelete(ctx context.Context, id uint) error {
	_ = s.db.WithContext(ctx).Unscoped().Where("payment_id = ?", id).Delete(&models.PaymentPayrollShare{})
	if err := s.repo.SoftDelete(ctx, id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrPaymentNotFound
		}
		return err
	}
	return nil
}
package services

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"gorm.io/gorm"
)

var (
	ErrSchoolContractNotFound = errors.New("school contract not found")
	ErrSchoolContractInvalid  = errors.New("invalid school contract")
)

type SchoolContractService struct {
	repo repositories.SchoolContractRepository
}

func NewSchoolContractService(repo repositories.SchoolContractRepository) *SchoolContractService {
	return &SchoolContractService{repo: repo}
}

type CreateSchoolContractParams struct {
	SchoolName       string
	StudentCount     int
	TotalAmountCents int64
	// UnitPriceCents is optional/legacy; ignored for total when TotalAmountCents > 0.
	UnitPriceCents int64
	Notes          string
	StartDate      *time.Time
	EndDate        *time.Time
	PaymentType    string
	Term           string
	Status         string
}

type UpdateSchoolContractParams = CreateSchoolContractParams

// normalizeSchoolPayment validates payment type / term / period.
func normalizeSchoolPayment(p *CreateSchoolContractParams) error {
	pt := strings.ToUpper(strings.TrimSpace(p.PaymentType))
	if pt == "" {
		pt = models.SchoolPaymentAnnual
	}
	switch pt {
	case models.SchoolPaymentMonthly, models.SchoolPaymentAnnual:
		p.Term = ""
	case models.SchoolPaymentTerm:
		term := strings.ToUpper(strings.TrimSpace(p.Term))
		if term != models.SchoolTermSummer && term != models.SchoolTermAcademic {
			return errors.New("برای پرداخت دوره‌ای، دوره (تابستان یا مهر تا خرداد) را انتخاب کنید")
		}
		p.Term = term
	default:
		return errors.New("نوع پرداخت قرارداد نامعتبر است")
	}
	p.PaymentType = pt
	if p.StartDate != nil && p.EndDate != nil && p.EndDate.Before(*p.StartDate) {
		return errors.New("تاریخ پایان قرارداد باید بعد از تاریخ شروع باشد")
	}
	return nil
}

// resolveContractTotal prefers explicit total; falls back to count×unit for legacy clients.
// Returns (totalAmountCents, unitPriceCentsToStore, error).
func resolveContractTotal(studentCount int, totalAmountCents, unitPriceCents int64) (int64, int64, error) {
	if studentCount <= 0 {
		return 0, 0, errors.New("student count must be greater than zero")
	}
	if totalAmountCents > 0 {
		unit := unitPriceCents
		if unit < 0 {
			unit = 0
		}
		return totalAmountCents, unit, nil
	}
	if unitPriceCents > 0 {
		return int64(studentCount) * unitPriceCents, unitPriceCents, nil
	}
	return 0, 0, errors.New("total amount must be greater than zero")
}

func validateSchoolContractFields(schoolName string, studentCount int, totalAmountCents, unitPriceCents int64) (int64, int64, error) {
	if strings.TrimSpace(schoolName) == "" {
		return 0, 0, errors.New("school name is required")
	}
	return resolveContractTotal(studentCount, totalAmountCents, unitPriceCents)
}

func (s *SchoolContractService) Create(ctx context.Context, p CreateSchoolContractParams) (*models.SchoolContract, error) {
	total, unit, err := validateSchoolContractFields(p.SchoolName, p.StudentCount, p.TotalAmountCents, p.UnitPriceCents)
	if err != nil {
		return nil, err
	}
	if err := normalizeSchoolPayment(&p); err != nil {
		return nil, err
	}
	status := models.SchoolContractStatusActive
	if st := strings.ToUpper(strings.TrimSpace(p.Status)); st != "" {
		status = models.SchoolContractStatus(st)
	}
	c := &models.SchoolContract{
		SchoolName:       strings.TrimSpace(p.SchoolName),
		StudentCount:     p.StudentCount,
		UnitPriceCents:   unit,
		TotalAmountCents: total,
		Notes:            strings.TrimSpace(p.Notes),
		StartDate:        p.StartDate,
		EndDate:          p.EndDate,
		PaymentType:      p.PaymentType,
		Term:             p.Term,
		Status:           status,
	}
	c.Normalize()
	if err := s.repo.Create(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

func (s *SchoolContractService) Update(ctx context.Context, id uint, p UpdateSchoolContractParams) (*models.SchoolContract, error) {
	c, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrSchoolContractNotFound
		}
		return nil, err
	}
	total, unit, err := validateSchoolContractFields(p.SchoolName, p.StudentCount, p.TotalAmountCents, p.UnitPriceCents)
	if err != nil {
		return nil, err
	}
	if err := normalizeSchoolPayment(&p); err != nil {
		return nil, err
	}
	c.SchoolName = strings.TrimSpace(p.SchoolName)
	c.StudentCount = p.StudentCount
	c.UnitPriceCents = unit
	c.TotalAmountCents = total
	c.Notes = strings.TrimSpace(p.Notes)
	c.StartDate = p.StartDate
	c.EndDate = p.EndDate
	c.PaymentType = p.PaymentType
	c.Term = p.Term
	if st := strings.ToUpper(strings.TrimSpace(p.Status)); st != "" {
		c.Status = models.SchoolContractStatus(st)
	}
	c.Normalize()
	if err := s.repo.Update(ctx, c); err != nil {
		return nil, err
	}
	return c, nil
}

func (s *SchoolContractService) GetByID(ctx context.Context, id uint) (*models.SchoolContract, int64, error) {
	c, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, 0, ErrSchoolContractNotFound
		}
		return nil, 0, err
	}
	paid, err := s.repo.SumPaidCents(ctx, id)
	if err != nil {
		return nil, 0, err
	}
	return c, paid, nil
}

func (s *SchoolContractService) List(
	ctx context.Context,
	limit, offset int,
	f repositories.SchoolContractListFilter,
) ([]models.SchoolContract, map[uint]int64, int64, error) {
	rows, total, err := s.repo.List(ctx, limit, offset, f)
	if err != nil {
		return nil, nil, 0, err
	}
	ids := make([]uint, len(rows))
	for i := range rows {
		ids[i] = rows[i].ID
	}
	paidMap, err := s.repo.SumPaidCentsByIDs(ctx, ids)
	if err != nil {
		return nil, nil, 0, err
	}
	return rows, paidMap, total, nil
}

func (s *SchoolContractService) Delete(ctx context.Context, id uint) error {
	_, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrSchoolContractNotFound
		}
		return err
	}
	return s.repo.SoftDelete(ctx, id)
}

// StudentStatsByIDs returns enrollment/settled/debt aggregates for students under each contract.
func (s *SchoolContractService) StudentStatsByIDs(ctx context.Context, ids []uint) (map[uint]repositories.SchoolContractStudentStats, error) {
	return s.repo.StudentStatsByIDs(ctx, ids)
}

// LegacyPaidCentsByIDs returns historical contract-only PAID totals (not included in paid_total).
func (s *SchoolContractService) LegacyPaidCentsByIDs(ctx context.Context, ids []uint) (map[uint]int64, error) {
	return s.repo.SumLegacyPaidCentsByIDs(ctx, ids)
}

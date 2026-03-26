package services

import (
	"context"
	"errors"
	"strings"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

var ErrCompensationRuleNotFound = errors.New("compensation rule not found")

type CompensationRuleService struct {
	db *gorm.DB
}

func NewCompensationRuleService(db *gorm.DB) *CompensationRuleService {
	return &CompensationRuleService{db: db}
}

type CreateCompensationRuleParams struct {
	Name          string
	IsActive      bool
	Priority      int
	TargetKind    models.CompensationTargetKind
	AmountKind    models.CompensationAmountKind
	ScopeKind     models.CompensationScopeKind
	PaymentType   models.CompensationPaymentType
	RoleID        *uint
	UserID        *uint
	FixedCents    *int64
	Percent       *float64
	CapacityLimit *int
}

type UpdateCompensationRuleParams = CreateCompensationRuleParams

func (s *CompensationRuleService) List(ctx context.Context) ([]models.CompensationRule, error) {
	var rules []models.CompensationRule
	err := s.db.WithContext(ctx).
		Preload("Role").
		Preload("User").
		Preload("Students").
		Order("priority ASC, id ASC").
		Find(&rules).Error
	return rules, err
}

func (s *CompensationRuleService) Create(ctx context.Context, p CreateCompensationRuleParams) (*models.CompensationRule, error) {
	r := &models.CompensationRule{
		Name:          strings.TrimSpace(p.Name),
		IsActive:      p.IsActive,
		Priority:      p.Priority,
		TargetKind:    p.TargetKind,
		AmountKind:    p.AmountKind,
		ScopeKind:     p.ScopeKind,
		PaymentType:   p.PaymentType,
		RoleID:        p.RoleID,
		UserID:        p.UserID,
		FixedCents:    p.FixedCents,
		Percent:       p.Percent,
		CapacityLimit: p.CapacityLimit,
	}
	if err := s.db.WithContext(ctx).Create(r).Error; err != nil {
		return nil, err
	}
	return s.GetByID(ctx, r.ID)
}

func (s *CompensationRuleService) GetByID(ctx context.Context, id uint) (*models.CompensationRule, error) {
	var r models.CompensationRule
	if err := s.db.WithContext(ctx).Preload("Role").Preload("User").Preload("Students").First(&r, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCompensationRuleNotFound
		}
		return nil, err
	}
	return &r, nil
}

func (s *CompensationRuleService) Update(ctx context.Context, id uint, p UpdateCompensationRuleParams) (*models.CompensationRule, error) {
	r, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	r.Name = strings.TrimSpace(p.Name)
	r.IsActive = p.IsActive
	r.Priority = p.Priority
	r.TargetKind = p.TargetKind
	r.AmountKind = p.AmountKind
	r.ScopeKind = p.ScopeKind
	r.PaymentType = p.PaymentType
	r.RoleID = p.RoleID
	r.UserID = p.UserID
	r.FixedCents = p.FixedCents
	r.Percent = p.Percent
	r.CapacityLimit = p.CapacityLimit
	if err := s.db.WithContext(ctx).Save(r).Error; err != nil {
		return nil, err
	}
	return s.GetByID(ctx, id)
}

func (s *CompensationRuleService) Delete(ctx context.Context, id uint) error {
	if err := s.db.WithContext(ctx).Delete(&models.CompensationRule{}, id).Error; err != nil {
		return err
	}
	return nil
}

func (s *CompensationRuleService) ReplaceStudents(ctx context.Context, ruleID uint, studentIDs []uint) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Unscoped().Where("compensation_rule_id = ?", ruleID).Delete(&models.CompensationRuleStudent{}).Error; err != nil {
			return err
		}
		for _, sid := range studentIDs {
			row := models.CompensationRuleStudent{
				CompensationRuleID: ruleID,
				StudentID:          sid,
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
		}
		return nil
	})
}


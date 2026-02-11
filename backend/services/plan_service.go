package services

import (
	"context"
	"errors"
	"strings"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"gorm.io/gorm"
)

var (
	ErrPlanNotFound       = errors.New("plan not found")
	ErrPlanNameExists     = errors.New("plan name already exists")
	ErrPlanInUse          = errors.New("plan has active enrollments")
	ErrInvalidPlanStatus  = errors.New("invalid plan status")
	ErrInvalidPlanType    = errors.New("invalid plan type")
	ErrInvalidPlanInterval = errors.New("invalid plan interval")
)

// PlanService encapsulates business logic for plans.
type PlanService struct {
	repo repositories.PlanRepository
}

func NewPlanService(repo repositories.PlanRepository) *PlanService {
	return &PlanService{repo: repo}
}

func (s *PlanService) List(ctx context.Context, limit, offset int, search, planType, status string) ([]models.Plan, int64, error) {
	planType = strings.ToUpper(planType)
	status = strings.ToLower(status)
	return s.repo.List(ctx, limit, offset, search, planType, status)
}

func (s *PlanService) GetByID(ctx context.Context, id uint) (*models.Plan, error) {
	p, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPlanNotFound
		}
		return nil, err
	}
	return p, nil
}

type CreatePlanParams struct {
	Name        string
	Description string
	PriceCents  int64
	Interval    string
	Type        string
	IsActive    *bool
	MaxUsers    *int
	Features    []string
}

type UpdatePlanParams struct {
	Name        *string
	Description *string
	PriceCents  *int64
	Interval    *string
	Type        *string
	IsActive    *bool
	MaxUsers    *int
	Features    *[]string
}

func (s *PlanService) Create(ctx context.Context, p CreatePlanParams) (*models.Plan, error) {
	// name uniqueness
	if existing, err := s.repo.FindByName(ctx, p.Name); err == nil && existing != nil {
		return nil, ErrPlanNameExists
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	planType := models.PlanType(strings.ToUpper(p.Type))
	interval := strings.ToLower(p.Interval)

	plan := &models.Plan{
		Name:       p.Name,
		Type:       planType,
		PriceCents: p.PriceCents,
		IsActive:   true,
	}
	if p.Description != "" {
		// description field doesn't exist in model; keep for future extension
	}
	if p.IsActive != nil {
		plan.IsActive = *p.IsActive
	}
	if p.MaxUsers != nil {
		plan.MaxUsers = p.MaxUsers
	}

	// interval mapping: we only persist PriceCents & Type today, but we keep interval for future
	_ = interval

	if err := s.repo.Create(ctx, plan, p.Features); err != nil {
		return nil, err
	}
	return plan, nil
}

func (s *PlanService) Update(ctx context.Context, id uint, p UpdatePlanParams) (*models.Plan, error) {
	plan, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// name uniqueness
	if p.Name != nil && *p.Name != plan.Name {
		if existing, err := s.repo.FindByName(ctx, *p.Name); err == nil && existing != nil && existing.ID != plan.ID {
			return nil, ErrPlanNameExists
		} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		plan.Name = *p.Name
	}

	if p.PriceCents != nil {
		plan.PriceCents = *p.PriceCents
	}
	if p.Type != nil {
		plan.Type = models.PlanType(strings.ToUpper(*p.Type))
	}
	if p.IsActive != nil {
		plan.IsActive = *p.IsActive
	}
	if p.MaxUsers != nil {
		plan.MaxUsers = p.MaxUsers
	}

	features := []string(nil)
	if p.Features != nil {
		features = *p.Features
	}

	if err := s.repo.Update(ctx, plan, features); err != nil {
		return nil, err
	}
	return plan, nil
}

func (s *PlanService) Deactivate(ctx context.Context, id uint) error {
	// Optional: prevent deactivation when in use
	if count, err := s.repo.CountEnrollments(ctx, id); err != nil {
		return err
	} else if count > 0 {
		return ErrPlanInUse
	}

	if err := s.repo.Deactivate(ctx, id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrPlanNotFound
		}
		return err
	}
	return nil
}


package repositories

import (
	"context"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

// PlanRepository encapsulates DB access for plans.
type PlanRepository interface {
	FindByID(ctx context.Context, id uint) (*models.Plan, error)
	FindByName(ctx context.Context, name string) (*models.Plan, error)
	List(ctx context.Context, limit, offset int, search, planType, status string) ([]models.Plan, int64, error)
	Create(ctx context.Context, plan *models.Plan, features []string) error
	Update(ctx context.Context, plan *models.Plan, features []string) error
	Deactivate(ctx context.Context, id uint) error
	CountEnrollments(ctx context.Context, id uint) (int64, error)
	UpdateActiveEnrollmentPricesForPlan(ctx context.Context, planID uint, priceCents int64) error
	Stats(ctx context.Context) (totalPlans, activePlans, activeEnrollments, monthlyRevenueCents int64, err error)
}

type GormPlanRepository struct {
	db *gorm.DB
}

func NewPlanRepository(db *gorm.DB) PlanRepository {
	return &GormPlanRepository{db: db}
}

func (r *GormPlanRepository) FindByID(ctx context.Context, id uint) (*models.Plan, error) {
	var p models.Plan
	if err := r.db.WithContext(ctx).
		Preload("Features").
		First(&p, id).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *GormPlanRepository) FindByName(ctx context.Context, name string) (*models.Plan, error) {
	var p models.Plan
	if err := r.db.WithContext(ctx).
		Where("name = ?", name).
		First(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

// List returns plans with pagination and optional filters.
func (r *GormPlanRepository) List(ctx context.Context, limit, offset int, search, planType, status string) ([]models.Plan, int64, error) {
	var (
		plans []models.Plan
		count int64
	)

	query := r.db.WithContext(ctx).Model(&models.Plan{})

	if search != "" {
		like := "%" + search + "%"
		query = query.Where("name LIKE ? OR description LIKE ?", like, like)
	}

	if planType != "" {
		query = query.Where("type = ?", planType)
	}

	if status != "" {
		switch status {
		case "active":
			query = query.Where("is_active = ?", true)
		case "inactive":
			query = query.Where("is_active = ?", false)
		case "archived":
			// if archived concept added later; for now treat as inactive
			query = query.Where("is_active = ?", false)
		}
	}

	if err := query.Count(&count).Error; err != nil {
		return nil, 0, err
	}

	if err := query.
		Preload("Features").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&plans).Error; err != nil {
		return nil, 0, err
	}

	return plans, count, nil
}

func (r *GormPlanRepository) Create(ctx context.Context, plan *models.Plan, features []string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(plan).Error; err != nil {
			return err
		}
		if len(features) > 0 {
			entries := make([]models.PlanFeature, len(features))
			for i, f := range features {
				entries[i] = models.PlanFeature{
					PlanID:      plan.ID,
					Description: f,
				}
			}
			if err := tx.Create(&entries).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *GormPlanRepository) Update(ctx context.Context, plan *models.Plan, features []string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(plan).Error; err != nil {
			return err
		}
		// Replace features set
		if err := tx.Where("plan_id = ?", plan.ID).Delete(&models.PlanFeature{}).Error; err != nil {
			return err
		}
		if len(features) > 0 {
			entries := make([]models.PlanFeature, len(features))
			for i, f := range features {
				entries[i] = models.PlanFeature{
					PlanID:      plan.ID,
					Description: f,
				}
			}
			if err := tx.Create(&entries).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *GormPlanRepository) Deactivate(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).
		Model(&models.Plan{}).
		Where("id = ?", id).
		Update("is_active", false).Error
}

func (r *GormPlanRepository) CountEnrollments(ctx context.Context, id uint) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).
		Model(&models.Enrollment{}).
		Where("plan_id = ?", id).
		Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

// UpdateActiveEnrollmentPricesForPlan sets price_cents on all ACTIVE enrollments for the plan (after discount rules change).
func (r *GormPlanRepository) UpdateActiveEnrollmentPricesForPlan(ctx context.Context, planID uint, priceCents int64) error {
	return r.db.WithContext(ctx).
		Model(&models.Enrollment{}).
		Where("plan_id = ? AND status = ?", planID, models.EnrollmentStatusActive).
		Update("price_cents", priceCents).Error
}

// Stats returns aggregate stats for plans: total, active, active enrollments and current month revenue.
func (r *GormPlanRepository) Stats(ctx context.Context) (totalPlans, activePlans, activeEnrollments, monthlyRevenueCents int64, err error) {
	db := r.db.WithContext(ctx)

	if err = db.Model(&models.Plan{}).Count(&totalPlans).Error; err != nil {
		return
	}

	if err = db.Model(&models.Plan{}).
		Where("is_active = ?", true).
		Count(&activePlans).Error; err != nil {
		return
	}

	if err = db.Model(&models.Enrollment{}).
		Where("status = ?", models.EnrollmentStatusActive).
		Count(&activeEnrollments).Error; err != nil {
		return
	}

	now := time.Now()
	year, month, _ := now.Date()
	loc := now.Location()
	firstOfMonth := time.Date(year, month, 1, 0, 0, 0, 0, loc)
	firstOfNextMonth := firstOfMonth.AddDate(0, 1, 0)

	if err = db.Model(&models.Payment{}).
		Where("status = ? AND paid_at >= ? AND paid_at < ?", models.PaymentStatusPaid, firstOfMonth, firstOfNextMonth).
		Select("COALESCE(SUM(amount_cents), 0)").
		Scan(&monthlyRevenueCents).Error; err != nil {
		return
	}

	return
}


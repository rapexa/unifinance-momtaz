package repositories

import (
	"context"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

type PaymentRepository interface {
	FindByID(ctx context.Context, id uint) (*models.Payment, error)
	List(
		ctx context.Context,
		limit, offset int,
		search, status, method string,
		from, to *time.Time,
		sort string,
	) ([]models.Payment, int64, error)
	Create(ctx context.Context, p *models.Payment) error
	Update(ctx context.Context, p *models.Payment) error
	SoftDelete(ctx context.Context, id uint) error
	ListRecent(ctx context.Context, limit int) ([]models.Payment, error)
}

type GormPaymentRepository struct {
	db *gorm.DB
}

func NewPaymentRepository(db *gorm.DB) PaymentRepository {
	return &GormPaymentRepository{db: db}
}

func (r *GormPaymentRepository) FindByID(ctx context.Context, id uint) (*models.Payment, error) {
	var p models.Payment
	if err := r.db.WithContext(ctx).
		Preload("Student").
		Preload("Enrollment").
		Preload("Enrollment.Plan").
		First(&p, id).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *GormPaymentRepository) baseQuery(ctx context.Context) *gorm.DB {
	return r.db.WithContext(ctx).Model(&models.Payment{})
}

func (r *GormPaymentRepository) List(
	ctx context.Context,
	limit, offset int,
	search, status, method string,
	from, to *time.Time,
	sort string,
) ([]models.Payment, int64, error) {
	var (
		payments []models.Payment
		count    int64
	)

	query := r.baseQuery(ctx)

	// Search on student name, description, reference_code
	if search != "" {
		like := "%" + search + "%"
		query = query.
			Joins("LEFT JOIN students ON students.id = payments.student_id").
			Where(
				r.db.Where("students.first_name LIKE ?", like).
					Or("students.last_name LIKE ?", like).
					Or("payments.description LIKE ?", like).
					Or("payments.reference_code LIKE ?", like),
			)
	}

	if status != "" {
		query = query.Where("payments.status = ?", status)
	}

	if method != "" {
		query = query.Where("payments.method = ?", method)
	}

	if from != nil {
		query = query.Where("payments.due_date >= ?", *from)
	}
	if to != nil {
		query = query.Where("payments.due_date <= ?", *to)
	}

	if err := query.Count(&count).Error; err != nil {
		return nil, 0, err
	}

	// Sorting
	switch sort {
	case "amount":
		query = query.Order("amount_cents ASC")
	case "-amount":
		query = query.Order("amount_cents DESC")
	case "created_at":
		query = query.Order("created_at ASC")
	case "-created_at", "":
		query = query.Order("created_at DESC")
	case "student_name":
		query = query.
			Joins("LEFT JOIN students s2 ON s2.id = payments.student_id").
			Order("s2.last_name ASC, s2.first_name ASC")
	default:
		query = query.Order("created_at DESC")
	}

	if err := query.
		Preload("Student").
		Preload("Enrollment").
		Preload("Enrollment.Plan").
		Limit(limit).
		Offset(offset).
		Find(&payments).Error; err != nil {
		return nil, 0, err
	}

	return payments, count, nil
}

func (r *GormPaymentRepository) Create(ctx context.Context, p *models.Payment) error {
	return r.db.WithContext(ctx).Create(p).Error
}

func (r *GormPaymentRepository) Update(ctx context.Context, p *models.Payment) error {
	return r.db.WithContext(ctx).Save(p).Error
}

func (r *GormPaymentRepository) SoftDelete(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).
		Model(&models.Payment{}).
		Where("id = ?", id).
		Update("status", "CANCELLED").Error
}

func (r *GormPaymentRepository) ListRecent(ctx context.Context, limit int) ([]models.Payment, error) {
	var payments []models.Payment
	if err := r.baseQuery(ctx).
		Preload("Student").
		Order("created_at DESC").
		Limit(limit).
		Find(&payments).Error; err != nil {
		return nil, err
	}
	return payments, nil
}
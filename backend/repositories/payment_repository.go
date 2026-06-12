package repositories

import (
	"context"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/access"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

// PaymentSummary holds aggregated amounts for the payments page.
type PaymentSummary struct {
	TodayReceivedCents   int64
	PendingCents         int64
	OverdueCents         int64
	ThisMonthReceivedCents int64
}

type PaymentRepository interface {
	FindByID(ctx context.Context, id uint) (*models.Payment, error)
	Summary(ctx context.Context, scopeUser *uint) (*PaymentSummary, error)
	List(
		ctx context.Context,
		limit, offset int,
		search, status, method string,
		from, to *time.Time,
		sort string,
		scopeUser *uint,
	) ([]models.Payment, int64, error)
	Create(ctx context.Context, p *models.Payment) error
	Update(ctx context.Context, p *models.Payment) error
	SoftDelete(ctx context.Context, id uint) error
	ListRecent(ctx context.Context, limit int, scopeUser *uint) ([]models.Payment, error)
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
		Preload("Student.Advisor").
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

func (r *GormPaymentRepository) scopePaymentsQuery(ctx context.Context, scopeUser *uint) *gorm.DB {
	q := r.baseQuery(ctx)
	if scopeUser == nil {
		return q
	}
	uid := *scopeUser
	return q.Joins("INNER JOIN students ON students.id = payments.student_id").
		Where(access.PaymentJoinStudentVisibleSQL(), uid, uid)
}

func (r *GormPaymentRepository) Summary(ctx context.Context, scopeUser *uint) (*PaymentSummary, error) {
	now := time.Now()
	loc := now.Location()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	todayEnd := todayStart.Add(24 * time.Hour)
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
	monthEnd := monthStart.AddDate(0, 1, 0)

	var todayReceived, pending, overdue, monthReceived int64

	sq := func() *gorm.DB { return r.scopePaymentsQuery(ctx, scopeUser) }

	// Today received: PAID and paid_at today
	if err := sq().Where("payments.status = ?", models.PaymentStatusPaid).
		Where("payments.paid_at >= ? AND payments.paid_at < ?", todayStart, todayEnd).
		Select("COALESCE(SUM(payments.amount_cents), 0)").
		Scan(&todayReceived).Error; err != nil {
		return nil, err
	}
	// Pending
	if err := sq().Where("payments.status = ?", models.PaymentStatusPending).
		Select("COALESCE(SUM(payments.amount_cents), 0)").
		Scan(&pending).Error; err != nil {
		return nil, err
	}
	// Overdue
	if err := sq().Where("payments.status = ?", models.PaymentStatusOverdue).
		Select("COALESCE(SUM(payments.amount_cents), 0)").
		Scan(&overdue).Error; err != nil {
		return nil, err
	}
	// This month received: PAID and paid_at in current month
	if err := sq().Where("payments.status = ?", models.PaymentStatusPaid).
		Where("payments.paid_at >= ? AND payments.paid_at < ?", monthStart, monthEnd).
		Select("COALESCE(SUM(payments.amount_cents), 0)").
		Scan(&monthReceived).Error; err != nil {
		return nil, err
	}

	return &PaymentSummary{
		TodayReceivedCents:     todayReceived,
		PendingCents:           pending,
		OverdueCents:           overdue,
		ThisMonthReceivedCents: monthReceived,
	}, nil
}

func (r *GormPaymentRepository) List(
	ctx context.Context,
	limit, offset int,
	search, status, method string,
	from, to *time.Time,
	sort string,
	scopeUser *uint,
) ([]models.Payment, int64, error) {
	var (
		payments []models.Payment
		count    int64
	)

	query := r.baseQuery(ctx)
	studentsJoined := false

	if scopeUser != nil {
		uid := *scopeUser
		query = query.
			Joins("INNER JOIN students ON students.id = payments.student_id").
			Where(access.PaymentJoinStudentVisibleSQL(), uid, uid)
		studentsJoined = true
	}

	// Search on student name, description, reference_code
	if search != "" {
		like := "%" + search + "%"
		if !studentsJoined {
			query = query.Joins("LEFT JOIN students ON students.id = payments.student_id")
			studentsJoined = true
		}
		query = query.Where(
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
		query = query.Order("payments.amount_cents ASC")
	case "-amount":
		query = query.Order("payments.amount_cents DESC")
	case "created_at":
		query = query.Order("payments.created_at ASC")
	case "-created_at", "":
		query = query.Order("payments.created_at DESC")
	case "student_name":
		if !studentsJoined {
			query = query.Joins("LEFT JOIN students ON students.id = payments.student_id")
		}
		query = query.Order("students.last_name ASC, students.first_name ASC")
	default:
		query = query.Order("payments.created_at DESC")
	}

	if err := query.
		Preload("Student").
		Preload("Student.Advisor").
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
		Update("status", models.PaymentStatusCancelled).Error
}

func (r *GormPaymentRepository) ListRecent(ctx context.Context, limit int, scopeUser *uint) ([]models.Payment, error) {
	var payments []models.Payment
	q := r.scopePaymentsQuery(ctx, scopeUser)
	if err := q.
		Preload("Student").
		Preload("Student.Advisor").
		Order("payments.created_at DESC").
		Limit(limit).
		Find(&payments).Error; err != nil {
		return nil, err
	}
	return payments, nil
}
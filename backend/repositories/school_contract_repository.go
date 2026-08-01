package repositories

import (
	"context"
	"strings"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

type SchoolContractListFilter struct {
	Search string
	Status string
	Sort   string
}

type SchoolContractRepository interface {
	FindByID(ctx context.Context, id uint) (*models.SchoolContract, error)
	List(ctx context.Context, limit, offset int, f SchoolContractListFilter) ([]models.SchoolContract, int64, error)
	Create(ctx context.Context, c *models.SchoolContract) error
	Update(ctx context.Context, c *models.SchoolContract) error
	SoftDelete(ctx context.Context, id uint) error
	SumPaidCents(ctx context.Context, contractID uint) (int64, error)
	SumPaidCentsByIDs(ctx context.Context, ids []uint) (map[uint]int64, error)
}

type GormSchoolContractRepository struct {
	db *gorm.DB
}

func NewSchoolContractRepository(db *gorm.DB) SchoolContractRepository {
	return &GormSchoolContractRepository{db: db}
}

func (r *GormSchoolContractRepository) FindByID(ctx context.Context, id uint) (*models.SchoolContract, error) {
	var c models.SchoolContract
	if err := r.db.WithContext(ctx).First(&c, id).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *GormSchoolContractRepository) List(
	ctx context.Context,
	limit, offset int,
	f SchoolContractListFilter,
) ([]models.SchoolContract, int64, error) {
	q := r.db.WithContext(ctx).Model(&models.SchoolContract{})
	if search := strings.TrimSpace(f.Search); search != "" {
		like := "%" + search + "%"
		q = q.Where("school_name LIKE ? OR notes LIKE ?", like, like)
	}
	if status := strings.TrimSpace(f.Status); status != "" && !strings.EqualFold(status, "ALL") {
		q = q.Where("status = ?", strings.ToUpper(status))
	}

	var count int64
	if err := q.Count(&count).Error; err != nil {
		return nil, 0, err
	}

	switch strings.ToLower(strings.TrimSpace(f.Sort)) {
	case "oldest":
		q = q.Order("created_at ASC")
	case "name":
		q = q.Order("school_name ASC")
	case "name_desc":
		q = q.Order("school_name DESC")
	default:
		q = q.Order("created_at DESC")
	}

	var rows []models.SchoolContract
	if err := q.Limit(limit).Offset(offset).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, count, nil
}

func (r *GormSchoolContractRepository) Create(ctx context.Context, c *models.SchoolContract) error {
	return r.db.WithContext(ctx).Create(c).Error
}

func (r *GormSchoolContractRepository) Update(ctx context.Context, c *models.SchoolContract) error {
	return r.db.WithContext(ctx).Save(c).Error
}

func (r *GormSchoolContractRepository) SoftDelete(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&models.SchoolContract{}, id).Error
}

func (r *GormSchoolContractRepository) SumPaidCents(ctx context.Context, contractID uint) (int64, error) {
	var sum int64
	err := r.db.WithContext(ctx).Model(&models.Payment{}).
		Where("school_contract_id = ? AND status = ?", contractID, models.PaymentStatusPaid).
		Select("COALESCE(SUM(amount_cents), 0)").
		Scan(&sum).Error
	return sum, err
}

func (r *GormSchoolContractRepository) SumPaidCentsByIDs(ctx context.Context, ids []uint) (map[uint]int64, error) {
	out := make(map[uint]int64, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	type row struct {
		SchoolContractID uint  `gorm:"column:school_contract_id"`
		PaidSum          int64 `gorm:"column:paid_sum"`
	}
	var rows []row
	err := r.db.WithContext(ctx).Model(&models.Payment{}).
		Select("school_contract_id, COALESCE(SUM(amount_cents), 0) AS paid_sum").
		Where("school_contract_id IN ? AND status = ?", ids, models.PaymentStatusPaid).
		Group("school_contract_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r0 := range rows {
		out[r0.SchoolContractID] = r0.PaidSum
	}
	return out, nil
}

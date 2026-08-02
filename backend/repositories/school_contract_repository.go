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

// SchoolContractStudentStats aggregates per-student enrollment/payment posture under a contract.
type SchoolContractStudentStats struct {
	EnrollmentSumCents int64
	SettledCount       int64 // enrollment > 0 && remaining <= 0
	DebtCount          int64 // remaining > 0
}

type SchoolContractRepository interface {
	FindByID(ctx context.Context, id uint) (*models.SchoolContract, error)
	List(ctx context.Context, limit, offset int, f SchoolContractListFilter) ([]models.SchoolContract, int64, error)
	Create(ctx context.Context, c *models.SchoolContract) error
	Update(ctx context.Context, c *models.SchoolContract) error
	SoftDelete(ctx context.Context, id uint) error
	// SumPaidCents is Σ PAID on students linked to the contract (not legacy school_contract_id payments).
	SumPaidCents(ctx context.Context, contractID uint) (int64, error)
	SumPaidCentsByIDs(ctx context.Context, ids []uint) (map[uint]int64, error)
	// SumLegacyPaidCentsByIDs is Σ PAID on historical school_contract_id-only payments (excluded from paid_total).
	SumLegacyPaidCentsByIDs(ctx context.Context, ids []uint) (map[uint]int64, error)
	StudentStatsByIDs(ctx context.Context, ids []uint) (map[uint]SchoolContractStudentStats, error)
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
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Soft-delete related payments so they disappear from /payments lists.
		var paymentIDs []uint
		if err := tx.Model(&models.Payment{}).
			Where("school_contract_id = ?", id).
			Pluck("id", &paymentIDs).Error; err != nil {
			return err
		}
		if len(paymentIDs) > 0 {
			if err := tx.Where("payment_id IN ?", paymentIDs).
				Delete(&models.PaymentPayrollShare{}).Error; err != nil {
				return err
			}
			if err := tx.Where("id IN ?", paymentIDs).
				Delete(&models.Payment{}).Error; err != nil {
				return err
			}
		}
		// Unlink school-channel students so FK RESTRICT does not block cleanup / hard deletes later.
		if err := tx.Model(&models.Student{}).
			Where("school_contract_id = ?", id).
			Update("school_contract_id", nil).Error; err != nil {
			return err
		}
		return tx.Delete(&models.SchoolContract{}, id).Error
	})
}

func (r *GormSchoolContractRepository) SumPaidCents(ctx context.Context, contractID uint) (int64, error) {
	m, err := r.SumPaidCentsByIDs(ctx, []uint{contractID})
	if err != nil {
		return 0, err
	}
	return m[contractID], nil
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
	// Per-student billing: sum PAID payments of non-deleted students linked to each contract.
	// Legacy payments with only school_contract_id are intentionally excluded (phase 5 migration).
	err := r.db.WithContext(ctx).Model(&models.Payment{}).
		Select("students.school_contract_id AS school_contract_id, COALESCE(SUM(payments.amount_cents), 0) AS paid_sum").
		Joins("INNER JOIN students ON students.id = payments.student_id AND students.deleted_at IS NULL").
		Where("students.school_contract_id IN ? AND students.status <> ? AND payments.status = ?",
			ids, models.StudentStatusDeleted, models.PaymentStatusPaid).
		Group("students.school_contract_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r0 := range rows {
		out[r0.SchoolContractID] = r0.PaidSum
	}
	return out, nil
}

func (r *GormSchoolContractRepository) SumLegacyPaidCentsByIDs(ctx context.Context, ids []uint) (map[uint]int64, error) {
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
		Where("school_contract_id IN ? AND student_id IS NULL AND status = ?", ids, models.PaymentStatusPaid).
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

func (r *GormSchoolContractRepository) StudentStatsByIDs(ctx context.Context, ids []uint) (map[uint]SchoolContractStudentStats, error) {
	out := make(map[uint]SchoolContractStudentStats, len(ids))
	if len(ids) == 0 {
		return out, nil
	}

	type studentRow struct {
		ID                  uint
		SchoolContractID    uint
		EnrollmentAmountCents int64
	}
	var students []studentRow
	if err := r.db.WithContext(ctx).Model(&models.Student{}).
		Select("id, school_contract_id, enrollment_amount_cents").
		Where("school_contract_id IN ? AND status <> ?", ids, models.StudentStatusDeleted).
		Scan(&students).Error; err != nil {
		return nil, err
	}
	if len(students) == 0 {
		return out, nil
	}

	studentIDs := make([]uint, len(students))
	for i := range students {
		studentIDs[i] = students[i].ID
	}

	type paidRow struct {
		StudentID uint  `gorm:"column:student_id"`
		PaidSum   int64 `gorm:"column:paid_sum"`
	}
	var paidRows []paidRow
	if err := r.db.WithContext(ctx).Model(&models.Payment{}).
		Select("student_id, COALESCE(SUM(amount_cents), 0) AS paid_sum").
		Where("student_id IN ? AND status = ?", studentIDs, models.PaymentStatusPaid).
		Group("student_id").
		Scan(&paidRows).Error; err != nil {
		return nil, err
	}
	paidByStudent := make(map[uint]int64, len(paidRows))
	for _, p := range paidRows {
		paidByStudent[p.StudentID] = p.PaidSum
	}

	type openRow struct {
		StudentID uint  `gorm:"column:student_id"`
		OpenSum   int64 `gorm:"column:open_sum"`
	}
	var openRows []openRow
	if err := r.db.WithContext(ctx).Model(&models.Payment{}).
		Select("student_id, COALESCE(SUM(amount_cents), 0) AS open_sum").
		Where("student_id IN ? AND status IN ?", studentIDs,
			[]models.PaymentStatus{models.PaymentStatusPending, models.PaymentStatusOverdue}).
		Group("student_id").
		Scan(&openRows).Error; err != nil {
		return nil, err
	}
	openByStudent := make(map[uint]int64, len(openRows))
	for _, o := range openRows {
		openByStudent[o.StudentID] = o.OpenSum
	}

	for _, st := range students {
		stats := out[st.SchoolContractID]
		stats.EnrollmentSumCents += st.EnrollmentAmountCents
		enroll := st.EnrollmentAmountCents
		var remaining int64
		if enroll > 0 {
			remaining = enroll - paidByStudent[st.ID]
		} else {
			remaining = openByStudent[st.ID]
		}
		if remaining > 0 {
			stats.DebtCount++
		} else if enroll > 0 {
			stats.SettledCount++
		}
		out[st.SchoolContractID] = stats
	}
	return out, nil
}

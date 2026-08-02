package repositories

import (
	"context"
	"strings"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/access"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

// StudentListFilter holds the optional filters for the students list.
// Empty / nil fields mean "no restriction".
type StudentListFilter struct {
	Search      string
	Status      string // ACTIVE | INACTIVE | DELETED
	AdvisorID   *uint
	BillingMode string // SINGLE_SESSION | MONTHLY | SCHOOL_ENROLLMENT
	SchoolName  string
	// RegistrationChannel: PRIVATE | SCHOOL
	RegistrationChannel string
	// SchoolContractID filters students linked to one school contract.
	SchoolContractID *uint
	PlanID           *uint
	// RoleUserID matches students where this user has a role payout share.
	RoleUserID *uint
	// HasDebt filters students with a negative ledger balance.
	HasDebt bool
	// Sort: newest (default) | oldest | name | name_desc
	Sort string
	// ScopeUser restricts rows to what this user may see (nil = full access).
	ScopeUser *uint
}

// StudentRepository encapsulates DB access for students.
type StudentRepository interface {
	FindByID(ctx context.Context, id uint) (*models.Student, error)
	List(ctx context.Context, limit, offset int, filter StudentListFilter) ([]models.Student, int64, error)
	DistinctSchoolNames(ctx context.Context, scopeUser *uint) ([]string, error)
	Create(ctx context.Context, student *models.Student) error
	Update(ctx context.Context, student *models.Student) error
	Delete(ctx context.Context, id uint) error
	HardDelete(ctx context.Context, id uint) error
	Stats(ctx context.Context, scopeUser *uint) (total, active, inactive, deleted, debtors int64, err error)
	IsStudentVisibleToUser(ctx context.Context, studentID uint, userID uint) (bool, error)
	// ReplaceActiveEnrollment cancels active enrollments for the student; if planID is non-nil, creates a new ACTIVE row.
	ReplaceActiveEnrollment(ctx context.Context, studentID uint, planID *uint, priceCents int64) error
	ReplaceStudentRolePayouts(ctx context.Context, studentID uint, rows []models.StudentRolePayout) error
	CountPaidPayments(ctx context.Context, studentID uint) (int64, error)
	// CountBySchoolContractIDs returns how many non-deleted students are linked to each contract.
	CountBySchoolContractIDs(ctx context.Context, ids []uint) (map[uint]int64, error)
	// SumEnrollmentAmountCentsBySchoolContractID sums enrollment_amount_cents for non-deleted students on a contract.
	SumEnrollmentAmountCentsBySchoolContractID(ctx context.Context, contractID uint) (int64, error)
}

type GormStudentRepository struct {
	db *gorm.DB
}

func NewStudentRepository(db *gorm.DB) StudentRepository {
	return &GormStudentRepository{db: db}
}

func (r *GormStudentRepository) FindByID(ctx context.Context, id uint) (*models.Student, error) {
	var s models.Student
	if err := r.db.WithContext(ctx).
		Preload("Advisor").
		Preload("CurrentPlan").
		Preload("SchoolContract").
		Preload("Enrollments", "status = ?", models.EnrollmentStatusActive).
		Preload("StudentRolePayouts").
		Preload("StudentRolePayouts.Role").
		Preload("StudentRolePayouts.User").
		First(&s, id).Error; err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *GormStudentRepository) IsStudentVisibleToUser(ctx context.Context, studentID uint, userID uint) (bool, error) {
	var st models.Student
	if err := r.db.WithContext(ctx).Select("id", "advisor_id").First(&st, studentID).Error; err != nil {
		return false, err
	}
	if st.AdvisorID != nil && *st.AdvisorID == userID {
		return true, nil
	}
	var n int64
	if err := r.db.WithContext(ctx).Model(&models.StudentRolePayout{}).
		Where("student_id = ? AND user_id = ?", studentID, userID).
		Count(&n).Error; err != nil {
		return false, err
	}
	return n > 0, nil
}

// normalizePersianText folds Arabic letter variants and half-spaces so that
// "محمدي"/"محمدی" and "دانش‌آموز"/"دانش آموز" match the same rows.
func normalizePersianText(s string) string {
	rep := strings.NewReplacer(
		"ي", "ی", // ARABIC YEH -> FARSI YEH
		"ى", "ی", // ALEF MAKSURA -> FARSI YEH
		"ك", "ک", // ARABIC KAF -> KEHEH
		"‌", " ", // ZWNJ -> space
		"‏", "", // RTL mark
		"‎", "", // LTR mark
		"أ", "ا", // ALEF WITH HAMZA ABOVE -> ALEF
		"إ", "ا",
		"آ", "ا", // ALEF WITH MADDA -> ALEF
		"ة", "ه", // TEH MARBUTA -> HEH
		"ي", "ی",
	)
	return strings.Join(strings.Fields(rep.Replace(s)), " ")
}

// sqlNormalizeExpr mirrors normalizePersianText inside MySQL for a column.
func sqlNormalizeExpr(col string) string {
	expr := col
	for _, p := range [][2]string{
		{"ي", "ی"},
		{"ى", "ی"},
		{"ك", "ک"},
		{"‌", " "},
		{"أ", "ا"},
		{"إ", "ا"},
		{"آ", "ا"},
		{"ة", "ه"},
	} {
		expr = "REPLACE(" + expr + ", '" + p[0] + "', '" + p[1] + "')"
	}
	return expr
}

// applyStudentFilters adds every filter of f (except pagination) to the query.
func applyStudentFilters(db *gorm.DB, q *gorm.DB, f StudentListFilter) *gorm.DB {
	if f.ScopeUser != nil {
		q = access.ScopeStudentRows(q, *f.ScopeUser)
	}

	if s := normalizePersianText(strings.TrimSpace(f.Search)); s != "" {
		like := "%" + s + "%"
		fullName := sqlNormalizeExpr("CONCAT(students.first_name, ' ', students.last_name)")
		cond := db.Where(fullName+" LIKE ?", like).
			Or(sqlNormalizeExpr("students.first_name")+" LIKE ?", like).
			Or(sqlNormalizeExpr("students.last_name")+" LIKE ?", like).
			Or(sqlNormalizeExpr("students.father_name")+" LIKE ?", like).
			Or(sqlNormalizeExpr("students.mother_name")+" LIKE ?", like).
			Or(sqlNormalizeExpr("students.school_name")+" LIKE ?", like).
			Or("students.phone LIKE ?", like).
			Or("students.father_phone LIKE ?", like).
			Or("students.mother_phone LIKE ?", like).
			Or("students.email LIKE ?", like)
		q = q.Where(cond)
	}

	if f.Status != "" {
		q = q.Where("students.status = ?", f.Status)
	}
	if f.AdvisorID != nil {
		q = q.Where("students.advisor_id = ?", *f.AdvisorID)
	}
	if f.BillingMode != "" {
		if f.BillingMode == string(models.EnrollmentBillingMonthly) {
			// Legacy rows created before the column existed have an empty mode.
			q = q.Where("(students.enrollment_billing_mode = ? OR students.enrollment_billing_mode = '' OR students.enrollment_billing_mode IS NULL)", f.BillingMode)
		} else {
			q = q.Where("students.enrollment_billing_mode = ?", f.BillingMode)
		}
	}
	if school := normalizePersianText(strings.TrimSpace(f.SchoolName)); school != "" {
		q = q.Where(sqlNormalizeExpr("students.school_name")+" = ?", school)
	}
	if ch := strings.ToUpper(strings.TrimSpace(f.RegistrationChannel)); ch != "" {
		if ch == string(models.RegistrationChannelPrivate) {
			// Legacy rows before the column existed may be empty.
			q = q.Where("(students.registration_channel = ? OR students.registration_channel = '' OR students.registration_channel IS NULL)", models.RegistrationChannelPrivate)
		} else {
			q = q.Where("students.registration_channel = ?", ch)
		}
	}
	if f.SchoolContractID != nil {
		q = q.Where("students.school_contract_id = ?", *f.SchoolContractID)
	}
	if f.PlanID != nil {
		q = q.Where("students.current_plan_id = ?", *f.PlanID)
	}
	if f.RoleUserID != nil {
		q = q.Where(`EXISTS (SELECT 1 FROM student_role_payouts srp2
			WHERE srp2.student_id = students.id AND srp2.user_id = ? AND srp2.deleted_at IS NULL)`, *f.RoleUserID)
	}
	if f.HasDebt {
		q = q.Where("students.balance_cents < 0")
	}
	return q
}

func studentListOrder(sort string) string {
	switch sort {
	case "oldest":
		return "students.id ASC"
	case "name":
		return "students.first_name ASC, students.last_name ASC, students.id ASC"
	case "name_desc":
		return "students.first_name DESC, students.last_name DESC, students.id DESC"
	default:
		return "students.id DESC"
	}
}

func (r *GormStudentRepository) List(ctx context.Context, limit, offset int, filter StudentListFilter) ([]models.Student, int64, error) {
	var (
		students []models.Student
		count    int64
	)

	ctxDB := r.db.WithContext(ctx)
	countQuery := applyStudentFilters(ctxDB, ctxDB.Model(&models.Student{}), filter)
	if err := countQuery.Count(&count).Error; err != nil {
		return nil, 0, err
	}

	// A fresh query so the Count above cannot leak into the SELECT below.
	rowsQuery := applyStudentFilters(ctxDB, ctxDB.Model(&models.Student{}), filter)
	if err := rowsQuery.
		Preload("Advisor").
		Preload("CurrentPlan").
		Preload("SchoolContract").
		Preload("Enrollments", "status = ?", models.EnrollmentStatusActive).
		Order(studentListOrder(filter.Sort)).
		Limit(limit).
		Offset(offset).
		Find(&students).Error; err != nil {
		return nil, 0, err
	}

	return students, count, nil
}

func (r *GormStudentRepository) CountBySchoolContractIDs(ctx context.Context, ids []uint) (map[uint]int64, error) {
	out := make(map[uint]int64, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	type row struct {
		SchoolContractID uint
		Cnt              int64
	}
	var rows []row
	if err := r.db.WithContext(ctx).Model(&models.Student{}).
		Select("school_contract_id AS school_contract_id, COUNT(*) AS cnt").
		Where("school_contract_id IN ? AND status <> ?", ids, models.StudentStatusDeleted).
		Group("school_contract_id").
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.SchoolContractID] = r.Cnt
	}
	return out, nil
}

func (r *GormStudentRepository) SumEnrollmentAmountCentsBySchoolContractID(ctx context.Context, contractID uint) (int64, error) {
	if contractID == 0 {
		return 0, nil
	}
	var sum int64
	err := r.db.WithContext(ctx).Model(&models.Student{}).
		Where("school_contract_id = ? AND status <> ?", contractID, models.StudentStatusDeleted).
		Select("COALESCE(SUM(enrollment_amount_cents), 0)").
		Scan(&sum).Error
	return sum, err
}

// DistinctSchoolNames returns the non-empty school names visible to the user, for filter dropdowns.
func (r *GormStudentRepository) DistinctSchoolNames(ctx context.Context, scopeUser *uint) ([]string, error) {
	ctxDB := r.db.WithContext(ctx)
	q := ctxDB.Model(&models.Student{}).
		Where("students.school_name <> ''")
	if scopeUser != nil {
		q = access.ScopeStudentRows(q, *scopeUser)
	}
	var names []string
	if err := q.Distinct().Order("students.school_name ASC").Pluck("students.school_name", &names).Error; err != nil {
		return nil, err
	}
	return names, nil
}

func (r *GormStudentRepository) Create(ctx context.Context, student *models.Student) error {
	return r.db.WithContext(ctx).Create(student).Error
}

func (r *GormStudentRepository) Update(ctx context.Context, student *models.Student) error {
	return r.db.WithContext(ctx).Save(student).Error
}

func (r *GormStudentRepository) Delete(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Delete(&models.Student{}, id).Error
}

// HardDelete permanently removes the student and all dependent rows (payments, enrollments, etc.).
func (r *GormStudentRepository) HardDelete(ctx context.Context, id uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var paymentIDs []uint
		if err := tx.Unscoped().Model(&models.Payment{}).
			Where("student_id = ?", id).
			Pluck("id", &paymentIDs).Error; err != nil {
			return err
		}
		if len(paymentIDs) > 0 {
			if err := tx.Unscoped().Where("payment_id IN ?", paymentIDs).
				Delete(&models.PaymentPayrollShare{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Unscoped().Where("student_id = ?", id).Delete(&models.Payment{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("student_id = ?", id).Delete(&models.Enrollment{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("student_id = ?", id).Delete(&models.PaymentReminder{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("student_id = ?", id).Delete(&models.StudentRolePayout{}).Error; err != nil {
			return err
		}
		res := tx.Unscoped().Delete(&models.Student{}, id)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return nil
	})
}

func (r *GormStudentRepository) CountPaidPayments(ctx context.Context, studentID uint) (int64, error) {
	var n int64
	err := r.db.WithContext(ctx).Model(&models.Payment{}).
		Where("student_id = ? AND status = ?", studentID, models.PaymentStatusPaid).
		Count(&n).Error
	return n, err
}

// Stats returns aggregate counts for students: total, active, inactive, and debtors (balance < 0).
// Each count uses a fresh query so Where conditions do not accumulate.
func (r *GormStudentRepository) Stats(ctx context.Context, scopeUser *uint) (total, active, inactive, deleted, debtors int64, err error) {
	ctxDB := r.db.WithContext(ctx)
	scoped := func() *gorm.DB {
		q := ctxDB.Model(&models.Student{})
		if scopeUser != nil {
			q = access.ScopeStudentRows(q, *scopeUser)
		}
		return q
	}

	if err = scoped().Count(&total).Error; err != nil {
		return
	}
	if err = scoped().Where("status = ?", models.StudentStatusActive).Count(&active).Error; err != nil {
		return
	}
	if err = scoped().Where("status = ?", models.StudentStatusInactive).Count(&inactive).Error; err != nil {
		return
	}
	if err = scoped().Where("status = ?", models.StudentStatusDeleted).Count(&deleted).Error; err != nil {
		return
	}
	if err = scoped().Where("balance_cents < 0").Count(&debtors).Error; err != nil {
		return
	}
	return
}

func (r *GormStudentRepository) ReplaceActiveEnrollment(ctx context.Context, studentID uint, planID *uint, priceCents int64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.Enrollment{}).
			Where("student_id = ? AND status = ?", studentID, models.EnrollmentStatusActive).
			Update("status", models.EnrollmentStatusCancelled).Error; err != nil {
			return err
		}
		if planID == nil {
			return nil
		}
		e := models.Enrollment{
			StudentID:  studentID,
			PlanID:     *planID,
			StartDate:  time.Now(),
			EndDate:    nil,
			Status:     models.EnrollmentStatusActive,
			PriceCents: priceCents,
		}
		return tx.Create(&e).Error
	})
}

func (r *GormStudentRepository) ReplaceStudentRolePayouts(ctx context.Context, studentID uint, rows []models.StudentRolePayout) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Hard-delete (Unscoped) so the unique index on (student_id, role_id, user_id)
		// does not block subsequent inserts with the same keys.
		if err := tx.Unscoped().Where("student_id = ?", studentID).Delete(&models.StudentRolePayout{}).Error; err != nil {
			return err
		}
		if len(rows) == 0 {
			return nil
		}
		for i := range rows {
			rows[i].StudentID = studentID
			rows[i].Model = gorm.Model{} // clear any stale ID/timestamps before insert
		}
		return tx.Create(&rows).Error
	})
}

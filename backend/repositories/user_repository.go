package repositories

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

// UserRepository defines data-access behavior for users.
// This is the core of the Repository Pattern for the User aggregate.
type UserRepository interface {
	FindByID(ctx context.Context, id uint) (*models.User, error)
	FindByEmail(ctx context.Context, email string) (*models.User, error)
	Create(ctx context.Context, user *models.User) error
	Update(ctx context.Context, user *models.User) error
	SetTokensValidFrom(ctx context.Context, userID uint, t time.Time) error
	TouchLastLogin(ctx context.Context, userID uint, t time.Time) error
	SetPasswordAndInvalidate(ctx context.Context, userID uint, passwordHash string, t time.Time) error
	List(ctx context.Context, limit, offset int, search, roleCode string, roleID uint, isActive *bool) ([]models.User, int64, error)
	RoleStats(ctx context.Context) ([]UserRoleStat, error)
	CountAssignedStudentsByUserIDs(ctx context.Context, userIDs []uint) (map[uint]int64, error)
	RoleStudentCounts(ctx context.Context) (map[uint]int64, error)
	CountRegisteredStudents(ctx context.Context) (int64, error)
	RoleIDsWithOrgStudentsView(ctx context.Context) ([]uint, error)
	UserIDsWithRoleIDs(ctx context.Context, userIDs, roleIDs []uint) ([]uint, error)
}

// UserRoleStat is one row for the users summary endpoint.
type UserRoleStat struct {
	RoleID         uint   `json:"role_id"`
	Code           string `json:"code"`
	Name           string `json:"name"`
	Count          int64  `json:"count"`
	ActiveCount    int64  `json:"active_count"`
	StudentsCount  int64  `json:"students_count"`
}

type GormUserRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) UserRepository {
	return &GormUserRepository{db: db}
}

func (r *GormUserRepository) FindByID(ctx context.Context, id uint) (*models.User, error) {
	var u models.User
	if err := r.db.WithContext(ctx).Preload("Role").First(&u, id).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *GormUserRepository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	if err := r.db.WithContext(ctx).Preload("Role").Where("email = ?", email).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *GormUserRepository) Create(ctx context.Context, user *models.User) error {
	// The email unique index ignores deleted_at, so a soft-deleted user (e.g. archived
	// by a fiscal-year close) still occupies the email and a plain INSERT would fail with
	// a duplicate-key error. If such an archived row exists, revive it in place instead.
	var soft models.User
	softErr := r.db.WithContext(ctx).Unscoped().
		Where("email = ? AND deleted_at IS NOT NULL", user.Email).
		First(&soft).Error
	if softErr == nil {
		if err := user.BeforeCreate(r.db); err != nil { // hash PlainPassword
			return err
		}
		updates := map[string]interface{}{
			"deleted_at":        gorm.Expr("NULL"),
			"first_name":        user.FirstName,
			"last_name":         user.LastName,
			"phone":             user.Phone,
			"role_id":           user.RoleID,
			"is_active":         user.IsActive,
			"organization_id":   user.OrganizationID,
			"two_factor_enabled": user.TwoFactorEnabled,
			"tokens_valid_from": gorm.Expr("NULL"),
		}
		if user.PasswordHash != "" {
			updates["password_hash"] = user.PasswordHash
		}
		if err := r.db.WithContext(ctx).Unscoped().
			Model(&models.User{}).Where("id = ?", soft.ID).Updates(updates).Error; err != nil {
			return err
		}
		user.ID = soft.ID
		return nil
	}
	if !errors.Is(softErr, gorm.ErrRecordNotFound) {
		return softErr
	}
	return r.db.WithContext(ctx).Create(user).Error
}

func (r *GormUserRepository) SetTokensValidFrom(ctx context.Context, userID uint, t time.Time) error {
	return r.db.WithContext(ctx).Model(&models.User{}).
		Where("id = ?", userID).
		Update("tokens_valid_from", t).Error
}

// TouchLastLogin records a successful login time.
func (r *GormUserRepository) TouchLastLogin(ctx context.Context, userID uint, t time.Time) error {
	return r.db.WithContext(ctx).Model(&models.User{}).
		Where("id = ?", userID).
		UpdateColumn("last_login_at", t).Error
}

func (r *GormUserRepository) SetPasswordAndInvalidate(ctx context.Context, userID uint, passwordHash string, t time.Time) error {
	return r.db.WithContext(ctx).Model(&models.User{}).
		Where("id = ?", userID).
		Updates(map[string]interface{}{
			"password_hash":     passwordHash,
			"tokens_valid_from": t,
		}).Error
}

func (r *GormUserRepository) Update(ctx context.Context, user *models.User) error {
	return r.db.WithContext(ctx).Save(user).Error
}

// List returns a paginated list of users with optional search, role and status filters.
func (r *GormUserRepository) List(ctx context.Context, limit, offset int, search, roleCode string, roleID uint, isActive *bool) ([]models.User, int64, error) {
	var (
		users []models.User
		count int64
	)

	query := r.db.WithContext(ctx).Model(&models.User{})

	if search != "" {
		like := "%" + search + "%"
		query = query.Where(
			r.db.Where("first_name LIKE ?", like).
				Or("last_name LIKE ?", like).
				Or("email LIKE ?", like),
		)
	}

	if roleID > 0 {
		query = query.Where("users.role_id = ?", roleID)
	} else if roleCode != "" {
		query = query.Joins("LEFT JOIN roles ON roles.id = users.role_id").
			Where("roles.code = ?", strings.ToLower(strings.TrimSpace(roleCode)))
	}

	if isActive != nil {
		query = query.Where("users.is_active = ?", *isActive)
	}

	if err := query.Count(&count).Error; err != nil {
		return nil, 0, err
	}

	q2 := r.db.WithContext(ctx).Model(&models.User{}).Preload("Role")
	if search != "" {
		like := "%" + search + "%"
		q2 = q2.Where(
			r.db.Where("first_name LIKE ?", like).
				Or("last_name LIKE ?", like).
				Or("email LIKE ?", like),
		)
	}
	if roleID > 0 {
		q2 = q2.Where("users.role_id = ?", roleID)
	} else if roleCode != "" {
		q2 = q2.Joins("LEFT JOIN roles ON roles.id = users.role_id").
			Where("roles.code = ?", strings.ToLower(strings.TrimSpace(roleCode)))
	}
	if isActive != nil {
		q2 = q2.Where("users.is_active = ?", *isActive)
	}

	if err := q2.
		Order("users.created_at DESC, users.id DESC").
		Limit(limit).
		Offset(offset).
		Find(&users).Error; err != nil {
		return nil, 0, err
	}

	return users, count, nil
}

// RoleStats returns user counts grouped by role.
func (r *GormUserRepository) RoleStats(ctx context.Context) ([]UserRoleStat, error) {
	var rows []UserRoleStat
	err := r.db.WithContext(ctx).Model(&models.User{}).
		Select("users.role_id as role_id, COALESCE(roles.code, '') as code, COALESCE(roles.name, '') as name, COUNT(*) as count, " +
			"COALESCE(SUM(CASE WHEN users.is_active THEN 1 ELSE 0 END), 0) as active_count").
		Joins("LEFT JOIN roles ON roles.id = users.role_id").
		Group("users.role_id, roles.code, roles.name").
		Scan(&rows).Error
	return rows, err
}

// CountAssignedStudentsByUserIDs counts distinct active students linked to each user as advisor or role payout.
func (r *GormUserRepository) CountAssignedStudentsByUserIDs(ctx context.Context, userIDs []uint) (map[uint]int64, error) {
	out := make(map[uint]int64, len(userIDs))
	for _, id := range userIDs {
		out[id] = 0
	}
	if len(userIDs) == 0 {
		return out, nil
	}
	type row struct {
		UserID uint
		Count  int64
	}
	var rows []row
	err := r.db.WithContext(ctx).Raw(`
SELECT uid AS user_id, COUNT(DISTINCT student_id) AS count FROM (
  SELECT advisor_id AS uid, id AS student_id FROM students
  WHERE deleted_at IS NULL AND status != ? AND advisor_id IN ?
  UNION
  SELECT srp.user_id AS uid, srp.student_id FROM student_role_payouts srp
  INNER JOIN students s ON s.id = srp.student_id AND s.deleted_at IS NULL AND s.status != ?
  WHERE srp.deleted_at IS NULL AND srp.user_id IN ?
) t GROUP BY uid
`, models.StudentStatusDeleted, userIDs, models.StudentStatusDeleted, userIDs).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, rw := range rows {
		out[rw.UserID] = rw.Count
	}
	return out, nil
}

// RoleStudentCounts returns distinct student counts per role (advisor role or student_role_payout role).
func (r *GormUserRepository) RoleStudentCounts(ctx context.Context) (map[uint]int64, error) {
	type row struct {
		RoleID uint
		Count  int64
	}
	var rows []row
	err := r.db.WithContext(ctx).Raw(`
SELECT role_id, COUNT(DISTINCT student_id) AS count FROM (
  SELECT srp.role_id, srp.student_id FROM student_role_payouts srp
  INNER JOIN students s ON s.id = srp.student_id AND s.deleted_at IS NULL AND s.status != ?
  WHERE srp.deleted_at IS NULL
  UNION
  SELECT u.role_id, st.id FROM students st
  INNER JOIN users u ON u.id = st.advisor_id AND u.deleted_at IS NULL
  WHERE st.deleted_at IS NULL AND st.status != ? AND st.advisor_id IS NOT NULL
) t WHERE role_id IS NOT NULL AND role_id > 0 GROUP BY role_id
`, models.StudentStatusDeleted, models.StudentStatusDeleted).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make(map[uint]int64, len(rows))
	for _, rw := range rows {
		out[rw.RoleID] = rw.Count
	}
	return out, nil
}

// CountRegisteredStudents returns all non-deleted students in the organization.
func (r *GormUserRepository) CountRegisteredStudents(ctx context.Context) (int64, error) {
	var cnt int64
	err := r.db.WithContext(ctx).Model(&models.Student{}).
		Where("status != ?", models.StudentStatusDeleted).
		Count(&cnt).Error
	return cnt, err
}

// RoleIDsWithOrgStudentsView returns role IDs that should see org-wide student totals (مدیرکل / NET_REVENUE).
func (r *GormUserRepository) RoleIDsWithOrgStudentsView(ctx context.Context) ([]uint, error) {
	var ids []uint
	err := r.db.WithContext(ctx).Model(&models.Role{}).
		Where("full_access = ? OR compensation_kind = ?", true, models.CompNetRevenue).
		Pluck("id", &ids).Error
	return ids, err
}

// UserIDsWithRoleIDs returns the subset of userIDs whose role_id is in roleIDs.
func (r *GormUserRepository) UserIDsWithRoleIDs(ctx context.Context, userIDs, roleIDs []uint) ([]uint, error) {
	if len(userIDs) == 0 || len(roleIDs) == 0 {
		return nil, nil
	}
	var ids []uint
	err := r.db.WithContext(ctx).Model(&models.User{}).
		Where("id IN ? AND role_id IN ?", userIDs, roleIDs).
		Pluck("id", &ids).Error
	return ids, err
}

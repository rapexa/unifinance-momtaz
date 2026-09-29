package services

import (
	"context"
	"crypto/ed25519"
	"errors"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/config"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/pkg/license"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// License states.
const (
	LicenseDisabled = "DISABLED" // no public key compiled in: unlimited
	LicenseValid    = "VALID"
	LicenseGrace    = "GRACE"   // expired less than LicenseGraceDays ago: still writable
	LicenseExpired  = "EXPIRED" // read-only
	LicenseMissing  = "MISSING" // read-only
	LicenseInvalid  = "INVALID" // read-only
)

// LicenseGraceDays is how long an expired subscription keeps working before read-only.
const LicenseGraceDays = 7

var (
	ErrLicenseReadOnly     = errors.New("اشتراک این مجموعه فعال نیست؛ امکان ثبت و ویرایش اطلاعات وجود ندارد. برای تمدید با پشتیبانی تماس بگیرید")
	ErrLicenseStudentLimit = errors.New("سقف تعداد دانش‌آموزان فعال در اشتراک شما پر شده است؛ برای ارتقای پلن با پشتیبانی تماس بگیرید")
	ErrLicenseUserLimit    = errors.New("سقف تعداد کاربران فعال در اشتراک شما پر شده است؛ برای ارتقای پلن با پشتیبانی تماس بگیرید")
	ErrLicenseDisabled     = errors.New("لایسنس در این نسخه فعال نیست")
)

// LicenseStatus is the current subscription state of this installation.
type LicenseStatus struct {
	Enabled  bool
	State    string
	ReadOnly bool
	Claims   *license.Claims
	DaysLeft int
	Students int64
	Users    int64
	Error    string
}

// LicenseService loads and verifies the license key; results are cached briefly because
// the guard middleware asks on every write.
type LicenseService struct {
	db  *gorm.DB
	cfg *config.Config
	pub ed25519.PublicKey

	mu       sync.Mutex
	cached   *LicenseStatus
	cachedAt time.Time
	now      func() time.Time
}

func NewLicenseService(db *gorm.DB, cfg *config.Config) *LicenseService {
	s := &LicenseService{db: db, cfg: cfg, now: time.Now}
	if pub, err := license.CompiledPublicKey(); err == nil {
		s.pub = pub
	}
	return s
}

// Enabled reports whether this build enforces licenses.
func (s *LicenseService) Enabled() bool { return s.pub != nil }

// currentKey returns the key saved in the database, else config license.key / key_file.
func (s *LicenseService) currentKey(ctx context.Context) string {
	var st models.AppSetting
	if err := s.db.WithContext(ctx).Where("`key` = ?", models.AppSettingLicenseKey).First(&st).Error; err == nil {
		if k := strings.TrimSpace(st.Value); k != "" {
			return k
		}
	}
	if s.cfg != nil {
		if k := strings.TrimSpace(s.cfg.License.Key); k != "" {
			return k
		}
		if f := strings.TrimSpace(s.cfg.License.KeyFile); f != "" {
			if b, err := os.ReadFile(f); err == nil {
				return strings.TrimSpace(string(b))
			}
		}
	}
	return ""
}

// Status returns the (cached, ≤30s old) license status.
func (s *LicenseService) Status(ctx context.Context) *LicenseStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cached != nil && s.now().Sub(s.cachedAt) < 30*time.Second {
		return s.cached
	}
	st := s.compute(ctx)
	s.cached, s.cachedAt = st, s.now()
	return st
}

func (s *LicenseService) invalidate() {
	s.mu.Lock()
	s.cached = nil
	s.mu.Unlock()
}

func (s *LicenseService) compute(ctx context.Context) *LicenseStatus {
	st := &LicenseStatus{Enabled: s.Enabled(), State: LicenseDisabled}
	_ = s.db.WithContext(ctx).Model(&models.Student{}).
		Where("status = ?", models.StudentStatusActive).Count(&st.Students).Error
	_ = s.db.WithContext(ctx).Model(&models.User{}).
		Where("is_active = ?", true).Count(&st.Users).Error
	if !st.Enabled {
		return st
	}
	key := s.currentKey(ctx)
	if key == "" {
		st.State, st.ReadOnly = LicenseMissing, true
		return st
	}
	claims, err := license.Parse(key, s.pub)
	if err != nil {
		st.State, st.ReadOnly, st.Error = LicenseInvalid, true, err.Error()
		return st
	}
	st.Claims = claims
	s.applyExpiry(st, s.now())
	return st
}

func (s *LicenseService) applyExpiry(st *LicenseStatus, now time.Time) {
	exp := st.Claims.ExpiresAt
	st.DaysLeft = int(exp.Sub(now).Hours() / 24)
	if exp.Sub(now) < 0 && st.DaysLeft == 0 {
		st.DaysLeft = -1
	}
	switch {
	case now.Before(exp):
		st.State = LicenseValid
	case now.Before(exp.AddDate(0, 0, LicenseGraceDays)):
		st.State = LicenseGrace
	default:
		st.State, st.ReadOnly = LicenseExpired, true
	}
}

// Save verifies and stores a new key (renewal/upgrade pasted by the customer).
func (s *LicenseService) Save(ctx context.Context, key string) (*LicenseStatus, error) {
	if !s.Enabled() {
		return nil, ErrLicenseDisabled
	}
	key = strings.Join(strings.Fields(key), "")
	if _, err := license.Parse(key, s.pub); err != nil {
		return nil, err
	}
	row := models.AppSetting{Key: models.AppSettingLicenseKey, Value: key}
	if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "key"}},
		DoUpdates: clause.AssignmentColumns([]string{"value", "updated_at"}),
	}).Create(&row).Error; err != nil {
		return nil, err
	}
	s.invalidate()
	return s.Status(ctx), nil
}

// CheckCanCreateStudent enforces the active-student limit.
func (s *LicenseService) CheckCanCreateStudent(ctx context.Context) error {
	st := s.Status(ctx)
	if st.ReadOnly {
		return ErrLicenseReadOnly
	}
	if st.Claims != nil && st.Claims.MaxStudents > 0 && st.Students >= int64(st.Claims.MaxStudents) {
		return ErrLicenseStudentLimit
	}
	return nil
}

// CheckCanCreateUser enforces the active-user limit.
func (s *LicenseService) CheckCanCreateUser(ctx context.Context) error {
	st := s.Status(ctx)
	if st.ReadOnly {
		return ErrLicenseReadOnly
	}
	if st.Claims != nil && st.Claims.MaxUsers > 0 && st.Users >= int64(st.Claims.MaxUsers) {
		return ErrLicenseUserLimit
	}
	return nil
}

// Refresh drops the cache (after creating students/users, counts change).
func (s *LicenseService) Refresh() { s.invalidate() }

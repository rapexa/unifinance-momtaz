package services

import (
	"context"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

var (
	ErrLeadInvalidName  = errors.New("نام را وارد کنید")
	ErrLeadInvalidPhone = errors.New("شماره موبایل معتبر نیست (مثلاً ۰۹۱۲۱۲۳۴۵۶۷)")
	ErrLeadRateLimited  = errors.New("درخواست‌های زیادی از این دستگاه ثبت شده است؛ کمی بعد دوباره تلاش کنید")
	ErrLeadNotFound     = errors.New("درخواست یافت نشد")
	ErrLeadBadStatus    = errors.New("وضعیت نامعتبر است")
)

var iranMobile = regexp.MustCompile(`^09\d{9}$`)

// LeadService stores demo requests from the public sales page.
type LeadService struct {
	db          *gorm.DB
	sms         *MelipayamakService
	notifyPhone string

	mu     sync.Mutex
	recent map[string][]time.Time // ip -> submissions in the last hour
}

func NewLeadService(db *gorm.DB, sms *MelipayamakService, notifyPhone string) *LeadService {
	return &LeadService{db: db, sms: sms, notifyPhone: strings.TrimSpace(notifyPhone), recent: map[string][]time.Time{}}
}

// mobileDigits converts Persian/Arabic digits to ASCII and keeps only digits and "+".
func mobileDigits(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= '۰' && r <= '۹':
			b.WriteRune('0' + (r - '۰'))
		case r >= '٠' && r <= '٩':
			b.WriteRune('0' + (r - '٠'))
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '+':
			b.WriteRune(r)
		}
	}
	return b.String()
}

// NormalizeIranMobile returns 09xxxxxxxxx or "" when the number is not an Iranian mobile.
func NormalizeIranMobile(raw string) string {
	d := mobileDigits(raw)
	switch {
	case strings.HasPrefix(d, "+98"):
		d = "0" + d[3:]
	case strings.HasPrefix(d, "0098"):
		d = "0" + d[4:]
	case strings.HasPrefix(d, "98") && len(d) == 12:
		d = "0" + d[2:]
	case strings.HasPrefix(d, "9") && len(d) == 10:
		d = "0" + d
	}
	if !iranMobile.MatchString(d) {
		return ""
	}
	return d
}

func clip(s string, n int) string {
	s = strings.TrimSpace(s)
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

// allow records a submission for ip and reports whether it is within 5 per hour.
func (s *LeadService) allow(ip string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	kept := s.recent[ip][:0]
	for _, t := range s.recent[ip] {
		if now.Sub(t) < time.Hour {
			kept = append(kept, t)
		}
	}
	if len(kept) >= 5 {
		s.recent[ip] = kept
		return false
	}
	s.recent[ip] = append(kept, now)
	return true
}

// Create validates and stores a lead, then notifies the vendor by SMS (best effort).
func (s *LeadService) Create(ctx context.Context, in models.Lead) (*models.Lead, error) {
	in.Name = clip(in.Name, 150)
	if len([]rune(in.Name)) < 2 {
		return nil, ErrLeadInvalidName
	}
	in.Phone = NormalizeIranMobile(in.Phone)
	if in.Phone == "" {
		return nil, ErrLeadInvalidPhone
	}
	if !s.allow(in.IP) {
		return nil, ErrLeadRateLimited
	}
	in.Organization = clip(in.Organization, 200)
	in.City = clip(in.City, 100)
	in.StudentsRange = clip(in.StudentsRange, 50)
	in.Plan = clip(in.Plan, 50)
	in.Hosting = clip(in.Hosting, 20)
	in.Message = clip(in.Message, 2000)
	in.UserAgent = clip(in.UserAgent, 255)
	in.Status = models.LeadStatusNew
	in.ID = 0
	if err := s.db.WithContext(ctx).Create(&in).Error; err != nil {
		return nil, err
	}
	if s.sms != nil && s.notifyPhone != "" && s.sms.CanSendText() {
		text := fmt.Sprintf("درخواست دمو جدید\n%s - %s\n%s", in.Name, in.Phone, in.Organization)
		go func() {
			if err := s.sms.SendText(s.notifyPhone, text); err != nil {
				log.Printf("leads: notify sms failed: %v", err)
			}
		}()
	}
	return &in, nil
}

// OrganizationName returns this installation's organization name (for public pages).
func (s *LeadService) OrganizationName(ctx context.Context) string {
	var org models.Organization
	if err := s.db.WithContext(ctx).Order("id ASC").First(&org).Error; err != nil {
		return ""
	}
	return strings.TrimSpace(org.Name)
}

// List returns leads, newest first, optionally filtered by status.
func (s *LeadService) List(ctx context.Context, status string) ([]models.Lead, error) {
	q := s.db.WithContext(ctx).Order("created_at DESC, id DESC").Limit(1000)
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var out []models.Lead
	return out, q.Find(&out).Error
}

// Update changes a lead's status and/or note.
func (s *LeadService) Update(ctx context.Context, id uint, status *string, note *string) (*models.Lead, error) {
	var l models.Lead
	if err := s.db.WithContext(ctx).First(&l, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrLeadNotFound
		}
		return nil, err
	}
	updates := map[string]interface{}{}
	if status != nil {
		switch models.LeadStatus(*status) {
		case models.LeadStatusNew, models.LeadStatusContacted, models.LeadStatusDemo, models.LeadStatusWon, models.LeadStatusLost:
			updates["status"] = *status
		default:
			return nil, ErrLeadBadStatus
		}
	}
	if note != nil {
		updates["note"] = clip(*note, 4000)
	}
	if len(updates) > 0 {
		if err := s.db.WithContext(ctx).Model(&l).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return &l, s.db.WithContext(ctx).First(&l, id).Error
}

// Delete removes a lead.
func (s *LeadService) Delete(ctx context.Context, id uint) error {
	res := s.db.WithContext(ctx).Delete(&models.Lead{}, id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrLeadNotFound
	}
	return nil
}

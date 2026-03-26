package services

import (
	"context"
	"strings"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

type ReminderService struct {
	db *gorm.DB
}

func NewReminderService(db *gorm.DB) *ReminderService {
	return &ReminderService{db: db}
}

func (s *ReminderService) EnsureDefaultRules(ctx context.Context) error {
	defaults := []models.ReminderRule{
		{Type: models.ReminderTypeBeforeDue, DaysOffset: 3, Channel: models.ReminderChannelTelegram, Enabled: true},
		{Type: models.ReminderTypeDueDay, DaysOffset: 0, Channel: models.ReminderChannelTelegram, Enabled: true},
		{Type: models.ReminderTypeOverdue, DaysOffset: 1, Channel: models.ReminderChannelTelegram, Enabled: true},
	}
	for i := range defaults {
		r := defaults[i]
		var existing models.ReminderRule
		err := s.db.WithContext(ctx).
			Where("type = ? AND days_offset = ? AND channel = ?", r.Type, r.DaysOffset, r.Channel).
			First(&existing).Error
		if err == gorm.ErrRecordNotFound {
			if err := s.db.WithContext(ctx).Create(&r).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
	}
	return nil
}

func (s *ReminderService) ListRules(ctx context.Context) ([]models.ReminderRule, error) {
	if err := s.EnsureDefaultRules(ctx); err != nil {
		return nil, err
	}
	var rules []models.ReminderRule
	err := s.db.WithContext(ctx).Order("type ASC, days_offset ASC").Find(&rules).Error
	return rules, err
}

func (s *ReminderService) ReplaceRules(ctx context.Context, rules []models.ReminderRule) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for i := range rules {
			r := rules[i]
			var existing models.ReminderRule
			err := tx.Where("type = ? AND days_offset = ? AND channel = ?", r.Type, r.DaysOffset, r.Channel).First(&existing).Error
			if err == gorm.ErrRecordNotFound {
				if err := tx.Create(&r).Error; err != nil {
					return err
				}
				continue
			}
			if err != nil {
				return err
			}
			existing.Enabled = r.Enabled
			if err := tx.Save(&existing).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

type ReminderLogItem struct {
	ID          uint                   `json:"id"`
	StudentID   uint                   `json:"student_id"`
	Student     string                 `json:"student"`
	Type        models.ReminderType    `json:"type"`
	DaysOffset  int                    `json:"days_offset"`
	AmountCents int64                  `json:"amount_cents"`
	LastSent    *time.Time             `json:"last_sent"`
	Status      models.ReminderStatus  `json:"status"`
	Channel     models.ReminderChannel `json:"channel"`
}

func (s *ReminderService) ListLogs(ctx context.Context, search string, limit int) ([]ReminderLogItem, error) {
	type row struct {
		ID          uint
		StudentID   uint
		FirstName   string
		LastName    string
		Type        string
		DaysOffset  int
		AmountCents int64
		LastSent    *time.Time
		Status      string
		Channel     string
	}
	var rows []row
	q := s.db.WithContext(ctx).Table("payment_reminders pr").
		Joins("LEFT JOIN students s ON s.id = pr.student_id").
		Joins("LEFT JOIN reminder_rules rr ON rr.id = pr.rule_id").
		Select("pr.id, pr.student_id, s.first_name, s.last_name, rr.type, rr.days_offset, pr.amount_cents, pr.sent_at as last_sent, pr.status, pr.channel").
		Order("pr.created_at DESC").
		Limit(limit)
	if strings.TrimSpace(search) != "" {
		like := "%" + strings.TrimSpace(search) + "%"
		q = q.Where("s.first_name LIKE ? OR s.last_name LIKE ?", like, like)
	}
	if err := q.Scan(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]ReminderLogItem, 0, len(rows))
	for _, r := range rows {
		out = append(out, ReminderLogItem{
			ID:          r.ID,
			StudentID:   r.StudentID,
			Student:     strings.TrimSpace(r.FirstName + " " + r.LastName),
			Type:        models.ReminderType(r.Type),
			DaysOffset:  r.DaysOffset,
			AmountCents: r.AmountCents,
			LastSent:    r.LastSent,
			Status:      models.ReminderStatus(r.Status),
			Channel:     models.ReminderChannel(r.Channel),
		})
	}
	return out, nil
}

func sameDay(a, b time.Time) bool {
	return a.Year() == b.Year() && a.Month() == b.Month() && a.Day() == b.Day()
}

func (s *ReminderService) RunNow(ctx context.Context) (int, error) {
	if err := s.EnsureDefaultRules(ctx); err != nil {
		return 0, err
	}
	var rules []models.ReminderRule
	if err := s.db.WithContext(ctx).Where("enabled = ?", true).Find(&rules).Error; err != nil {
		return 0, err
	}
	var payments []models.Payment
	if err := s.db.WithContext(ctx).
		Preload("Student").
		Where("status IN ?", []models.PaymentStatus{models.PaymentStatusPending, models.PaymentStatusOverdue}).
		Where("due_date IS NOT NULL").
		Find(&payments).Error; err != nil {
		return 0, err
	}
	now := time.Now()
	sent := 0
	for i := range payments {
		p := &payments[i]
		if p.DueDate == nil {
			continue
		}
		due := *p.DueDate
		for j := range rules {
			r := &rules[j]
			trigger := false
			switch r.Type {
			case models.ReminderTypeBeforeDue:
				trigger = sameDay(now, due.AddDate(0, 0, -r.DaysOffset))
			case models.ReminderTypeDueDay:
				trigger = sameDay(now, due)
			case models.ReminderTypeOverdue:
				trigger = now.After(due.AddDate(0, 0, r.DaysOffset))
			}
			if !trigger {
				continue
			}
			var existing models.PaymentReminder
			err := s.db.WithContext(ctx).
				Where("payment_id = ? AND rule_id = ? AND DATE(created_at) = CURDATE()", p.ID, r.ID).
				First(&existing).Error
			if err == nil {
				continue
			}
			if err != gorm.ErrRecordNotFound {
				return sent, err
			}
			pr := models.PaymentReminder{
				StudentID:   p.StudentID,
				PaymentID:   &p.ID,
				RuleID:      &r.ID,
				AmountCents: p.AmountCents,
				Status:      models.ReminderStatusSent,
				Channel:     r.Channel,
				SentAt:      &now,
			}
			if err := s.db.WithContext(ctx).Create(&pr).Error; err != nil {
				return sent, err
			}
			sent++
		}
	}
	return sent, nil
}

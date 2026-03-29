package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

// hardRule defines a fixed reminder rule. No database table is involved.
type hardRule struct {
	Type       models.ReminderType
	DaysOffset int
	BodyID     int
	Label      string
}

// HardCodedRules are the three fixed SMS reminder rules.
// These are never stored in – or read from – the database.
var HardCodedRules = []hardRule{
	{Type: models.ReminderTypeBeforeDue, DaysOffset: 3, BodyID: PatternBefore3Days, Label: "۳ روز قبل از سررسید"},
	{Type: models.ReminderTypeBeforeDue, DaysOffset: 1, BodyID: PatternBefore1Day, Label: "۱ روز قبل از سررسید"},
	{Type: models.ReminderTypeOverdue, DaysOffset: 2, BodyID: PatternOverdue2Days, Label: "۲ روز بعد از سررسید"},
}

// HardRuleDTO is the JSON shape returned by ListRules.
type HardRuleDTO struct {
	Type       string `json:"type"`
	DaysOffset int    `json:"days_offset"`
	BodyID     int    `json:"body_id"`
	Label      string `json:"label"`
}

type ReminderService struct {
	db  *gorm.DB
	sms *MelipayamakService
}

func NewReminderService(db *gorm.DB, sms *MelipayamakService) *ReminderService {
	return &ReminderService{db: db, sms: sms}
}

// ListRules returns the hard-coded rules (no DB hit needed).
func (s *ReminderService) ListRules() []HardRuleDTO {
	out := make([]HardRuleDTO, 0, len(HardCodedRules))
	for _, r := range HardCodedRules {
		out = append(out, HardRuleDTO{
			Type:       string(r.Type),
			DaysOffset: r.DaysOffset,
			BodyID:     r.BodyID,
			Label:      r.Label,
		})
	}
	return out
}

type ReminderLogItem struct {
	ID          uint                  `json:"id"`
	StudentID   uint                  `json:"student_id"`
	Student     string                `json:"student"`
	Type        models.ReminderType   `json:"type"`
	DaysOffset  int                   `json:"days_offset"`
	AmountCents int64                 `json:"amount_cents"`
	LastSent    *time.Time            `json:"last_sent"`
	Status      models.ReminderStatus `json:"status"`
}

func (s *ReminderService) ListLogs(ctx context.Context, search string, limit int) ([]ReminderLogItem, error) {
	type row struct {
		ID          uint
		StudentID   uint
		FirstName   string
		LastName    string
		DaysOffset  int
		RuleType    string
		AmountCents int64
		LastSent    *time.Time
		Status      string
	}
	var rows []row
	q := s.db.WithContext(ctx).Table("payment_reminders pr").
		Joins("LEFT JOIN students s ON s.id = pr.student_id").
		Select("pr.id, pr.student_id, s.first_name, s.last_name, pr.amount_cents, pr.sent_at as last_sent, pr.status, pr.days_offset as days_offset, pr.rule_type as rule_type").
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
			Type:        models.ReminderType(r.RuleType),
			DaysOffset:  r.DaysOffset,
			AmountCents: r.AmountCents,
			LastSent:    r.LastSent,
			Status:      models.ReminderStatus(r.Status),
		})
	}
	return out, nil
}

func sameDay(a, b time.Time) bool {
	return a.Year() == b.Year() && a.Month() == b.Month() && a.Day() == b.Day()
}

func (s *ReminderService) RunNow(ctx context.Context) (int, error) {
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
		for _, r := range HardCodedRules {
			trigger := false
			switch r.Type {
			case models.ReminderTypeBeforeDue:
				trigger = sameDay(now, due.AddDate(0, 0, -r.DaysOffset))
			case models.ReminderTypeOverdue:
				trigger = now.After(due.AddDate(0, 0, r.DaysOffset))
			}
			if !trigger {
				continue
			}

			// Deduplicate: skip if this payment+rule combo was already sent today.
			dedupeKey := fmt.Sprintf("%d_%s_%d", p.ID, string(r.Type), r.DaysOffset)
			var existing models.PaymentReminder
			err := s.db.WithContext(ctx).
				Where("payment_id = ? AND rule_type = ? AND days_offset = ? AND DATE(created_at) = CURDATE()",
					p.ID, string(r.Type), r.DaysOffset).
				First(&existing).Error
			if err == nil {
				continue // already sent today
			}
			if err != gorm.ErrRecordNotFound {
				return sent, fmt.Errorf("reminder dedup check (%s): %w", dedupeKey, err)
			}

			// Send SMS.
			if s.sms != nil {
				s.sms.SendPatternToAll(&p.Student, r.BodyID, nil)
			}

			pr := models.PaymentReminder{
				StudentID:   p.StudentID,
				PaymentID:   &p.ID,
				AmountCents: p.AmountCents,
				Status:      models.ReminderStatusSent,
				Channel:     models.ReminderChannelSMS,
				SentAt:      &now,
				RuleType:    string(r.Type),
				DaysOffset:  r.DaysOffset,
			}
			if err := s.db.WithContext(ctx).Create(&pr).Error; err != nil {
				return sent, err
			}
			sent++
		}
	}
	return sent, nil
}

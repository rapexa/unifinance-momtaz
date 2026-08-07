package services

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

const (
	defaultPaydayDay           = 25
	payrollReminderWindowDays  = 3 // days before payday (inclusive of payday)
	payrollReminderRuleType    = "PAYROLL_PENDING"
)

// hardRule defines a fixed reminder rule. No database table is involved.
type hardRule struct {
	Type       models.ReminderType
	DaysOffset int
	BodyID     int
	Label      string
}

// HardCodedRules are the fixed student SMS reminder rules.
var HardCodedRules = []hardRule{
	{Type: models.ReminderTypeBeforeDue, DaysOffset: 7, BodyID: PatternBefore7Days, Label: "۷ روز قبل از سررسید"},
	{Type: models.ReminderTypeBeforeDue, DaysOffset: 3, BodyID: PatternBefore3Days, Label: "۳ روز قبل از سررسید"},
	{Type: models.ReminderTypeBeforeDue, DaysOffset: 1, BodyID: PatternBefore1Day, Label: "۱ روز قبل از سررسید"},
	{Type: models.ReminderTypeOverdue, DaysOffset: 2, BodyID: PatternOverdue2Days, Label: "۲ روز بعد از سررسید (یک‌بار)"},
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

// ListRules returns the hard-coded student rules (no DB hit needed).
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

// PayrollDueItem is a PENDING payslip near org payday (for Reminders UI).
type PayrollDueItem struct {
	EntryID          uint       `json:"entry_id"`
	UserID           uint       `json:"user_id"`
	UserName         string     `json:"user_name"`
	UserPhone        string     `json:"user_phone,omitempty"`
	PeriodYear       int        `json:"period_year"`
	PeriodMonth      int        `json:"period_month"`
	TotalSalaryCents int64      `json:"total_salary_cents"`
	Status           string     `json:"status"`
	PaydayDay        int        `json:"payday_day"`
	DaysUntilPayday  int        `json:"days_until_payday"`
	NearPayday       bool       `json:"near_payday"`
	ReminderSentAt   *time.Time `json:"reminder_sent_at,omitempty"`
}

type PayrollReminderLogItem struct {
	ID               uint                  `json:"id"`
	UserID           uint                  `json:"user_id"`
	UserName         string                `json:"user_name"`
	PeriodYear       int                   `json:"period_year"`
	PeriodMonth      int                   `json:"period_month"`
	TotalSalaryCents int64                 `json:"total_salary_cents"`
	DaysBeforePayday int                   `json:"days_before_payday"`
	Status           models.ReminderStatus `json:"status"`
	Channel          models.ReminderChannel `json:"channel"`
	SentAt           *time.Time            `json:"sent_at"`
}

func sameDay(a, b time.Time) bool {
	ay, am, ad := a.Date()
	by, bm, bd := b.Date()
	return ay == by && am == bm && ad == bd
}

func clampPaydayDay(day int) int {
	if day < 1 {
		return defaultPaydayDay
	}
	if day > 28 {
		return 28
	}
	return day
}

func (s *ReminderService) orgPaydayDay(ctx context.Context) int {
	var org models.Organization
	if err := s.db.WithContext(ctx).Select("payday_day").First(&org).Error; err != nil {
		return defaultPaydayDay
	}
	return clampPaydayDay(org.PaydayDay)
}

// SetPaydayDay updates the organization payday day-of-month (1–28).
func (s *ReminderService) SetPaydayDay(ctx context.Context, day int) (int, error) {
	day = clampPaydayDay(day)
	var org models.Organization
	if err := s.db.WithContext(ctx).First(&org).Error; err != nil {
		return 0, err
	}
	org.PaydayDay = day
	if err := s.db.WithContext(ctx).Save(&org).Error; err != nil {
		return 0, err
	}
	return day, nil
}

// daysUntilPaydayInMonth returns how many days from `now` until payday this month.
// Negative means payday already passed this month.
func daysUntilPaydayInMonth(now time.Time, paydayDay int) int {
	paydayDay = clampPaydayDay(paydayDay)
	y, m, d := now.Date()
	payday := time.Date(y, m, paydayDay, 0, 0, 0, 0, now.Location())
	today := time.Date(y, m, d, 0, 0, 0, 0, now.Location())
	return int(payday.Sub(today).Hours() / 24)
}

func nearPaydayWindow(daysUntil int) bool {
	return daysUntil >= 0 && daysUntil <= payrollReminderWindowDays
}

// RunNow sends student payment reminders only (employee payroll reminders are not included).
func (s *ReminderService) RunNow(ctx context.Context) (int, error) {
	return s.runStudentReminders(ctx)
}

func (s *ReminderService) runStudentReminders(ctx context.Context) (int, error) {
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
		if p.StudentID == nil || p.Student == nil {
			continue
		}
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
				// Exactly on the calendar day that is offset days after due (once).
				trigger = sameDay(now, due.AddDate(0, 0, r.DaysOffset))
			}
			if !trigger {
				continue
			}

			var existing models.PaymentReminder
			q := s.db.WithContext(ctx).
				Where("payment_id = ? AND rule_type = ? AND days_offset = ?",
					p.ID, string(r.Type), r.DaysOffset)
			if r.Type == models.ReminderTypeBeforeDue {
				// Before-due: allow only once ever for that exact day match (same combo).
				err := q.First(&existing).Error
				if err == nil {
					continue
				}
				if err != gorm.ErrRecordNotFound {
					return sent, fmt.Errorf("بررسی تکراری بودن یادآوری: %w", err)
				}
			} else {
				// Overdue: once ever for this payment+rule (no daily re-send).
				err := q.First(&existing).Error
				if err == nil {
					continue
				}
				if err != gorm.ErrRecordNotFound {
					return sent, fmt.Errorf("بررسی تکراری بودن یادآوری معوق: %w", err)
				}
			}

			if s.sms != nil && r.BodyID > 0 {
				s.sms.SendPatternToAll(p.Student, r.BodyID, nil)
			}

			pr := models.PaymentReminder{
				StudentID:   *p.StudentID,
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

func (s *ReminderService) runPayrollReminders(ctx context.Context) (int, error) {
	now := time.Now()
	payday := s.orgPaydayDay(ctx)
	daysUntil := daysUntilPaydayInMonth(now, payday)
	if !nearPaydayWindow(daysUntil) {
		return 0, nil
	}
	year, month := DefaultPeriod(now)

	var entries []models.PayrollEntry
	if err := s.db.WithContext(ctx).
		Preload("User").
		Where("status = ? AND period_year = ? AND period_month = ?",
			models.PayrollStatusPending, year, month).
		Find(&entries).Error; err != nil {
		return 0, err
	}

	sent := 0
	for i := range entries {
		e := &entries[i]
		var existing models.PayrollReminder
		err := s.db.WithContext(ctx).
			Where("payroll_entry_id = ? AND rule_type = ?", e.ID, payrollReminderRuleType).
			First(&existing).Error
		if err == nil {
			continue
		}
		if err != gorm.ErrRecordNotFound {
			return sent, fmt.Errorf("بررسی تکراری بودن یادآوری حقوق: %w", err)
		}

		channel := models.ReminderChannelSMS
		if s.sms != nil && PatternPayrollPending > 0 && e.User.Phone != "" {
			if err := s.sms.SendPattern(strings.TrimSpace(e.User.Phone), PatternPayrollPending, nil); err != nil {
				log.Printf("payroll reminder SMS user=%d: %v", e.UserID, err)
			}
		} else {
			channel = models.ReminderChannelSMS // still SMS channel label; body may be skipped
		}

		row := models.PayrollReminder{
			UserID:           e.UserID,
			PayrollEntryID:   e.ID,
			PeriodYear:       e.PeriodYear,
			PeriodMonth:      e.PeriodMonth,
			RuleType:         payrollReminderRuleType,
			DaysBeforePayday: daysUntil,
			TotalSalaryCents: e.TotalSalaryCents,
			Status:           models.ReminderStatusSent,
			Channel:          channel,
			SentAt:           &now,
		}
		if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
			return sent, err
		}
		sent++
	}
	return sent, nil
}

// ListPayrollDue returns PENDING payslips for the current period with payday proximity.
func (s *ReminderService) ListPayrollDue(ctx context.Context) ([]PayrollDueItem, int, error) {
	now := time.Now()
	payday := s.orgPaydayDay(ctx)
	daysUntil := daysUntilPaydayInMonth(now, payday)
	year, month := DefaultPeriod(now)

	var entries []models.PayrollEntry
	if err := s.db.WithContext(ctx).
		Preload("User").
		Where("status = ? AND period_year = ? AND period_month = ?",
			models.PayrollStatusPending, year, month).
		Order("total_salary_cents DESC").
		Find(&entries).Error; err != nil {
		return nil, payday, err
	}

	near := nearPaydayWindow(daysUntil)
	out := make([]PayrollDueItem, 0, len(entries))
	for _, e := range entries {
		name := strings.TrimSpace(e.User.FirstName + " " + e.User.LastName)
		item := PayrollDueItem{
			EntryID:          e.ID,
			UserID:           e.UserID,
			UserName:         name,
			UserPhone:        e.User.Phone,
			PeriodYear:       e.PeriodYear,
			PeriodMonth:      e.PeriodMonth,
			TotalSalaryCents: e.TotalSalaryCents,
			Status:           string(e.Status),
			PaydayDay:        payday,
			DaysUntilPayday:  daysUntil,
			NearPayday:       near,
		}
		var pr models.PayrollReminder
		if err := s.db.WithContext(ctx).
			Where("payroll_entry_id = ? AND rule_type = ?", e.ID, payrollReminderRuleType).
			Order("id DESC").
			First(&pr).Error; err == nil {
			item.ReminderSentAt = pr.SentAt
		}
		out = append(out, item)
	}
	return out, payday, nil
}

func (s *ReminderService) ListPayrollReminderLogs(ctx context.Context, limit int) ([]PayrollReminderLogItem, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	type row struct {
		ID               uint
		UserID           uint
		FirstName        string
		LastName         string
		PeriodYear       int
		PeriodMonth      int
		TotalSalaryCents int64
		DaysBeforePayday int
		Status           string
		Channel          string
		SentAt           *time.Time
	}
	var rows []row
	err := s.db.WithContext(ctx).Table("payroll_reminders pr").
		Joins("LEFT JOIN users u ON u.id = pr.user_id").
		Select("pr.id, pr.user_id, u.first_name, u.last_name, pr.period_year, pr.period_month, pr.total_salary_cents, pr.days_before_payday, pr.status, pr.channel, pr.sent_at").
		Order("pr.created_at DESC").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]PayrollReminderLogItem, 0, len(rows))
	for _, r := range rows {
		out = append(out, PayrollReminderLogItem{
			ID:               r.ID,
			UserID:           r.UserID,
			UserName:         strings.TrimSpace(r.FirstName + " " + r.LastName),
			PeriodYear:       r.PeriodYear,
			PeriodMonth:      r.PeriodMonth,
			TotalSalaryCents: r.TotalSalaryCents,
			DaysBeforePayday: r.DaysBeforePayday,
			Status:           models.ReminderStatus(r.Status),
			Channel:          models.ReminderChannel(r.Channel),
			SentAt:           r.SentAt,
		})
	}
	return out, nil
}

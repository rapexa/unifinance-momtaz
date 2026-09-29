package services

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/access"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/pkg/jalali"
	"gorm.io/gorm"
)

// Student payment reminders (یادآوری‌ها)
//
// Debtors come from each active student's schedule: explicit open invoices (PENDING/OVERDUE
// payments with a due date) when the student has any, otherwise the billing schedule derived
// from the registration date (monthly fee / annual installments) with PAID payments applied
// oldest-first. Messages come from editable templates; with a sender line configured they are
// sent as free text, otherwise the fixed panel patterns are used.

var (
	ErrTemplateNotFound  = errors.New("message template not found")
	ErrTemplateEmptyBody = errors.New("message text is empty")
)

// Template keys.
const (
	TemplateBeforeDue7 = "BEFORE_DUE_7"
	TemplateBeforeDue3 = "BEFORE_DUE_3"
	TemplateBeforeDue1 = "BEFORE_DUE_1"
	TemplateOverdue2   = "OVERDUE_2"
	TemplateOverdue30  = "OVERDUE_30"
	TemplateManual     = "MANUAL"
)

// DefaultMessageTemplates are created on first use and can then be edited from the UI.
var DefaultMessageTemplates = []models.MessageTemplate{
	{Key: TemplateBeforeDue7, Title: "۷ روز قبل از سررسید", Kind: models.ReminderTypeBeforeDue, DaysOffset: 7, SortOrder: 1,
		Body: "{نام} عزیز، شهریه/قسط شما به مبلغ {مبلغ} تومان در تاریخ {تاریخ} سررسید می‌شود.\n{مرکز}"},
	{Key: TemplateBeforeDue3, Title: "۳ روز قبل از سررسید", Kind: models.ReminderTypeBeforeDue, DaysOffset: 3, SortOrder: 2,
		Body: "{نام} عزیز، {روز} روز تا سررسید شهریه/قسط شما ({مبلغ} تومان — {تاریخ}) باقی مانده است.\n{مرکز}"},
	{Key: TemplateBeforeDue1, Title: "۱ روز قبل از سررسید", Kind: models.ReminderTypeBeforeDue, DaysOffset: 1, SortOrder: 3,
		Body: "{نام} عزیز، فردا ({تاریخ}) سررسید پرداخت {مبلغ} تومان است.\n{مرکز}"},
	{Key: TemplateOverdue2, Title: "۲ روز بعد از سررسید", Kind: models.ReminderTypeOverdue, DaysOffset: 2, SortOrder: 4,
		Body: "{نام} عزیز، مبلغ {مبلغ} تومان از تاریخ {تاریخ} پرداخت نشده است. لطفاً در اولین فرصت پرداخت کنید.\n{مرکز}"},
	{Key: TemplateOverdue30, Title: "۳۰ روز بعد از سررسید", Kind: models.ReminderTypeOverdue, DaysOffset: 30, SortOrder: 5,
		Body: "{نام} عزیز، {روز} روز از سررسید پرداخت شما گذشته و مبلغ {مبلغ} تومان بدهی معوق دارید. لطفاً با مرکز تماس بگیرید.\n{مرکز}"},
	{Key: TemplateManual, Title: "ارسال دستی به بدهکاران", Kind: models.ReminderTypeManual, SortOrder: 6,
		Body: "{نام} عزیز، مانده بدهی شما {مبلغ} تومان است. لطفاً نسبت به پرداخت اقدام کنید.\n{مرکز}"},
}

// patternForTemplate maps templates to the fixed panel patterns (used without a sender line).
func patternForTemplate(key string, overdue bool) int {
	switch key {
	case TemplateBeforeDue7:
		return PatternBefore7Days
	case TemplateBeforeDue3:
		return PatternBefore3Days
	case TemplateBeforeDue1:
		return PatternBefore1Day
	case TemplateOverdue2, TemplateOverdue30:
		return PatternOverdue2Days
	default:
		if overdue {
			return PatternOverdue2Days
		}
		return PatternBefore1Day
	}
}

// EnsureTemplates inserts any missing default template.
func (s *ReminderService) EnsureTemplates(ctx context.Context) error {
	for _, t := range DefaultMessageTemplates {
		var n int64
		if err := s.db.WithContext(ctx).Unscoped().Model(&models.MessageTemplate{}).Where("`key` = ?", t.Key).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			continue
		}
		row := t
		row.Enabled = true
		if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
			return err
		}
	}
	return nil
}

// ListTemplates returns all templates (defaults are created on first call).
func (s *ReminderService) ListTemplates(ctx context.Context) ([]models.MessageTemplate, error) {
	if err := s.EnsureTemplates(ctx); err != nil {
		return nil, err
	}
	var rows []models.MessageTemplate
	err := s.db.WithContext(ctx).Order("sort_order ASC, id ASC").Find(&rows).Error
	return rows, err
}

func (s *ReminderService) template(ctx context.Context, key string) (*models.MessageTemplate, error) {
	if err := s.EnsureTemplates(ctx); err != nil {
		return nil, err
	}
	var t models.MessageTemplate
	if err := s.db.WithContext(ctx).Where("`key` = ?", key).First(&t).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTemplateNotFound
		}
		return nil, err
	}
	return &t, nil
}

// UpdateTemplate edits a template's text and on/off state.
func (s *ReminderService) UpdateTemplate(ctx context.Context, key, body string, enabled *bool) (*models.MessageTemplate, error) {
	t, err := s.template(ctx, key)
	if err != nil {
		return nil, err
	}
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, ErrTemplateEmptyBody
	}
	updates := map[string]interface{}{"body": body}
	if enabled != nil {
		updates["enabled"] = *enabled
	}
	if err := s.db.WithContext(ctx).Model(t).Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.template(ctx, key)
}

// CanSendText reports whether editable free-text SMS is available.
func (s *ReminderService) CanSendText() bool {
	return s.sms != nil && s.sms.CanSendText()
}

// SMSConfigured reports whether the SMS panel credentials are set.
func (s *ReminderService) SMSConfigured() bool {
	return s.sms != nil && s.sms.IsConfigured()
}

// MessageVars are the values substituted into a template.
type MessageVars struct {
	Name        string
	AmountCents int64
	DueDate     *time.Time
	Days        int
	Org         string
}

func faDigits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune('۰' + (r - '0'))
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func formatTomansFa(cents int64) string {
	t := cents / 10
	if t < 0 {
		t = -t
	}
	s := strconv.FormatInt(t, 10)
	var b strings.Builder
	for i, r := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteRune('٬')
		}
		b.WriteRune(r)
	}
	return faDigits(b.String())
}

// RenderTemplate fills {نام} {مبلغ} {تاریخ} {روز} {مرکز}.
func RenderTemplate(body string, v MessageVars) string {
	date := ""
	if v.DueDate != nil {
		date = faDigits(jalali.FormatDate(*v.DueDate))
	}
	r := strings.NewReplacer(
		"{نام}", v.Name,
		"{مبلغ}", formatTomansFa(v.AmountCents),
		"{تاریخ}", date,
		"{روز}", faDigits(strconv.Itoa(v.Days)),
		"{مرکز}", v.Org,
	)
	return strings.TrimSpace(r.Replace(body))
}

func (s *ReminderService) orgName(ctx context.Context) string {
	var org models.Organization
	if err := s.db.WithContext(ctx).Select("name").First(&org).Error; err != nil {
		return ""
	}
	return org.Name
}

// DebtorItem is one unpaid (or partly paid) installment/invoice.
type DebtorItem struct {
	DueDate     time.Time
	AmountCents int64 // remaining
	PaymentID   *uint // set for explicit invoices
}

// DebtorRow is one student with overdue and/or upcoming amounts.
type DebtorRow struct {
	StudentID          uint
	Name               string
	Phone              string
	FatherPhone        string
	MotherPhone        string
	AdvisorName        string
	Source             string // SCHEDULE | INVOICE
	OverdueCents       int64
	OldestDueDate      *time.Time
	DaysOverdue        int
	NextDueDate        *time.Time
	NextDueCents       int64
	NextPaymentID      *uint
	DaysUntilDue       int
	TotalRemaining     int64
	Aging              [3]int64 // overdue 1–30, 31–60, 60+ days
	LastReminderAt     *time.Time
	LastReminder       string
	LastReminderStatus string
}

func dayStart(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}

func daysBetween(a, b time.Time) int {
	return int(dayStart(b).Sub(dayStart(a)).Hours() / 24)
}

// Debtors lists active students that are overdue or have an installment due within horizonDays.
func (s *ReminderService) Debtors(ctx context.Context, now time.Time, horizonDays int) ([]DebtorRow, error) {
	return s.DebtorsScoped(ctx, now, horizonDays, nil)
}

// DebtorsScoped is Debtors limited to the students visible to scopeUser (nil = all).
func (s *ReminderService) DebtorsScoped(ctx context.Context, now time.Time, horizonDays int, scopeUser *uint) ([]DebtorRow, error) {
	if horizonDays < 0 {
		horizonDays = 0
	}
	today := dayStart(now)
	horizon := today.AddDate(0, 0, horizonDays+1)

	var students []models.Student
	sq := s.db.WithContext(ctx).
		Preload("Advisor").
		Preload("Enrollments", "status = ?", models.EnrollmentStatusActive).
		Where("students.status = ?", models.StudentStatusActive)
	if scopeUser != nil {
		sq = access.ScopeStudentRows(sq, *scopeUser)
	}
	if err := sq.Find(&students).Error; err != nil {
		return nil, err
	}
	if len(students) == 0 {
		return []DebtorRow{}, nil
	}
	ids := make([]uint, len(students))
	for i := range students {
		ids[i] = students[i].ID
	}

	type paidRow struct {
		StudentID uint
		PaidSum   int64
		OpenSum   int64
	}
	var sums []paidRow
	if err := s.db.WithContext(ctx).Model(&models.Payment{}).
		Select(`student_id,
			COALESCE(SUM(CASE WHEN status = ? THEN amount_cents ELSE 0 END), 0) AS paid_sum,
			COALESCE(SUM(CASE WHEN status IN (?, ?) THEN amount_cents ELSE 0 END), 0) AS open_sum`,
			models.PaymentStatusPaid, models.PaymentStatusPending, models.PaymentStatusOverdue).
		Where("student_id IN ?", ids).Group("student_id").Scan(&sums).Error; err != nil {
		return nil, err
	}
	paid := map[uint]int64{}
	open := map[uint]int64{}
	for _, r := range sums {
		paid[r.StudentID] = r.PaidSum
		open[r.StudentID] = r.OpenSum
	}

	var invoices []models.Payment
	if err := s.db.WithContext(ctx).
		Where("student_id IN ? AND status IN ? AND due_date IS NOT NULL", ids,
			[]models.PaymentStatus{models.PaymentStatusPending, models.PaymentStatusOverdue}).
		Order("due_date ASC, id ASC").Find(&invoices).Error; err != nil {
		return nil, err
	}
	invByStudent := map[uint][]models.Payment{}
	for _, p := range invoices {
		if p.StudentID != nil {
			invByStudent[*p.StudentID] = append(invByStudent[*p.StudentID], p)
		}
	}

	type lastRow struct {
		StudentID   uint
		SentAt      *time.Time
		TemplateKey string
		Status      string
	}
	var lasts []lastRow
	if err := s.db.WithContext(ctx).Raw(`
SELECT pr.student_id, pr.sent_at, pr.template_key, pr.status FROM payment_reminders pr
INNER JOIN (SELECT student_id, MAX(id) AS id FROM payment_reminders WHERE deleted_at IS NULL AND student_id IN ? GROUP BY student_id) t
  ON t.id = pr.id`, ids).Scan(&lasts).Error; err != nil {
		return nil, err
	}
	lastBy := map[uint]lastRow{}
	for _, l := range lasts {
		lastBy[l.StudentID] = l
	}

	out := make([]DebtorRow, 0)
	for i := range students {
		st := &students[i]
		var items []DebtorItem
		source := "SCHEDULE"
		if inv := invByStudent[st.ID]; len(inv) > 0 {
			source = "INVOICE"
			for _, p := range inv {
				if !p.DueDate.Before(horizon) {
					continue
				}
				id := p.ID
				items = append(items, DebtorItem{DueDate: dayStart(p.DueDate.In(now.Location())), AmountCents: p.AmountCents, PaymentID: &id})
			}
		} else if enroll := EffectiveEnrollmentCents(st); enroll > 0 {
			remainingPaid := paid[st.ID]
			for _, inst := range st.Installments(enroll, horizon) {
				amt := inst.AmountCents
				if remainingPaid >= amt {
					remainingPaid -= amt
					continue
				}
				amt -= remainingPaid
				remainingPaid = 0
				items = append(items, DebtorItem{DueDate: inst.DueDate, AmountCents: amt})
			}
		}
		if len(items) == 0 {
			continue
		}

		row := DebtorRow{
			StudentID:   st.ID,
			Name:        strings.TrimSpace(st.FirstName + " " + st.LastName),
			Phone:       st.Phone,
			FatherPhone: st.FatherPhone,
			MotherPhone: st.MotherPhone,
			Source:      source,
		}
		if st.Advisor != nil {
			row.AdvisorName = strings.TrimSpace(st.Advisor.FirstName + " " + st.Advisor.LastName)
		}
		for _, it := range items {
			if it.DueDate.Before(today) {
				row.OverdueCents += it.AmountCents
				if row.OldestDueDate == nil {
					d := it.DueDate
					row.OldestDueDate = &d
				}
				age := daysBetween(it.DueDate, today)
				switch {
				case age <= 30:
					row.Aging[0] += it.AmountCents
				case age <= 60:
					row.Aging[1] += it.AmountCents
				default:
					row.Aging[2] += it.AmountCents
				}
			} else if row.NextDueDate == nil {
				d := it.DueDate
				row.NextDueDate = &d
				row.NextDueCents = it.AmountCents
				row.NextPaymentID = it.PaymentID
				row.DaysUntilDue = daysBetween(today, it.DueDate)
			}
		}
		if row.OldestDueDate != nil {
			row.DaysOverdue = daysBetween(*row.OldestDueDate, today)
		}
		row.TotalRemaining = StudentBalanceAt(st, paid[st.ID], open[st.ID], now).TotalRemainingCents
		if l, ok := lastBy[st.ID]; ok {
			row.LastReminderAt = l.SentAt
			row.LastReminder = l.TemplateKey
			row.LastReminderStatus = l.Status
		}
		out = append(out, row)
	}
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if (a.OverdueCents > 0) != (b.OverdueCents > 0) {
			return a.OverdueCents > 0
		}
		if a.OverdueCents > 0 {
			return a.DaysOverdue > b.DaysOverdue
		}
		return a.DaysUntilDue < b.DaysUntilDue
	})
	return out, nil
}

// SendResult summarizes one student's SMS.
type SendResult struct {
	StudentID  uint
	Name       string
	Message    string
	Recipients []string
	Status     models.ReminderStatus
	Error      string
}

func studentPhones(r DebtorRow) []string {
	seen := map[string]bool{}
	var out []string
	for _, p := range []string{r.Phone, r.FatherPhone, r.MotherPhone} {
		p = strings.TrimSpace(p)
		if p != "" && !seen[p] {
			seen[p] = true
			out = append(out, p)
		}
	}
	return out
}

// sendToDebtor sends one message (free text when possible, else the panel pattern) and logs it.
func (s *ReminderService) sendToDebtor(ctx context.Context, r DebtorRow, tpl *models.MessageTemplate, text string, dueDate *time.Time, amount int64, paymentID *uint) SendResult {
	res := SendResult{StudentID: r.StudentID, Name: r.Name, Recipients: studentPhones(r), Status: models.ReminderStatusSent}
	var sendErr error
	switch {
	case !s.SMSConfigured():
		sendErr = errors.New("پنل پیامک تنظیم نشده است")
	case len(res.Recipients) == 0:
		sendErr = errors.New("شماره موبایلی برای دانش‌آموز یا والدین ثبت نشده است")
	case s.CanSendText():
		res.Message = text
		for _, ph := range res.Recipients {
			if err := s.sms.SendText(ph, text); err != nil {
				sendErr = err
			}
		}
	default:
		bodyID := patternForTemplate(tpl.Key, r.OverdueCents > 0)
		if bodyID <= 0 {
			sendErr = errors.New("الگوی پیامک این یادآوری در پنل ثبت نشده و شماره خط ارسال متن آزاد تنظیم نشده است")
		} else {
			for _, ph := range res.Recipients {
				if err := s.sms.SendPattern(ph, bodyID, nil); err != nil {
					sendErr = err
				}
			}
		}
	}
	if sendErr != nil {
		res.Status = models.ReminderStatusFailed
		res.Error = sendErr.Error()
	}
	now := time.Now()
	logRow := models.PaymentReminder{
		StudentID:   r.StudentID,
		PaymentID:   paymentID,
		RuleType:    string(tpl.Kind),
		DaysOffset:  tpl.DaysOffset,
		AmountCents: amount,
		Status:      res.Status,
		Channel:     models.ReminderChannelSMS,
		SentAt:      &now,
		DueDate:     dueDate,
		TemplateKey: tpl.Key,
		Message:     res.Message,
		Recipients:  strings.Join(res.Recipients, ","),
		Error:       res.Error,
	}
	if err := s.db.WithContext(ctx).Create(&logRow).Error; err != nil {
		log.Printf("reminders: log for student %d failed: %v", r.StudentID, err)
	}
	return res
}

// SendManual sends a message to the given debtors. text overrides the MANUAL template body
// (placeholders are filled per student).
func (s *ReminderService) SendManual(ctx context.Context, studentIDs []uint, text string, horizonDays int, scopeUser *uint) ([]SendResult, error) {
	tpl, err := s.template(ctx, TemplateManual)
	if err != nil {
		return nil, err
	}
	body := strings.TrimSpace(text)
	if body == "" {
		body = tpl.Body
	}
	rows, err := s.DebtorsScoped(ctx, time.Now(), horizonDays, scopeUser)
	if err != nil {
		return nil, err
	}
	want := make(map[uint]bool, len(studentIDs))
	for _, id := range studentIDs {
		want[id] = true
	}
	org := s.orgName(ctx)
	var out []SendResult
	for _, r := range rows {
		if !want[r.StudentID] {
			continue
		}
		amount, due, days := r.OverdueCents, r.OldestDueDate, r.DaysOverdue
		if amount == 0 {
			amount, due, days = r.NextDueCents, r.NextDueDate, r.DaysUntilDue
		}
		msg := RenderTemplate(body, MessageVars{Name: r.Name, AmountCents: amount, DueDate: due, Days: days, Org: org})
		out = append(out, s.sendToDebtor(ctx, r, tpl, msg, due, amount, r.NextPaymentID))
		delete(want, r.StudentID)
	}
	for id := range want {
		out = append(out, SendResult{StudentID: id, Status: models.ReminderStatusFailed, Error: "این دانش‌آموز بدهی یا سررسید نزدیکی ندارد"})
	}
	return out, nil
}

// PreviewMessage renders a template (or custom text) for one debtor.
func (s *ReminderService) PreviewMessage(ctx context.Context, studentID uint, key, text string, scopeUser *uint) (string, error) {
	rows, err := s.DebtorsScoped(ctx, time.Now(), 30, scopeUser)
	if err != nil {
		return "", err
	}
	body := strings.TrimSpace(text)
	if body == "" {
		tpl, err := s.template(ctx, key)
		if err != nil {
			return "", err
		}
		body = tpl.Body
	}
	for _, r := range rows {
		if r.StudentID != studentID {
			continue
		}
		amount, due, days := r.OverdueCents, r.OldestDueDate, r.DaysOverdue
		if amount == 0 {
			amount, due, days = r.NextDueCents, r.NextDueDate, r.DaysUntilDue
		}
		return RenderTemplate(body, MessageVars{Name: r.Name, AmountCents: amount, DueDate: due, Days: days, Org: s.orgName(ctx)}), nil
	}
	return "", fmt.Errorf("student %d is not a debtor", studentID)
}

// alreadySent reports whether a template was already sent for this student and due date.
func (s *ReminderService) alreadySent(ctx context.Context, studentID uint, key string, due time.Time, paymentID *uint, tpl *models.MessageTemplate) (bool, error) {
	var n int64
	from, to := dayStart(due), dayStart(due).AddDate(0, 0, 1)
	if err := s.db.WithContext(ctx).Model(&models.PaymentReminder{}).
		Where("student_id = ? AND template_key = ? AND due_date >= ? AND due_date < ?", studentID, key, from, to).
		Count(&n).Error; err != nil {
		return false, err
	}
	if n > 0 {
		return true, nil
	}
	if paymentID != nil {
		// Reminders logged before templates existed (per payment + rule).
		if err := s.db.WithContext(ctx).Model(&models.PaymentReminder{}).
			Where("payment_id = ? AND rule_type = ? AND days_offset = ?", *paymentID, string(tpl.Kind), tpl.DaysOffset).
			Count(&n).Error; err != nil {
			return false, err
		}
	}
	return n > 0, nil
}

// RunNow sends automatic student reminders for enabled templates. A reminder fires on its day
// (or one day late if the server was down) and at most once per student, template and due date.
func (s *ReminderService) RunNow(ctx context.Context) (int, error) {
	tpls, err := s.ListTemplates(ctx)
	if err != nil {
		return 0, err
	}
	maxBefore := 0
	for _, t := range tpls {
		if t.Kind == models.ReminderTypeBeforeDue && t.DaysOffset > maxBefore {
			maxBefore = t.DaysOffset
		}
	}
	rows, err := s.Debtors(ctx, time.Now(), maxBefore)
	if err != nil {
		return 0, err
	}
	org := s.orgName(ctx)
	sent := 0
	for _, r := range rows {
		for i := range tpls {
			t := &tpls[i]
			if !t.Enabled {
				continue
			}
			var due *time.Time
			var amount int64
			var days int
			var paymentID *uint
			switch t.Kind {
			case models.ReminderTypeBeforeDue:
				if r.NextDueDate == nil || r.DaysUntilDue > t.DaysOffset || r.DaysUntilDue < t.DaysOffset-1 {
					continue
				}
				due, amount, days, paymentID = r.NextDueDate, r.NextDueCents, r.DaysUntilDue, r.NextPaymentID
			case models.ReminderTypeOverdue:
				if r.OldestDueDate == nil || r.DaysOverdue < t.DaysOffset || r.DaysOverdue > t.DaysOffset+1 {
					continue
				}
				due, amount, days = r.OldestDueDate, r.OverdueCents, r.DaysOverdue
			default:
				continue
			}
			done, err := s.alreadySent(ctx, r.StudentID, t.Key, *due, paymentID, t)
			if err != nil {
				return sent, err
			}
			if done {
				continue
			}
			msg := RenderTemplate(t.Body, MessageVars{Name: r.Name, AmountCents: amount, DueDate: due, Days: days, Org: org})
			if res := s.sendToDebtor(ctx, r, t, msg, due, amount, paymentID); res.Status == models.ReminderStatusSent {
				sent++
			}
		}
	}
	return sent, nil
}

// ReminderLogItem is one sent reminder (log tab).
type ReminderLogItem struct {
	ID          uint                  `json:"id"`
	StudentID   uint                  `json:"student_id"`
	Student     string                `json:"student"`
	Type        models.ReminderType   `json:"type"`
	DaysOffset  int                   `json:"days_offset"`
	AmountCents int64                 `json:"amount_cents"`
	LastSent    *time.Time            `json:"last_sent"`
	Status      models.ReminderStatus `json:"status"`
	TemplateKey string                `json:"template_key,omitempty"`
	Message     string                `json:"message,omitempty"`
	Recipients  string                `json:"recipients,omitempty"`
	Error       string                `json:"error,omitempty"`
	DueDate     *time.Time            `json:"due_date,omitempty"`
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
		TemplateKey string
		Message     string
		Recipients  string
		Error       string
		DueDate     *time.Time
	}
	var rows []row
	q := s.db.WithContext(ctx).Table("payment_reminders pr").
		Joins("LEFT JOIN students s ON s.id = pr.student_id").
		Where("pr.deleted_at IS NULL").
		Select(`pr.id, pr.student_id, s.first_name, s.last_name, pr.amount_cents, pr.sent_at AS last_sent,
			pr.status, pr.days_offset, pr.rule_type, pr.template_key, pr.message, pr.recipients, pr.error, pr.due_date`).
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
			TemplateKey: r.TemplateKey,
			Message:     r.Message,
			Recipients:  r.Recipients,
			Error:       r.Error,
			DueDate:     r.DueDate,
		})
	}
	return out, nil
}

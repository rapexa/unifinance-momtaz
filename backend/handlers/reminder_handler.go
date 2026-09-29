package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/middleware"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

type ReminderHandler struct {
	service *services.ReminderService
}

func NewReminderHandler(service *services.ReminderService) *ReminderHandler {
	return &ReminderHandler{service: service}
}

// MessageTemplateDTO is an editable SMS text.
type MessageTemplateDTO struct {
	Key        string `json:"key"`
	Title      string `json:"title"`
	Type       string `json:"type"`
	DaysOffset int    `json:"days_offset"`
	Body       string `json:"body"`
	Enabled    bool   `json:"enabled"`
	// Label/BodyID keep older clients of /reminders/rules working.
	Label  string `json:"label"`
	BodyID int    `json:"body_id"`
}

func (h *ReminderHandler) templates(c *gin.Context) ([]MessageTemplateDTO, bool) {
	rows, err := h.service.ListTemplates(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در بارگذاری متن پیامک‌ها"})
		return nil, false
	}
	out := make([]MessageTemplateDTO, len(rows))
	for i, t := range rows {
		out[i] = MessageTemplateDTO{
			Key: t.Key, Title: t.Title, Type: string(t.Kind), DaysOffset: t.DaysOffset,
			Body: t.Body, Enabled: t.Enabled, Label: t.Title,
		}
	}
	return out, true
}

// ListRules handles GET /reminders/rules (reminder templates; kept for older clients).
func (h *ReminderHandler) ListRules(c *gin.Context) {
	if out, ok := h.templates(c); ok {
		c.JSON(http.StatusOK, gin.H{"data": out})
	}
}

// ReplaceRules is kept for route compatibility; edit templates via PUT /reminders/templates/:key.
func (h *ReminderHandler) ReplaceRules(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

// ListTemplates handles GET /reminders/templates
func (h *ReminderHandler) ListTemplates(c *gin.Context) {
	out, ok := h.templates(c)
	if !ok {
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"data":           out,
		"custom_text":    h.service.CanSendText(),
		"sms_configured": h.service.SMSConfigured(),
		"placeholders":   []string{"{نام}", "{مبلغ}", "{تاریخ}", "{روز}", "{مرکز}"},
	})
}

type updateTemplateRequest struct {
	Body    string `json:"body" binding:"required,max=1000"`
	Enabled *bool  `json:"enabled"`
}

// UpdateTemplate handles PUT /reminders/templates/:key
func (h *ReminderHandler) UpdateTemplate(c *gin.Context) {
	if !requireAdmin(c) {
		return
	}
	var req updateTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeBindError(c, err)
		return
	}
	t, err := h.service.UpdateTemplate(c.Request.Context(), c.Param("key"), req.Body, req.Enabled)
	if err != nil {
		switch err {
		case services.ErrTemplateNotFound:
			c.JSON(http.StatusNotFound, gin.H{"error": "متن پیامک یافت نشد"})
		case services.ErrTemplateEmptyBody:
			c.JSON(http.StatusBadRequest, gin.H{"error": "متن پیامک خالی است"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در ذخیره متن پیامک"})
		}
		return
	}
	c.JSON(http.StatusOK, MessageTemplateDTO{
		Key: t.Key, Title: t.Title, Type: string(t.Kind), DaysOffset: t.DaysOffset,
		Body: t.Body, Enabled: t.Enabled, Label: t.Title,
	})
}

// DebtorDTO is one row of the debtors list.
type DebtorDTO struct {
	StudentID          uint       `json:"student_id"`
	Name               string     `json:"name"`
	Phone              string     `json:"phone,omitempty"`
	FatherPhone        string     `json:"father_phone,omitempty"`
	MotherPhone        string     `json:"mother_phone,omitempty"`
	AdvisorName        string     `json:"advisor_name,omitempty"`
	Source             string     `json:"source"`
	OverdueCents       int64      `json:"overdue_cents"`
	OldestDueDate      *time.Time `json:"oldest_due_date,omitempty"`
	DaysOverdue        int        `json:"days_overdue"`
	NextDueDate        *time.Time `json:"next_due_date,omitempty"`
	NextDueCents       int64      `json:"next_due_cents"`
	DaysUntilDue       int        `json:"days_until_due"`
	TotalRemaining     int64      `json:"total_remaining_cents"`
	Aging              [3]int64   `json:"aging_cents"`
	LastReminderAt     *time.Time `json:"last_reminder_at,omitempty"`
	LastReminder       string     `json:"last_reminder,omitempty"`
	LastReminderStatus string     `json:"last_reminder_status,omitempty"`
}

// ListDebtors handles GET /reminders/debtors?days=30
// Overdue students plus students with an installment due within `days`.
func (h *ReminderHandler) ListDebtors(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	if days < 0 || days > 365 {
		days = 30
	}
	rows, err := h.service.DebtorsScoped(c.Request.Context(), time.Now(), days, middleware.DataScopeUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در محاسبه بدهکاران"})
		return
	}
	out := make([]DebtorDTO, len(rows))
	for i, r := range rows {
		out[i] = DebtorDTO{
			StudentID: r.StudentID, Name: r.Name, Phone: r.Phone, FatherPhone: r.FatherPhone,
			MotherPhone: r.MotherPhone, AdvisorName: r.AdvisorName, Source: r.Source,
			OverdueCents: r.OverdueCents, OldestDueDate: r.OldestDueDate, DaysOverdue: r.DaysOverdue,
			NextDueDate: r.NextDueDate, NextDueCents: r.NextDueCents, DaysUntilDue: r.DaysUntilDue,
			TotalRemaining: r.TotalRemaining, Aging: r.Aging,
			LastReminderAt: r.LastReminderAt, LastReminder: r.LastReminder, LastReminderStatus: r.LastReminderStatus,
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": out, "days": days})
}

type previewRequest struct {
	StudentID   uint   `json:"student_id" binding:"required"`
	TemplateKey string `json:"template_key"`
	Text        string `json:"text"`
}

// Preview handles POST /reminders/preview — the exact text a student would receive.
func (h *ReminderHandler) Preview(c *gin.Context) {
	var req previewRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeBindError(c, err)
		return
	}
	key := req.TemplateKey
	if key == "" {
		key = services.TemplateManual
	}
	msg, err := h.service.PreviewMessage(c.Request.Context(), req.StudentID, key, req.Text, middleware.DataScopeUserID(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "پیش‌نمایش پیامک ممکن نیست"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": msg})
}

type sendRequest struct {
	StudentIDs []uint `json:"student_ids" binding:"required,min=1,max=500"`
	Text       string `json:"text" binding:"max=1000"`
}

// Send handles POST /reminders/send — manual SMS to selected debtors.
func (h *ReminderHandler) Send(c *gin.Context) {
	var req sendRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeBindError(c, err)
		return
	}
	results, err := h.service.SendManual(c.Request.Context(), req.StudentIDs, req.Text, 30, middleware.DataScopeUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در ارسال پیامک"})
		return
	}
	sent, failed := 0, 0
	out := make([]gin.H, len(results))
	for i, r := range results {
		if r.Status == "SENT" {
			sent++
		} else {
			failed++
		}
		out[i] = gin.H{"student_id": r.StudentID, "name": r.Name, "status": r.Status, "error": r.Error, "message": r.Message}
	}
	c.JSON(http.StatusOK, gin.H{"sent": sent, "failed": failed, "results": out})
}

func (h *ReminderHandler) ListLogs(c *gin.Context) {
	search := c.DefaultQuery("search", "")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := h.service.ListLogs(c.Request.Context(), search, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در بارگذاری لاگ یادآوری"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *ReminderHandler) RunNow(c *gin.Context) {
	count, err := h.service.RunNow(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در اجرای یادآوری‌ها"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sent_count": count})
}

// ListPayrollDue handles GET /reminders/payroll-due
func (h *ReminderHandler) ListPayrollDue(c *gin.Context) {
	rows, payday, err := h.service.ListPayrollDue(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در بارگذاری فیش‌های در انتظار حقوق"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"payday_day": payday,
		"data":       rows,
	})
}

// ListPayrollLogs handles GET /reminders/payroll-logs
func (h *ReminderHandler) ListPayrollLogs(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	rows, err := h.service.ListPayrollReminderLogs(c.Request.Context(), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در بارگذاری لاگ یادآوری حقوق"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

type updatePaydayRequest struct {
	PaydayDay int `json:"payday_day" binding:"required,min=1,max=28"`
}

// UpdatePayday handles PUT /reminders/payday
func (h *ReminderHandler) UpdatePayday(c *gin.Context) {
	var req updatePaydayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "روز پرداخت حقوق باید بین ۱ تا ۲۸ باشد"})
		return
	}
	day, err := h.service.SetPaydayDay(c.Request.Context(), req.PaydayDay)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در ذخیره روز پرداخت حقوق"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"payday_day": day})
}

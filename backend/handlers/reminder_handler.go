package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

type ReminderHandler struct {
	service *services.ReminderService
}

func NewReminderHandler(service *services.ReminderService) *ReminderHandler {
	return &ReminderHandler{service: service}
}

// ListRules returns the hard-coded reminder rules (no DB required).
func (h *ReminderHandler) ListRules(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": h.service.ListRules()})
}

// ReplaceRules is kept for route compatibility but is a no-op since rules are hard-coded.
func (h *ReminderHandler) ReplaceRules(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
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

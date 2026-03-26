package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

type ReminderHandler struct {
	service *services.ReminderService
}

func NewReminderHandler(service *services.ReminderService) *ReminderHandler {
	return &ReminderHandler{service: service}
}

type reminderRuleRequest struct {
	Type       string `json:"type" binding:"required,oneof=BEFORE_DUE DUE_DAY OVERDUE"`
	DaysOffset int    `json:"days_offset"`
	Channel    string `json:"channel" binding:"required,oneof=TELEGRAM SMS"`
	Enabled    bool   `json:"enabled"`
}

func (h *ReminderHandler) ListRules(c *gin.Context) {
	rows, err := h.service.ListRules(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load reminder rules"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *ReminderHandler) ReplaceRules(c *gin.Context) {
	var req []reminderRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rules := make([]models.ReminderRule, 0, len(req))
	for _, r := range req {
		rules = append(rules, models.ReminderRule{
			Type:       models.ReminderType(r.Type),
			DaysOffset: r.DaysOffset,
			Channel:    models.ReminderChannel(r.Channel),
			Enabled:    r.Enabled,
		})
	}
	if err := h.service.ReplaceRules(c.Request.Context(), rules); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save reminder rules"})
		return
	}
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load reminder logs"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func (h *ReminderHandler) RunNow(c *gin.Context) {
	count, err := h.service.RunNow(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to run reminders"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sent_count": count})
}

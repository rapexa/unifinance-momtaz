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

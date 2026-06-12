package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

type FiscalYearHandler struct {
	service *services.FiscalYearService
}

func NewFiscalYearHandler(service *services.FiscalYearService) *FiscalYearHandler {
	return &FiscalYearHandler{service: service}
}

type fiscalYearDTO struct {
	ID        uint   `json:"id"`
	Name      string `json:"name"`
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
	Status    string `json:"status"`
	ClosedAt  string `json:"closed_at"`
	ExportURL string `json:"export_url"`
	CreatedAt string `json:"created_at"`
}

func toFiscalYearDTO(fy *models.FiscalYear) fiscalYearDTO {
	dto := fiscalYearDTO{
		ID:        fy.ID,
		Name:      fy.Name,
		StartDate: fy.StartDate.Format("2006-01-02"),
		Status:    string(fy.Status),
		ExportURL: fy.ExportURL,
		CreatedAt: fy.CreatedAt.Format(time.RFC3339),
	}
	if fy.EndDate != nil {
		dto.EndDate = fy.EndDate.Format("2006-01-02")
	}
	if fy.ClosedAt != nil {
		dto.ClosedAt = fy.ClosedAt.Format(time.RFC3339)
	}
	return dto
}

// List returns all fiscal years ordered by newest first.
func (h *FiscalYearHandler) List(c *gin.Context) {
	years, err := h.service.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت سال‌های مالی"})
		return
	}
	dtos := make([]fiscalYearDTO, len(years))
	for i := range years {
		dtos[i] = toFiscalYearDTO(&years[i])
	}
	c.JSON(http.StatusOK, dtos)
}

// GetCurrent returns the currently open fiscal year or 404.
func (h *FiscalYearHandler) GetCurrent(c *gin.Context) {
	fy, err := h.service.GetCurrent(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت سال مالی جاری"})
		return
	}
	if fy == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "سال مالی فعالی وجود ندارد"})
		return
	}
	c.JSON(http.StatusOK, toFiscalYearDTO(fy))
}

// Create starts a new fiscal year.
func (h *FiscalYearHandler) Create(c *gin.Context) {
	var body struct {
		Name      string `json:"name" binding:"required"`
		StartDate string `json:"start_date" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "نام و تاریخ شروع الزامی است"})
		return
	}

	startDate, err := time.Parse("2006-01-02", body.StartDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "فرمت تاریخ اشتباه است. فرمت مورد قبول: YYYY-MM-DD"})
		return
	}

	fy, err := h.service.Create(c.Request.Context(), services.CreateFiscalYearInput{
		Name:      body.Name,
		StartDate: startDate,
	})
	if err != nil {
		if errors.Is(err, services.ErrFiscalYearAlreadyOpen) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در ایجاد سال مالی"})
		return
	}
	c.JSON(http.StatusCreated, toFiscalYearDTO(fy))
}

// Update changes editable fields of a fiscal year (currently name only).
func (h *FiscalYearHandler) Update(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}

	var body struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "نام سال مالی الزامی است"})
		return
	}

	fy, err := h.service.UpdateName(c.Request.Context(), uint(id), body.Name)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrFiscalYearNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		default:
			if err.Error() == "نام سال مالی الزامی است" {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در ویرایش سال مالی"})
		}
		return
	}
	c.JSON(http.StatusOK, toFiscalYearDTO(fy))
}

// Close closes a fiscal year: exports data to CSV, resets student balances.
func (h *FiscalYearHandler) Close(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}

	fy, err := h.service.Close(c.Request.Context(), uint(id))
	if err != nil {
		switch {
		case errors.Is(err, services.ErrFiscalYearNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrFiscalYearNotOpen):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, toFiscalYearDTO(fy))
}

// Restore undoes a Close: all soft-deleted data is recovered and the year is re-opened.
// Only allowed when no year is OPEN and no newer fiscal year exists.
func (h *FiscalYearHandler) Restore(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}

	fy, err := h.service.Restore(c.Request.Context(), uint(id))
	if err != nil {
		switch {
		case errors.Is(err, services.ErrFiscalYearNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrFiscalYearAlreadyOpen):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrFiscalYearNotClosed):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrFiscalYearRestoreBlocked):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, toFiscalYearDTO(fy))
}

// Reopen opens a previously closed fiscal year (only when no year is currently open).
func (h *FiscalYearHandler) Reopen(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}

	fy, err := h.service.Reopen(c.Request.Context(), uint(id))
	if err != nil {
		switch {
		case errors.Is(err, services.ErrFiscalYearNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrFiscalYearAlreadyOpen):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrFiscalYearNotClosed):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, toFiscalYearDTO(fy))
}

// HardDelete permanently removes a closed fiscal year and its CSV export.
func (h *FiscalYearHandler) HardDelete(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}

	if err := h.service.HardDelete(c.Request.Context(), uint(id)); err != nil {
		switch {
		case errors.Is(err, services.ErrFiscalYearNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrFiscalYearMustBeClosedFirst):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در حذف کامل سال مالی"})
		}
		return
	}
	c.Status(http.StatusNoContent)
}

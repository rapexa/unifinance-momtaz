package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/repositories"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

type SchoolContractHandler struct {
	service  *services.SchoolContractService
	students *services.StudentService
}

func NewSchoolContractHandler(service *services.SchoolContractService, students *services.StudentService) *SchoolContractHandler {
	return &SchoolContractHandler{service: service, students: students}
}

type SchoolContractDTO struct {
	ID                      uint       `json:"id"`
	SchoolName              string     `json:"school_name"`
	StudentCount            int        `json:"student_count"`
	RegisteredStudentCount  int64      `json:"registered_student_count"`
	UnitPriceCents          int64      `json:"unit_price_cents"`
	TotalAmountCents        int64      `json:"total_amount_cents"`
	PaidTotalCents          int64      `json:"paid_total_cents"`
	RemainingBalanceCents   int64      `json:"remaining_balance_cents"`
	Status                  string     `json:"status"`
	Notes                   string     `json:"notes,omitempty"`
	StartDate               *time.Time `json:"start_date,omitempty"`
	CreatedAt               time.Time  `json:"created_at"`
}

func toSchoolContractDTO(c *models.SchoolContract, paid int64, registered int64) SchoolContractDTO {
	return SchoolContractDTO{
		ID:                     c.ID,
		SchoolName:             c.SchoolName,
		StudentCount:           c.StudentCount,
		RegisteredStudentCount: registered,
		UnitPriceCents:         c.UnitPriceCents,
		TotalAmountCents:       c.TotalAmountCents,
		PaidTotalCents:         paid,
		RemainingBalanceCents:  c.RemainingBalanceCents(paid),
		Status:                 string(c.Status),
		Notes:                  c.Notes,
		StartDate:              c.StartDate,
		CreatedAt:              c.CreatedAt,
	}
}

type schoolContractBody struct {
	SchoolName     string `json:"school_name" binding:"required,min=1,max=200"`
	StudentCount   int    `json:"student_count" binding:"required,gt=0"`
	UnitPriceCents int64  `json:"unit_price_cents" binding:"required,gt=0"`
	Notes          string `json:"notes" binding:"omitempty,max=1000"`
	StartDateStr   string `json:"start_date" binding:"omitempty"`
	Status         string `json:"status" binding:"omitempty,oneof=ACTIVE INACTIVE SETTLED"`
}

func (h *SchoolContractHandler) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 200 {
		pageSize = 200
	}
	offset := (page - 1) * pageSize

	rows, paidMap, total, err := h.service.List(c.Request.Context(), pageSize, offset, repositories.SchoolContractListFilter{
		Search: c.DefaultQuery("search", ""),
		Status: c.DefaultQuery("status", ""),
		Sort:   c.DefaultQuery("sort", "newest"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list school contracts"})
		return
	}
	ids := make([]uint, len(rows))
	for i := range rows {
		ids[i] = rows[i].ID
	}
	regMap := map[uint]int64{}
	if h.students != nil && len(ids) > 0 {
		if m, err := h.students.CountBySchoolContractIDs(c.Request.Context(), ids); err == nil {
			regMap = m
		}
	}
	out := make([]SchoolContractDTO, len(rows))
	for i := range rows {
		out[i] = toSchoolContractDTO(&rows[i], paidMap[rows[i].ID], regMap[rows[i].ID])
	}
	totalPages := int(total) / pageSize
	if int(total)%pageSize != 0 {
		totalPages++
	}
	c.JSON(http.StatusOK, gin.H{
		"data": out,
		"meta": gin.H{
			"current_page": page,
			"page_size":    pageSize,
			"total_items":  total,
			"total_pages":  totalPages,
		},
	})
}

func (h *SchoolContractHandler) Get(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	contract, paid, err := h.service.GetByID(c.Request.Context(), uint(id))
	if err != nil {
		if errors.Is(err, services.ErrSchoolContractNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "school contract not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get school contract"})
		return
	}
	var registered int64
	if h.students != nil {
		if m, err := h.students.CountBySchoolContractIDs(c.Request.Context(), []uint{contract.ID}); err == nil {
			registered = m[contract.ID]
		}
	}
	c.JSON(http.StatusOK, toSchoolContractDTO(contract, paid, registered))
}

func (h *SchoolContractHandler) Create(c *gin.Context) {
	var body schoolContractBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	start, err := parseOptionalDate(body.StartDateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	created, err := h.service.Create(c.Request.Context(), services.CreateSchoolContractParams{
		SchoolName:     body.SchoolName,
		StudentCount:   body.StudentCount,
		UnitPriceCents: body.UnitPriceCents,
		Notes:          body.Notes,
		StartDate:      start,
		Status:         body.Status,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, toSchoolContractDTO(created, 0, 0))
}

func (h *SchoolContractHandler) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body schoolContractBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	start, err := parseOptionalDate(body.StartDateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, err := h.service.Update(c.Request.Context(), uint(id), services.UpdateSchoolContractParams{
		SchoolName:     body.SchoolName,
		StudentCount:   body.StudentCount,
		UnitPriceCents: body.UnitPriceCents,
		Notes:          body.Notes,
		StartDate:      start,
		Status:         body.Status,
	})
	if err != nil {
		if errors.Is(err, services.ErrSchoolContractNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "school contract not found"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_, paid, _ := h.service.GetByID(c.Request.Context(), updated.ID)
	var registered int64
	if h.students != nil {
		if m, err := h.students.CountBySchoolContractIDs(c.Request.Context(), []uint{updated.ID}); err == nil {
			registered = m[updated.ID]
		}
	}
	c.JSON(http.StatusOK, toSchoolContractDTO(updated, paid, registered))
}

func (h *SchoolContractHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.service.Delete(c.Request.Context(), uint(id)); err != nil {
		if errors.Is(err, services.ErrSchoolContractNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "school contract not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete school contract"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

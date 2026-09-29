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
	ID                     uint       `json:"id"`
	SchoolName             string     `json:"school_name"`
	StudentCount           int        `json:"student_count"`
	RegisteredStudentCount int64      `json:"registered_student_count"`
	// UnitPriceCents is deprecated; kept for older clients/rows. Prefer total_amount_cents.
	UnitPriceCents             int64      `json:"unit_price_cents,omitempty"`
	TotalAmountCents           int64      `json:"total_amount_cents"`
	PaidTotalCents             int64      `json:"paid_total_cents"`
	RemainingBalanceCents      int64      `json:"remaining_balance_cents"`
	// LegacyPaidTotalCents is historical school_contract_id-only PAID (excluded from paid_total).
	LegacyPaidTotalCents       int64      `json:"legacy_paid_total_cents,omitempty"`
	StudentsEnrollmentSumCents int64      `json:"students_enrollment_sum_cents"`
	StudentsSettledCount       int64      `json:"students_settled_count"`
	StudentsDebtCount          int64      `json:"students_debt_count"`
	EnrollmentMismatch         bool       `json:"enrollment_mismatch"`
	Status                     string     `json:"status"`
	Notes                      string     `json:"notes,omitempty"`
	StartDate                  *time.Time `json:"start_date,omitempty"`
	EndDate                    *time.Time `json:"end_date,omitempty"`
	// PaymentType: MONTHLY | TERM | ANNUAL; Term: SUMMER | ACADEMIC (TERM only).
	PaymentType      string    `json:"payment_type"`
	Term             string    `json:"term,omitempty"`
	DurationMonths   int       `json:"duration_months"`
	InstallmentCents int64     `json:"installment_cents"`
	CreatedAt        time.Time `json:"created_at"`
}

func toSchoolContractDTO(
	c *models.SchoolContract,
	paid int64,
	legacyPaid int64,
	registered int64,
	stats repositories.SchoolContractStudentStats,
) SchoolContractDTO {
	return SchoolContractDTO{
		ID:                         c.ID,
		SchoolName:                 c.SchoolName,
		StudentCount:               c.StudentCount,
		RegisteredStudentCount:     registered,
		UnitPriceCents:             c.UnitPriceCents,
		TotalAmountCents:           c.TotalAmountCents,
		PaidTotalCents:             paid,
		RemainingBalanceCents:      c.RemainingBalanceCents(paid),
		LegacyPaidTotalCents:       legacyPaid,
		StudentsEnrollmentSumCents: stats.EnrollmentSumCents,
		StudentsSettledCount:       stats.SettledCount,
		StudentsDebtCount:          stats.DebtCount,
		EnrollmentMismatch:         stats.EnrollmentSumCents > 0 && stats.EnrollmentSumCents != c.TotalAmountCents,
		Status:                     string(c.Status),
		Notes:                      c.Notes,
		StartDate:                  c.StartDate,
		EndDate:                    c.EndDate,
		PaymentType:                paymentTypeOrDefault(c.PaymentType),
		Term:                       c.Term,
		DurationMonths:             c.DurationMonths(),
		InstallmentCents:           c.InstallmentCents(),
		CreatedAt:                  c.CreatedAt,
	}
}

func paymentTypeOrDefault(pt string) string {
	if pt == "" {
		return models.SchoolPaymentAnnual
	}
	return pt
}

// schoolContractBody accepts total_amount_cents (preferred) or legacy unit_price_cents.
type schoolContractBody struct {
	SchoolName       string `json:"school_name" binding:"required,min=1,max=200"`
	StudentCount     int    `json:"student_count" binding:"required,gt=0"`
	TotalAmountCents int64  `json:"total_amount_cents" binding:"omitempty,gt=0"`
	UnitPriceCents   int64  `json:"unit_price_cents" binding:"omitempty,gte=0"`
	Notes            string `json:"notes" binding:"omitempty,max=1000"`
	StartDateStr     string `json:"start_date" binding:"omitempty"`
	EndDateStr       string `json:"end_date" binding:"omitempty"`
	PaymentType      string `json:"payment_type" binding:"omitempty,oneof=MONTHLY TERM ANNUAL"`
	Term             string `json:"term" binding:"omitempty,oneof=SUMMER ACADEMIC"`
	Status           string `json:"status" binding:"omitempty,oneof=ACTIVE INACTIVE SETTLED"`
}

func (h *SchoolContractHandler) financeForIDs(c *gin.Context, ids []uint) (
	regMap map[uint]int64,
	legacyMap map[uint]int64,
	statsMap map[uint]repositories.SchoolContractStudentStats,
) {
	regMap = map[uint]int64{}
	legacyMap = map[uint]int64{}
	statsMap = map[uint]repositories.SchoolContractStudentStats{}
	if len(ids) == 0 {
		return regMap, legacyMap, statsMap
	}
	if h.students != nil {
		if m, err := h.students.CountBySchoolContractIDs(c.Request.Context(), ids); err == nil {
			regMap = m
		}
	}
	if m, err := h.service.LegacyPaidCentsByIDs(c.Request.Context(), ids); err == nil {
		legacyMap = m
	}
	if m, err := h.service.StudentStatsByIDs(c.Request.Context(), ids); err == nil {
		statsMap = m
	}
	return regMap, legacyMap, statsMap
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت قراردادهای مدرسه"})
		return
	}
	ids := make([]uint, len(rows))
	for i := range rows {
		ids[i] = rows[i].ID
	}
	regMap, legacyMap, statsMap := h.financeForIDs(c, ids)
	out := make([]SchoolContractDTO, len(rows))
	for i := range rows {
		id := rows[i].ID
		out[i] = toSchoolContractDTO(&rows[i], paidMap[id], legacyMap[id], regMap[id], statsMap[id])
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}
	contract, paid, err := h.service.GetByID(c.Request.Context(), uint(id))
	if err != nil {
		if errors.Is(err, services.ErrSchoolContractNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "قرارداد مدرسه یافت نشد"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت قرارداد مدرسه"})
		return
	}
	regMap, legacyMap, statsMap := h.financeForIDs(c, []uint{contract.ID})
	c.JSON(http.StatusOK, toSchoolContractDTO(contract, paid, legacyMap[contract.ID], regMap[contract.ID], statsMap[contract.ID]))
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
	end, err := parseOptionalDate(body.EndDateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	created, err := h.service.Create(c.Request.Context(), services.CreateSchoolContractParams{
		SchoolName:       body.SchoolName,
		StudentCount:     body.StudentCount,
		TotalAmountCents: body.TotalAmountCents,
		UnitPriceCents:   body.UnitPriceCents,
		Notes:            body.Notes,
		StartDate:        start,
		EndDate:          end,
		PaymentType:      body.PaymentType,
		Term:             body.Term,
		Status:           body.Status,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, toSchoolContractDTO(created, 0, 0, 0, repositories.SchoolContractStudentStats{}))
}

func (h *SchoolContractHandler) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
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
	end, err := parseOptionalDate(body.EndDateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, err := h.service.Update(c.Request.Context(), uint(id), services.UpdateSchoolContractParams{
		SchoolName:       body.SchoolName,
		StudentCount:     body.StudentCount,
		TotalAmountCents: body.TotalAmountCents,
		UnitPriceCents:   body.UnitPriceCents,
		Notes:            body.Notes,
		StartDate:        start,
		EndDate:          end,
		PaymentType:      body.PaymentType,
		Term:             body.Term,
		Status:           body.Status,
	})
	if err != nil {
		if errors.Is(err, services.ErrSchoolContractNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "قرارداد مدرسه یافت نشد"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_, paid, _ := h.service.GetByID(c.Request.Context(), updated.ID)
	regMap, legacyMap, statsMap := h.financeForIDs(c, []uint{updated.ID})
	c.JSON(http.StatusOK, toSchoolContractDTO(updated, paid, legacyMap[updated.ID], regMap[updated.ID], statsMap[updated.ID]))
}

func (h *SchoolContractHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}
	if err := h.service.Delete(c.Request.Context(), uint(id)); err != nil {
		if errors.Is(err, services.ErrSchoolContractNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "قرارداد مدرسه یافت نشد"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "حذف قرارداد مدرسه با خطا مواجه شد"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

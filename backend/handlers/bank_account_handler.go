package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/middleware"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/services"
)

// BankAccountHandler exposes the organization's bank accounts (حساب‌های بانکی).
type BankAccountHandler struct {
	service *services.BankAccountService
}

func NewBankAccountHandler(service *services.BankAccountService) *BankAccountHandler {
	return &BankAccountHandler{service: service}
}

// BankAccountDTO is the API shape of a bank account.
type BankAccountDTO struct {
	ID                  uint      `json:"id"`
	Title               string    `json:"title"`
	BankName            string    `json:"bank_name,omitempty"`
	OwnerName           string    `json:"owner_name,omitempty"`
	CardNumber          string    `json:"card_number,omitempty"`
	AccountNumber       string    `json:"account_number,omitempty"`
	IBAN                string    `json:"iban,omitempty"`
	OpeningBalanceCents int64     `json:"opening_balance_cents"`
	IsActive            bool      `json:"is_active"`
	ShowToStudents      bool      `json:"show_to_students"`
	SortOrder           int       `json:"sort_order"`
	Notes               string    `json:"notes,omitempty"`
	InflowCents         int64     `json:"inflow_cents"`
	OutflowCents        int64     `json:"outflow_cents"`
	BalanceCents        int64     `json:"balance_cents"`
	CreatedAt           time.Time `json:"created_at"`
}

// PublicBankAccountDTO is what students see on payment pages.
type PublicBankAccountDTO struct {
	Title         string `json:"title"`
	BankName      string `json:"bank_name,omitempty"`
	OwnerName     string `json:"owner_name,omitempty"`
	CardNumber    string `json:"card_number,omitempty"`
	AccountNumber string `json:"account_number,omitempty"`
	IBAN          string `json:"iban,omitempty"`
}

func toBankAccountDTO(a services.BankAccountWithBalance) BankAccountDTO {
	return BankAccountDTO{
		ID:                  a.ID,
		Title:               a.Title,
		BankName:            a.BankName,
		OwnerName:           a.OwnerName,
		CardNumber:          a.CardNumber,
		AccountNumber:       a.AccountNumber,
		IBAN:                a.IBAN,
		OpeningBalanceCents: a.OpeningBalanceCents,
		IsActive:            a.IsActive,
		ShowToStudents:      a.ShowToStudents,
		SortOrder:           a.SortOrder,
		Notes:               a.Notes,
		InflowCents:         a.InflowCents,
		OutflowCents:        a.OutflowCents,
		BalanceCents:        a.BalanceCents,
		CreatedAt:           a.CreatedAt,
	}
}

func toPublicBankAccountDTOs(rows []models.BankAccount) []PublicBankAccountDTO {
	out := make([]PublicBankAccountDTO, len(rows))
	for i, a := range rows {
		out[i] = PublicBankAccountDTO{
			Title:         a.Title,
			BankName:      a.BankName,
			OwnerName:     a.OwnerName,
			CardNumber:    a.CardNumber,
			AccountNumber: a.AccountNumber,
			IBAN:          a.IBAN,
		}
	}
	return out
}

type bankAccountRequest struct {
	Title               string `json:"title" binding:"max=120"`
	BankName            string `json:"bank_name" binding:"max=80"`
	OwnerName           string `json:"owner_name" binding:"max=120"`
	CardNumber          string `json:"card_number" binding:"max=40"`
	AccountNumber       string `json:"account_number" binding:"max=40"`
	IBAN                string `json:"iban" binding:"max=40"`
	OpeningBalanceCents int64  `json:"opening_balance_cents"`
	IsActive            *bool  `json:"is_active"`
	ShowToStudents      *bool  `json:"show_to_students"`
	SortOrder           int    `json:"sort_order"`
	Notes               string `json:"notes" binding:"max=500"`
}

func (r bankAccountRequest) input() services.BankAccountInput {
	active, show := true, true
	if r.IsActive != nil {
		active = *r.IsActive
	}
	if r.ShowToStudents != nil {
		show = *r.ShowToStudents
	}
	return services.BankAccountInput{
		Title:               r.Title,
		BankName:            r.BankName,
		OwnerName:           r.OwnerName,
		CardNumber:          r.CardNumber,
		AccountNumber:       r.AccountNumber,
		IBAN:                r.IBAN,
		OpeningBalanceCents: r.OpeningBalanceCents,
		IsActive:            active,
		ShowToStudents:      show,
		SortOrder:           r.SortOrder,
		Notes:               r.Notes,
	}
}

func (h *BankAccountHandler) writeError(c *gin.Context, err error) {
	switch err {
	case services.ErrBankAccountNotFound:
		c.JSON(http.StatusNotFound, gin.H{"error": "حساب بانکی یافت نشد"})
	case services.ErrBankAccountTitleMissing:
		c.JSON(http.StatusBadRequest, gin.H{"error": "عنوان یا نام بانک الزامی است"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در ذخیره حساب بانکی"})
	}
}

// requireAdmin blocks users whose data is scoped to their own students.
func requireAdmin(c *gin.Context) bool {
	if middleware.DataScopeUserID(c) != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "این عملیات فقط برای مدیر مجاز است"})
		return false
	}
	return true
}

// List handles GET /bank-accounts?active=true
func (h *BankAccountHandler) List(c *gin.Context) {
	rows, err := h.service.List(c.Request.Context(), c.Query("active") == "true")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "خطا در دریافت حساب‌های بانکی"})
		return
	}
	out := make([]BankAccountDTO, len(rows))
	var total int64
	for i, r := range rows {
		out[i] = toBankAccountDTO(r)
		total += r.BalanceCents
	}
	c.JSON(http.StatusOK, gin.H{"data": out, "total_balance_cents": total})
}

// Create handles POST /bank-accounts
func (h *BankAccountHandler) Create(c *gin.Context) {
	if !requireAdmin(c) {
		return
	}
	var req bankAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeBindError(c, err)
		return
	}
	a, err := h.service.Create(c.Request.Context(), req.input())
	if err != nil {
		h.writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, toBankAccountDTO(services.BankAccountWithBalance{BankAccount: *a, BalanceCents: a.OpeningBalanceCents}))
}

// Update handles PUT /bank-accounts/:id
func (h *BankAccountHandler) Update(c *gin.Context) {
	if !requireAdmin(c) {
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}
	var req bankAccountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeBindError(c, err)
		return
	}
	a, err := h.service.Update(c.Request.Context(), uint(id), req.input())
	if err != nil {
		h.writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, toBankAccountDTO(services.BankAccountWithBalance{BankAccount: *a}))
}

// Delete handles DELETE /bank-accounts/:id
func (h *BankAccountHandler) Delete(c *gin.Context) {
	if !requireAdmin(c) {
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}
	if err := h.service.Delete(c.Request.Context(), uint(id)); err != nil {
		h.writeError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

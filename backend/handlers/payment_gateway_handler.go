package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/soheilsshh/unifinance-momtaz/models"
	"github.com/soheilsshh/unifinance-momtaz/services"
	"gorm.io/gorm"
)

// PaymentGatewayHandler handles public-facing payment gateway endpoints.
type PaymentGatewayHandler struct {
	paymentService  *services.PaymentService
	zarinpalService *services.ZarinpalService
	db              *gorm.DB
	frontendURL     string
}

func NewPaymentGatewayHandler(
	paymentService *services.PaymentService,
	zarinpalService *services.ZarinpalService,
	db *gorm.DB,
	frontendURL string,
) *PaymentGatewayHandler {
	return &PaymentGatewayHandler{
		paymentService:  paymentService,
		zarinpalService: zarinpalService,
		db:              db,
		frontendURL:     frontendURL,
	}
}

// publicPaymentDTO is the response for the public payment detail endpoint.
type publicPaymentDTO struct {
	ID           uint    `json:"id"`
	StudentName  string  `json:"student_name"`
	StudentPhone string  `json:"student_phone"`
	AmountCents  int64   `json:"amount_cents"`
	Description  string  `json:"description"`
	Status       string  `json:"status"`
	DueDate      *string `json:"due_date"`
}

// GetPublicPayment handles GET /public/payments/:id
// Returns minimal payment info for the public pay page (no auth required).
func (h *PaymentGatewayHandler) GetPublicPayment(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}

	var payment models.Payment
	if err := h.db.WithContext(c.Request.Context()).
		Preload("Student").
		First(&payment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "لینک پرداخت یافت نشد"})
		return
	}

	dto := publicPaymentDTO{
		ID:           payment.ID,
		StudentName:  payment.Student.FirstName + " " + payment.Student.LastName,
		StudentPhone: payment.Student.Phone,
		AmountCents:  payment.AmountCents,
		Description:  payment.Description,
		Status:       string(payment.Status),
	}
	if payment.DueDate != nil {
		s := payment.DueDate.Format("2006-01-02")
		dto.DueDate = &s
	}

	c.JSON(http.StatusOK, dto)
}

// InitiatePayment handles POST /public/payments/:id/pay
// Creates a ZarinPal payment request and returns the gateway URL.
func (h *PaymentGatewayHandler) InitiatePayment(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "شناسه نامعتبر است"})
		return
	}

	var payment models.Payment
	if err := h.db.WithContext(c.Request.Context()).
		Preload("Student").
		First(&payment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "لینک پرداخت یافت نشد"})
		return
	}

	if payment.Status == models.PaymentStatusPaid {
		c.JSON(http.StatusBadRequest, gin.H{"error": "این پرداخت قبلاً انجام شده است"})
		return
	}

	description := payment.Description
	if description == "" {
		description = fmt.Sprintf("پرداخت شهریه - %s %s", payment.Student.FirstName, payment.Student.LastName)
	}

	authority, err := h.zarinpalService.Request(
		payment.AmountCents,
		description,
		payment.Student.Phone,
		payment.Student.Email,
	)
	if err != nil {
		log.Printf("zarinpal: request failed for payment %d: %v", id, err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "اتصال به درگاه پرداخت ناموفق بود. لطفاً دوباره تلاش کنید."})
		return
	}

	// Persist authority so the callback can find this payment record.
	if err := h.db.WithContext(c.Request.Context()).
		Model(&payment).
		Update("zarinpal_authority", authority).Error; err != nil {
		log.Printf("zarinpal: could not save authority for payment %d: %v", id, err)
	}

	paymentURL := h.zarinpalService.StartPayURL() + authority
	c.JSON(http.StatusOK, gin.H{"payment_url": paymentURL})
}

// Callback handles GET /payment/callback
// ZarinPal redirects the user here after payment. The handler verifies the
// transaction and then redirects the user to the React result page.
func (h *PaymentGatewayHandler) Callback(c *gin.Context) {
	status := c.Query("Status")
	authority := c.Query("Authority")

	// Find the payment by the stored authority token.
	var payment models.Payment
	if err := h.db.WithContext(c.Request.Context()).
		Where("zarinpal_authority = ?", authority).
		First(&payment).Error; err != nil {
		// Can't associate to a payment – redirect with generic failure.
		c.Redirect(http.StatusFound, h.frontendURL+"/paymentResult/0?success=false&error=not_found")
		return
	}

	resultBase := fmt.Sprintf("%s/paymentResult/%d", h.frontendURL, payment.ID)

	if status != "OK" {
		// User cancelled or transaction failed on ZarinPal side.
		c.Redirect(http.StatusFound, resultBase+"?success=false&error=cancelled")
		return
	}

	// Verify with ZarinPal.
	code, refID, err := h.zarinpalService.Verify(authority, payment.AmountCents)
	if err != nil {
		log.Printf("zarinpal: verify error for payment %d: %v", payment.ID, err)
		c.Redirect(http.StatusFound, resultBase+"?success=false&error=verify_failed")
		return
	}

	// code 100 = first successful verify; code 101 = already verified (idempotent).
	if code != 100 && code != 101 {
		c.Redirect(http.StatusFound, fmt.Sprintf("%s?success=false&error=gateway_code_%d", resultBase, code))
		return
	}

	// Mark payment as PAID if not already.
	if payment.Status != models.PaymentStatusPaid {
		now := time.Now()
		refCodeStr := strconv.FormatInt(refID, 10)
		if err := h.db.WithContext(c.Request.Context()).
			Model(&payment).
			Updates(map[string]interface{}{
				"status":        models.PaymentStatusPaid,
				"paid_at":       now,
				"reference_code": refCodeStr,
				"method":        models.PaymentMethodGateway,
			}).Error; err != nil {
			log.Printf("zarinpal: could not update payment %d to PAID: %v", payment.ID, err)
			c.Redirect(http.StatusFound, resultBase+"?success=false&error=db_error")
			return
		}
	}

	redirectURL := fmt.Sprintf("%s?success=true&ref_id=%d", resultBase, refID)
	c.Redirect(http.StatusFound, redirectURL)
}

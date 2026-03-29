package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	zarinpalRequestURL  = "https://payment.zarinpal.com/pg/v4/payment/request.json"
	zarinpalVerifyURL   = "https://payment.zarinpal.com/pg/v4/payment/verify.json"
	zarinpalStartPayURL = "https://payment.zarinpal.com/pg/StartPay/"

	zarinpalSandboxRequestURL = "https://sandbox.zarinpal.com/pg/v4/payment/request.json"
	zarinpalSandboxVerifyURL  = "https://sandbox.zarinpal.com/pg/v4/payment/verify.json"
	zarinpalSandboxStartPay   = "https://sandbox.zarinpal.com/pg/StartPay/"
)

// ZarinpalService handles communication with the ZarinPal payment gateway.
type ZarinpalService struct {
	merchantID  string
	sandbox     bool
	callbackURL string
	httpClient  *http.Client
}

func NewZarinpalService(merchantID string, sandbox bool, callbackURL string) *ZarinpalService {
	return &ZarinpalService{
		merchantID:  merchantID,
		sandbox:     sandbox,
		callbackURL: callbackURL,
		httpClient:  &http.Client{Timeout: 30 * time.Second},
	}
}

type zarinpalRequestBody struct {
	MerchantID  string            `json:"merchant_id"`
	Amount      int64             `json:"amount"`
	Currency    string            `json:"currency"`
	Description string            `json:"description"`
	CallbackURL string            `json:"callback_url"`
	Metadata    map[string]string `json:"metadata,omitempty"`
}

type zarinpalRequestResponse struct {
	Data struct {
		Code      int    `json:"code"`
		Message   string `json:"message"`
		Authority string `json:"authority"`
		FeeType   string `json:"fee_type"`
		Fee       int    `json:"fee"`
	} `json:"data"`
	Errors interface{} `json:"errors"`
}

type zarinpalVerifyBody struct {
	MerchantID string `json:"merchant_id"`
	Amount     int64  `json:"amount"`
	Authority  string `json:"authority"`
}

type zarinpalVerifyResponse struct {
	Data struct {
		Code     int    `json:"code"`
		Message  string `json:"message"`
		CardHash string `json:"card_hash"`
		CardPan  string `json:"card_pan"`
		RefID    int64  `json:"ref_id"`
		FeeType  string `json:"fee_type"`
		Fee      int    `json:"fee"`
	} `json:"data"`
	Errors interface{} `json:"errors"`
}

func (s *ZarinpalService) requestURL() string {
	if s.sandbox {
		return zarinpalSandboxRequestURL
	}
	return zarinpalRequestURL
}

func (s *ZarinpalService) verifyURL() string {
	if s.sandbox {
		return zarinpalSandboxVerifyURL
	}
	return zarinpalVerifyURL
}

func (s *ZarinpalService) StartPayURL() string {
	if s.sandbox {
		return zarinpalSandboxStartPay
	}
	return zarinpalStartPayURL
}

// Request creates a payment request at ZarinPal and returns the authority token.
// amount is in IRR (Rials).
func (s *ZarinpalService) Request(amount int64, description, mobile, email string) (string, error) {
	payload := zarinpalRequestBody{
		MerchantID:  s.merchantID,
		Amount:      amount,
		Currency:    "IRR",
		Description: description,
		CallbackURL: s.callbackURL,
	}
	if mobile != "" || email != "" {
		payload.Metadata = map[string]string{}
		if mobile != "" {
			payload.Metadata["mobile"] = mobile
		}
		if email != "" {
			payload.Metadata["email"] = email
		}
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("zarinpal: marshal request: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, s.requestURL(), bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("zarinpal: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("zarinpal: http request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("zarinpal: read response: %w", err)
	}

	var parsed zarinpalRequestResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", fmt.Errorf("zarinpal: unmarshal response: %w (body: %s)", err, string(respBody))
	}

	if parsed.Data.Code != 100 {
		return "", fmt.Errorf("zarinpal: request failed with code %d: %s", parsed.Data.Code, parsed.Data.Message)
	}

	return parsed.Data.Authority, nil
}

// Verify verifies a payment with ZarinPal after callback.
// amount is in IRR (Rials).
// Returns (zarinpalCode, refID, error).
func (s *ZarinpalService) Verify(authority string, amount int64) (int, int64, error) {
	payload := zarinpalVerifyBody{
		MerchantID: s.merchantID,
		Amount:     amount,
		Authority:  authority,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return 0, 0, fmt.Errorf("zarinpal: marshal verify: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, s.verifyURL(), bytes.NewReader(body))
	if err != nil {
		return 0, 0, fmt.Errorf("zarinpal: build verify request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return 0, 0, fmt.Errorf("zarinpal: http verify request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, 0, fmt.Errorf("zarinpal: read verify response: %w", err)
	}

	var parsed zarinpalVerifyResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return 0, 0, fmt.Errorf("zarinpal: unmarshal verify response: %w (body: %s)", err, string(respBody))
	}

	return parsed.Data.Code, parsed.Data.RefID, nil
}

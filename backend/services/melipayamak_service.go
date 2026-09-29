package services

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
)

const melipayamakEndpoint = "http://api.payamak-panel.com/post/send.asmx"

// melipayamakRestSend sends a free-text SMS from a dedicated line (REST API).
const melipayamakRestSend = "https://rest.payamak-panel.com/api/SendSMS/SendSMS"

// Pattern body IDs registered in the Melipayamak panel.
// PatternBefore7Days / PatternPayrollPending are 0 until registered in the panel;
// SendPattern skips bodyID <= 0.
const (
	PatternOverdue2Days   = 436788 // بیشتر از ۲ روز از سررسید گذشته
	PatternBefore1Day     = 436786 // ۱ روز قبل از سررسید
	PatternBefore3Days    = 436785 // ۳ روز قبل از سررسید
	PatternBefore7Days    = 0      // ۷ روز قبل — پس از ثبت در پنل پر شود
	PatternPayrollPending = 0      // یادآوری حقوق کارمند — اختیاری
)

// BodyIDForRule returns the Melipayamak bodyId for a given reminder rule,
// or 0 if there is no registered pattern for that rule.
func BodyIDForRule(r *models.ReminderRule) int {
	switch r.Type {
	case models.ReminderTypeBeforeDue:
		switch r.DaysOffset {
		case 7:
			return PatternBefore7Days
		case 3:
			return PatternBefore3Days
		case 1:
			return PatternBefore1Day
		}
	case models.ReminderTypeOverdue:
		if r.DaysOffset >= 2 {
			return PatternOverdue2Days
		}
	}
	return 0
}

// MelipayamakService sends patterned SMS messages via the ملی پیامک SOAP API.
type MelipayamakService struct {
	username string
	apiKey   string
	from     string
	client   *http.Client
}

func NewMelipayamakService(username, apiKey string) *MelipayamakService {
	return &MelipayamakService{
		username: username,
		apiKey:   apiKey,
		client:   &http.Client{Timeout: 15 * time.Second},
	}
}

// WithSender sets the sender line used for free-text messages.
func (m *MelipayamakService) WithSender(from string) *MelipayamakService {
	m.from = strings.TrimSpace(from)
	return m
}

// CanSendText reports whether free-text SMS (editable templates) can be sent.
func (m *MelipayamakService) CanSendText() bool {
	return m != nil && m.IsConfigured() && m.from != ""
}

// SendText sends a free-text SMS to one number from the configured sender line.
func (m *MelipayamakService) SendText(to, text string) error {
	to = strings.TrimSpace(to)
	if to == "" {
		return nil
	}
	if !m.CanSendText() {
		return fmt.Errorf("melipayamak: sender line (from) or credentials not configured")
	}
	form := url.Values{}
	form.Set("username", m.username)
	form.Set("password", m.apiKey)
	form.Set("to", to)
	form.Set("from", m.from)
	form.Set("text", text)
	form.Set("isFlash", "false")
	resp, err := m.client.PostForm(melipayamakRestSend, form)
	if err != nil {
		return fmt.Errorf("melipayamak: http request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var out struct {
		Value        string `json:"Value"`
		RetStatus    int    `json:"RetStatus"`
		StrRetStatus string `json:"StrRetStatus"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return fmt.Errorf("melipayamak: parse response: %w (raw: %s)", err, string(body))
	}
	log.Printf("melipayamak: SendText to=%s status=%d %s value=%s", to, out.RetStatus, out.StrRetStatus, out.Value)
	if out.RetStatus != 1 {
		return fmt.Errorf("melipayamak: send failed (%d %s)", out.RetStatus, out.StrRetStatus)
	}
	return nil
}

// IsConfigured returns true when credentials are set (prevents no-op calls).
func (m *MelipayamakService) IsConfigured() bool {
	return m.apiKey != ""
}

// SendPattern sends a pattern-based SMS to a single number.
// variables is the ordered list of pattern variables (empty for fixed-text patterns).
func (m *MelipayamakService) SendPattern(to string, bodyID int, variables []string) error {
	if bodyID <= 0 {
		log.Printf("melipayamak: skip send to %s – pattern bodyID not configured", to)
		return nil
	}
	if !m.IsConfigured() {
		log.Printf("melipayamak: skip send to %s – credentials not configured", to)
		return nil
	}
	if to == "" {
		return nil
	}

	// Build <text> element: one <string> child per variable.
	var textElements strings.Builder
	if len(variables) == 0 {
		textElements.WriteString("<string></string>")
	} else {
		for _, v := range variables {
			textElements.WriteString("<string>")
			textElements.WriteString(v)
			textElements.WriteString("</string>")
		}
	}

	soapBody := fmt.Sprintf(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SendByBaseNumber xmlns="http://tempuri.org/">
      <username>%s</username>
      <password>%s</password>
      <text>%s</text>
      <to>%s</to>
      <bodyId>%d</bodyId>
    </SendByBaseNumber>
  </soap:Body>
</soap:Envelope>`,
		m.username, m.apiKey, textElements.String(), to, bodyID)

	req, err := http.NewRequest(http.MethodPost, melipayamakEndpoint, strings.NewReader(soapBody))
	if err != nil {
		return fmt.Errorf("melipayamak: build request: %w", err)
	}
	req.Header.Set("Content-Type", "text/xml; charset=utf-8")
	req.Header.Set("SOAPAction", `"http://tempuri.org/SendByBaseNumber"`)

	resp, err := m.client.Do(req)
	if err != nil {
		return fmt.Errorf("melipayamak: http request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("melipayamak: read response: %w", err)
	}

	result, err := parseSendResult(body)
	if err != nil {
		return fmt.Errorf("melipayamak: parse response: %w (raw: %s)", err, string(body))
	}

	log.Printf("melipayamak: SendPattern to=%s bodyId=%d result=%s", to, bodyID, result)

	// Negative codes are errors; positive codes (recId, ≥1) are success.
	// Code 2 = insufficient balance (non-fatal, log only).
	if strings.HasPrefix(result, "-") {
		return fmt.Errorf("melipayamak: gateway error code %s for %s", result, to)
	}
	return nil
}

// SendPatternToAll sends the same pattern to student + father + mother phones.
// Errors are logged but do not stop subsequent sends.
func (m *MelipayamakService) SendPatternToAll(student *models.Student, bodyID int, variables []string) {
	phones := []string{student.Phone, student.FatherPhone, student.MotherPhone}
	for _, ph := range phones {
		ph = strings.TrimSpace(ph)
		if ph == "" {
			continue
		}
		if err := m.SendPattern(ph, bodyID, variables); err != nil {
			log.Printf("melipayamak: error sending to %s: %v", ph, err)
		}
	}
}

// --- XML parsing ---

type soapEnvelope struct {
	Body soapBody `xml:"Body"`
}

type soapBody struct {
	Response sendByBaseNumberResponse `xml:"SendByBaseNumberResponse"`
}

type sendByBaseNumberResponse struct {
	Result string `xml:"SendByBaseNumberResult"`
}

func parseSendResult(data []byte) (string, error) {
	var env soapEnvelope
	if err := xml.Unmarshal(data, &env); err != nil {
		return "", err
	}
	return strings.TrimSpace(env.Body.Response.Result), nil
}

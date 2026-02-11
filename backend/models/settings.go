package models

import "gorm.io/gorm"

// PaymentSettings corresponds to Settings > Payments tab (card, IBAN, gateway).
type PaymentSettings struct {
	gorm.Model
	OrganizationID uint         `gorm:"not null;uniqueIndex"`
	Organization   Organization `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`

	CardNumber string `gorm:"size:32"`
	IBAN       string `gorm:"size:50"`

	GatewayProvider    string `gorm:"size:50"`  // e.g. ZARINPAL
	GatewayMerchantID  string `gorm:"size:128"` // Merchant ID / API key
	GatewayCallbackURL string `gorm:"size:255"`
	IsGatewayConnected bool   `gorm:"not null;default:false"`
}

type NotificationType string

const (
	NotificationNewPayment   NotificationType = "NEW_PAYMENT"
	NotificationNewDebt      NotificationType = "NEW_DEBT"
	NotificationDueReminder  NotificationType = "DUE_REMINDER"
	NotificationDailyReport  NotificationType = "DAILY_REPORT"
	NotificationWeeklyReport NotificationType = "WEEKLY_REPORT"
)

// NotificationSetting matches Settings > Notifications switches.
type NotificationSetting struct {
	gorm.Model
	UserID uint `gorm:"not null;index:idx_user_type,priority:1"`
	User   User `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`

	Type    NotificationType `gorm:"type:varchar(64);not null;index:idx_user_type,priority:2"`
	Enabled bool             `gorm:"not null;default:true"`
}


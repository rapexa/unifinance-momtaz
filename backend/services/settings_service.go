package services

import (
	"context"
	"errors"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

var (
	ErrCurrentPasswordInvalid = errors.New("current password is incorrect")
	ErrPasswordTooShort       = errors.New("new password is too short")
)

// SettingsService handles organization, profile, security, notifications, and payment settings.
type SettingsService struct {
	db         *gorm.DB
	userService *UserService
}

func NewSettingsService(db *gorm.DB, userService *UserService) *SettingsService {
	return &SettingsService{db: db, userService: userService}
}

// OrganizationSettingsResult is returned by GetOrganizationSettings.
type OrganizationSettingsResult struct {
	ID      uint
	Name    string
	Phone   string
	Address string
	Email   string
}

// UpdateOrganizationParams is used by UpdateOrganizationSettings.
type UpdateOrganizationParams struct {
	Name, Phone, Address, Email *string
}

func (s *SettingsService) GetOrganizationSettings(ctx context.Context, userID uint) (*OrganizationSettingsResult, error) {
	var org models.Organization
	if err := s.db.WithContext(ctx).First(&org).Error; err != nil {
		return nil, err
	}
	return &OrganizationSettingsResult{
		ID: org.ID, Name: org.Name, Phone: org.Phone, Address: org.Address, Email: org.Email,
	}, nil
}

func (s *SettingsService) UpdateOrganizationSettings(ctx context.Context, userID uint, p UpdateOrganizationParams) (*OrganizationSettingsResult, error) {
	var org models.Organization
	if err := s.db.WithContext(ctx).First(&org).Error; err != nil {
		return nil, err
	}
	if p.Name != nil {
		org.Name = *p.Name
	}
	if p.Phone != nil {
		org.Phone = *p.Phone
	}
	if p.Address != nil {
		org.Address = *p.Address
	}
	if p.Email != nil {
		org.Email = *p.Email
	}
	if err := s.db.WithContext(ctx).Save(&org).Error; err != nil {
		return nil, err
	}
	return &OrganizationSettingsResult{
		ID: org.ID, Name: org.Name, Phone: org.Phone, Address: org.Address, Email: org.Email,
	}, nil
}

// UpdateProfileParams is used by UpdateProfile.
type UpdateProfileParams struct {
	FirstName, LastName, Email, Phone, AvatarURL, Bio *string
}

func (s *SettingsService) GetProfile(ctx context.Context, userID uint) (*models.User, error) {
	return s.userService.GetByID(ctx, userID)
}

func (s *SettingsService) UpdateProfile(ctx context.Context, userID uint, p UpdateProfileParams) (*models.User, error) {
	u, err := s.userService.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if p.FirstName != nil {
		u.FirstName = *p.FirstName
	}
	if p.LastName != nil {
		u.LastName = *p.LastName
	}
	if p.Email != nil {
		u.Email = *p.Email
	}
	if p.Phone != nil {
		u.Phone = *p.Phone
	}
	if p.AvatarURL != nil {
		u.AvatarURL = *p.AvatarURL
	}
	if p.Bio != nil {
		u.Bio = *p.Bio
	}
	if err := s.db.WithContext(ctx).Save(u).Error; err != nil {
		return nil, err
	}
	return u, nil
}

func (s *SettingsService) ChangePassword(ctx context.Context, userID uint, currentPassword, newPassword string) error {
	if len(newPassword) < 6 {
		return ErrPasswordTooShort
	}
	u, err := s.userService.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(currentPassword)) != nil {
		return ErrCurrentPasswordInvalid
	}
	u.PlainPassword = newPassword
	return s.db.WithContext(ctx).Save(u).Error
}

func (s *SettingsService) SetTwoFactorEnabled(ctx context.Context, userID uint, enabled bool) error {
	u, err := s.userService.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	u.TwoFactorEnabled = enabled
	return s.db.WithContext(ctx).Save(u).Error
}

// NotificationToggle is used by SetNotificationSettings.
type NotificationToggle struct {
	Type    models.NotificationType
	Enabled bool
}

// NotificationSettingItem is returned by GetNotificationSettings.
type NotificationSettingItem struct {
	Type    string
	Enabled bool
}

func (s *SettingsService) GetNotificationSettings(ctx context.Context, userID uint) ([]NotificationSettingItem, error) {
	var list []models.NotificationSetting
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).Find(&list).Error; err != nil {
		return nil, err
	}
	out := make([]NotificationSettingItem, 0, len(list))
	for _, n := range list {
		out = append(out, NotificationSettingItem{Type: string(n.Type), Enabled: n.Enabled})
	}
	return out, nil
}

func (s *SettingsService) SetNotificationSettings(ctx context.Context, userID uint, toggles []NotificationToggle) error {
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).Delete(&models.NotificationSetting{}).Error; err != nil {
		return err
	}
	for _, t := range toggles {
		if err := s.db.WithContext(ctx).Create(&models.NotificationSetting{UserID: userID, Type: t.Type, Enabled: t.Enabled}).Error; err != nil {
			return err
		}
	}
	return nil
}

// PaymentSettingsResult is returned by Get/UpdatePaymentSettings.
type PaymentSettingsResult struct {
	CardNumber         string
	IBAN               string
	GatewayProvider    string
	GatewayMerchantID  string
	GatewayCallbackURL string
	IsGatewayConnected bool
}

// UpdatePaymentSettingsParams is used by UpdatePaymentSettings.
type UpdatePaymentSettingsParams struct {
	CardNumber, IBAN, GatewayProvider, GatewayMerchantID, GatewayCallbackURL *string
	IsGatewayConnected                                                       *bool
}

func (s *SettingsService) GetPaymentSettings(ctx context.Context, userID uint) (*PaymentSettingsResult, error) {
	var ps models.PaymentSettings
	if err := s.db.WithContext(ctx).First(&ps).Error; err != nil {
		return nil, err
	}
	return &PaymentSettingsResult{
		CardNumber: ps.CardNumber, IBAN: ps.IBAN, GatewayProvider: ps.GatewayProvider,
		GatewayMerchantID: ps.GatewayMerchantID, GatewayCallbackURL: ps.GatewayCallbackURL,
		IsGatewayConnected: ps.IsGatewayConnected,
	}, nil
}

func (s *SettingsService) UpdatePaymentSettings(ctx context.Context, userID uint, p UpdatePaymentSettingsParams) (*PaymentSettingsResult, error) {
	var ps models.PaymentSettings
	if err := s.db.WithContext(ctx).First(&ps).Error; err != nil {
		return nil, err
	}
	if p.CardNumber != nil {
		ps.CardNumber = *p.CardNumber
	}
	if p.IBAN != nil {
		ps.IBAN = *p.IBAN
	}
	if p.GatewayProvider != nil {
		ps.GatewayProvider = *p.GatewayProvider
	}
	if p.GatewayMerchantID != nil {
		ps.GatewayMerchantID = *p.GatewayMerchantID
	}
	if p.GatewayCallbackURL != nil {
		ps.GatewayCallbackURL = *p.GatewayCallbackURL
	}
	if p.IsGatewayConnected != nil {
		ps.IsGatewayConnected = *p.IsGatewayConnected
	}
	if err := s.db.WithContext(ctx).Save(&ps).Error; err != nil {
		return nil, err
	}
	return &PaymentSettingsResult{
		CardNumber: ps.CardNumber, IBAN: ps.IBAN, GatewayProvider: ps.GatewayProvider,
		GatewayMerchantID: ps.GatewayMerchantID, GatewayCallbackURL: ps.GatewayCallbackURL,
		IsGatewayConnected: ps.IsGatewayConnected,
	}, nil
}

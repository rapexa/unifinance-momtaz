package services

import (
	"context"
	"errors"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// SettingsService encapsulates settings-related operations (organization, profile, security, notifications, payments).
type SettingsService struct {
	db          *gorm.DB
	userService *UserService
}

func NewSettingsService(db *gorm.DB, userService *UserService) *SettingsService {
	return &SettingsService{
		db:          db,
		userService: userService,
	}
}

// --- Organization (Settings > General) ---

// getUserAndOrgID returns the user and its organization ID, falling back to the first organization if none is set.
func (s *SettingsService) getUserAndOrgID(ctx context.Context, userID uint) (*models.User, uint, error) {
	user, err := s.userService.GetByID(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	if user.OrganizationID != nil {
		return user, *user.OrganizationID, nil
	}

	var org models.Organization
	if err := s.db.WithContext(ctx).First(&org).Error; err != nil {
		return user, 0, err
	}
	return user, org.ID, nil
}

// GetOrganizationSettings returns the organization settings for the current admin's organization.
func (s *SettingsService) GetOrganizationSettings(ctx context.Context, userID uint) (*models.Organization, error) {
	_, orgID, err := s.getUserAndOrgID(ctx, userID)
	if err != nil {
		return nil, err
	}

	var org models.Organization
	if err := s.db.WithContext(ctx).First(&org, orgID).Error; err != nil {
		return nil, err
	}
	return &org, nil
}

type UpdateOrganizationParams struct {
	Name    *string
	Phone   *string
	Address *string
	Email   *string
}

// UpdateOrganizationSettings updates general organization info.
func (s *SettingsService) UpdateOrganizationSettings(ctx context.Context, userID uint, p UpdateOrganizationParams) (*models.Organization, error) {
	_, orgID, err := s.getUserAndOrgID(ctx, userID)
	if err != nil {
		return nil, err
	}

	var org models.Organization
	if err := s.db.WithContext(ctx).First(&org, orgID).Error; err != nil {
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
	return &org, nil
}

// --- Profile (Settings > Profile) ---

type UpdateProfileParams struct {
	FirstName *string
	LastName  *string
	Email     *string
	Phone     *string
	AvatarURL *string
	Bio       *string
}

// GetProfile returns the current user's profile.
func (s *SettingsService) GetProfile(ctx context.Context, userID uint) (*models.User, error) {
	return s.userService.GetByID(ctx, userID)
}

// UpdateProfile updates the current user's profile fields.
func (s *SettingsService) UpdateProfile(ctx context.Context, userID uint, p UpdateProfileParams) (*models.User, error) {
	params := UpdateUserParams{
		FirstName: p.FirstName,
		LastName:  p.LastName,
		Email:     p.Email,
		Phone:     p.Phone,
	}

	user, err := s.userService.Update(ctx, userID, params)
	if err != nil {
		return nil, err
	}

	// AvatarURL and Bio are not handled in UserService; update them directly.
	updated := false
	if p.AvatarURL != nil {
		user.AvatarURL = *p.AvatarURL
		updated = true
	}
	if p.Bio != nil {
		user.Bio = *p.Bio
		updated = true
	}
	if updated {
		if err := s.db.WithContext(ctx).Save(user).Error; err != nil {
			return nil, err
		}
	}

	return user, nil
}

// --- Security (Settings > Security) ---

var (
	ErrCurrentPasswordInvalid = errors.New("current password is incorrect")
	ErrPasswordTooShort       = errors.New("password too short")
)

// ChangePassword verifies the current password and sets a new one.
func (s *SettingsService) ChangePassword(ctx context.Context, userID uint, currentPassword, newPassword string) error {
	if len(newPassword) < 6 {
		return ErrPasswordTooShort
	}

	user, err := s.userService.GetByID(ctx, userID)
	if err != nil {
		return err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(currentPassword)); err != nil {
		return ErrCurrentPasswordInvalid
	}

	user.PlainPassword = newPassword
	if err := s.db.WithContext(ctx).Save(user).Error; err != nil {
		return err
	}
	return nil
}

// SetTwoFactorEnabled toggles the TwoFactorEnabled flag for the current user.
func (s *SettingsService) SetTwoFactorEnabled(ctx context.Context, userID uint, enabled bool) error {
	user, err := s.userService.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	user.TwoFactorEnabled = enabled
	return s.db.WithContext(ctx).Save(user).Error
}

// --- Notifications (Settings > Notifications) ---

// GetNotificationSettings returns all notification settings rows for the user.
func (s *SettingsService) GetNotificationSettings(ctx context.Context, userID uint) ([]models.NotificationSetting, error) {
	var settings []models.NotificationSetting
	if err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Find(&settings).Error; err != nil {
		return nil, err
	}
	return settings, nil
}

type NotificationToggle struct {
	Type    models.NotificationType
	Enabled bool
}

// SetNotificationSettings upserts notification settings for the user.
func (s *SettingsService) SetNotificationSettings(ctx context.Context, userID uint, toggles []NotificationToggle) error {
	for _, t := range toggles {
		var setting models.NotificationSetting
		err := s.db.WithContext(ctx).
			Where("user_id = ? AND type = ?", userID, t.Type).
			First(&setting).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			setting = models.NotificationSetting{
				UserID:  userID,
				Type:    t.Type,
				Enabled: t.Enabled,
			}
			if err := s.db.WithContext(ctx).Create(&setting).Error; err != nil {
				return err
			}
			continue
		} else if err != nil {
			return err
		}

		setting.Enabled = t.Enabled
		if err := s.db.WithContext(ctx).Save(&setting).Error; err != nil {
			return err
		}
	}
	return nil
}

// --- Payment Settings (Settings > Payments) ---

type UpdatePaymentSettingsParams struct {
	CardNumber         *string
	IBAN               *string
	GatewayProvider    *string
	GatewayMerchantID  *string
	GatewayCallbackURL *string
	IsGatewayConnected *bool
}

// GetPaymentSettings returns payment settings for the current organization, creating a default row if needed.
func (s *SettingsService) GetPaymentSettings(ctx context.Context, userID uint) (*models.PaymentSettings, error) {
	_, orgID, err := s.getUserAndOrgID(ctx, userID)
	if err != nil {
		return nil, err
	}

	var ps models.PaymentSettings
	err = s.db.WithContext(ctx).
		Where("organization_id = ?", orgID).
		First(&ps).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		ps = models.PaymentSettings{
			OrganizationID: orgID,
		}
		if err := s.db.WithContext(ctx).Create(&ps).Error; err != nil {
			return nil, err
		}
		return &ps, nil
	} else if err != nil {
		return nil, err
	}

	return &ps, nil
}

// UpdatePaymentSettings updates payment settings for the current organization.
func (s *SettingsService) UpdatePaymentSettings(ctx context.Context, userID uint, p UpdatePaymentSettingsParams) (*models.PaymentSettings, error) {
	ps, err := s.GetPaymentSettings(ctx, userID)
	if err != nil {
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

	if err := s.db.WithContext(ctx).Save(ps).Error; err != nil {
		return nil, err
	}
	return ps, nil
}


package models

import (
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type User struct {
	gorm.Model
	FirstName string `gorm:"size:100;not null"`
	LastName  string `gorm:"size:100;not null"`
	Email     string `gorm:"size:255;not null;uniqueIndex"`
	Phone     string `gorm:"size:20;index"`
	IsActive  bool   `gorm:"not null;default:true;index"`

	RoleID uint  `gorm:"not null;index;default:0"`
	Role   *Role `gorm:"constraint:OnUpdate:CASCADE,OnDelete:RESTRICT;"`

	// Auth & security (Settings > Security tab)
	// Never serialized: raw models.User values are returned by the auth endpoints.
	PasswordHash     string `gorm:"size:255;not null" json:"-"`
	PlainPassword    string `gorm:"-" json:"-"`
	TwoFactorEnabled bool   `gorm:"not null;default:false"`
	// TokensValidFrom invalidates every access token issued before this time.
	// Set on logout and on password reset so old JWTs stop working immediately.
	TokensValidFrom *time.Time `gorm:"" json:"-"`

	// Profile (Settings > Profile)
	AvatarURL string `gorm:"size:512"`
	Bio       string `gorm:"type:text"`

	LastLoginAt    *time.Time
	OrganizationID *uint         `gorm:"index"`
	Organization   *Organization `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	// Relationships
	Students []Student `gorm:"foreignKey:AdvisorID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
	// When a user is deleted, we also delete its payroll entries (they are derived data).
	PayrollEntries []PayrollEntry `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
	// NotificationConfigs holds per-user notification preferences.
	NotificationConfigs []NotificationSetting `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

// BeforeCreate hashes PlainPassword into PasswordHash if provided.
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.PlainPassword != "" {
		hashed, err := bcrypt.GenerateFromPassword([]byte(u.PlainPassword), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		u.PasswordHash = string(hashed)
		u.PlainPassword = ""
	}
	return nil
}

// BeforeUpdate hashes PlainPassword into PasswordHash if provided.
func (u *User) BeforeUpdate(tx *gorm.DB) error {
	if u.PlainPassword != "" {
		hashed, err := bcrypt.GenerateFromPassword([]byte(u.PlainPassword), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		u.PasswordHash = string(hashed)
		u.PlainPassword = ""
	}
	return nil
}

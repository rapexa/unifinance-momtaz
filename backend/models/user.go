package models

import (
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type UserRole string

const (
	UserRoleAdmin      UserRole = "ADMIN"
	UserRoleAccountant UserRole = "ACCOUNTANT"
	UserRoleAdvisor    UserRole = "ADVISOR"
	UserRoleOperator   UserRole = "OPERATOR"
)

type User struct {
	gorm.Model
	FirstName string   `gorm:"size:100;not null"`
	LastName  string   `gorm:"size:100;not null"`
	Email     string   `gorm:"size:255;not null;uniqueIndex"`
	Phone     string   `gorm:"size:20;index"`
	Role      UserRole `gorm:"type:varchar(32);not null;default:'ADVISOR';index"`
	IsActive  bool     `gorm:"not null;default:true;index"`

	// Auth & security (Settings > Security tab)
	PasswordHash     string `gorm:"size:255;not null"`
	PlainPassword    string `gorm:"-"`
	TwoFactorEnabled bool   `gorm:"not null;default:false"`

	// Profile (Settings > Profile)
	AvatarURL string `gorm:"size:512"`
	Bio       string `gorm:"type:text"`

	LastLoginAt    *time.Time
	OrganizationID *uint         `gorm:"index"`
	Organization   *Organization `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

	// Relationships
	// A user (typically an advisor) can have many students assigned via AdvisorID on Student.
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


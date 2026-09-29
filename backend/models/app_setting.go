package models

import "time"

// AppSetting is an installation-wide key/value setting (e.g. the license key pasted in
// the settings page).
type AppSetting struct {
	Key       string `gorm:"primaryKey;size:100"`
	Value     string `gorm:"type:text"`
	UpdatedAt time.Time
}

const (
	AppSettingLicenseKey = "license_key"
	// AppSettingLicenseOwner is "1" when the database existed before licensing was introduced
	// (the owner installation), "0" for installations created afterwards. Set once.
	AppSettingLicenseOwner = "license_owner"
)

package models

import "time"

// AppSetting is an installation-wide key/value setting (e.g. the license key pasted in
// the settings page).
type AppSetting struct {
	Key       string `gorm:"primaryKey;size:100"`
	Value     string `gorm:"type:text"`
	UpdatedAt time.Time
}

const AppSettingLicenseKey = "license_key"

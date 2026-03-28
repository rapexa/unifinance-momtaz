package models

import (
	"time"

	"gorm.io/gorm"
)

type FiscalYearStatus string

const (
	FiscalYearOpen   FiscalYearStatus = "OPEN"
	FiscalYearClosed FiscalYearStatus = "CLOSED"
)

// FiscalYear tracks an accounting period. Only one may be OPEN at a time.
type FiscalYear struct {
	gorm.Model
	Name      string           `gorm:"size:100;not null"`
	StartDate time.Time        `gorm:"not null;index"`
	EndDate   *time.Time       `gorm:"index"`
	Status    FiscalYearStatus `gorm:"type:varchar(20);not null;default:'OPEN';index"`
	ClosedAt  *time.Time
	ExportURL string `gorm:"size:500"`
}

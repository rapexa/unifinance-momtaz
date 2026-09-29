package models

import "time"

// LeadStatus tracks a demo request through the sales process.
type LeadStatus string

const (
	LeadStatusNew       LeadStatus = "NEW"
	LeadStatusContacted LeadStatus = "CONTACTED"
	LeadStatusDemo      LeadStatus = "DEMO"
	LeadStatusWon       LeadStatus = "WON"
	LeadStatusLost      LeadStatus = "LOST"
)

// Lead is a demo/purchase request submitted from the public sales page (vendor mode only).
type Lead struct {
	ID            uint   `gorm:"primaryKey"`
	Name          string `gorm:"size:150;not null"`
	Phone         string `gorm:"size:30;not null;index"`
	Organization  string `gorm:"size:200"`
	City          string `gorm:"size:100"`
	StudentsRange string `gorm:"size:50"`
	Plan          string `gorm:"size:50"`
	// Hosting: CLOUD (on our servers) | ONPREM (customer's server) | UNSURE
	Hosting   string     `gorm:"size:20"`
	Message   string     `gorm:"type:text"`
	Status    LeadStatus `gorm:"size:20;not null;default:NEW;index"`
	Note      string     `gorm:"type:text"`
	IP        string     `gorm:"size:64"`
	UserAgent string     `gorm:"size:255"`
	CreatedAt time.Time  `gorm:"index"`
	UpdatedAt time.Time
}

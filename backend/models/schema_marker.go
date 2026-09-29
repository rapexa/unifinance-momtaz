package models

import "time"

// SchemaMarker records one-off data migrations that must never run twice.
type SchemaMarker struct {
	Name      string `gorm:"primaryKey;size:128"`
	CreatedAt time.Time
}

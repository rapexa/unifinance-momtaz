package models

import "gorm.io/gorm"

// BankAccount is one of the organization's bank accounts / cash boxes.
// Student payments, staff payouts and expenses can be linked to the account the money moved through.
type BankAccount struct {
	gorm.Model
	Title         string `gorm:"size:120;not null"` // e.g. "ملت — حساب اصلی" or "صندوق"
	BankName      string `gorm:"size:80"`
	OwnerName     string `gorm:"size:120"`
	CardNumber    string `gorm:"size:32"`
	AccountNumber string `gorm:"size:40"`
	IBAN          string `gorm:"size:40"`
	// OpeningBalanceCents is the balance when the account was registered in the system.
	OpeningBalanceCents int64 `gorm:"not null;default:0"`
	IsActive            bool  `gorm:"not null;default:true;index"`
	// ShowToStudents shows the card/IBAN on student payment pages and links.
	ShowToStudents bool   `gorm:"not null;default:true"`
	SortOrder      int    `gorm:"not null;default:0"`
	Notes          string `gorm:"size:500"`
}

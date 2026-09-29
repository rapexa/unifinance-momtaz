package services

import (
	"context"
	"errors"
	"strings"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

var (
	ErrBankAccountNotFound     = errors.New("bank account not found")
	ErrBankAccountTitleMissing = errors.New("bank account title is required")
)

// BankAccountWithBalance is an account with its cash movements.
type BankAccountWithBalance struct {
	models.BankAccount
	InflowCents  int64 // PAID student payments deposited to the account
	OutflowCents int64 // staff payouts + expenses paid from the account
	BalanceCents int64 // opening + inflow − outflow
}

// BankAccountService manages the organization's bank accounts.
type BankAccountService struct {
	db *gorm.DB
}

func NewBankAccountService(db *gorm.DB) *BankAccountService {
	return &BankAccountService{db: db}
}

// BankAccountInput is the editable part of a bank account.
type BankAccountInput struct {
	Title               string
	BankName            string
	OwnerName           string
	CardNumber          string
	AccountNumber       string
	IBAN                string
	OpeningBalanceCents int64
	IsActive            bool
	ShowToStudents      bool
	SortOrder           int
	Notes               string
}

func normalizeDigits(s string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(s) {
		switch {
		case r >= '۰' && r <= '۹':
			b.WriteRune('0' + (r - '۰'))
		case r >= '٠' && r <= '٩':
			b.WriteRune('0' + (r - '٠'))
		case r == ' ' || r == '-' || r == '‌':
			// drop separators
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

func (in BankAccountInput) apply(a *models.BankAccount) error {
	title := strings.TrimSpace(in.Title)
	if title == "" {
		title = strings.TrimSpace(in.BankName)
	}
	if title == "" {
		return ErrBankAccountTitleMissing
	}
	a.Title = title
	a.BankName = strings.TrimSpace(in.BankName)
	a.OwnerName = strings.TrimSpace(in.OwnerName)
	a.CardNumber = normalizeDigits(in.CardNumber)
	a.AccountNumber = normalizeDigits(in.AccountNumber)
	iban := strings.ToUpper(normalizeDigits(in.IBAN))
	if iban != "" && !strings.HasPrefix(iban, "IR") {
		iban = "IR" + iban
	}
	a.IBAN = iban
	a.OpeningBalanceCents = in.OpeningBalanceCents
	a.IsActive = in.IsActive
	a.ShowToStudents = in.ShowToStudents
	a.SortOrder = in.SortOrder
	a.Notes = strings.TrimSpace(in.Notes)
	return nil
}

// List returns accounts (optionally only active) with balances.
func (s *BankAccountService) List(ctx context.Context, activeOnly bool) ([]BankAccountWithBalance, error) {
	var rows []models.BankAccount
	q := s.db.WithContext(ctx).Order("sort_order ASC, id ASC")
	if activeOnly {
		q = q.Where("is_active = ?", true)
	}
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	in, err := s.sumByAccount(ctx, `SELECT bank_account_id AS id, COALESCE(SUM(amount_cents),0) AS total
		FROM payments WHERE deleted_at IS NULL AND status = ? AND bank_account_id IS NOT NULL GROUP BY bank_account_id`,
		models.PaymentStatusPaid)
	if err != nil {
		return nil, err
	}
	out1, err := s.sumByAccount(ctx, `SELECT bank_account_id AS id, COALESCE(SUM(amount_cents),0) AS total
		FROM staff_payouts WHERE deleted_at IS NULL AND bank_account_id IS NOT NULL GROUP BY bank_account_id`)
	if err != nil {
		return nil, err
	}
	out2 := map[uint]int64{}
	if s.db.Migrator().HasTable("expenses") {
		out2, err = s.sumByAccount(ctx, `SELECT bank_account_id AS id, COALESCE(SUM(amount_cents),0) AS total
			FROM expenses WHERE deleted_at IS NULL AND bank_account_id IS NOT NULL GROUP BY bank_account_id`)
		if err != nil {
			return nil, err
		}
	}
	out := make([]BankAccountWithBalance, len(rows))
	for i, a := range rows {
		out[i] = BankAccountWithBalance{
			BankAccount:  a,
			InflowCents:  in[a.ID],
			OutflowCents: out1[a.ID] + out2[a.ID],
		}
		out[i].BalanceCents = a.OpeningBalanceCents + out[i].InflowCents - out[i].OutflowCents
	}
	return out, nil
}

func (s *BankAccountService) sumByAccount(ctx context.Context, sql string, args ...interface{}) (map[uint]int64, error) {
	type row struct {
		ID    uint
		Total int64
	}
	var rows []row
	if err := s.db.WithContext(ctx).Raw(sql, args...).Scan(&rows).Error; err != nil {
		return nil, err
	}
	m := make(map[uint]int64, len(rows))
	for _, r := range rows {
		m[r.ID] = r.Total
	}
	return m, nil
}

// PublicAccounts are the active accounts shown to students for card-to-card / bank transfer.
func (s *BankAccountService) PublicAccounts(ctx context.Context) ([]models.BankAccount, error) {
	var rows []models.BankAccount
	err := s.db.WithContext(ctx).
		Where("is_active = ? AND show_to_students = ?", true, true).
		Order("sort_order ASC, id ASC").Find(&rows).Error
	return rows, err
}

func (s *BankAccountService) Create(ctx context.Context, in BankAccountInput) (*models.BankAccount, error) {
	var a models.BankAccount
	if err := in.apply(&a); err != nil {
		return nil, err
	}
	if err := s.db.WithContext(ctx).Create(&a).Error; err != nil {
		return nil, err
	}
	// GORM replaces false with the column default (true) on insert; store the real flags.
	if !in.IsActive || !in.ShowToStudents {
		if err := s.db.WithContext(ctx).Model(&a).Updates(map[string]interface{}{
			"is_active":        in.IsActive,
			"show_to_students": in.ShowToStudents,
		}).Error; err != nil {
			return nil, err
		}
		a.IsActive, a.ShowToStudents = in.IsActive, in.ShowToStudents
	}
	return &a, nil
}

func (s *BankAccountService) Update(ctx context.Context, id uint, in BankAccountInput) (*models.BankAccount, error) {
	var a models.BankAccount
	if err := s.db.WithContext(ctx).First(&a, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrBankAccountNotFound
		}
		return nil, err
	}
	if err := in.apply(&a); err != nil {
		return nil, err
	}
	if err := s.db.WithContext(ctx).Save(&a).Error; err != nil {
		return nil, err
	}
	return &a, nil
}

// Delete removes an account. Linked payments keep their amounts; the link is cleared.
func (s *BankAccountService) Delete(ctx context.Context, id uint) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Unscoped().Delete(&models.BankAccount{}, id)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return ErrBankAccountNotFound
		}
		return nil
	})
}

// Exists reports whether an account id is valid (used to validate links).
func (s *BankAccountService) Exists(ctx context.Context, id uint) bool {
	var n int64
	s.db.WithContext(ctx).Model(&models.BankAccount{}).Where("id = ?", id).Count(&n)
	return n > 0
}

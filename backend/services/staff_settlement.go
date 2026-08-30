package services

import (
	"context"
	"errors"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

var (
	ErrStaffPayoutInvalidAmount = errors.New("payout amount must be positive")
	ErrStaffPayoutInvalidPaidAt = errors.New("invalid payout paid_at")
)

// StaffPayoutRow is one payout line in settlement history.
type StaffPayoutRow struct {
	ID          uint
	AmountCents int64
	PaidAt      time.Time
	Note        string
	CreatedAt   time.Time
}

// StaffSettlementSummary is org ↔ staff settlement (accrued salary vs cash paid out).
type StaffSettlementSummary struct {
	AccruedTotalCents int64
	PaidOutTotalCents int64
	BalanceCents      int64 // positive = org owes staff; negative = org overpaid staff
	Payouts           []StaffPayoutRow
}

// ComputeStaffSettlementBalance returns accrued − paid (positive means org owes staff).
func ComputeStaffSettlementBalance(accruedCents, paidOutCents int64) int64 {
	return accruedCents - paidOutCents
}

// refreshPendingEntriesFromShares ensures pending payslips reflect payment shares for this user.
func (s *PayrollService) refreshPendingEntriesFromShares(ctx context.Context, userID uint) error {
	type periodRow struct {
		Year  int
		Month int
	}
	var periods []periodRow
	err := s.db.WithContext(ctx).Raw(`
		SELECT DISTINCT YEAR(p.paid_at) AS year, MONTH(p.paid_at) AS month
		FROM payment_payroll_shares pps
		INNER JOIN payments p ON p.id = pps.payment_id AND p.deleted_at IS NULL
		WHERE pps.user_id = ? AND pps.deleted_at IS NULL
		  AND p.status = ? AND p.paid_at IS NOT NULL
	`, userID, models.PaymentStatusPaid).Scan(&periods).Error
	if err != nil {
		return err
	}
	for _, pr := range periods {
		if pr.Year < 1 || pr.Month < 1 || pr.Month > 12 {
			continue
		}
		var entry models.PayrollEntry
		eErr := s.db.WithContext(ctx).
			Where("user_id = ? AND period_year = ? AND period_month = ?", userID, pr.Year, pr.Month).
			First(&entry).Error
		if errors.Is(eErr, gorm.ErrRecordNotFound) {
			if _, _, rErr := s.RecalculateUserPeriod(ctx, userID, pr.Year, pr.Month); rErr != nil &&
				!errors.Is(rErr, ErrPayrollEntryPaidLocked) {
				return rErr
			}
			continue
		}
		if eErr != nil {
			return eErr
		}
		if entry.Status == models.PayrollStatusPending {
			if _, _, rErr := s.RecalculateUserPeriod(ctx, userID, pr.Year, pr.Month); rErr != nil &&
				!errors.Is(rErr, ErrPayrollEntryPaidLocked) {
				return rErr
			}
		}
	}
	return nil
}

func (s *PayrollService) sumAccruedSalaryCents(ctx context.Context, userID uint) (int64, error) {
	var total int64
	err := s.db.WithContext(ctx).Model(&models.PayrollEntry{}).
		Where("user_id = ?", userID).
		Select("COALESCE(SUM(total_salary_cents), 0)").
		Scan(&total).Error
	return total, err
}

func (s *PayrollService) sumStaffPayoutCents(ctx context.Context, userID uint) (int64, error) {
	var total int64
	err := s.db.WithContext(ctx).Model(&models.StaffPayout{}).
		Where("user_id = ?", userID).
		Select("COALESCE(SUM(amount_cents), 0)").
		Scan(&total).Error
	return total, err
}

// GetStaffSettlement returns accrued salary, payouts and balance for one staff user.
func (s *PayrollService) GetStaffSettlement(ctx context.Context, userID uint, scopeUser *uint) (*StaffSettlementSummary, error) {
	if scopeUser != nil && *scopeUser != userID {
		return nil, ErrPayrollForbidden
	}
	var u models.User
	if err := s.db.WithContext(ctx).First(&u, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPayrollUserNotFound
		}
		return nil, err
	}
	if err := s.refreshPendingEntriesFromShares(ctx, userID); err != nil {
		return nil, err
	}
	accrued, err := s.sumAccruedSalaryCents(ctx, userID)
	if err != nil {
		return nil, err
	}
	paidOut, err := s.sumStaffPayoutCents(ctx, userID)
	if err != nil {
		return nil, err
	}
	var rows []models.StaffPayout
	if err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("paid_at DESC, id DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	payouts := make([]StaffPayoutRow, len(rows))
	for i, r := range rows {
		payouts[i] = StaffPayoutRow{
			ID:          r.ID,
			AmountCents: r.AmountCents,
			PaidAt:      r.PaidAt,
			Note:        r.Note,
			CreatedAt:   r.CreatedAt,
		}
	}
	return &StaffSettlementSummary{
		AccruedTotalCents: accrued,
		PaidOutTotalCents: paidOut,
		BalanceCents:      ComputeStaffSettlementBalance(accrued, paidOut),
		Payouts:           payouts,
	}, nil
}

// CreateStaffPayoutParams is input for recording a cash payout to staff.
type CreateStaffPayoutParams struct {
	UserID      uint
	AmountCents int64
	PaidAt      time.Time
	Note        string
	CreatedByID *uint
}

// CreateStaffPayout records a cash payment from the organization to a staff member.
func (s *PayrollService) CreateStaffPayout(ctx context.Context, p CreateStaffPayoutParams, scopeUser *uint) (*models.StaffPayout, error) {
	if scopeUser != nil && *scopeUser != p.UserID {
		return nil, ErrPayrollForbidden
	}
	if p.AmountCents <= 0 {
		return nil, ErrStaffPayoutInvalidAmount
	}
	if p.PaidAt.IsZero() {
		return nil, ErrStaffPayoutInvalidPaidAt
	}
	var u models.User
	if err := s.db.WithContext(ctx).First(&u, p.UserID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPayrollUserNotFound
		}
		return nil, err
	}
	row := models.StaffPayout{
		UserID:      p.UserID,
		AmountCents: p.AmountCents,
		PaidAt:      p.PaidAt,
		Note:        p.Note,
		CreatedByID: p.CreatedByID,
	}
	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

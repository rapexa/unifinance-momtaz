package services

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/soheilsshh/unifinance-momtaz/models"
	"gorm.io/gorm"
)

// Staff settlement ledger ("پرداخت به مشاوران / کارکنان")
//
// Every month a staff member earns (accrues) salary: fixed base + shares of PAID student
// payments + monthly slices of annual contracts. Every cash payout reduces what the
// organization owes. The balance runs across months:
//
//	closing(month) = opening(month) + accrued(month) − paid(month)
//	opening(month) = closing(previous month)
//
// closing > 0 → organization still owes the staff member (carried to next month).
// closing < 0 → staff member was overpaid and owes the organization until the next accrual.
//
// Payouts settle months oldest-first (FIFO); a payslip is PAID when cumulative payouts cover
// the cumulative accrual through that month. Late student payments therefore never get lost:
// they raise that month's accrual and show up as an outstanding balance.

var (
	ErrStaffPayoutInvalidAmount = errors.New("payout amount must be positive")
	ErrStaffPayoutInvalidPaidAt = errors.New("invalid payout paid_at")
	ErrStaffPayoutNotFound      = errors.New("payout not found")
	ErrPayslipHasNoPayout       = errors.New("payslip is settled by other payouts")
)

// maxLedgerMonths bounds how far back a ledger recomputes months.
const maxLedgerMonths = 60

// StaffPayoutRow is one payout line in settlement history.
type StaffPayoutRow struct {
	ID             uint
	AmountCents    int64
	PaidAt         time.Time
	Note           string
	Source         string
	PayrollEntryID *uint
	CreatedAt      time.Time
}

// StaffLedgerMonth is one month of the running settlement balance.
type StaffLedgerMonth struct {
	PeriodYear          int
	PeriodMonth         int
	EntryID             *uint
	BaseSalaryCents     int64
	VariableSalaryCents int64
	OpeningCents        int64 // carried from previous month (+ org owes, − staff owes)
	AccruedCents        int64 // earned this month
	PaidCents           int64 // payouts dated in this month
	ClosingCents        int64 // opening + accrued − paid
	Settled             bool  // cumulative payouts cover cumulative accrual through this month
	SettledAt           *time.Time
}

// StaffLedger is the full settlement picture for one staff user.
type StaffLedger struct {
	UserID            uint
	Months            []StaffLedgerMonth // ascending
	TotalAccruedCents int64
	TotalPaidCents    int64
	BalanceCents      int64 // positive = org owes staff; negative = staff owes org
	Payouts           []StaffPayoutRow
}

// MonthAt returns the ledger month for a period key (zero row with carried balance if outside range).
func (l *StaffLedger) MonthAt(year, month int) StaffLedgerMonth {
	if l == nil {
		return StaffLedgerMonth{PeriodYear: year, PeriodMonth: month}
	}
	idx := PeriodIndex(year, month)
	var last *StaffLedgerMonth
	for i := range l.Months {
		m := &l.Months[i]
		mi := PeriodIndex(m.PeriodYear, m.PeriodMonth)
		if mi == idx {
			return *m
		}
		if mi < idx {
			last = m
		}
	}
	out := StaffLedgerMonth{PeriodYear: year, PeriodMonth: month}
	if last != nil {
		out.OpeningCents = last.ClosingCents
		out.ClosingCents = last.ClosingCents
	}
	return out
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

type ledgerAccrual struct {
	EntryID  *uint
	Base     int64
	Variable int64
}

type ledgerPayout struct {
	AmountCents int64
	PaidAt      time.Time
}

// BuildLedgerMonths computes the running balance month by month.
// accruals and payouts are keyed by period index; months span [fromIdx, toIdx].
// openingCents is the balance carried in before fromIdx. Payouts must be sorted by PaidAt.
func BuildLedgerMonths(fromY, fromM, toY, toM int, openingCents int64, accruals map[int]ledgerAccrual, payouts []ledgerPayout) []StaffLedgerMonth {
	fromIdx := PeriodIndex(fromY, fromM)
	toIdx := PeriodIndex(toY, toM)
	if toIdx < fromIdx {
		return nil
	}

	paidByMonth := map[int]int64{}
	for _, p := range payouts {
		y, m := PeriodOf(p.PaidAt)
		idx := PeriodIndex(y, m)
		if idx < fromIdx {
			idx = fromIdx
		}
		paidByMonth[idx] += p.AmountCents
	}

	// FIFO settlement: running payout total vs cumulative target.
	// An opening credit (negative opening) behaves like an earlier payout.
	creditStart := int64(0)
	target := openingCents
	if openingCents < 0 {
		creditStart = -openingCents
		target = 0
	}

	out := make([]StaffLedgerMonth, 0, toIdx-fromIdx+1)
	balance := openingCents
	y, m := fromY, fromM
	for idx := fromIdx; idx <= toIdx; idx++ {
		a := accruals[idx]
		accrued := a.Base + a.Variable
		paid := paidByMonth[idx]
		row := StaffLedgerMonth{
			PeriodYear:          y,
			PeriodMonth:         m,
			EntryID:             a.EntryID,
			BaseSalaryCents:     a.Base,
			VariableSalaryCents: a.Variable,
			OpeningCents:        balance,
			AccruedCents:        accrued,
			PaidCents:           paid,
		}
		balance = balance + accrued - paid
		row.ClosingCents = balance
		target += accrued
		if accrued > 0 {
			running := creditStart
			if running >= target {
				row.Settled = true
				start, _ := PeriodBounds(y, m)
				row.SettledAt = &start
			} else {
				for _, p := range payouts {
					running += p.AmountCents
					if running >= target {
						row.Settled = true
						t := p.PaidAt
						row.SettledAt = &t
						break
					}
				}
			}
		}
		out = append(out, row)
		y, m = PeriodAdd(y, m, 1)
	}
	return out
}

// ledgerSyncFrom returns the first period whose payslip the ledger recomputes for a user.
func (s *PayrollService) ledgerSyncFrom(ctx context.Context, u *models.User, toY, toM int) (int, int, error) {
	fromY, fromM := PeriodOf(u.CreatedAt)

	var firstShare sql.NullTime
	if err := s.db.WithContext(ctx).Raw(`
SELECT MIN(p.paid_at) FROM payment_payroll_shares pps
INNER JOIN payments p ON p.id = pps.payment_id AND p.deleted_at IS NULL
WHERE pps.deleted_at IS NULL AND pps.user_id = ? AND p.status = ? AND p.paid_at IS NOT NULL
`, u.ID, models.PaymentStatusPaid).Scan(&firstShare).Error; err != nil {
		return 0, 0, err
	}
	if firstShare.Valid {
		if y, m := PeriodOf(firstShare.Time); PeriodIndex(y, m) < PeriodIndex(fromY, fromM) {
			fromY, fromM = y, m
		}
	}
	var firstJoin sql.NullTime
	if err := s.db.WithContext(ctx).Raw(`
SELECT MIN(join_date) FROM students
WHERE deleted_at IS NULL AND advisor_id = ? AND enrollment_billing_mode = ? AND status = ? AND join_date IS NOT NULL
`, u.ID, models.EnrollmentBillingSchoolEnrollment, models.StudentStatusActive).Scan(&firstJoin).Error; err != nil {
		return 0, 0, err
	}
	if firstJoin.Valid {
		if y, m := PeriodOf(firstJoin.Time); PeriodIndex(y, m) < PeriodIndex(fromY, fromM) {
			fromY, fromM = y, m
		}
	}

	if fyIdx, ok := s.openFiscalYearStartIndex(ctx); ok && PeriodIndex(fromY, fromM) < fyIdx {
		fromY, fromM = periodFromIndex(fyIdx)
	}
	if PeriodIndex(toY, toM)-PeriodIndex(fromY, fromM) >= maxLedgerMonths {
		fromY, fromM = PeriodAdd(toY, toM, -(maxLedgerMonths - 1))
	}
	return fromY, fromM, nil
}

// syncEntryAmounts creates or refreshes one payslip from role rules and payments.
// Months that have passed keep their stored fixed base (role changes are not retroactive);
// shares always refresh so late student payments are never lost. Manual overrides are kept.
func (s *PayrollService) syncEntryAmounts(ctx context.Context, cc *compContext, entry *models.PayrollEntry, year, month, currentIdx int) (*models.PayrollEntry, error) {
	if entry != nil && entry.ManualOverride {
		return entry, nil
	}
	br, err := s.computeCompensation(ctx, cc, year, month)
	if err != nil {
		return nil, err
	}
	if entry == nil {
		if br.BaseSalaryCents == 0 && br.VariableSalaryCents == 0 {
			return nil, nil
		}
		return s.CreateEntry(ctx, CreateEntryParams{
			UserID:              cc.user.ID,
			PeriodYear:          year,
			PeriodMonth:         month,
			BaseSalaryCents:     br.BaseSalaryCents,
			VariableSalaryCents: br.VariableSalaryCents,
			StudentsCount:       br.StudentsCount,
			StudentsCountSet:    true,
			Status:              models.PayrollStatusPending,
		})
	}
	base := br.BaseSalaryCents
	if PeriodIndex(year, month) < currentIdx {
		base = entry.BaseSalaryCents
	}
	if base == entry.BaseSalaryCents && br.VariableSalaryCents == entry.VariableSalaryCents {
		return entry, nil
	}
	entry.BaseSalaryCents = base
	entry.VariableSalaryCents = br.VariableSalaryCents
	entry.TotalSalaryCents = base + br.VariableSalaryCents
	if err := s.db.WithContext(ctx).Model(&models.PayrollEntry{}).Where("id = ?", entry.ID).Updates(map[string]interface{}{
		"base_salary_cents":     entry.BaseSalaryCents,
		"variable_salary_cents": entry.VariableSalaryCents,
		"total_salary_cents":    entry.TotalSalaryCents,
	}).Error; err != nil {
		return nil, err
	}
	return entry, nil
}

// SyncStaffLedger recomputes a user's payslips from the first relevant month through
// (at least) the given period, applies payouts FIFO, stores derived PAID/PENDING statuses,
// and returns the ledger.
func (s *PayrollService) SyncStaffLedger(ctx context.Context, userID uint, uptoY, uptoM int) (*StaffLedger, error) {
	cc, err := s.loadCompContext(ctx, userID)
	if err != nil {
		if errors.Is(err, ErrPayrollNoRole) {
			return s.buildStaffLedger(ctx, userID, uptoY, uptoM, nil)
		}
		return nil, err
	}
	return s.buildStaffLedger(ctx, userID, uptoY, uptoM, cc)
}

// GetStaffLedger returns the ledger without recomputing payslip amounts (statuses are refreshed).
func (s *PayrollService) GetStaffLedger(ctx context.Context, userID uint, uptoY, uptoM int) (*StaffLedger, error) {
	return s.buildStaffLedger(ctx, userID, uptoY, uptoM, nil)
}

func (s *PayrollService) buildStaffLedger(ctx context.Context, userID uint, uptoY, uptoM int, cc *compContext) (*StaffLedger, error) {
	nowY, nowM := DefaultPeriod(time.Now())
	currentIdx := PeriodIndex(nowY, nowM)
	toY, toM := nowY, nowM
	if uptoY > 0 && uptoM >= 1 && uptoM <= 12 && PeriodIndex(uptoY, uptoM) > currentIdx {
		toY, toM = uptoY, uptoM
	}

	var payoutRows []models.StaffPayout
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).
		Order("paid_at ASC, id ASC").Find(&payoutRows).Error; err != nil {
		return nil, err
	}
	for _, p := range payoutRows {
		if y, m := PeriodOf(p.PaidAt); PeriodIndex(y, m) > PeriodIndex(toY, toM) {
			toY, toM = y, m
		}
	}

	syncFromIdx := PeriodIndex(toY, toM) + 1 // nothing to sync without a role
	if cc != nil {
		fy, fm, err := s.ledgerSyncFrom(ctx, &cc.user, toY, toM)
		if err != nil {
			return nil, err
		}
		syncFromIdx = PeriodIndex(fy, fm)
	}

	var entries []models.PayrollEntry
	if err := s.db.WithContext(ctx).Where("user_id = ?", userID).
		Order("period_year ASC, period_month ASC").Find(&entries).Error; err != nil {
		return nil, err
	}
	byIdx := make(map[int]*models.PayrollEntry, len(entries))
	fromIdx := syncFromIdx
	for i := range entries {
		e := &entries[i]
		idx := PeriodIndex(e.PeriodYear, e.PeriodMonth)
		byIdx[idx] = e
		if idx < fromIdx {
			fromIdx = idx
		}
	}
	for _, p := range payoutRows {
		if idx := PeriodIndex(PeriodOf(p.PaidAt)); idx < fromIdx {
			fromIdx = idx
		}
	}
	if fromIdx > PeriodIndex(toY, toM) {
		fromIdx = PeriodIndex(toY, toM)
	}
	fromY, fromM := periodFromIndex(fromIdx)

	if cc != nil {
		for idx := syncFromIdx; idx <= PeriodIndex(toY, toM); idx++ {
			y, m := periodFromIndex(idx)
			e, err := s.syncEntryAmounts(ctx, cc, byIdx[idx], y, m, currentIdx)
			if err != nil {
				return nil, err
			}
			if e != nil {
				byIdx[idx] = e
			}
		}
	}

	accruals := make(map[int]ledgerAccrual, len(byIdx))
	for idx, e := range byIdx {
		id := e.ID
		accruals[idx] = ledgerAccrual{EntryID: &id, Base: e.BaseSalaryCents, Variable: e.VariableSalaryCents}
	}
	payouts := make([]ledgerPayout, len(payoutRows))
	for i, p := range payoutRows {
		payouts[i] = ledgerPayout{AmountCents: p.AmountCents, PaidAt: p.PaidAt}
	}
	months := BuildLedgerMonths(fromY, fromM, toY, toM, 0, accruals, payouts)

	// Persist derived statuses on payslips.
	for _, row := range months {
		e := byIdx[PeriodIndex(row.PeriodYear, row.PeriodMonth)]
		if e == nil {
			continue
		}
		want := models.PayrollStatusPending
		var wantPaidAt *time.Time
		if row.Settled {
			want = models.PayrollStatusPaid
			wantPaidAt = row.SettledAt
		}
		if e.Status == want && sameTimePtr(e.PaidAt, wantPaidAt) {
			continue
		}
		if err := s.db.WithContext(ctx).Model(&models.PayrollEntry{}).Where("id = ?", e.ID).
			Updates(map[string]interface{}{"status": want, "paid_at": wantPaidAt}).Error; err != nil {
			return nil, err
		}
		e.Status = want
		e.PaidAt = wantPaidAt
	}

	ledger := &StaffLedger{UserID: userID, Months: months}
	for _, row := range months {
		ledger.TotalAccruedCents += row.AccruedCents
		ledger.TotalPaidCents += row.PaidCents
	}
	ledger.BalanceCents = ledger.TotalAccruedCents - ledger.TotalPaidCents
	ledger.Payouts = make([]StaffPayoutRow, 0, len(payoutRows))
	for i := len(payoutRows) - 1; i >= 0; i-- {
		r := payoutRows[i]
		ledger.Payouts = append(ledger.Payouts, StaffPayoutRow{
			ID:             r.ID,
			AmountCents:    r.AmountCents,
			PaidAt:         r.PaidAt,
			Note:           r.Note,
			Source:         r.Source,
			PayrollEntryID: r.PayrollEntryID,
			CreatedAt:      r.CreatedAt,
		})
	}
	return ledger, nil
}

func periodFromIndex(idx int) (int, int) {
	y, m := idx/12, idx%12
	if m == 0 {
		return y - 1, 12
	}
	return y, m
}

func sameTimePtr(a, b *time.Time) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return a.Equal(*b)
}

// StaffBalanceRow is one staff member's settlement position for a period (payroll list columns).
type StaffBalanceRow struct {
	OpeningCents int64
	AccruedCents int64
	PaidCents    int64
	ClosingCents int64 // balance at end of the period
	BalanceCents int64 // overall balance today (all months, all payouts)
}

// StaffBalancesForPeriod returns ledger positions for several users without recomputing amounts.
func (s *PayrollService) StaffBalancesForPeriod(ctx context.Context, userIDs []uint, year, month int) (map[uint]StaffBalanceRow, error) {
	out := make(map[uint]StaffBalanceRow, len(userIDs))
	for _, uid := range userIDs {
		l, err := s.GetStaffLedger(ctx, uid, year, month)
		if err != nil {
			return nil, err
		}
		m := l.MonthAt(year, month)
		out[uid] = StaffBalanceRow{
			OpeningCents: m.OpeningCents,
			AccruedCents: m.AccruedCents,
			PaidCents:    m.PaidCents,
			ClosingCents: m.ClosingCents,
			BalanceCents: l.BalanceCents,
		}
	}
	return out, nil
}

// SyncAllStaffLedgers recomputes every active staff ledger through the given period.
func (s *PayrollService) SyncAllStaffLedgers(ctx context.Context, year, month int) error {
	var ids []uint
	if err := s.db.WithContext(ctx).Model(&models.User{}).
		Where("is_active = ? AND role_id IS NOT NULL AND role_id > 0", true).
		Pluck("id", &ids).Error; err != nil {
		return err
	}
	for _, id := range ids {
		if _, err := s.SyncStaffLedger(ctx, id, year, month); err != nil &&
			!errors.Is(err, ErrPayrollUserNotFound) {
			return err
		}
	}
	return nil
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
	l, err := s.SyncStaffLedger(ctx, userID, 0, 0)
	if err != nil {
		return nil, err
	}
	return &StaffSettlementSummary{
		AccruedTotalCents: l.TotalAccruedCents,
		PaidOutTotalCents: l.TotalPaidCents,
		BalanceCents:      l.BalanceCents,
		Payouts:           l.Payouts,
	}, nil
}

// CreateStaffPayoutParams is input for recording a cash payout to staff.
type CreateStaffPayoutParams struct {
	UserID         uint
	AmountCents    int64
	PaidAt         time.Time
	Note           string
	CreatedByID    *uint
	PayrollEntryID *uint
	Source         string
}

// CreateStaffPayout records a cash payment from the organization to a staff member.
func (s *PayrollService) CreateStaffPayout(ctx context.Context, p CreateStaffPayoutParams, scopeUser *uint) (*models.StaffPayout, error) {
	if scopeUser != nil {
		// Only unscoped (admin) users may move money in the staff ledger.
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
	source := strings.TrimSpace(p.Source)
	if source == "" {
		source = models.StaffPayoutSourceManual
	}
	row := models.StaffPayout{
		UserID:         p.UserID,
		AmountCents:    p.AmountCents,
		PaidAt:         p.PaidAt,
		Note:           p.Note,
		CreatedByID:    p.CreatedByID,
		PayrollEntryID: p.PayrollEntryID,
		Source:         source,
	}
	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		return nil, err
	}
	if _, err := s.GetStaffLedger(ctx, p.UserID, 0, 0); err != nil {
		return nil, err
	}
	return &row, nil
}

// DeleteStaffPayout removes a payout (admin correction) and refreshes payslip statuses.
func (s *PayrollService) DeleteStaffPayout(ctx context.Context, payoutID uint, scopeUser *uint) error {
	if scopeUser != nil {
		return ErrPayrollForbidden
	}
	var row models.StaffPayout
	if err := s.db.WithContext(ctx).First(&row, payoutID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrStaffPayoutNotFound
		}
		return err
	}
	if err := s.db.WithContext(ctx).Delete(&models.StaffPayout{}, payoutID).Error; err != nil {
		return err
	}
	_, err := s.GetStaffLedger(ctx, row.UserID, 0, 0)
	return err
}

// PayslipOutstandingCents is what must be paid now so that every month up to and including
// the payslip's month is settled (cumulative accrual − all payouts so far; never negative).
func (s *PayrollService) PayslipOutstandingCents(ctx context.Context, entry *models.PayrollEntry) (int64, error) {
	l, err := s.SyncStaffLedger(ctx, entry.UserID, entry.PeriodYear, entry.PeriodMonth)
	if err != nil {
		return 0, err
	}
	var cumAccrued int64
	target := PeriodIndex(entry.PeriodYear, entry.PeriodMonth)
	for _, m := range l.Months {
		if PeriodIndex(m.PeriodYear, m.PeriodMonth) <= target {
			cumAccrued += m.AccruedCents
		}
	}
	due := cumAccrued - l.TotalPaidCents
	if due < 0 {
		due = 0
	}
	return due, nil
}

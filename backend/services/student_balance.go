package services

import (
	"context"
	"fmt"

	"github.com/soheilsshh/unifinance-momtaz/access"
	"github.com/soheilsshh/unifinance-momtaz/models"
)

// EffectiveEnrollmentCents returns the contract/enrollment amount used for balance math.
func EffectiveEnrollmentCents(st *models.Student) int64 {
	if st == nil {
		return 0
	}
	if st.EnrollmentAmountCents > 0 {
		return st.EnrollmentAmountCents
	}
	if len(st.Enrollments) > 0 {
		return st.Enrollments[0].PriceCents
	}
	return 0
}

// RemainingBalanceCents matches the student list: enrollment − paid, or open charges when no enrollment.
func RemainingBalanceCents(st *models.Student, paidSum, openSum int64) int64 {
	enroll := EffectiveEnrollmentCents(st)
	if enroll > 0 {
		return enroll - paidSum
	}
	return openSum
}

// StudentDebtCents is the positive amount a student still owes (0 if settled or prepaid).
func StudentDebtCents(st *models.Student, paidSum, openSum int64) int64 {
	rem := RemainingBalanceCents(st, paidSum, openSum)
	if rem > 0 {
		return rem
	}
	return 0
}

type StudentDebtByAdvisor struct {
	AdvisorID   uint
	AdvisorName string
	DebtCents   int64
}

type ActiveStudentDebtRow struct {
	StudentID    uint
	StudentName  string
	AdvisorName  string
	DebtCents    int64
	LedgerCents  int64 // negative for API/report compatibility (debt shown as -remaining)
}

func (s *PaymentService) loadActiveStudentsForDebt(ctx context.Context, scopeUser *uint) ([]models.Student, error) {
	var students []models.Student
	q := s.db.WithContext(ctx).
		Preload("Enrollments", "status = ?", models.EnrollmentStatusActive).
		Preload("Advisor").
		Where("students.status = ?", models.StudentStatusActive)
	if scopeUser != nil {
		q = access.ScopeStudentRows(q, *scopeUser)
	}
	if err := q.Find(&students).Error; err != nil {
		return nil, err
	}
	return students, nil
}

func (s *PaymentService) SumActiveStudentDebtCents(ctx context.Context, scopeUser *uint) (int64, error) {
	students, err := s.loadActiveStudentsForDebt(ctx, scopeUser)
	if err != nil {
		return 0, err
	}
	if len(students) == 0 {
		return 0, nil
	}
	ids := make([]uint, len(students))
	for i := range students {
		ids[i] = students[i].ID
	}
	paid, open, err := s.PaymentTotalsByStudentIDs(ctx, ids)
	if err != nil {
		return 0, err
	}
	var sum int64
	for i := range students {
		sum += StudentDebtCents(&students[i], paid[students[i].ID], open[students[i].ID])
	}
	return sum, nil
}

func (s *PaymentService) CountActiveStudentDebtors(ctx context.Context, scopeUser *uint) (int64, error) {
	students, err := s.loadActiveStudentsForDebt(ctx, scopeUser)
	if err != nil {
		return 0, err
	}
	if len(students) == 0 {
		return 0, nil
	}
	ids := make([]uint, len(students))
	for i := range students {
		ids[i] = students[i].ID
	}
	paid, open, err := s.PaymentTotalsByStudentIDs(ctx, ids)
	if err != nil {
		return 0, err
	}
	var count int64
	for i := range students {
		if StudentDebtCents(&students[i], paid[students[i].ID], open[students[i].ID]) > 0 {
			count++
		}
	}
	return count, nil
}

func (s *PaymentService) ActiveStudentDebtsByAdvisor(ctx context.Context, scopeUser *uint) ([]StudentDebtByAdvisor, error) {
	students, err := s.loadActiveStudentsForDebt(ctx, scopeUser)
	if err != nil {
		return nil, err
	}
	if len(students) == 0 {
		return nil, nil
	}
	ids := make([]uint, len(students))
	for i := range students {
		ids[i] = students[i].ID
	}
	paid, open, err := s.PaymentTotalsByStudentIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	byAdvisor := map[uint]*StudentDebtByAdvisor{}
	for i := range students {
		st := &students[i]
		debt := StudentDebtCents(st, paid[st.ID], open[st.ID])
		if debt <= 0 {
			continue
		}
		aid := uint(0)
		name := "بدون مشاور"
		if st.AdvisorID != nil && st.Advisor != nil && st.Advisor.ID != 0 {
			aid = *st.AdvisorID
			name = fmt.Sprintf("%s %s", st.Advisor.FirstName, st.Advisor.LastName)
		}
		row, ok := byAdvisor[aid]
		if !ok {
			row = &StudentDebtByAdvisor{AdvisorID: aid, AdvisorName: name}
			byAdvisor[aid] = row
		}
		row.DebtCents += debt
	}
	out := make([]StudentDebtByAdvisor, 0, len(byAdvisor))
	for _, row := range byAdvisor {
		out = append(out, *row)
	}
	// simple sort by debt desc
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j].DebtCents > out[i].DebtCents {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out, nil
}

func (s *PaymentService) ActiveStudentDebtDetails(ctx context.Context, scopeUser *uint) ([]ActiveStudentDebtRow, error) {
	students, err := s.loadActiveStudentsForDebt(ctx, scopeUser)
	if err != nil {
		return nil, err
	}
	if len(students) == 0 {
		return nil, nil
	}
	ids := make([]uint, len(students))
	for i := range students {
		ids[i] = students[i].ID
	}
	paid, open, err := s.PaymentTotalsByStudentIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make([]ActiveStudentDebtRow, 0)
	for i := range students {
		st := &students[i]
		debt := StudentDebtCents(st, paid[st.ID], open[st.ID])
		if debt <= 0 {
			continue
		}
		adv := ""
		if st.Advisor != nil {
			adv = fmt.Sprintf("%s %s", st.Advisor.FirstName, st.Advisor.LastName)
		}
		out = append(out, ActiveStudentDebtRow{
			StudentID:   st.ID,
			StudentName: fmt.Sprintf("%s %s", st.FirstName, st.LastName),
			AdvisorName: adv,
			DebtCents:   debt,
			LedgerCents: -debt,
		})
	}
	return out, nil
}

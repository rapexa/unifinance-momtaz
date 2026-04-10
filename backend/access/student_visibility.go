package access

import "gorm.io/gorm"

// StudentVisibleToUserSQL restricts rows on table `students` (alias must be `students`).
const StudentVisibleToUserSQL = `(students.advisor_id = ? OR EXISTS (
	SELECT 1 FROM student_role_payouts srp
	WHERE srp.student_id = students.id AND srp.user_id = ? AND srp.deleted_at IS NULL
))`

// ScopeStudentRows restricts a query on table `students` (models.Student).
func ScopeStudentRows(db *gorm.DB, userID uint) *gorm.DB {
	return db.Where(StudentVisibleToUserSQL, userID, userID)
}

// PaymentJoinStudentVisibleSQL is the same visibility rule when `students` is joined on payments.student_id = students.id.
func PaymentJoinStudentVisibleSQL() string {
	return StudentVisibleToUserSQL
}

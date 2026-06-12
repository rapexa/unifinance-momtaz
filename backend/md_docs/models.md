## Models Overview

This document describes all backend models in `backend/models/`, their fields, and relationships.

Models:

- `Organization`
- `User`
- `Student`
- `Plan`, `PlanFeature`
- `Enrollment`
- `Payment`
- `PayrollEntry`, `PayrollScheme`
- `ReminderRule`, `PaymentReminder`
- `PaymentSettings`, `NotificationSetting`

---

## Organization

**File**: `models/organization.go`

Represents the consulting group / institute (Settings > General).

```go
type Organization struct {
  gorm.Model
  Name    string
  Phone   string
  Address string
  Email   string

  Users     []User
  Students  []Student
  Plans     []Plan
  Settings  []PaymentSettings
  Reminders []ReminderRule
}
```

- **Relationships**:
  - `Organization` **has many** `User` via `User.OrganizationID`.
  - `Organization` **has many** `Student` via `Student.OrganizationID`.
  - `Organization` **has many** `Plan` via `Plan.OrganizationID`.
  - `Organization` **has many** `PaymentSettings` via `PaymentSettings.OrganizationID`.
  - `Organization` **has many** `ReminderRule` via `ReminderRule.OrganizationID`.
- **Constraints**:
  - On children, `constraint` tags specify cascade or set-null behavior.

Sample JSON snippet:

```json
{
  "id": 1,
  "name": "گروه مشاوره تحصیلی و روانشناسی",
  "phone": "021-88888888",
  "email": "info@example.com"
}
```

---

## User

**File**: `models/user.go`

Represents system users: admin, accountant, advisor, operator (Users page & Settings).

```go
type User struct {
  gorm.Model
  FirstName string
  LastName  string
  Email     string `gorm:"uniqueIndex"`
  Phone     string
  Role      UserRole
  IsActive  bool

  PasswordHash     string
  PlainPassword    string `gorm:"-"`
  TwoFactorEnabled bool

  AvatarURL string
  Bio       string

  LastLoginAt    *time.Time
  OrganizationID *uint         `gorm:"index"`
  Organization   *Organization `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

  Students            []Student            `gorm:"foreignKey:AdvisorID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
  PayrollEntries      []PayrollEntry       `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
  NotificationConfigs []NotificationSetting `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}
```

- **Relationships**:
  - `User` **belongs to** `Organization`.
  - `User` **has many** `Student` where `Student.AdvisorID` points to `User.ID`.
  - `User` **has many** `PayrollEntry` via `PayrollEntry.UserID`.
  - `User` **has many** `NotificationSetting` via `NotificationSetting.UserID`.
- **Hooks**:
  - `BeforeCreate` / `BeforeUpdate` hash `PlainPassword` into `PasswordHash` using bcrypt.
- **Security**:
  - Passwords never stored in plain text.
  - Email unique index prevents duplicates.

Example JSON (API response):

```json
{
  "id": 1,
  "first_name": "مدیر",
  "last_name": "سیستم",
  "email": "admin@example.com",
  "role": "ADMIN",
  "is_active": true
}
```

---

## Student

**File**: `models/student.go`

Represents students/clients managed in `/students`, `/payments`, `/reminders`.

```go
type Student struct {
  gorm.Model
  FirstName string
  LastName  string
  Email     string `gorm:"index"`
  Phone     string `gorm:"index"`
  Status    StudentStatus
  JoinDate  *time.Time

  BalanceCents int64

  AdvisorID *uint `gorm:"index"`
  Advisor   *User `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

  CurrentPlanID *uint `gorm:"index"`
  CurrentPlan   *Plan `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

  OrganizationID *uint         `gorm:"index"`
  Organization   *Organization `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

  Enrollments []Enrollment `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
  Payments    []Payment    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
  Reminders   []PaymentReminder `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}
```

- **Relationships**:
  - `Student` **belongs to** an advisor `User` via `AdvisorID`.
  - `Student` **belongs to** `Organization`.
  - `Student` **belongs to** current `Plan` via `CurrentPlanID`.
  - `Student` **has many** `Enrollment`, `Payment`, `PaymentReminder`.
- **Edge cases**:
  - `AdvisorID`, `CurrentPlanID`, `OrganizationID` are nullable (`*uint`), so students can exist without these links (e.g., during import).

---

## Plan & PlanFeature

**File**: `models/plan.go`

```go
type Plan struct {
  gorm.Model
  Name   string
  Type   PlanType
  PriceCents int64
  DiscountPercent *float64
  IsActive bool

  OrganizationID *uint         `gorm:"index"`
  Organization   *Organization `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

  Enrollments []Enrollment `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
  Features    []PlanFeature `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
}

type PlanFeature struct {
  gorm.Model
  PlanID      uint `gorm:"not null;index"`
  Plan        Plan `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
  Description string
}
```

- **Relationships**:
  - `Plan` **belongs to** `Organization`.
  - `Plan` **has many** `Enrollment` and `PlanFeature`.
  - `PlanFeature` **belongs to** `Plan`.
- **Implications**:
  - Deleting a `Plan` cascades to `PlanFeature` (features removed), but `Enrollment` is set to null or handled via constraints specified.

---

## Enrollment

**File**: `models/enrollment.go`

```go
type Enrollment struct {
  gorm.Model
  StudentID uint    `gorm:"not null;index"`
  Student   Student `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
  PlanID    uint    `gorm:"not null;index"`
  Plan      Plan    `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`

  StartDate time.Time
  EndDate   *time.Time

  Status     EnrollmentStatus
  PriceCents int64
}
```

- **Relationships**:
  - `Enrollment` **belongs to** `Student` and `Plan`.
- **Use cases**:
  - Tracks active/finished/cancelled subscriptions for `/plans`, `/students`, and `/reports`.

---

## Payment

**File**: `models/payment.go`

```go
type Payment struct {
  gorm.Model
  StudentID uint    `gorm:"not null;index"`
  Student   Student `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`
  EnrollmentID *uint
  Enrollment   *Enrollment `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

  AmountCents int64
  Currency    string

  Description string
  Status      PaymentStatus
  Method      PaymentMethod

  DueDate *time.Time
  PaidAt  *time.Time

  ReferenceCode string
}
```

- **Relationships**:
  - `Payment` **belongs to** `Student`.
  - Optionally **belongs to** an `Enrollment`.
- **Performance**:
  - Indexed foreign keys (`StudentID`) and time fields (`DueDate`, `PaidAt`) aid reporting and queries.

---

## PayrollEntry & PayrollScheme

**File**: `models/payroll.go`

```go
type PayrollEntry struct {
  gorm.Model
  UserID uint `gorm:"not null;index"`
  User   User `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`

  PeriodYear  int `gorm:"not null;index"`
  PeriodMonth int `gorm:"not null;index"`

  BaseSalaryCents     int64
  VariableSalaryCents int64
  TotalSalaryCents    int64

  StudentsCount int

  Status PayrollStatus
  PaidAt *time.Time
}

type PayrollScheme struct {
  gorm.Model
  Role UserRole `gorm:"type:varchar(32);not null;uniqueIndex"`

  BaseSalaryCents   int64
  PerStudentCents   int64
  RevenuePercent    float64
  MonthlyBonusCents int64

  IsActive bool
}
```

- **Relationships**:
  - `PayrollEntry` **belongs to** `User`.
  - `PayrollScheme` is a configuration per `UserRole` (no fk, looked up by role).

---

## ReminderRule & PaymentReminder

**File**: `models/reminder.go`

```go
type ReminderRule struct {
  gorm.Model
  Type       ReminderType
  DaysOffset int
  Channel    ReminderChannel
  Enabled    bool

  OrganizationID *uint         `gorm:"index"`
  Organization   *Organization `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`
}

type PaymentReminder struct {
  gorm.Model
  StudentID uint    `gorm:"not null;index"`
  Student   Student `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`

  PaymentID *uint `gorm:"index"`
  Payment   *Payment `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

  RuleID *uint `gorm:"index"`
  Rule   *ReminderRule `gorm:"constraint:OnUpdate:CASCADE,OnDelete:SET NULL;"`

  AmountCents int64

  Status  ReminderStatus
  Channel ReminderChannel

  SentAt *time.Time
}
```

- **Relationships**:
  - `ReminderRule` **belongs to** `Organization`.
  - `PaymentReminder` **belongs to** `Student`, optionally `Payment`, and `ReminderRule`.

---

## PaymentSettings & NotificationSetting

**File**: `models/settings.go`

```go
type PaymentSettings struct {
  gorm.Model
  OrganizationID uint         `gorm:"not null;uniqueIndex"`
  Organization   Organization `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`

  CardNumber string
  IBAN       string

  GatewayProvider    string
  GatewayMerchantID  string
  GatewayCallbackURL string
  IsGatewayConnected bool
}

type NotificationSetting struct {
  gorm.Model
  UserID uint `gorm:"not null;index:idx_user_type,priority:1"`
  User   User `gorm:"constraint:OnUpdate:CASCADE,OnDelete:CASCADE;"`

  Type    NotificationType `gorm:"type:varchar(64);not null;index:idx_user_type,priority:2"`
  Enabled bool
}
```

- **Relationships**:
  - `PaymentSettings` **belongs to** `Organization` (one-to-one via `OrganizationID`).
  - `NotificationSetting` **belongs to** `User`.

---

## Relationship Summary Diagram

```text
Organization
  ├─< Users
  │     ├─< Students        (via AdvisorID)
  │     ├─< PayrollEntries
  │     └─< NotificationSettings
  ├─< Students
  │     ├─< Enrollments
  │     ├─< Payments
  │     └─< PaymentReminders
  ├─< Plans
  │     ├─< PlanFeatures
  │     └─< Enrollments
  ├─< PaymentSettings (1-1)
  └─< ReminderRules

Enrollment
  ├─> Student
  └─> Plan

Payment
  ├─> Student
  └─> Enrollment (optional)

PaymentReminder
  ├─> Student
  ├─> Payment (optional)
  └─> ReminderRule

PayrollEntry
  └─> User

PayrollScheme
  └─(by) UserRole (no FK)
```

---

## Best Practices & Notes

- **Foreign keys & indexes**:
  - All relationship fields (`XID`) are indexed (`gorm:"index"`), which improves join and filter performance.
  - Parent structs declare relationship slices with `constraint` tags to enforce referential integrity.

- **Cascading behavior**:
  - Deleting a parent (`Organization`, `User`, etc.) cascades or sets null on children depending on domain needs.
  - For example, deleting a `User` removes its `NotificationSettings` and `PayrollEntries`, and unassigns `Students` by setting `AdvisorID` to null.

- **Avoiding GORM migration errors**:
  - Previously, `User.Students` caused `invalid field ... define a valid foreign key` because GORM expected `Student.UserID`.
  - This is now fixed by:
    - Adding `AdvisorID` on `Student` with `gorm:"index"`.
    - Tagging `User.Students` with `gorm:"foreignKey:AdvisorID"`.

- **Serialization (API)**:
  - For API responses, you may want to add `json:"..."` tags to models or use DTO structs in handlers to avoid circular JSON (e.g., `User -> Students -> Advisor -> User`).
  - When preloading, carefully choose which relations to include to avoid huge payloads.

- **Testing**:
  - Repository interfaces (`UserRepository`, `StudentRepository`) allow mocking DB access in tests.
  - For relationship tests, use an in-memory MySQL (Docker) or a test database and run `migrations.Run()` before tests.

- **Migrations**:
  - Models are migrated in `migrations.Run()` in a parent-first order (`Organization`, `User`, `Plan`, `Student`, ...).
  - Migrations run automatically when the API server starts (`go run ./cmd` or the built binary).

```bash
cd backend
go run ./cmd
```


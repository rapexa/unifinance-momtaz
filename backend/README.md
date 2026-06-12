## Unifinance Backend (Go + GORM + MySQL)

This backend implements the database layer for the Unifinance frontend, using:

- Go
- GORM (ORM)
- MySQL
- Viper for configuration (.env)

### Folder structure

- `cmd/main.go` – HTTP entrypoint (Gin router, wiring of dependencies)
- `config/config.go` – loads configuration via Viper (from `.env` + env vars, including JWT)
- `database/database.go` – initializes GORM connection to MySQL (singleton)
- `models/` – domain models inferred from the frontend:
  - `organization.go` – `Organization`
  - `user.go` – `User` (system users: admin, accountant, advisor, operator)
  - `student.go` – `Student`
  - `plan.go` – `Plan`, `PlanFeature`
  - `enrollment.go` – `Enrollment` (student–plan relation)
  - `payment.go` – `Payment`
  - `payroll.go` – `PayrollEntry`, `PayrollScheme`
  - `reminder.go` – `ReminderRule`, `PaymentReminder`
  - `settings.go` – `PaymentSettings`, `NotificationSetting`
- `repositories/` – Repository pattern for DB access:
  - `user_repository.go` – `UserRepository` (GORM implementation)
  - `student_repository.go` – `StudentRepository` (GORM implementation)
- `services/` – business logic layer:
  - `auth_service.go` – `AuthService` (login + JWT)
  - `student_service.go` – `StudentService`
- `handlers/` – Gin HTTP handlers:
  - `auth_handler.go` – `/api/v1/auth/login`
  - `student_handler.go` – `/api/v1/students` CRUD subset
- `middleware/` – Gin middlewares:
  - `auth.go` – JWT auth + role-based authorization
- `utils/jwt.go` – JWT helper functions (sign/parse tokens)
- `migrations/migrate.go` – runs GORM AutoMigrate and seeds base data
- `.env.example` – sample configuration

### Models overview

These models are designed to support all frontend pages and flows described in the docs:

- **Users & Roles (`/users`, Settings > Profile/Security/Notifications)**  
  `User` (profile, auth, role, 2FA, avatar, bio), `NotificationSetting`.

- **Organization settings (Settings > General)**  
  `Organization` (name, phone, address, email).

- **Students (`/students`, dashboard, payments, reminders)**  
  `Student` (contact, status, advisor, current plan, balance),  
  `Enrollment` (link to `Plan`), `Payment`, `PaymentReminder`.

- **Plans & services (`/plans`)**  
  `Plan` (type: monthly/yearly/workshop/course, price, discount, active), `PlanFeature`.

- **Payments (`/payments`, dashboard, reports)**  
  `Payment` (student, enrollment, amount, status paid/pending/overdue, method, due date, paid date, description, reference).

- **Payroll (`/payroll`)**  
  `PayrollEntry` (per user, month, base/variable/total salary, status),  
  `PayrollScheme` (per role: fixed and variable salary rules).

- **Reminders (`/reminders`)**  
  `ReminderRule` (before/due/overdue, days offset, channel, enabled),  
  `PaymentReminder` (logs sent reminders, status, channel, timestamps).

- **Payment & notification settings (Settings > Payments, Notifications)**  
  `PaymentSettings` (card, IBAN, gateway info), `NotificationSetting`.

### Design patterns used

| Pattern                | Where                                           | Why                                                                                      |
|------------------------|-------------------------------------------------|------------------------------------------------------------------------------------------|
| Singleton              | `config.MustLoadConfig`, `database.MustGetDB`  | Single, shared config and DB connection; concurrency-safe with `sync.Once`.             |
| Repository             | `repositories/*.go`                             | Abstracts GORM from services/handlers, improves testability and separation of concerns.  |
| Service Layer          | `services/*.go`                                 | Encapsulates business logic (auth, students) separate from HTTP and persistence.        |
| Middleware             | `middleware/auth.go`                            | Cross-cutting concerns (JWT auth, RBAC) applied declaratively to Gin route groups.      |
| Dependency Injection   | `cmd/main.go`                                   | Wires config, DB, repositories, services, handlers in one place for loose coupling.     |

High-level dependency flow:

```text
Gin HTTP -> handlers -> services -> repositories -> GORM -> MySQL
                    \-> middleware (auth, role)
Config/Viper --------------------------^
```

### Setup

1. **Create the database in MySQL**

Example:

```sql
CREATE DATABASE unifinance_momtaz CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'unifinance'@'%' IDENTIFIED BY 'secret';
GRANT ALL PRIVILEGES ON unifinance_momtaz.* TO 'unifinance'@'%';
FLUSH PRIVILEGES;
```

Or via Docker:

```bash
docker run --name unifinance-mysql -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=unifinance_momtaz \
  -e MYSQL_USER=unifinance -e MYSQL_PASSWORD=secret \
  -p 3306:3306 -d mysql:8
```

2. **Backend module & dependencies**

From the `backend` folder:

```bash
go mod init github.com/soheilsshh/unifinance-momtaz
go get gorm.io/gorm gorm.io/driver/mysql github.com/spf13/viper golang.org/x/crypto/bcrypt
go mod tidy
```

3. **Configure environment**

- Copy `.env.example` to `.env` and adjust:

```bash
cp .env.example .env
```

Edit `.env` for your DB host, port, user, password, and database name.

4. **Run API server**

From the `backend` folder:

```bash
go run ./cmd
```

Or build a single binary:

```bash
go build -o unifinance-server ./cmd
./unifinance-server
```

On startup the server **automatically**:

- Connects to MySQL using `.env`
- Runs `AutoMigrate` for all models
- Runs one-time backfills and seeds (default organization, admin user, roles)

Default admin after first run: `admin@example.com` / `change-me-please` — change this in production.

The server listens on `:8081` with:

- `GET /health` – health check
- `POST /api/v1/auth/login` – login with email/password to receive JWT
- `GET /api/v1/users/me` – read current user from JWT
- `GET /api/v1/students` – list students (with pagination and search)
- `GET /api/v1/students/:id` – get a single student
- `POST /api/v1/students` – create student (admin/advisor roles only)

### Next steps

- Expose HTTP APIs on top of these models (e.g. using `net/http` or a router like chi/gin).
- Wire the frontend React app to these APIs via React Query.
- Implement authentication (login/logout), password reset, and authorization based on `User.Role`.



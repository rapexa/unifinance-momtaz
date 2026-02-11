## Auth Overview

The backend implements stateless authentication using:

- **Go** + **Gin** for HTTP routing
- **GORM** + **MySQL** for persistence
- **JWT (HS256)** for access & refresh tokens
- **Viper** for configuration (`.env`), including JWT secrets and expiry
- **bcrypt** for password hashing

The frontend currently has no dedicated `/login` page, but it does include:

- Users and roles management (`/users`)
- Profile & security tabs under `/settings` (password change, 2FA toggle)

The backend provides a full auth API that can be consumed by the frontend (e.g., via React Query).

---

## Endpoints

Base path: `/api/v1`

| Method | Path                     | Description                                      | Auth required | Body                                                         |
|--------|--------------------------|--------------------------------------------------|--------------|--------------------------------------------------------------|
| POST   | `/auth/register`        | Register a new user and return tokens            | No           | `{ first_name, last_name, email, password, phone? }`        |
| POST   | `/auth/login`           | Login with email/password, get tokens            | No           | `{ email, password }`                                       |
| POST   | `/auth/refresh`         | Refresh access & refresh tokens                  | No           | `{ refresh_token }`                                         |
| POST   | `/auth/forgot-password` | Request password reset (stubbed)                 | No           | `{ email }`                                                 |
| POST   | `/auth/reset-password`  | Reset password using reset token (stubbed)       | No           | `{ token, new_password }`                                   |
| GET    | `/auth/me`              | Get current authenticated user                   | Yes (JWT)    | –                                                            |
| POST   | `/auth/logout`          | Log out (client-side token discard)              | Yes (JWT)    | –                                                            |
| GET    | `/users/me`             | Simple current user info (id & role)             | Yes (JWT)    | –                                                            |

Note: All protected endpoints require an `Authorization: Bearer <access_token>` header.

---

## JWT Tokens & Claims

Two token types are issued:

- **Access token**
  - Short-lived, used for API calls.
  - Lifetime: `JWT_EXPIRY_HOURS` (default: 24 hours).
- **Refresh token**
  - Longer-lived, used only for `/auth/refresh`.
  - Lifetime: `JWT_REFRESH_EXPIRY_HOURS` (default: 7 days).

Claim structure (`utils.JWTClaims`):

```go
type JWTClaims struct {
  UserID    uint            `json:"user_id"`
  Role      models.UserRole `json:"role"`
  TokenType string          `json:"typ"` // "access" or "refresh"
  jwt.RegisteredClaims
}
```

- Tokens are signed with HS256 using `JWT_SECRET` from config.
- `TokenType` ensures:
  - `AuthMiddleware` only accepts `"access"` tokens.
  - `/auth/refresh` only accepts `"refresh"` tokens.

---

## Middleware

**File**: `middleware/auth.go`

### `AuthMiddleware(cfg *config.Config) gin.HandlerFunc`

- Reads `Authorization` header (`Bearer <access_token>`).
- Parses JWT using `utils.ParseToken`.
- Validates:
  - Token is valid and not expired.
  - `claims.TokenType == "access"`.
- On success, sets:

```go
c.Set(ContextUserIDKey, claims.UserID)
c.Set(ContextUserRole, claims.Role)
```

and calls `c.Next()`.

On failure returns:

- `401 { "error": "missing Authorization header" }`
- `401 { "error": "invalid Authorization header" }`
- `401 { "error": "invalid or expired token" }`
- `401 { "error": "invalid token type" }`

### `RoleMiddleware(allowed ...models.UserRole)`

- Checks `userRole` from context against allowed roles.
- Returns `403 { "error": "insufficient permissions" }` if not allowed.

Used e.g. for creating students (admin/advisor only).

---

## Service Layer

**File**: `services/auth_service.go`

```go
type AuthTokens struct {
  AccessToken  string `json:"access_token"`
  RefreshToken string `json:"refresh_token"`
}

type AuthResult struct {
  User   *models.User `json:"user"`
  Tokens AuthTokens   `json:"tokens"`
}
```

### Login

```go
func (s *AuthService) Login(ctx context.Context, email, password string) (*AuthResult, error)
```

- Validates:
  - User exists by email.
  - User `IsActive == true`.
  - `bcrypt.CompareHashAndPassword` succeeds.
- Issues:
  - Access token via `utils.GenerateAccessToken`.
  - Refresh token via `utils.GenerateRefreshToken`.

### Register

```go
func (s *AuthService) Register(ctx context.Context, firstName, lastName, email, password, phone string) (*AuthResult, error)
```

- Basic validation (`len(password) >= 6`).
- Creates `User` with:
  - default role `ADVISOR`,
  - `IsActive = true`,
  - `PlainPassword = password` (hashed via model hooks).
- On success, returns tokens like `Login`.

### Refresh

```go
func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (*AuthResult, error)
```

- Parses refresh token using `utils.ParseToken`.
- Ensures `claims.TokenType == "refresh"`.
- Loads user by `claims.UserID`.
- Issues new access & refresh tokens.

### Me

```go
func (s *AuthService) GetByID(ctx context.Context, id uint) (*models.User, error)
```

- Simple wrapper around `UserRepository.FindByID`.

### Forgot / Reset Password (stubs)

```go
func (s *AuthService) ForgotPassword(ctx context.Context, email string) error
func (s *AuthService) ResetPassword(ctx context.Context, token, newPassword string) error
```

- Currently return `ErrNotImplemented` (no email integration or reset-token storage yet).
- Handlers surface that as 501 for `reset-password` and 200 generic for `forgot-password`.

---

## HTTP Handlers

**File**: `handlers/auth_handler.go`

- `POST /api/v1/auth/register` → `AuthHandler.Register`
- `POST /api/v1/auth/login` → `AuthHandler.Login`
- `POST /api/v1/auth/refresh` → `AuthHandler.Refresh`
- `POST /api/v1/auth/forgot-password` → `AuthHandler.ForgotPassword`
- `POST /api/v1/auth/reset-password` → `AuthHandler.ResetPassword`
- `GET /api/v1/auth/me` → `AuthHandler.Me` (protected)
- `POST /api/v1/auth/logout` → `AuthHandler.Logout` (protected)

### Example JSON responses

- **Login / Register / Refresh**:

```json
{
  "user": {
    "id": 1,
    "first_name": "مدیر",
    "last_name": "سیستم",
    "email": "admin@example.com",
    "role": "ADMIN"
  },
  "tokens": {
    "access_token": "<JWT_ACCESS>",
    "refresh_token": "<JWT_REFRESH>"
  }
}
```

- **Forgot Password**:

```json
{
  "message": "if this email exists, a reset link will be sent"
}
```

---

## Routing (Gin)

**File**: `cmd/main.go`

```go
api := r.Group("/api/v1")

authGroup := api.Group("/auth")
{
  authGroup.POST("/register", authHandler.Register)
  authGroup.POST("/login", authHandler.Login)
  authGroup.POST("/refresh", authHandler.Refresh)
  authGroup.POST("/forgot-password", authHandler.ForgotPassword)
  authGroup.POST("/reset-password", authHandler.ResetPassword)
}

protected := api.Group("")
protected.Use(middleware.AuthMiddleware(cfg))

protected.GET("/users/me", ...) // simple

protectedAuth := protected.Group("/auth")
{
  protectedAuth.GET("/me", authHandler.Me)
  protectedAuth.POST("/logout", authHandler.Logout)
}
```

---

## Example `curl` Commands

### Register

```bash
curl -X POST http://localhost:8081/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Ali",
    "last_name": "Ahmadi",
    "email": "ali@example.com",
    "password": "StrongPass123",
    "phone": "09121234567"
  }'
```

### Login

```bash
curl -X POST http://localhost:8081/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "admin@example.com", "password": "change-me-please" }'
```

### Refresh

```bash
curl -X POST http://localhost:8081/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{ "refresh_token": "<JWT_REFRESH>" }'
```

### Get current user

```bash
curl http://localhost:8081/api/v1/auth/me \
  -H "Authorization: Bearer <JWT_ACCESS>"
```

### Logout

```bash
curl -X POST http://localhost:8081/api/v1/auth/logout \
  -H "Authorization: Bearer <JWT_ACCESS>"
```

---

## Security & Edge Cases

- **Password storage**:
  - All passwords are hashed via bcrypt (`golang.org/x/crypto/bcrypt`) in `User` model hooks.
  - Plain password is only in-memory (`PlainPassword` field with `gorm:"-"`).

- **JWT secret**:
  - Loaded from Viper (`JWT_SECRET`).
  - Use a long, random secret in production.

- **Token expiry**:
  - Access tokens: shorter lifetime (24h by default).
  - Refresh tokens: longer lifetime (7 days by default).

- **Logout & revocation**:
  - Current implementation is purely stateless; logout only instructs the client to discard tokens.
  - For stricter security, add a token blacklist (e.g., Redis) or use short-lived access tokens + rotating refresh tokens with server-side tracking.

- **Rate limiting**:
  - Not implemented yet; recommended to apply rate limiting on `/auth/login` and `/auth/register` (e.g., via gin middleware or reverse proxy).

- **HTTPS**:
  - Always serve over HTTPS in production to protect tokens in transit.
  - Set `Secure`, `HttpOnly`, `SameSite` if using cookies.

- **Role-based access**:
  - `User.Role` can be used with `RoleMiddleware` for admin-only routes (e.g., user management, settings).

---

## Frontend Integration Notes

- Store tokens securely on the frontend (prefer `httpOnly` cookies if possible; otherwise, secure storage).
- Attach `Authorization: Bearer <access_token>` to all protected API requests.
- On 401/403 due to expired access token:
  - Call `/api/v1/auth/refresh` with refresh token.
  - On success, retry original request.
- Align profile & security tabs under `/settings` with:
  - `/auth/me` for fetching user profile.
  - Future endpoints for changing password, enabling 2FA, etc.


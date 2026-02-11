## Auth Restrictions – Admin-Only Login

This document describes how login and authorization are restricted to **admin users only** in the backend.

---

## Overview

The backend uses:

- **Go + Gin** for HTTP routing
- **GORM + MySQL** for persistence
- **JWT (HS256)** for access and refresh tokens
- **Viper** for configuration (`.env`)
- **bcrypt** for password hashing

The `User` model includes a `Role` field:

```go
type UserRole string

const (
  UserRoleAdmin      UserRole = "ADMIN"
  UserRoleAccountant UserRole = "ACCOUNTANT"
  UserRoleAdvisor    UserRole = "ADVISOR"
  UserRoleOperator   UserRole = "OPERATOR"
)
```

For security reasons, the **login flow is restricted to admins only**. Other roles cannot obtain tokens even if they have valid credentials.

---

## Backend Changes

### 1. AuthService.Login – Role Check (Admin Only)

**File**: `backend/services/auth_service.go`

Relevant part of `Login`:

```go
func (s *AuthService) Login(ctx context.Context, email, password string) (*AuthResult, error) {
  user, err := s.userRepo.FindByEmail(ctx, email)
  if err != nil {
    return nil, ErrInvalidCredentials
  }

  if !user.IsActive {
    return nil, ErrInactiveUser
  }

  if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) != nil {
    return nil, ErrInvalidCredentials
  }

  // Enforce admin-only login:
  // Use constant-time comparison on uppercased role to avoid timing-based role probing.
  roleUpper := strings.ToUpper(string(user.Role))
  if subtle.ConstantTimeCompare([]byte(roleUpper), []byte(string(models.UserRoleAdmin))) != 1 {
    log.Printf("auth: non-admin login attempt blocked for email=%s role=%s", user.Email, user.Role)
    return nil, ErrAdminOnly
  }

  access, err := utils.GenerateAccessToken(user, s.cfg)
  // ...
}
```

New error:

```go
var (
  ErrInvalidCredentials = errors.New("invalid email or password")
  ErrInactiveUser       = errors.New("user is inactive")
  ErrNotImplemented     = errors.New("not implemented")
  ErrAdminOnly          = errors.New("admin only")
)
```

**Key points:**

- Password checks still use `bcrypt.CompareHashAndPassword`.
- After password validation, a **constant-time role comparison** ensures only `UserRoleAdmin` can proceed.
- Non-admin login attempts are logged (email + role, no passwords).

### 2. Login Handler – 403 for Non-Admins

**File**: `backend/handlers/auth_handler.go`

In `Login`:

```go
result, err := h.authService.Login(c.Request.Context(), req.Email, req.Password)
if err != nil {
  switch err {
  case services.ErrInvalidCredentials:
    c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
  case services.ErrInactiveUser:
    c.JSON(http.StatusForbidden, gin.H{"error": "user is inactive"})
  case services.ErrAdminOnly:
    c.JSON(http.StatusForbidden, gin.H{"error": "Access denied: Admin only"})
  default:
    c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
  }
  return
}
```

**Example responses:**

- Wrong password:

```json
HTTP 401
{ "error": "invalid credentials" }
```

- Inactive user:

```json
HTTP 403
{ "error": "user is inactive" }
```

- Non-admin role (e.g., ADVISOR):

```json
HTTP 403
{ "error": "Access denied: Admin only" }
```

### 3. Role-Based Middleware – AdminOnly

**File**: `backend/middleware/auth.go`

Existing `RoleMiddleware`:

```go
func RoleMiddleware(allowed ...models.UserRole) gin.HandlerFunc {
  allowedSet := make(map[models.UserRole]struct{}, len(allowed))
  for _, r := range allowed {
    allowedSet[r] = struct{}{}
  }

  return func(c *gin.Context) {
    roleVal, exists := c.Get(ContextUserRole)
    if !exists {
      c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "missing role in context"})
      return
    }

    role, ok := roleVal.(models.UserRole)
    if !ok {
      c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "invalid role type"})
      return
    }

    if _, ok := allowedSet[role]; !ok {
      c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
      return
    }

    c.Next()
  }
}
```

New helper for admin-only routes:

```go
// AdminOnly is a convenience middleware for admin-only routes.
func AdminOnly() gin.HandlerFunc {
  return RoleMiddleware(models.UserRoleAdmin)
}
```

Usage example in `cmd/main.go`:

```go
students := protected.Group("/students")
{
  students.GET("", studentHandler.List)        // requires any authenticated user
  students.GET("/:id", studentHandler.Get)     // requires any authenticated user
  students.POST("",
    middleware.RoleMiddleware(models.UserRoleAdmin, models.UserRoleAdvisor),
    studentHandler.Create,
  )
}
```

You can tighten any route to admin-only by replacing `RoleMiddleware` with `AdminOnly`:

```go
protectedAdmin := protected.Group("/admin")
protectedAdmin.Use(middleware.AdminOnly())
{
  // admin-only endpoints here
}
```

---

## JWT Claims and Role

JWT access/refresh tokens include a `role` claim (from `User.Role`):

```go
type JWTClaims struct {
  UserID    uint            `json:"user_id"`
  Role      models.UserRole `json:"role"`
  TokenType string          `json:"typ"` // "access" or "refresh"
  jwt.RegisteredClaims
}
```

`AuthMiddleware` populates Gin’s context from these claims:

```go
claims, err := utils.ParseToken(parts[1], cfg)
// ...
if claims.TokenType != "access" {
  c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token type"})
  return
}

c.Set(ContextUserIDKey, claims.UserID)
c.Set(ContextUserRole, claims.Role)
```

`RoleMiddleware` and `AdminOnly` then enforce authorization using this `Role` value.

---

## Security Implications and Nuances

- **Defense-in-depth**:
  - Admin-only login ensures that even if non-admin credentials are leaked, they still cannot obtain tokens.
  - `RoleMiddleware` / `AdminOnly` further protect admin APIs from misuse by already logged-in non-admin users (if such tokens were issued in future flows).

- **Constant-time comparison**:
  - Role check during login uses `crypto/subtle.ConstantTimeCompare` on an uppercased string.
  - While role names are not typically secret, this avoids linking timing differences directly to role names during brute-force probing.

- **Logging**:
  - Non-admin login attempts are logged with `email` and `role`:

  ```go
  log.Printf("auth: non-admin login attempt blocked for email=%s role=%s", user.Email, user.Role)
  ```

  - No sensitive data (passwords, tokens) is written to the logs.

- **Token leakage scenario**:
  - Tokens are only ever issued to admins. If a token is stolen:
    - It already belongs to an admin; `RoleMiddleware` still permits admin operations.
    - Use short-lived access tokens + refresh rotation + (optionally) token blacklist for higher security.

- **Future changes**:
  - If later you decide to allow non-admin login for regular dashboards:
    - Relax the admin-only check in `AuthService.Login`.
    - Keep `AdminOnly` middleware on routes that truly require admin privileges.

---

## Example Flows

### 1. Admin Login (Allowed)

1. User submits email/password for an account with `Role=ADMIN`.
2. Backend:
   - Validates password.
   - Role check passes (admin).
   - Issues access & refresh tokens.
3. Client receives:

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

### 2. Advisor Login (Blocked)

1. User submits valid credentials for `Role=ADVISOR`.
2. Backend:
   - Password OK.
   - Admin-only check fails.
   - Logs event and returns 403.
3. Response:

```json
HTTP 403
{ "error": "Access denied: Admin only" }
```

---

## Summary

- Login is limited to users with `Role == ADMIN`.
- Non-admin attempts are blocked at the service layer and logged.
- JWT claims carry the role; middleware enforces authorization for protected routes.
- `AdminOnly` middleware is available for stricter admin-only endpoints.


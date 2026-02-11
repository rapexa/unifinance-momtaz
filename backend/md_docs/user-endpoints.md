## User Management API

This document describes the **admin-only** user management endpoints exposed by the backend.

- **Base path**: `/api/v1`
- **Auth**: Bearer JWT
- **Role requirement**: **ADMIN only** for all endpoints in this document.

All routes are mounted under `/api/v1/users` and are protected with:

- `AuthMiddleware` – validates JWT and injects user ID/role into context.
- `AdminOnly` – ensures the role is `ADMIN`.

---

## Common Types

### UserDTO

```json
{
  "id": 1,
  "first_name": "Soheil",
  "last_name": "Admin",
  "email": "admin@example.com",
  "phone": "+989121234567",
  "role": "ADMIN",
  "is_active": true,
  "organization_id": 1,
  "created_at": "2026-02-10T12:34:56Z"
}
```

Fields:

- `id` – numeric primary key.
- `first_name`, `last_name` – user’s name.
- `email` – unique email.
- `phone` – optional phone number.
- `role` – one of `ADMIN`, `ACCOUNTANT`, `ADVISOR`, `OPERATOR`.
- `is_active` – whether the user is active (used for soft deactivation).
- `organization_id` – optional organization this user belongs to.
- `created_at` – creation timestamp.

Sensitive fields like `PasswordHash` are **never** returned.

---

## 1. GET /api/v1/users

List users with pagination and optional filters.

**Method**: `GET`  
**Path**: `/api/v1/users`  
**Auth**: Required (Bearer JWT)  
**Role**: ADMIN only

### Query Parameters

- `page` (int, optional, default: `1`)
- `page_size` (int, optional, default: `20`, max: `100`)
- `search` (string, optional)  
  - Searches in `first_name`, `last_name`, and `email` using `%search%` match.
- `role` (string, optional)  
  - Exact match on `role` field (e.g. `ADMIN`, `ADVISOR`).
- `status` (string, optional)  
  - `"active"` → `is_active = true`  
  - `"inactive"` → `is_active = false`

### Response: 200 OK

```json
{
  "data": [
    {
      "id": 1,
      "first_name": "Soheil",
      "last_name": "Admin",
      "email": "admin@example.com",
      "phone": "+989121234567",
      "role": "ADMIN",
      "is_active": true,
      "organization_id": 1,
      "created_at": "2026-02-10T12:34:56Z"
    }
  ],
  "meta": {
    "current_page": 1,
    "page_size": 20,
    "total_items": 42,
    "total_pages": 3
  }
}
```

### Possible Errors

- `400 Bad Request` – invalid `status` or other query param:

```json
{ "error": "invalid status; must be 'active' or 'inactive'", "code": 400 }
```

- `401 Unauthorized` – missing/invalid token.
- `403 Forbidden` – user is not admin.
- `500 Internal Server Error` – DB or server error.

---

## 2. GET /api/v1/users/:id

Get a single user by ID.

**Method**: `GET`  
**Path**: `/api/v1/users/{id}`  
**Auth**: Required  
**Role**: ADMIN only

### Path Parameters

- `id` (int) – user ID.

### Response: 200 OK

```json
{
  "id": 1,
  "first_name": "Soheil",
  "last_name": "Admin",
  "email": "admin@example.com",
  "phone": "+989121234567",
  "role": "ADMIN",
  "is_active": true,
  "organization_id": 1,
  "created_at": "2026-02-10T12:34:56Z"
}
```

### Errors

- `400 Bad Request` – invalid ID.
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found` – user does not exist:

```json
{ "error": "user not found", "code": 404 }
```

- `500 Internal Server Error`

---

## 3. POST /api/v1/users

Create a new user.

**Method**: `POST`  
**Path**: `/api/v1/users`  
**Auth**: Required  
**Role**: ADMIN only

### Request Body

```json
{
  "first_name": "Ali",
  "last_name": "Karimi",
  "email": "ali.karimi@example.com",
  "phone": "+989121112233",
  "role": "ADVISOR",
  "password": "StrongPass123",
  "organization_id": 1,
  "is_active": true
}
```

Validation rules:

- `first_name` / `last_name`: required, 2–100 chars.
- `email`: required, valid email, max 255, must be **unique**.
- `phone`: optional, max 20 chars.
- `role`: required (accepted values map to existing roles such as `ADMIN`, `ACCOUNTANT`, `ADVISOR`, `OPERATOR`).
- `password`: required, minimum length 8; hashed with bcrypt via model hooks.
- `organization_id`: optional.
- `is_active`: optional, defaults to `true`.

### Response: 201 Created

```json
{
  "id": 5,
  "first_name": "Ali",
  "last_name": "Karimi",
  "email": "ali.karimi@example.com",
  "phone": "+989121112233",
  "role": "ADVISOR",
  "is_active": true,
  "organization_id": 1,
  "created_at": "2026-02-10T13:01:23Z"
}
```

### Errors

- `400 Bad Request` – validation error (missing/invalid fields).
- `401 Unauthorized`
- `403 Forbidden`
- `409 Conflict` – email already exists:

```json
{ "error": "email already exists", "code": 409 }
```

- `500 Internal Server Error`

---

## 4. PUT /api/v1/users/:id

Update user fields (password cannot be changed here).

**Method**: `PUT`  
**Path**: `/api/v1/users/{id}`  
**Auth**: Required  
**Role**: ADMIN only

### Request Body (partial update)

All fields are optional; only provided fields are updated.

```json
{
  "first_name": "Ali Reza",
  "email": "ali.reza@example.com",
  "role": "ACCOUNTANT",
  "is_active": false,
  "phone": "+989121112233",
  "organization_id": 2
}
```

Rules:

- Same format/length rules as POST.
- If `email` changes, it must still be unique.
- `password` is **not** accepted here (use a dedicated password-change endpoint in future).

### Response: 200 OK

```json
{
  "id": 5,
  "first_name": "Ali Reza",
  "last_name": "Karimi",
  "email": "ali.reza@example.com",
  "phone": "+989121112233",
  "role": "ACCOUNTANT",
  "is_active": false,
  "organization_id": 2,
  "created_at": "2026-02-10T13:01:23Z"
}
```

### Errors

- `400 Bad Request` – invalid ID or body validation failure.
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found` – user not found.
- `409 Conflict` – email already exists.
- `500 Internal Server Error`

---

## 5. DELETE /api/v1/users/:id

Soft deactivate a user.

**Method**: `DELETE`  
**Path**: `/api/v1/users/{id}`  
**Auth**: Required  
**Role**: ADMIN only

Behavior:

- Does **not** physically delete the record.
- Sets `is_active = false` (existing soft delete via `DeletedAt` is not used here).

### Response: 200 OK

```json
{
  "message": "User deactivated",
  "code": 200
}
```

### Errors

- `400 Bad Request` – invalid ID.
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found`
- `500 Internal Server Error`

---

## Security & Implementation Notes

- All endpoints use:
  - `AuthMiddleware` to validate JWT and populate user context.
  - `AdminOnly` middleware to restrict access to `ADMIN` role.
- Passwords:
  - Never returned in responses.
  - Stored as bcrypt hashes via `User` model hooks using `PlainPassword`.
- Pagination:
  - Standard pattern using `page` and `page_size` query params.
  - Response always includes `meta` with `current_page`, `page_size`, `total_items`, `total_pages`.
- Filtering:
  - `search` uses SQL `LIKE` on `first_name`, `last_name`, `email`.
  - `role` filters on exact role string.
  - `status` filters on `is_active`.
- Errors:
  - User endpoints return JSON errors of the form:

```json
{ "error": "message", "code": 400 }
```

- In production, rate limiting and audit logging are recommended for these admin-sensitive endpoints.


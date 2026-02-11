## Plan Management API

This document describes the **admin-only** plan management endpoints.

- **Base path**: `/api/v1`
- **Auth**: Bearer JWT
- **Role requirement**: **ADMIN only** for all plan endpoints.

All routes are mounted under `/api/v1/plans` and are protected with:

- `AuthMiddleware` – validates JWT, extracts user ID/role.
- `AdminOnly` – ensures role is `ADMIN`.

---

## DTO – PlanDTO

```json
{
  "id": 1,
  "name": "Pro Plan",
  "description": "Full access + priority support",
  "price_cents": 9900,
  "interval": "monthly",
  "type": "MONTHLY",
  "is_active": true,
  "max_users": 50,
  "features": ["feature1", "feature2", "analytics"],
  "created_at": "2026-02-10T12:34:56Z",
  "updated_at": "2026-02-10T13:00:00Z"
}
```

Notes:

- `interval` is currently passed through the API but is not persisted as a separate field in the `Plan` model; future migrations can add it.
- `type` maps to `PlanType` (`MONTHLY`, `YEARLY`, `WORKSHOP`, `COURSE`).
- `features` is derived from `PlanFeature` rows linked to the plan.

---

## 1. GET /api/v1/plans

List plans with pagination and optional filters.

**Method**: `GET`  
**Path**: `/api/v1/plans`  
**Auth**: Required (Bearer JWT)  
**Role**: ADMIN only

### Query Parameters

- `page` (int, optional, default: `1`)
- `page_size` (int, optional, default: `20`, max: `100`)
- `search` (string, optional)  
  - Searches in `name` and `description` using SQL `LIKE %search%`.
- `type` (string, optional)  
  - Exact match on `Plan.Type` (e.g. `MONTHLY`, `YEARLY`, `WORKSHOP`, `COURSE`).
- `status` (string, optional)  
  - `"active"` → `is_active = true`  
  - `"inactive"` → `is_active = false`  
  - `"archived"` → currently treated as `is_active = false` (placeholder for future archive state).

### Response: 200 OK

```json
{
  "data": [
    {
      "id": 1,
      "name": "Standard Plan",
      "description": "For small teams",
      "price_cents": 4900,
      "interval": "monthly",
      "type": "MONTHLY",
      "is_active": true,
      "max_users": 10,
      "features": ["basic reports", "email support"],
      "created_at": "2026-02-10T10:00:00Z",
      "updated_at": "2026-02-10T11:00:00Z"
    }
  ],
  "meta": {
    "current_page": 1,
    "page_size": 20,
    "total_items": 12,
    "total_pages": 1
  }
}
```

### Errors

- `400 Bad Request` – invalid `status`:

```json
{ "error": "invalid status; must be 'active', 'inactive', or 'archived'", "code": 400 }
```

- `401 Unauthorized`
- `403 Forbidden`
- `500 Internal Server Error`

---

## 2. GET /api/v1/plans/:id

Get a single plan by ID.

**Method**: `GET`  
**Path**: `/api/v1/plans/{id}`  
**Auth**: Required  
**Role**: ADMIN only

### Path Parameters

- `id` (int) – Plan ID.

### Response: 200 OK

```json
{
  "id": 1,
  "name": "Standard Plan",
  "description": "For small teams",
  "price_cents": 4900,
  "interval": "monthly",
  "type": "MONTHLY",
  "is_active": true,
  "max_users": 10,
  "features": ["basic reports", "email support"],
  "created_at": "2026-02-10T10:00:00Z",
  "updated_at": "2026-02-10T11:00:00Z"
}
```

### Errors

- `400 Bad Request` – invalid ID.
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found` – plan does not exist:

```json
{ "error": "plan not found", "code": 404 }
```

- `500 Internal Server Error`

---

## 3. POST /api/v1/plans

Create a new plan.

**Method**: `POST`  
**Path**: `/api/v1/plans`  
**Auth**: Required  
**Role**: ADMIN only

### Request Body

```json
{
  "name": "Pro Plan",
  "description": "Full access + priority support",
  "price_cents": 9900,
  "interval": "monthly",
  "type": "MONTHLY",
  "is_active": true,
  "max_users": 50,
  "features": ["feature1", "feature2", "analytics"]
}
```

Validation rules:

- `name`: required, 2–255 characters; must be **unique** across plans.
- `description`: optional, max 1000 characters.
- `price_cents`: required, must be `> 0`.
- `interval`: required, one of `"monthly"` or `"yearly"` (pre-validated at handler level; persisted indirectly today).
- `type`: optional, up to 50 characters; mapped to `PlanType` (`MONTHLY`, `YEARLY`, `WORKSHOP`, `COURSE`) in service.
- `is_active`: optional, defaults to `true`.
- `max_users`: optional.
- `features`: optional array of non-empty strings.

### Response: 201 Created

```json
{
  "id": 2,
  "name": "Pro Plan",
  "description": "Full access + priority support",
  "price_cents": 9900,
  "interval": "monthly",
  "type": "MONTHLY",
  "is_active": true,
  "max_users": 50,
  "features": ["feature1", "feature2", "analytics"],
  "created_at": "2026-02-10T12:45:00Z",
  "updated_at": "2026-02-10T12:45:00Z"
}
```

### Errors

- `400 Bad Request` – missing or invalid fields.
- `401 Unauthorized`
- `403 Forbidden`
- `409 Conflict` – plan name already exists:

```json
{ "error": "plan name already exists", "code": 409 }
```

- `500 Internal Server Error`

---

## 4. PUT /api/v1/plans/:id

Update an existing plan. Partial updates are allowed.

**Method**: `PUT`  
**Path**: `/api/v1/plans/{id}`  
**Auth**: Required  
**Role**: ADMIN only

### Request Body (example)

```json
{
  "price_cents": 12900,
  "is_active": true,
  "features": ["feature1", "feature2", "advanced analytics"]
}
```

All fields in the body are optional:

- `name`: optional, 2–255 characters; if changed, must remain unique.
- `description`: optional.
- `price_cents`: optional, must be `> 0` if provided.
- `interval`: optional, `"monthly"` / `"yearly"`.
- `type`: optional, up to 50 characters.
- `is_active`: optional.
- `max_users`: optional.
- `features`: optional; if provided, **replaces** all existing features for the plan.

### Response: 200 OK

```json
{
  "id": 2,
  "name": "Pro Plan",
  "description": "Full access + priority support",
  "price_cents": 12900,
  "interval": "monthly",
  "type": "MONTHLY",
  "is_active": true,
  "max_users": 50,
  "features": ["feature1", "feature2", "advanced analytics"],
  "created_at": "2026-02-10T12:45:00Z",
  "updated_at": "2026-02-10T13:10:00Z"
}
```

### Errors

- `400 Bad Request` – invalid ID or body validation failure.
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found` – plan not found.
- `409 Conflict` – plan name already exists.
- `500 Internal Server Error`

---

## 5. DELETE /api/v1/plans/:id

Soft deactivate a plan.

**Method**: `DELETE`  
**Path**: `/api/v1/plans/{id}`  
**Auth**: Required  
**Role**: ADMIN only

Behavior:

- Does **not** hard-delete the plan.
- Sets `is_active = false` (using GORM `Update`).
- Optionally checks if the plan has any existing enrollments:
  - If `CountEnrollments > 0` → returns `409 Conflict` and does **not** deactivate.

### Response: 200 OK

```json
{
  "message": "Plan deactivated",
  "code": 200
}
```

### Errors

- `400 Bad Request` – invalid ID.
- `401 Unauthorized`
- `403 Forbidden`
- `404 Not Found` – plan not found.
- `409 Conflict` – plan has active enrollments:

```json
{ "error": "cannot deactivate plan with active enrollments", "code": 409 }
```

- `500 Internal Server Error`

---

## Notes & Future Improvements

- **Pagination**:
  - Follows the same convention as other list endpoints:
    - `page`, `page_size`.
    - Response `meta` with `current_page`, `page_size`, `total_items`, `total_pages`.
  - Implemented with GORM `.Limit` / `.Offset` and `.Count`.

- **Soft delete vs hard delete**:
  - Current implementation uses `is_active` flag for logical deactivation.
  - `gorm.Model` includes `DeletedAt`; physical deletes are not used for plans to retain history.

- **Features storage**:
  - Features are stored as separate `PlanFeature` rows per plan.
  - API exposes them as a simple `[]string` (descriptions).

- **Multi-tenancy**:
  - `Plan` model includes `OrganizationID`; current endpoints do not explicitly filter by organization, but this is straightforward to add in `PlanRepository.List` for per-organization isolation.

- **Ideas for future work**:
  - Add `interval` as a proper DB column and enforce allowed values at the model level.
  - Introduce a true `archived` state separate from `is_active`.
  - Add endpoints to associate plans directly with organizations and enforce access boundaries.
  - Return localized labels for plan types/intervals if needed by frontend.


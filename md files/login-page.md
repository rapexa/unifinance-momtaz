## Login Page – Admin Access Only

This document describes the **Login page** added to the frontend, including its route, layout, styling, and integration with the backend auth API.

---

## Purpose

The Login page is the **entry point for admin users** to access the management dashboard. It:

- Collects email and password.
- Calls the backend `/api/v1/auth/login` endpoint.
- Enforces the **admin-only** rule (non-admins receive a clear error message).
- Stores the JWT access/refresh tokens on success and redirects to the main dashboard.

---

## Route and Navigation

- **Path**: `/login`
- **Component file**: `src/pages/Login.tsx`
- **Route registration**: in `src/App.tsx`:

```tsx
<BrowserRouter>
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/" element={<Index />} />
    {/* other routes */}
    <Route path="*" element={<NotFound />} />
  </Routes>
</BrowserRouter>
```

Behavior:

- Visiting `/login` shows the login form.
- If the user is already logged in (an `accessToken` exists in `localStorage`), the page immediately redirects to `/`.

---

## Component Structure

**File**: `src/pages/Login.tsx`

Key points:

- Uses React hooks:
  - `useState` for `email`, `password`, `loading`, `error`.
  - `useEffect` + `useNavigate` to redirect if already logged in.
- Uses `lucide-react` icons (`Lock`, `Mail`) to match the rest of the UI.
- Does **not** use `MainLayout` (no sidebar/header); instead, it uses a standalone centered card.

High-level JSX:

```tsx
return (
  <div className="min-h-screen flex items-center justify-center bg-background px-4">
    <div className="w-full max-w-md">
      <div className="card-elevated p-8">
        {/* Icon + title + subtitle */}
        {/* Email + password fields */}
        {/* Error box */}
        {/* Submit button */}
        {/* Forgot password link (stub) */}
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        © ۲۰۲۶ یونی‌فاینانس ممتاز – داشبورد مدیریتی
      </p>
    </div>
  </div>
);
```

---

## Styling and Design Language

The Login page reuses the **same design system** as the rest of the app:

- Background and text colors from `src/index.css` (`bg-background`, `text-foreground`).
- Global RTL layout (`html { direction: rtl; }`).
- **Card** look with:
  - `card-elevated` utility (rounded corners, subtle shadow, hover transition).
  - Internal padding (`p-8`).
- Primary action button:
  - `bg-primary`, `text-primary-foreground`, rounded, shadowed, with hover/disabled states:

```tsx
<button
  className="mt-2 flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
>
  {loading ? "در حال ورود..." : "ورود به سیستم"}
</button>
```

- Inputs mimic existing form fields:
  - Rounded borders, subtle focus ring using `--ring` token.

```tsx
<div className="flex items-center rounded-lg border bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
  <Mail className="mr-2 h-4 w-4 text-muted-foreground" />
  <input
    type="email"
    className="w-full bg-transparent text-sm outline-none"
    placeholder="admin@example.com"
  />
</div>
```

- Error messages use the same destructive color scheme as status chips:

```tsx
<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
  {error}
</div>
```

Visually, the page feels consistent with other forms (e.g., settings), but simplified and focused on login.

---

## API Integration

### Request

- **Method**: `POST`
- **URL**: `/api/v1/auth/login`
- **Body**:

```json
{
  "email": "admin@example.com",
  "password": "secret123"
}
```

Implementation (simplified):

```tsx
const res = await fetch("/api/v1/auth/login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ email, password }),
});

const data = await res.json().catch(() => null);
```

> Note: For local development, ensure the backend is reachable from the Vite dev server (via CORS headers on the backend or a Vite proxy).

### Success Handling

Expected backend response (simplified):

```json
{
  "user": { "id": 1, "first_name": "مدیر", "last_name": "سیستم", "email": "admin@example.com", "role": "ADMIN" },
  "tokens": {
    "access_token": "<JWT_ACCESS>",
    "refresh_token": "<JWT_REFRESH>"
  }
}
```

On success, the page:

```tsx
localStorage.setItem("accessToken", data.tokens.access_token);
if (data.tokens.refresh_token) {
  localStorage.setItem("refreshToken", data.tokens.refresh_token);
}

navigate("/", { replace: true });
```

### Error Handling

The page covers several error cases:

- **Validation (client-side)**:
  - Empty email or password → `"ایمیل و رمز عبور الزامی هستند."`
  - HTML5 validation for email format + `minLength={6}` for password.

- **401 Unauthorized (invalid credentials)**:

```tsx
res.status === 401
  ? "ایمیل یا رمز عبور نامعتبر است."
  : "خطا در ورود. دوباره تلاش کنید.";
```

- **403 Forbidden (admin restriction)**:
  - The backend returns:

  ```json
  { "error": "Access denied: Admin only" }
  ```

  - This is surfaced as-is in the red error box.

- **Network / unexpected errors**:
  - `"خطای اتصال به سرور. لطفاً بعداً دوباره تلاش کنید."`

---

## User Flow

1. User navigates to `/login`.
2. If a valid `accessToken` is already present in `localStorage`, they are redirected to `/`.
3. Otherwise:
   - The login card is shown.
   - User enters **organizational email** and **password**.
   - Clicks **"ورود به سیستم"**.
4. While the request is in flight:
   - Button text changes to `"در حال ورود..."`.
   - Button is disabled to prevent duplicate submissions.
5. On success:
   - Access/refresh tokens are stored in `localStorage`.
   - User is redirected to the dashboard (`/`).
6. On failure:
   - A localized error message is shown (credentials, admin-only, or network).

---

## Matching Existing Style & Future Extensions

- The page:
  - Uses the same **color palette**, **rounded radius**, and **typography** as other views.
  - Respects RTL direction and spacing patterns (padding, gaps).
  - Uses existing utility classes like `card-elevated`, `text-gradient`, and `text-muted-foreground`.

Potential future improvements:

- Use shared UI components (`Button`, `Input`) instead of raw `<button>` / `<input>` for stricter consistency.
- Implement **global auth context** (React Context + React Query) to:
  - Attach `Authorization: Bearer <token>` headers automatically.
  - Handle token refresh / logout flows.
- Add a dedicated **forgot password flow** (`/forgot-password` route) instead of a stubbed button.
- Add a **protected route wrapper** that redirects unauthenticated users from main pages to `/login`.


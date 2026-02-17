## Login Page – Admin Access Only

This document describes the **Login page** in the frontend: route, layout, styling, and integration with the backend auth API.

---

## Purpose

The Login page is the **entry point** for authenticated access to the management dashboard. It:

- Collects **organizational email** and **password**.
- Calls the backend via **`login()`** from `@/api/authApi` (POST `/api/v1/auth/login`).
- Enforces **admin-only** access: non-admin users receive a 403 and the message **"دسترسی فقط برای ادمین مجاز است."**
- On success, stores JWT **access** and **refresh** tokens in `localStorage` and redirects to **`/dashboard`**.
- If the user already has an `accessToken` in `localStorage`, they are **immediately redirected** to `/dashboard` (no form shown).

---

## Route and Navigation

- **Paths**: **`/`** and **`/login`** both render the Login page (same component).
- **Component file**: `src/pages/Login.tsx`
- **Route registration** in `src/App.tsx`:

```tsx
<Route path="/" element={<Login />} />
<Route path="/login" element={<Login />} />
<Route path="/dashboard" element={<Index />} />
// ... other routes
```

Behavior:

- Visiting `/` or `/login` shows the login form **only if** there is no `accessToken` in `localStorage`.
- If `accessToken` exists, `useEffect` runs and `navigate("/dashboard", { replace: true })`.
- After a successful login, the code calls `navigate("/dashboard", { replace: true })`.

The **dashboard** is only at **`/dashboard`**; the home path `/` is reserved for Login.

---

## Component Structure

**File**: `src/pages/Login.tsx`

Key points:

- **State**: `useState` for `email`, `password`, `loading`, `error`.
- **Redirect when already logged in**: `useEffect` checks `localStorage.getItem("accessToken")` and redirects to `/dashboard` if present.
- **Submit**: `handleSubmit` calls `login(email, password)` from `@/api/authApi`. On success it redirects to `/dashboard`; on failure it sets `error` with a localized message.
- **Icons**: `lucide-react` (`Lock`, `Mail`).
- **Layout**: Standalone centered card; **no** `MainLayout` (no sidebar/header).

High-level JSX:

```tsx
return (
  <div className="min-h-screen flex items-center justify-center bg-background px-4">
    <div className="w-full max-w-md">
      <div className="card-elevated p-8">
        {/* Icon + title + subtitle */}
        {/* Email + password fields (controlled) */}
        {/* Error box (conditional) */}
        {/* Submit button (disabled when loading) */}
        {/* Forgot password link (placeholder – shows message that feature is not implemented) */}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} یونی‌فاینانس ممتاز – داشبورد مدیریتی
      </p>
    </div>
  </div>
);
```

---

## Styling and Design Language

The Login page reuses the **same design system** as the rest of the app:

- `bg-background`, `text-foreground`, `text-muted-foreground`.
- **Card**: `card-elevated` (rounded, shadow, hover transition), padding `p-8`.
- **Primary button**: `bg-primary`, `text-primary-foreground`, rounded, shadow, hover/disabled states. Text shows "در حال ورود..." when `loading`.
- **Inputs**: Rounded border, `bg-card`, `focus-within:ring-2 focus-within:ring-ring`.
- **Error box**: `border-destructive/30`, `bg-destructive/10`, `text-destructive`.
- **Title**: `text-gradient` for "ورود به پنل مدیریت".
- RTL and spacing follow the global layout.

---

## API Integration

Login is implemented in **`src/api/authApi.ts`**:

- **Method**: POST  
- **URL**: `${API_BASE}/auth/login` (default `http://localhost:8081/api/v1/auth/login`)  
- **Body**: `{ "email": string, "password": string }`  
- **Headers**: `Content-Type: application/json` (no Bearer on login).

**Success**:

- Backend returns a JSON body with `tokens.access_token` (and optionally `tokens.refresh_token`).
- The client stores them in `localStorage` (`accessToken`, `refreshToken`) and returns `{ success: true, data }`.
- The Login page then redirects to `/dashboard`.

**Errors** (mapped to Farsi in `Login.tsx`):

- **Validation**: Empty email/password → "ایمیل و رمز عبور الزامی هستند."
- **401 (invalid credentials)**: `result.error === "Invalid credentials"` → "ایمیل یا رمز عبور نامعتبر است."
- **403 (admin only)**: `result.error === "Access denied"` → "دسترسی فقط برای ادمین مجاز است."
- **Server unreachable**: "Server unreachable. Please try again later." → "خطای اتصال به سرور. لطفاً بعداً دوباره تلاش کنید."
- Other errors shown as `result.error` or fallback "خطا در ورود. دوباره تلاش کنید."

For local development, the backend must be reachable (CORS allows the frontend dev origin, e.g. port 8080). Base URL can be overridden with `VITE_API_BASE_URL`.

---

## User Flow

1. User opens **`/`** or **`/login`**.
2. If `accessToken` exists → redirect to **`/dashboard`**.
3. Otherwise the login card is shown.
4. User enters email and password and clicks **"ورود به سیستم"**.
5. While the request is in progress: button shows "در حال ورود...", button is disabled.
6. On success: tokens stored, redirect to **`/dashboard`**.
7. On failure: one of the above error messages is shown in the red box.

---

## Matching Existing Style & Future Extensions

The page uses the same **color palette**, **radius**, and **typography** as the rest of the app (e.g. `card-elevated`, `text-gradient`, `text-muted-foreground`) and respects RTL.

Possible future improvements:

- Use shared UI components (`Button`, `Input`) from `components/ui/` for full consistency.
- **Protected route wrapper**: Redirect unauthenticated users from `/dashboard` and other main routes to `/login` when there is no token or when the profile request returns 401.
- **Forgot password**: Implement `/forgot-password` and wire the "فراموشی رمز عبور؟" link (currently shows a placeholder message).
- **Global auth context**: Optionally wrap the app in a context that provides user and logout, and attach token refresh logic (e.g. using `refreshToken`) in the API layer.

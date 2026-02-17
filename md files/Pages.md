## Pages and Routes

This document describes **every route/page** in the application, with purpose, layout, data, and interactions.

Route configuration lives in `src/App.tsx` via React Router v6:

```tsx
<Routes>
  <Route path="/" element={<Login />} />
  <Route path="/login" element={<Login />} />
  <Route path="/dashboard" element={<Index />} />
  <Route path="/users" element={<Users />} />
  <Route path="/students" element={<Students />} />
  <Route path="/plans" element={<Plans />} />
  <Route path="/payments" element={<Payments />} />
  <Route path="/payroll" element={<Payroll />} />
  <Route path="/reminders" element={<Reminders />} />
  <Route path="/reports" element={<Reports />} />
  <Route path="/settings" element={<Settings />} />
  <Route path="*" element={<NotFound />} />
</Routes>
```

The **Login** page does not use `MainLayout`. All other main pages (Dashboard, Users, Students, etc.) use the shared `MainLayout` shell. There is **no route-level auth guard** in the router; the Login page redirects to `/dashboard` when a token exists, and the Dashboard page redirects users without DASHBOARD permission to their first allowed page.

---

## `/` and `/login` – Login

- **File**: `src/pages/Login.tsx`
- **Component name**: `Login` (default export).

### Description

The **entry point** for authenticated access. Both `/` and `/login` render the same Login page. It:

- Collects email and password.
- Calls the backend via `login()` from `@/api/authApi` (POST `/api/v1/auth/login`).
- On success, stores JWT access/refresh tokens in `localStorage` and redirects to `/dashboard`.
- Enforces **admin-only** access: non-admin users receive a 403 and the message "دسترسی فقط برای ادمین مجاز است."
- If the user already has an `accessToken` in `localStorage`, they are immediately redirected to `/dashboard`.

### Components Used

- Standalone centered card (no `MainLayout`).
- `lucide-react` icons (`Lock`, `Mail`).
- Shared design tokens: `card-elevated`, `text-gradient`, `bg-primary`, `text-destructive`, etc.

### Functionality and User Flow

1. User opens `/` or `/login`.
2. If `accessToken` exists → redirect to `/dashboard`.
3. Otherwise the login form is shown; user enters email and password and submits.
4. On success → tokens stored, redirect to `/dashboard`.
5. On failure → error message shown (invalid credentials, access denied, or server error).

See `login-page.md` for API details and styling.

---

## `/dashboard` – Dashboard (Index)

- **File**: `src/pages/Index.tsx`
- **Component name**: `Dashboard` (default export).

### Description

The **main dashboard** after login. It provides a financial overview using **live data from the API**:

- KPI cards: total revenue, debts (pending + overdue), payroll, active students.
- Revenue vs. expenses chart (monthly trend from `getRevenueTrend`).
- Sidebar widgets: QuickActions, DebtAlerts (from dashboard summary).
- Recent payments table (from dashboard summary).

### API Integration

- `useCurrentUser()` for profile and permissions.
- `useQuery` for `getDashboardSummary({ recent_limit: 5, alerts_limit: 5 })` (key: `dashboard-summary`).
- `useQuery` for `getRevenueTrend({ months: 6 })` (key: `dashboard-revenue-trend`).
- If the user has no DASHBOARD permission, they are redirected to the first permitted section (e.g. `/students`, `/settings`) via `FIRST_ROUTE_BY_PERMISSION`.

### Components Used

- `MainLayout` with `title="داشبورد"`, `subtitle="خلاصه وضعیت مالی سیستم"`.
- `KPICard` ×4 (values from `summary.kpis`; loading state when `summaryLoading`).
- `RevenueChart` – receives `data={trendData}`, `isLoading={trendLoading}`.
- `QuickActions`, `DebtAlerts` (alerts from `summary?.debt_alerts`, loading from `summaryLoading`).
- `RecentPaymentsTable` – receives `payments={summary?.recent_payments}`, `isLoading={summaryLoading}`.

### Edge Cases

- Loading states: KPIs and widgets show "—" or loading text while data is fetched.
- Empty chart/debt lists: Components handle empty data (e.g. "داده‌ای برای نمایش وجود ندارد").

---

## `/users` – Users & Roles Management

- **File**: `src/pages/Users.tsx`
- **Component name**: `Users`.

### Description

Manages system users and roles. The UI typically includes search, role summary cards, and a table of users. Data may be loaded from **API** (`usersApi`) with React Query or local state; exact implementation (search/filter, pagination, CRUD) depends on the current code. Layout uses `MainLayout` and shared UI primitives (Button, Input, icons, etc.).

---

## `/students` – Students Management

- **File**: `src/pages/Students.tsx`
- **Component name**: `Students`.

### Description

Student profiles and financial data. May support grid/list views, summary stats, and search/filters. Data may come from **API** (`studentsApi`). Uses `MainLayout` and shared components.

---

## `/plans` – Plans & Services

- **File**: `src/pages/Plans.tsx`
- **Component name**: `Plans`.

### Description

Financial plans (monthly, yearly, workshops, etc.). List/cards with search, stats, and plan cards. Data may come from **API** (`plansApi`). Uses `MainLayout`.

---

## `/payments` – Payments

- **File**: `src/pages/Payments.tsx`
- **Component name**: `Payments`.

### Description

Central screen for payments: summary cards, search, tabs by status, and a payments table. Data may come from **API** (`paymentsApi`). Uses `MainLayout`, Tabs, status chips, and action buttons (filter, export, payment link, register payment).

---

## `/payroll` – Payroll & Salaries

- **File**: `src/pages/Payroll.tsx`
- **Component name**: `Payroll`.

### Description

Salary side: summary cards (total, fixed, variable, paid) and **two tabs**:

1. **فیش حقوقی** (default) – Table of all payroll entries for the selected period. Columns: employee, role, students count, base salary, variable salary, total, status, **عملیات**. Actions per row: **ویرایش** (edit), **جزئیات** (detail dialog), **PDF** (print payslip). **Edit** opens a dialog with the entry data; user can change base salary, variable salary, students count, and status, then save via **PUT** `/api/v1/payroll/entries/:id` (`updatePayrollEntry`). Creating a new entry is via «ثبت حقوق» and **POST** `/api/v1/payroll/entries`.
2. **ساختار حقوق** – Cards describing fixed/variable salary structure (from schemes); edit buttons are placeholders.

The separate «فیش‌های حقوقی» tab has been **removed**; the list of payslips lives only in the **فیش حقوقی** tab. Data from **API** (`payrollApi`: summary, list entries, get entry, create, **update**). Uses `MainLayout`, Tabs, Dialog (create, detail, **edit**), Button, Input, Select.

---

## `/reminders` – Payment Reminders

- **File**: `src/pages/Reminders.tsx`
- **Component name**: `Reminders`.

### Description

Reminder configuration and history: config cards (pre-due, due-day, overdue), toggles, table of reminders, bulk send. Backend reminder endpoints may not be fully implemented yet; page may use mock data or placeholders. Uses `MainLayout`, Button, Input, Switch.

---

## `/reports` – Reports & Analytics

- **File**: `src/pages/Reports.tsx`
- **Component name**: `Reports`.

### Description

Financial reports and charts (revenue, payroll, debts). May use **API** (`reportsApi`) for summary and series data. Uses `MainLayout`, Tabs, and `recharts` (area, bar, pie). Chart containers may use `dir="ltr"` for axis orientation.

---

## `/settings` – Settings

- **File**: `src/pages/Settings.tsx`
- **Component name**: `Settings`.

### Description

Configuration: organization, **profile** (including **profile image upload**), security (password, 2FA), notifications, payment settings. Data and updates use **API** (`settingsApi`: organization, profile, security, notifications, payments).

### Profile tab

- **Profile image**: User can upload an avatar via a file input (accepts jpeg, png, gif, webp). The frontend calls `uploadProfileAvatar(file)` (POST `/api/v1/settings/profile/avatar`, multipart). The backend saves the file under `uploads/avatars/{userID}.{ext}` and updates the user’s `avatar_url`. The image is displayed via `getUploadsBase()` + `profile.avatar_url` (served at `/uploads/...` on the API origin). If no avatar is set, the first letter of the name is shown in a circle.
- Other profile fields: first name, last name, email, phone; save via `updateProfile`.

Uses `MainLayout`, Tabs, Button, Input, Switch.

---

## `*` – Not Found (404)

- **File**: `src/pages/NotFound.tsx`
- **Component name**: `NotFound`.

### Description

Catch‑all route for unmatched paths. Renders a centered card with 404 message and a link back home. Prefer using React Router’s `<Link to="/">` or `<Link to="/dashboard">` instead of `<a href="/">` to avoid full page reload.

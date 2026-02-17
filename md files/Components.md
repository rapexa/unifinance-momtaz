## Components Overview

This document covers the **reusable components** and how they are used across pages.

At a high level:

- `layout/` components define the **application shell** (with auth-aware sidebar and header).
- `dashboard/` components are **data-driven widgets** (they accept API data and loading state).
- `ui/` components implement the **design system primitives** (buttons, inputs, tabs, etc.).
- `api/` modules provide **typed API clients** used by pages and hooks.
- `hooks/` (including `useCurrentUser`) and `lib/` provide shared utilities.

---

## Layout Components

### `MainLayout`

- **File**: `src/components/layout/MainLayout.tsx`
- **Purpose**: Shared scaffold for all main application pages (Dashboard, Users, Students, etc.).

Props:

- `children: ReactNode` – page content.
- `title: string` – passed to `AppHeader`.
- `subtitle?: string` – optional subtitle in the header.

Structure:

- Sidebar: `<AppSidebar />`.
- Main section: `<AppHeader title={title} subtitle={subtitle} />` and a scrollable content area with `children`.

Usage:

- Every main route except Login and NotFound wraps its content in `MainLayout`.

---

### `AppSidebar`

- **File**: `src/components/layout/AppSidebar.tsx`
- **Purpose**: Top-level navigation (permission-filtered), brand area, and user block with logout.

Key details:

- **Navigation**: Static array `navItems` with `title`, `href`, `icon`, and `permission` (from `@/api/settingsApi` – e.g. `PERMISSIONS.DASHBOARD`, `PERMISSIONS.USERS`). Items are **filtered** with `hasPermission(profile?.permissions, item.permission)` so only allowed sections are shown. Dashboard link is `/dashboard`.
- **User state**: Uses `useCurrentUser()` – `profile`, `isLoading`, `isError`, `logout`. Display name and role are derived from `profile`. If **`profile.avatar_url`** is set, the bottom section shows the **uploaded avatar image** (via **`getUploadsBase()` + `profile.avatar_url`**); otherwise the first letter in a circle. Dropdown with links to Settings and **خروج** (logout). Logout calls `logout()` then `navigate("/login")`.
- **Collapsed state**: `collapsed` (useState); on desktop the sidebar can shrink to icon-only; on mobile an overlay and floating button open/close the sidebar.
- Styling: `sidebar-*` tokens, `cn()` for conditional classes. Active route is highlighted (e.g. `bg-sidebar-primary`).

Routing:

- Uses `<Link to={item.href}>` from `react-router-dom` for nav items.

---

### `AppHeader`

- **File**: `src/components/layout/AppHeader.tsx`
- **Purpose**: Sticky header with page title, search, notification count (from API), and user menu.

Props:

- `title: string`
- `subtitle?: string`

Features:

- Sticky at top, semi-transparent background with blur.
- Title and subtitle on one side.
- **Notification count**: `useQuery` with `getNotificationCount` from `@/api/settingsApi` (query key: `notification-count`). Badge shows count (or 99+).
- **User menu**: Uses `useCurrentUser()` for display name and role. If the user has **`profile.avatar_url`**, an avatar image is shown (from **`getUploadsBase()` + `profile.avatar_url`**); otherwise the first letter of the name in a circle. Dropdown with **پروفایل**, **تنظیمات** (links to `/settings`), and **خروج** (logout → `logout()` and `navigate("/login")`).
- Search input is present (local UI; no backend search wired).

---

## Dashboard Components

Dashboard widgets are designed to receive **data and loading state** from the parent (typically from React Query in the Dashboard page). They no longer rely on hardcoded mock data inside the component.

### `KPICard`

- **File**: `src/components/dashboard/KPICard.tsx`
- **Purpose**: KPI statistic card with optional trend indicator.

Props:

- `title: string`
- `value: string` – formatted value (e.g. from API, formatted as Persian).
- `change?`: `value: string`, `trend: "up" | "down"` – optional.
- `icon: LucideIcon`
- `variant?: "default" | "success" | "warning" | "danger"`

Usage:

- Used on the dashboard for revenue, debts, payroll, active students (values from `getDashboardSummary().kpis`).

---

### `RevenueChart`

- **File**: `src/components/dashboard/RevenueChart.tsx`
- **Purpose**: Area chart comparing monthly revenue vs. expenses.

Props:

- `data?: RevenueTrendPoint[]` – from API (`getRevenueTrend`). Each point: `year`, `month`, `revenue_cents`, `payroll_cents`.
- `isLoading?: boolean`

Implementation:

- Uses `recharts`: `AreaChart`, `Area`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `ResponsiveContainer`. Transforms API data to `month` label and revenue/expenses (tomans). Renders in a `card-elevated` with legend. Shows loading or empty state when no data.

---

### `RecentPaymentsTable`

- **File**: `src/components/dashboard/RecentPaymentsTable.tsx`
- **Purpose**: Table of recent payments (e.g. last 5 from dashboard summary).

Props:

- `payments?: DashboardPaymentItem[]` – from API (`getDashboardSummary().recent_payments`). Items include `id`, `student_name`, `amount_cents`, `status`, `method`, `paid_at`, `created_at`, etc.
- `isLoading?: boolean`

Status and method labels:

- Status: PAID, PENDING, OVERDUE mapped to Farsi and `status-paid`, `status-pending`, `status-debt`.
- Method: CARD_TO_CARD, GATEWAY, CASH, etc. mapped to Farsi.

---

### `DebtAlerts`

- **File**: `src/components/dashboard/DebtAlerts.tsx`
- **Purpose**: List of overdue debt alerts.

Props:

- `alerts?: DebtAlertItem[]` – from API (`getDashboardSummary().debt_alerts`). Each: `student_id`, `student_name`, `amount_cents`, `days_overdue`.
- `isLoading?: boolean`

UI:

- Header with icon, title "هشدار بدهی‌ها", and count badge. List of alerts with student name, days overdue, amount. Footer link/button (e.g. "مشاهده همه بدهی‌ها"). Loading and empty states are handled.

---

### `QuickActions`

- **File**: `src/components/dashboard/QuickActions.tsx`
- **Purpose**: Grid of action buttons (e.g. ثبت پرداخت, لینک پرداخت, فیش حقوقی, ارسال یادآوری). Buttons may be wired to routes or dialogs as the app evolves.

---

## API Layer (`src/api/`)

The frontend uses **typed API modules** that call the backend with `getAuthHeaders()` (Bearer token from `localStorage`). Base URL: `http://localhost:8081/api/v1` or `VITE_API_BASE_URL`.

- **authApi.ts**: `login(email, password)` – POST `/auth/login`, stores tokens, returns success/error.
- **dashboardApi.ts**: `getDashboardSummary(params?)`, `getRevenueTrend(params?)` – dashboard summary and revenue trend.
- **settingsApi.ts**: Organization, profile (`getProfile`, `updateProfile`), **`uploadProfileAvatar(file)`** (POST `/settings/profile/avatar`, multipart), **`getUploadsBase()`** (base URL for serving uploaded files, e.g. avatars). Security (password, 2FA), notifications, payment settings. Exports `PERMISSIONS` and `Profile` type used by sidebar and `useCurrentUser`.
- **usersApi.ts**, **studentsApi.ts**, **plansApi.ts**, **paymentsApi.ts**, **payrollApi.ts** (includes **`updatePayrollEntry(id, payload)`** – PUT `/payroll/entries/:id`), **reportsApi.ts**: Resource-specific list/get/create/update/delete or summary/export where implemented.

These are used by pages and by hooks such as `useCurrentUser`.

---

## Hooks

### `useCurrentUser`

- **File**: `src/hooks/useCurrentUser.ts`
- **Purpose**: Current user profile and logout for layout and permission checks.

Implementation:

- `useQuery` with `queryKey: ["current-user"]`, `queryFn: getProfile` (from `@/api/settingsApi`). Retries disabled on 401 or auth-related errors. Returns `profile`, `isLoading`, `isError`, `logout`. `logout()` clears query cache and removes `accessToken` and `refreshToken` from `localStorage`.

Used by:

- `AppSidebar`, `AppHeader` (display name, role, logout, permission filtering in sidebar).
- Dashboard (Index) for permission-based redirect when user has no DASHBOARD permission.

### `use-mobile`

- **File**: `src/hooks/use-mobile.tsx`
- Used where behavior differs between mobile and desktop (e.g. sidebar layout).

### `use-toast`

- **File**: `src/hooks/use-toast.ts` and `components/ui/use-toast.ts`
- Triggers toasts from components.

### `lib/utils.ts`

- **cn**: Class name merging (e.g. for conditional Tailwind classes). Other shared helpers as needed.

### `lib/shamsi.ts`

- **Shamsi (Jalali) ↔ Gregorian** conversion for month/year: **`shamsiToGregorianYYYYMM(sYear, sMonth)`**, **`gregorianYYYYMMToShamsi(ym)`**, **`shamsiYearOptions()`**, **`SHAMSI_MONTH_NAMES`**. Used by the Reports page so the user can pick the report range in **شمسی** (year + month name); the app converts to `YYYY-MM` for the API.

---

## Navigation Components

### `NavLink`

- **File**: `src/components/NavLink.tsx`
- Thin wrapper around React Router’s `NavLink` with `activeClassName` / `pendingClassName`. Sidebar currently uses `<Link>` directly; this component is available for nav items that need active styling.

---

## UI (Design System) Components

Under `src/components/ui/`: shadcn-style primitives (Radix-based). They support the rest of the app with consistent props and tokens. Key groups:

- **Form controls**: button, input, textarea, checkbox, radio-group, switch, select, input-otp.
- **Feedback**: alert, toast, toaster, sonner, progress, skeleton.
- **Layout**: card, accordion, collapsible, scroll-area, resizable, aspect-ratio, sheet, sidebar.
- **Overlays & menus**: dialog, alert-dialog, drawer, dropdown-menu, context-menu, hover-card, popover, tooltip, menubar, navigation-menu.
- **Navigation**: breadcrumb, pagination, tabs, toggle, toggle-group.
- **Data display**: table, badge, avatar, calendar, chart, carousel.

---

## Component Usage by Page (Summary)

- **Login**: No MainLayout; standalone card.
- **Dashboard (Index)**: MainLayout, KPICard ×4, RevenueChart, QuickActions, DebtAlerts, RecentPaymentsTable (all fed from dashboard API and loading state).
- **Settings**: MainLayout, Tabs (general, **profile** with **avatar upload** via `uploadProfileAvatar` and `getUploadsBase`), security, notifications, payments.
- **Payroll**: MainLayout, summary cards, Tabs (**فیش حقوقی** – table with **ویرایش** opening edit dialog and `updatePayrollEntry`, جزئیات, PDF – and **ساختار حقوق**). Dialogs: create entry, detail entry, **edit entry** (EditPayrollForm).
- **Users, Students, Plans, Payments, Reminders, Reports**: MainLayout plus page-specific content; data may come from corresponding API modules and React Query.

This architecture keeps layout and auth in one place (sidebar/header + useCurrentUser), dashboard widgets data-driven, and pages focused on domain UI and API wiring.

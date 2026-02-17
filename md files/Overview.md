## Overview

This frontend is a **single-page web application** for managing the finances and operations of an educational consulting group (students, plans, payments, payroll, reminders, and reports). It communicates with a **Go (Gin) backend API** and uses **JWT authentication** with **role-based access control (RBAC)**.

- **Language**: TypeScript
- **Framework / UI library**: React 18 (SPA)
- **Routing**: React Router v6 (`BrowserRouter`)
- **State / data fetching**: `@tanstack/react-query` (QueryClient) with **real API integration** via `src/api/*.ts` modules
- **Auth**: Login at `/` and `/login`; JWT stored in `localStorage`; `useCurrentUser` hook and permission-based sidebar/dashboard redirect
- **Styling**: Tailwind CSS with a custom RTL, finance‑oriented design system
- **Component library**: shadcn‑ui (Radix UI) + custom design tokens
- **Charts**: `recharts`
- **Build tool**: Vite

**Backend (reference):**

- **Stack**: Go, Gin, JWT, RBAC (permission middleware), Swagger at `/swagger/*`
- **Base path**: `/api/v1`
- **Auth**: `POST /auth/login`, `POST /auth/refresh`, protected routes via `Authorization: Bearer <token>`
- **Main resource groups**: `/auth`, `/users`, `/students`, `/plans`, `/payments`, `/dashboard`, `/payroll`, `/reports`, `/settings` (organization, profile, security, notifications, payments)

---

## Project Structure

The **frontend** source lives in the repository root under `src/` (no separate `frontend/` folder for the main app).

Top‑level files (frontend‑relevant):

- `index.html`: HTML shell that mounts the React app on the `#root` div.
- `vite.config.ts`: Vite configuration, React SWC plugin, alias for `@` → `./src`.
- `tsconfig*.json`: TypeScript configuration for the app and tooling.
- `tailwind.config.ts`, `postcss.config.js`: Tailwind / PostCSS pipeline configuration.
- `eslint.config.js`, `vitest.config.ts`: Linting and testing setup.
- `package.json`: Scripts and dependencies.

Source tree (`src/`):

- `main.tsx` – React entry point that mounts `<App />` to `#root`.
- `App.tsx` – Global providers (React Query, tooltips, toasts) and all routes.
- `pages/` – **Top‑level pages** mapped to URL paths.
- `components/layout/` – Layout shell (`MainLayout`, `AppSidebar`, `AppHeader`).
- `components/dashboard/` – Dashboard widgets (KPICard, RevenueChart, RecentPaymentsTable, DebtAlerts, QuickActions).
- `components/ui/` – Reusable shadcn‑style primitives (buttons, inputs, tabs, etc.).
- `api/` – **API client modules** (authApi, dashboardApi, usersApi, studentsApi, plansApi, paymentsApi, payrollApi, reportsApi, settingsApi) with shared `getAuthHeaders()` for Bearer token.
- `hooks/` – Shared hooks (`use-mobile`, `use-toast`, `useCurrentUser`).
- `lib/utils.ts` – Utility helpers (e.g. `cn`).
- `index.css` – Tailwind setup, theme tokens, and app‑wide utility classes.

---

## Entry Points and Application Bootstrapping

### HTML Shell (`index.html`)

- Provides a minimal HTML document with a `<div id="root"></div>` element.
- Vite injects the compiled JS bundle that runs `src/main.tsx`.

### React Entry (`src/main.tsx`)

Responsibilities:

- Import global styles from `src/index.css`.
- Create a React DOM root and render `<App />`:

```typescript
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
```

### Application Shell (`src/App.tsx`)

`App` is the **top‑level React component** that wires together:

- `QueryClientProvider` – global React Query client.
- `TooltipProvider` – context for UI tooltips.
- Two toast systems: `Toaster` (shadcn) and `Sonner` (sonner).
- `BrowserRouter` & `Routes` – SPA routing.

Route configuration (React Router v6):

```tsx
<BrowserRouter>
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
</BrowserRouter>
```

There is **no server‑side rendering**; all routing is client‑side via `BrowserRouter`. **Authentication** is not enforced at the route level in `App.tsx`; the Login page redirects to `/dashboard` when a token exists, and the Dashboard (Index) redirects to the first allowed page when the user lacks the DASHBOARD permission.

---

## Route Map (Site Map)

| Path        | Page / purpose                                      |
|------------|------------------------------------------------------|
| `/`        | Login (same as `/login`)                             |
| `/login`   | Login                                                |
| `/dashboard`| Dashboard (Index) – KPIs, chart, recent payments, debt alerts |
| `/users`   | Users & roles management                             |
| `/students`| Students list and profiles                           |
| `/plans`   | Plans & services                                    |
| `/payments`| Payments list and stats                              |
| `/payroll` | Payroll & salary structure                           |
| `/reminders`| Reminder rules and history                          |
| `/reports` | Analytical reports and charts                        |
| `/settings`| System & profile settings                            |
| `*`        | 404 Not Found                                        |

- **Landing**: `/` and `/login` both render the Login page; after login, users are redirected to `/dashboard`.
- **Dashboard**: Only at `/dashboard` (no longer at `/`).
- **RBAC**: Sidebar nav items are filtered by the current user’s `permissions` (from `GET /settings/profile`). Users without DASHBOARD are redirected from the dashboard to the first permitted section (e.g. `/students`, `/settings`).
- Navigation is driven by `AppSidebar` (links to the above paths) and header/user menu (e.g. logout, settings).

---

## Global Layout & Architecture

### `MainLayout`

`MainLayout` wraps all main application pages (Dashboard, Users, Students, etc.) with:

- **Persistent sidebar**: `AppSidebar` (navigation filtered by permissions, brand area, user summary and dropdown with logout).
- **Sticky header**: `AppHeader` (page title, subtitle, search, notification count from API, user menu with profile/settings/logout).
- **Scrollable content area**: a flex container with padding where the page body is rendered.

Data flow:

- The page component passes `title` and `subtitle` to `MainLayout`.
- `MainLayout` passes those to `AppHeader` and renders `children` in the main content area.

### `AppSidebar`

Responsibilities:

- **Permission-based navigation**: Nav items are filtered with `hasPermission(profile?.permissions, item.permission)`. Items use permission codes from `@/api/settingsApi` (e.g. DASHBOARD, USERS, STUDENTS).
- **Dashboard link**: Points to `/dashboard` (not `/`).
- **User block**: Uses `useCurrentUser()` (profile, isLoading, isError, logout). Displays display name and role; dropdown with links to Settings, and **خروج** (logout) which calls `logout()` and `navigate("/login")`.
- Collapsible behavior: desktop icon‑only mode; mobile overlay + floating button to open/close.

### `AppHeader`

Responsibilities:

- Display current page `title` and optional `subtitle`.
- Global search input (local UI; no backend search wired yet).
- Notification bell with **live count** from `getNotificationCount()` (React Query, key `notification-count`).
- User chip and dropdown (profile, settings, logout) using `useCurrentUser()`.

---

## API Integration

- **Base URL**: `http://localhost:8081/api/v1` by default; overridable via `VITE_API_BASE_URL`.
- **Auth**: After login, `accessToken` (and optionally `refreshToken`) are stored in `localStorage`. API modules use `getAuthHeaders()` which returns `{ Authorization: "Bearer " + accessToken }`.
- **Modules**: `authApi`, `dashboardApi`, `usersApi`, `studentsApi`, `plansApi`, `paymentsApi`, `payrollApi`, `reportsApi`, `settingsApi`. They expose typed functions that call `fetch` with auth headers and return promises (or throw on non‑OK).
- **React Query**: Used for current user (`useCurrentUser` → `getProfile`), dashboard data (summary, revenue trend), notification count, and other list/summary endpoints. Queries use stable `queryKey`s and often `staleTime`; mutations or refetches can be added per feature.
- **Profile & RBAC**: `GET /settings/profile` returns user profile including `permissions` array and optional `avatar_url`. **Profile image upload**: `POST /settings/profile/avatar` (multipart) saves the file under `/uploads/avatars/` and updates the user’s avatar URL; the app serves uploads from `/uploads` on the API origin. Sidebar and dashboard redirect logic use profile permissions to show only allowed sections.

---

## Technology Stack Details

### Core Runtime

- **React 18** with functional components and hooks.
- **TypeScript** for static typing across components, hooks, and API types.
- **React Router v6** for declarative, component‑based routing.
- **React Query (@tanstack/react-query)**:
  - Used for server state (e.g. dashboard summary, revenue trend, profile, notification count).
  - `useCurrentUser` and logout clear tokens and invalidate `current-user` query.

### UI & Design System

- **Tailwind CSS**: Applied via `index.css` and `tailwind.config.ts`; custom CSS variables for colors, typography, sidebar, charts, gradients; RTL via `html { direction: rtl; }`; utilities such as `status-paid`, `status-pending`, `status-debt`, `card-elevated`, `number-display`, `text-gradient`.
- **shadcn‑ui** under `components/ui/`: buttons, inputs, tabs, tables, dialogs, dropdowns, etc., built on Radix UI.
- **Icons**: `lucide-react` across the app.

### Feedback & Overlays

- **Toasts**: `Toaster` (shadcn) and `Sonner`.
- **Tooltips**: `TooltipProvider` wraps the app; tooltip components in `ui/tooltip.tsx`.

### Charts & Analytics

- `recharts` in `RevenueChart` (dashboard) and on the Reports page. Dashboard chart data comes from **API** (`getRevenueTrend`); Reports may use API or local data depending on implementation.

---

## High-Level Behavior and Data Flow

- **Auth**: User logs in at `/` or `/login`; tokens are stored; redirect to `/dashboard`. Logout clears tokens and redirects to `/login`. Profile (and permissions) are loaded via `useCurrentUser` for sidebar and header.
- **Dashboard**: Fetches `getDashboardSummary` and `getRevenueTrend` via React Query; passes API data (and loading state) to KPICard, RevenueChart, DebtAlerts, RecentPaymentsTable. Users without DASHBOARD are redirected to the first permitted page.
- **Other pages**: May use their respective API modules (students, users, plans, payments, payroll, reports, settings) with React Query or local state; structure supports loading/error states and real data.
- Financial values are typically represented as **formatted Persian strings** (e.g. via `toLocaleString("fa-IR")`) or as numeric values in API types (e.g. `amount_cents`).

---

## Known / Potential Issues (High-Level)

- **Protected routes**: There is no global route guard in `App.tsx`; unauthenticated users can open `/dashboard` or other URLs directly. If the backend returns 401, the UI may show errors or empty state; consider a wrapper that redirects to `/login` when there is no token or profile.
- **404 page**: May still use a raw `<a href="/">` instead of `<Link to="/">`; prefer `<Link>` to stay inside the SPA.
- **Accessibility**: Icons and buttons may lack `aria-label`; tables may lack ARIA roles or captions.
- **Internationalization**: App is Farsi‑first and RTL; some labels may be in English (e.g. 404 message).
- **Reminders**: Backend may not yet expose reminder endpoints (TODO in backend); the Reminders page may be UI‑only or use mocks.
- **Performance**: For large datasets, tables and charts may need pagination or virtualization.

Subsequent docs (`Pages.md`, `Components.md`, `Styles.md`, `login-page.md`) go into route‑by‑route, component‑by‑component, and design system details.

## Components Overview

This document covers the **reusable components** and how they are used across pages.

At a high level:

- `layout/` components define the **application shell**.
- `dashboard/` components create composable dashboard widgets.
- `ui/` components implement the **design system primitives** (buttons, inputs, tabs, etc.).
- `hooks/` and `lib/` provide supporting utilities.

---

## Layout Components

### `MainLayout`

- **File**: `src/components/layout/MainLayout.tsx`
- **Purpose**: Shared scaffold for nearly all pages.

Props:

- `children: ReactNode` – page content.
- `title: string` – passed to `AppHeader`.
- `subtitle?: string` – optional subtitle, also shown in the header.

Structure:

- Right‑hand (RTL) sidebar: `<AppSidebar />`.
- Main section:
  - `<AppHeader title={title} subtitle={subtitle} />`
  - Scrollable content area with padding and `children`.

Usage:

- Every main route (`Index`, `Users`, `Students`, `Plans`, `Payments`, `Payroll`, `Reminders`, `Reports`, `Settings`) wraps its content in `MainLayout`.

---

### `AppSidebar`

- **File**: `src/components/layout/AppSidebar.tsx`
- **Purpose**: Top‑level navigation and user summary.

Key details:

- Defines a static array `navItems`:
  - `title` (Farsi label).
  - `href` (route path).
  - `icon` (Lucide icon component).
  - Optional `badge` (for counts like number of students or pending payments).
- Uses `useLocation()` to compute `isActive` for each link based on `location.pathname`.
- Renders:
  - A brand header with an icon and organization label.
  - Navigation list with icons, labels, and badges.
  - A user section at the bottom (avatar + name/role).

Behavior:

- **Collapsed state**:
  - Controlled by `collapsed` (`useState(false)`).
  - On large screens, shows a toggle button that turns the sidebar into a narrow icon bar.
  - On mobile, uses an overlay and a floating button to open/close.
- Styles are based on:
  - `sidebar-*` design tokens from `index.css` (e.g., `bg-sidebar`, `border-sidebar-border`).
  - `cn` for conditional classes.

Routing:

- Uses `<Link to={item.href}>` from `react-router-dom`.

---

### `AppHeader`

- **File**: `src/components/layout/AppHeader.tsx`
- **Purpose**: Sticky header with page title, search, notifications, and user menu.

Props:

- `title: string`
- `subtitle?: string`

Features:

- Sticky at top, semi‑transparent background with blur.
- Title and subtitle section on the left.
- On the right:
  - Search input (desktop only).
  - Notification bell button (`Bell` icon) with a static badge (“۵”).
  - User menu button:
    - Avatar circle with initial.
    - Name and role text.
    - `ChevronDown` icon.

Interactions:

- No dropdown menu attached yet; all buttons are UI only.

---

## Dashboard Components

### `KPICard`

- **File**: `src/components/dashboard/KPICard.tsx`
- **Purpose**: KPI statistic card with optional trend indicator.

Props:

- `title: string`
- `value: string` – formatted value (e.g., `"۱۲۵,۴۵۰,۰۰۰"`).
- `change?`:
  - `value: string` – e.g., `"+۱۲٪"`.
  - `trend: "up" | "down"` – determines color and icon.
- `icon: LucideIcon` – icon for the top‑right.
- `variant?: "default" | "success" | "warning" | "danger"` – background color of icon container.

Usage:

- Used on the dashboard home page to show revenue, debts, payroll, and active students.

---

### `RevenueChart`

- **File**: `src/components/dashboard/RevenueChart.tsx`
- **Purpose**: Area chart comparing monthly revenue vs. expenses.

Implementation:

- Uses `recharts`:
  - `AreaChart`, `Area`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `ResponsiveContainer`.
- Data is a static `data` array of `{ month, revenue, expenses }`.
- Renders in a card (`card-elevated`) with legend and Farsi month labels.
- Uses `dir="ltr"` on the chart container to keep X‑axis direction intuitive despite RTL UI.

Usage:

- Placed on the dashboard page.
- Similar patterns are reused in the `Reports` page (with different data).

---

### `RecentPaymentsTable`

- **File**: `src/components/dashboard/RecentPaymentsTable.tsx`
- **Purpose**: Compact table of the most recent payments.

Data:

- `mockPayments` array of `{ id, student, amount, date, status, method }`.

Status:

- `statusLabels` and `statusStyles` map keys `"paid" | "pending" | "debt"` to:
  - Display text.
  - CSS utility classes for styling.

Features:

- Shown inside a `card-elevated`.
- Table columns:
  - Student (with avatar circle).
  - Amount.
  - Date.
  - Method.
  - Status chip.
- Each row has a slight animation delay for a subtle entrance effect.

---

### `DebtAlerts`

- **File**: `src/components/dashboard/DebtAlerts.tsx`
- **Purpose**: List of overdue debt alerts.

Data:

- `mockAlerts` array of `{ id, student, amount, daysOverdue }`.

UI:

- Header bar with:
  - `AlertTriangle` icon.
  - Title “هشدار بدهی‌ها”.
  - Badge for total alerts.
- For each alert:
  - Student name and initial.
  - Days overdue.
  - Amount and “تومان”.
- Footer button “مشاهده همه بدهی‌ها” with arrow icon.

Interactions:

- No click handlers; the button is a visual affordance only.

---

### `QuickActions`

- **File**: `src/components/dashboard/QuickActions.tsx`
- **Purpose**: Grid of action buttons for common operations.

Actions:

- `ثبت پرداخت`
- `لینک پرداخت`
- `فیش حقوقی`
- `ارسال یادآوری`

Behavior:

- Each action is a `<Button>` with an icon and label.
- No handlers are attached yet; these are ready to be wired to routes or dialogs.

---

## Navigation Components

### `NavLink`

- **File**: `src/components/NavLink.tsx`
- **Purpose**: Thin wrapper around React Router’s `<NavLink>` providing `activeClassName` / `pendingClassName` props for compatibility with older patterns.

Props:

- Extends `NavLinkProps`, but:
  - `className?: string`
  - `activeClassName?: string`
  - `pendingClassName?: string`

Implementation:

- Forwards ref to the underlying `<RouterNavLink>`.
- Computes `className` using `cn` and the `isActive` / `isPending` flags from `react-router-dom`.

Usage:

- Not heavily used in current pages (sidebar uses `<Link>` directly), but useful for future nav items that require active styling.

---

## UI (Design System) Components

> Note: These are shadcn‑style primitives under `src/components/ui/`. They broadly follow standard shadcn APIs and use Radix UI under the hood. Only their high‑level roles are documented here; refer to individual files for advanced props and patterns.

Key primitives:

- **Form controls**:
  - `button.tsx`, `input.tsx`, `textarea.tsx`, `checkbox.tsx`, `radio-group.tsx`, `switch.tsx`, `select.tsx`, `input-otp.tsx`.
- **Feedback**:
  - `alert.tsx`, `toast.tsx`, `toaster.tsx`, `sonner.tsx`, `progress.tsx`, `skeleton.tsx`.
- **Layout & containers**:
  - `card.tsx`, `accordion.tsx`, `collapsible.tsx`, `scroll-area.tsx`, `resizable.tsx`, `aspect-ratio.tsx`, `sheet.tsx`, `sidebar.tsx`.
- **Overlays & menus**:
  - `dialog.tsx`, `alert-dialog.tsx`, `drawer.tsx`, `dropdown-menu.tsx`, `context-menu.tsx`, `hover-card.tsx`, `popover.tsx`, `tooltip.tsx`, `menubar.tsx`, `navigation-menu.tsx`.
- **Navigation aids**:
  - `breadcrumb.tsx`, `pagination.tsx`, `tabs.tsx`, `toggle.tsx`, `toggle-group.tsx`.
- **Data display**:
  - `table.tsx`, `badge.tsx`, `avatar.tsx`, `calendar.tsx`, `chart.tsx`, `carousel.tsx`.

Common patterns:

- Each component:
  - Exposes typed props.
  - Uses Tailwind classes plus CSS variables from `index.css`.
  - Follows shadcn naming and composition conventions.

---

## Hooks and Utilities

### `use-mobile`

- **File**: `src/hooks/use-mobile.tsx`
- Likely determines if the current viewport is considered mobile (implementation not fully detailed here, but typically uses `useMediaQuery` or `window.matchMedia`).
- Used where behavior diverges between mobile and desktop layouts.

### `use-toast`

- **File**: `src/hooks/use-toast.ts` and `components/ui/use-toast.ts`
- Provides hooks to trigger toasts from any component.

### `lib/utils.ts`

- Contains helper functions such as:
  - `cn` – class name merging.
  - Any additional shared utilities added by the project.

---

## Component Usage by Page (Summary)

High‑level mapping of **major components** to **pages**:

- `Index`:
  - `MainLayout`, `KPICard`, `RevenueChart`, `QuickActions`, `DebtAlerts`, `RecentPaymentsTable`.
- `Users`:
  - `MainLayout`, `Button`, `Input`, avatar & status pills using utilities.
- `Students`:
  - `MainLayout`, `Button`, `Input`, list/grid layout, status and number utilities.
- `Plans`:
  - `MainLayout`, `Button`, `Input`, `Badge`, feature list with `Check` icons.
- `Payments`:
  - `MainLayout`, `Button`, `Input`, `Tabs`, status chips.
- `Payroll`:
  - `MainLayout`, `Button`, `Tabs`, table for employees, cards for structures.
- `Reminders`:
  - `MainLayout`, `Button`, `Input`, `Switch`, status icons.
- `Reports`:
  - `MainLayout`, `Button`, `Tabs`, various `recharts` charts.
- `Settings`:
  - `MainLayout`, `Button`, `Input`, `Switch`, `Tabs`.

This architecture promotes **reuse and consistency**:

- Layout is fixed and opinionated via `MainLayout`, `AppSidebar`, `AppHeader`.
- Page components focus on domain‑specific UI and data (currently mocked).
- `ui/` primitives ensure visual consistency and rapid iteration across the app.


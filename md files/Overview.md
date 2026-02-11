## Overview

This frontend is a **single-page web application** for managing the finances and operations of an educational consulting group (students, plans, payments, payroll, reminders, and reports).

- **Language**: TypeScript
- **Framework / UI library**: React 18 (SPA)
- **Routing**: React Router v6 (`BrowserRouter`)
- **State / data fetching**: `@tanstack/react-query` (QueryClient, ready for API integration)
- **Styling**: Tailwind CSS with a custom RTL, finance‑oriented design system
- **Component library**: shadcn‑ui (Radix UI) + custom design tokens
- **Charts**: `recharts`
- **Build tool**: Vite

The codebase is currently **mock‑data only** (no real API calls), but the structure is ready to be wired to backend services via React Query.

---

## Project Structure

Top‑level files (frontend‑relevant):

- `index.html`: HTML shell that mounts the React app on the `#root` div.
- `vite.config.ts`: Vite configuration, React SWC plugin, alias for `@` → `./src`.
- `tsconfig*.json`: TypeScript configuration for the app and tooling.
- `tailwind.config.ts`, `postcss.config.js`: Tailwind / PostCSS pipeline configuration.
- `eslint.config.js`, `vitest.config.ts`: Linting and testing setup.
- `package.json`: Scripts and dependencies.

Source tree:

- `src/main.tsx` – React entry point that mounts `<App />` to `#root`.
- `src/App.tsx` – Global providers (React Query, tooltips, toasts) and all routes.
- `src/pages/` – **Top‑level pages** mapped to URL paths.
- `src/components/layout/` – Layout shell (`MainLayout`, `AppSidebar`, `AppHeader`).
- `src/components/dashboard/` – Dashboard widgets (KPI cards, charts, tables, alerts).
- `src/components/ui/` – Reusable shadcn‑style primitives (buttons, inputs, tabs, etc.).
- `src/hooks/` – Shared React hooks (e.g., `use-mobile`, `use-toast`).
- `src/lib/utils.ts` – Utility helpers (class name merging, etc.).
- `src/index.css` – Tailwind setup, theme tokens, and app‑wide utility classes.

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
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
```

### Application Shell (`src/App.tsx`)

`App` is the **top‑level React component** that wires together:

- `QueryClientProvider` – global React Query client.
- `TooltipProvider` – context for UI tooltips.
- Two toast systems:
  - `Toaster` – local toast (shadcn UI).
  - `Sonner` – notification toasts (`sonner` library).
- `BrowserRouter` & `Routes` – SPA routing.

Route configuration (React Router v6):

```tsx
<BrowserRouter>
  <Routes>
    <Route path="/" element={<Index />} />
    <Route path="/users" element={<Users />} />
    <Route path="/students" element={<Students />} />
    <Route path="/plans" element={<Plans />} />
    <Route path="/payments" element={<Payments />} />
    <Route path="/payroll" element={<Payroll />} />
    <Route path="/reminders" element={<Reminders />} />
    <Route path="/reports" element={<Reports />} />
    <Route path="/settings" element={<Settings />} />
    {/* catch‑all 404 */}
    <Route path="*" element={<NotFound />} />
  </Routes>
</BrowserRouter>
```

There is **no server‑side rendering**; all routing is client‑side via `BrowserRouter`.

---

## Route Map (Site Map)

All routes are **static (no dynamic parameters)** and are declared in `App.tsx`.

```text
/                -> Dashboard (Index.tsx)
/users           -> Users & roles management
/students        -> Students list and profiles (mocked)
/plans           -> Plans & services
/payments        -> Payments list and stats
/payroll         -> Payroll & salary structure
/reminders       -> Reminder rules and history
/reports         -> Analytical reports and charts
/settings        -> System & profile settings
* (any other)    -> 404 Not Found page
```

There are currently:

- **8 main application pages** plus:
  - **1 dashboard landing page** (`/`).
  - **1 404 fallback** (`*`).
- **No dynamic, nested, or admin‑only routes** implemented yet (all permissions are implicit and in the UI text only).

Navigation is driven by:

- `AppSidebar` nav items (links to the same paths).
- Occasional buttons acting as entry points to flows (e.g., “ثبت پرداخت”, “پلن جدید”) but they do not yet navigate to separate sub‑routes.

---

## Global Layout & Architecture

### `MainLayout`

`MainLayout` wraps all main pages with:

- **Persistent sidebar**: `AppSidebar` (includes main navigation, brand area, and user summary).
- **Sticky header**: `AppHeader` (page title, breadcrumb‑like subtitle, search, notifications, user menu).
- **Scrollable content area**: a flex container with padding where the page body is rendered.

Data flow:

- The page component (e.g., `Payments`) passes `title` and `subtitle` props to `MainLayout`.
- `MainLayout` passes those down to `AppHeader`, and renders `children` in the main content area.

### `AppSidebar`

Responsibilities:

- Top‑level navigation between routes using `react-router-dom`'s `<Link>`.
- Collapsible behavior:
  - **Desktop**: collapsible sidebar with icon‑only mode.
  - **Mobile**: overlay + floating action button to open/close sidebar.
- Shows a static “system admin” user chip at the bottom.

Key nav items:

- "/" → Dashboard
- "/users"
- "/students"
- "/plans"
- "/payments"
- "/payroll"
- "/reminders"
- "/reports"
- "/settings"

### `AppHeader`

Responsibilities:

- Display current page `title` and optional `subtitle`.
- Global search input (currently local; no actual query logic).
- Notification bell with a static badge count.
- User chip with name/role (“مدیر سیستم”) and dropdown icon (no menu yet).

---

## Technology Stack Details

### Core Runtime

- **React 18** with functional components and hooks.
- **TypeScript** for static typing across components and hooks.
- **React Router v6** for declarative, component‑based routing.
- **React Query (@tanstack/react-query)**:
  - `QueryClient` is instantiated once and provided app‑wide.
  - No specific queries are declared yet; this is ready for future API integration.

### UI & Design System

- **Tailwind CSS**:
  - Applied via `src/index.css` and `tailwind.config.ts`.
  - Custom CSS variables for colors, typography, sidebar, charts, and gradients.
  - RTL layout enforced globally via `html { direction: rtl; }`.
  - Utility classes:
    - `status-paid`, `status-pending`, `status-debt`
    - `card-elevated`, `number-display`, `text-gradient`, etc.
- **shadcn‑ui style components** under `src/components/ui/`:
  - Buttons, inputs, tabs, tables, accordions, dialogs, dropdowns, etc.
  - These components rely on Radix UI primitives under the hood.
- **Iconography**:
  - `lucide-react` across all views for consistent icon visuals.

### Feedback & Overlays

- **Toasts**:
  - `Toaster` (`/components/ui/toaster.tsx`) for shadcn‑style toasts.
  - `Sonner` (`/components/ui/sonner.tsx`) for rich notifications.
- **Tooltips**:
  - `TooltipProvider` wraps the app; tooltip components are available in `ui/tooltip.tsx`.

### Charts & Analytics

- `recharts` used in:
  - `RevenueChart` (dashboard).
  - `Reports` page (area chart, bar chart, pie chart).
- All chart data is currently **hardcoded mock data** for demonstration.

---

## Dependencies (from `package.json`)

Key runtime dependencies (non‑dev):

- React & router:
  - `react`, `react-dom`, `react-router-dom`
- Data & forms:
  - `@tanstack/react-query`
  - `react-hook-form`, `@hookform/resolvers`, `zod`
- UI & styling:
  - `tailwindcss`, `tailwindcss-animate`, `tailwind-merge`
  - `@fontsource/vazirmatn` (Persian/Arabic font)
  - `lucide-react`
  - shadcn/Radix wrappers (`@radix-ui/react-*`)
- State & utilities:
  - `class-variance-authority`, `clsx`
  - `date-fns`
  - `sonner`
  - `embla-carousel-react`
  - `vaul`

Key dev dependencies:

- `vite`, `@vitejs/plugin-react-swc`
- `typescript`, `typescript-eslint`, `eslint`, `@eslint/js`
- `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
- `tailwindcss`, `@tailwindcss/typography`, `postcss`, `autoprefixer`

---

## High-Level Behavior and Data Flow

- Pages currently use **local component state** plus **static mock data** arrays to render tables, cards, and charts.
- There are **no network requests** or global stores (Redux, Zustand, etc.) but React Query is ready to be used.
- Navigation uses declarative routes plus clickable buttons and actions that (for now) are **visual only** and do not change routes or mutate data.
- All financial values are represented as **formatted Persian strings** (e.g., `"۲,۵۰۰,۰۰۰"`) rather than numeric types.

---

## Known / Potential Issues (High-Level)

- **No real API integration** yet:
  - All data is mock; React Query is unused.
  - No loading/error states are implemented.
- **404 page uses a raw `<a href="/">` link** instead of React Router’s `<Link>`, causing a full page reload.
- **Accessibility**:
  - Icons used without `aria-label` in many buttons (e.g., “More” menu, send icons).
  - No focus outlines are customized; relies on Tailwind default focus styles.
  - Tables are visually rich but lack ARIA roles or captions.
- **Internationalization**:
  - The app is Farsi‑first and RTL, but some labels are in English (e.g., "Oops! Page not found").
- **Performance**:
  - For current scale, performance is fine (mostly static rendering).
  - With large datasets, tables and charts would benefit from pagination or virtualization.

Subsequent docs (`Pages.md`, `Components.md`, `Styles.md`, `Improvements.md`) go into route‑by‑route, component‑by‑component, and design system details, plus concrete refactoring and enhancement suggestions.


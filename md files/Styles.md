## Styling and Theming

This document explains how styles, themes, and responsiveness are implemented.

---

## Tailwind CSS Setup

- Tailwind is initialized in `src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- Fonts are imported from `@fontsource/vazirmatn` for weights 400, 500, 700.
- Tailwind configuration (`tailwind.config.ts`) extends the theme with:
  - Custom colors (via CSS variables).
  - Typography plugin.
  - RTL‑aware utilities.

The app uses a **design‑token approach** via CSS variables defined under `:root` and `.dark` in `index.css`, then referenced from Tailwind utilities.

---

## Design Tokens (CSS Variables)

Defined in `src/index.css` under `@layer base`:

### Core Colors

- Background and foreground:
  - `--background`, `--foreground`
- Cards and popovers:
  - `--card`, `--card-foreground`
  - `--popover`, `--popover-foreground`
- Primary / secondary:
  - `--primary`, `--primary-foreground`
  - `--secondary`, `--secondary-foreground`
- Muted:
  - `--muted`, `--muted-foreground`
- Accent:
  - `--accent`, `--accent-foreground`

### Status Colors

- `--success` / `--success-foreground`
- `--warning` / `--warning-foreground`
- `--destructive` / `--destructive-foreground`

These are used to build semantic utility classes like `status-paid`, `status-pending`, and `status-debt`.

### Sidebar Palette

- `--sidebar-background`
- `--sidebar-foreground`
- `--sidebar-primary`
- `--sidebar-primary-foreground`
- `--sidebar-accent`
- `--sidebar-accent-foreground`
- `--sidebar-border`
- `--sidebar-ring`
- `--sidebar-muted`

These drive the look of `AppSidebar`.

### Chart Colors

- `--chart-1` to `--chart-5` – used in charts and metrics.

### Gradients

- `--gradient-primary`
- `--gradient-card`
- `--gradient-success`

These are used by `.text-gradient` and other styled elements.

---

## Dark Mode

Dark theme overrides are defined under `.dark`:

- Re‑defines:
  - `--background`, `--foreground`
  - Surface colors, borders, inputs, ring.
  - Sidebar colors.
  - Status colors (slightly tuned for contrast).

Activation:

- No explicit theme toggle is included yet, but the tokens are ready.
- Integration can be done via:
  - `next-themes` (already in `package.json`).
  - Or a manual class toggle on `<html>` or `<body>` to set `.dark`.

---

## Base Layer and RTL Support

In `@layer base`:

- `*` applies `border-border` (Tailwind color).
- `html` sets `direction: rtl;` for the entire app.
- `body` applies:
  - `bg-background text-foreground`
  - `font-vazir` (from Tailwind config).
  - `antialiased`.

Result:

- Default layout is **right‑to‑left**, suitable for Farsi UI.
- Components that need LTR (e.g., charts, phone numbers) explicitly use `dir="ltr"` or `dir="ltr"` on containers.

---

## Custom Utility Classes

Defined under `@layer utilities` in `src/index.css`:

### `.text-gradient`

- Uses `background-image: var(--gradient-primary)` with `bg-clip-text text-transparent`.
- Good for highlighted headings or numeric KPIs.

### Status Chips

- `.status-paid`
  - `bg-success/15 text-success border-success/30`
- `.status-pending`
  - `bg-warning/15 text-warning border-warning/30`
- `.status-debt`
  - `bg-destructive/15 text-destructive border-destructive/30`

Used across:

- Payments tables.
- Debts / user statuses.

### `.card-elevated`

- Shared card styling:
  - `bg-card rounded-xl border shadow-sm hover:shadow-md transition-shadow`.

Used across:

- Dashboard widgets.
- Stats cards.
- Tables containers in pages.

### `.number-display`

- For numeric values:
  - `font-medium tabular-nums tracking-tight`
  - `font-feature-settings: "tnum";`

Ensures numbers align neatly in tables and cards.

---

## Legacy / Unused Styles

- `src/App.css` may contain leftover styles from the Vite starter template.
  - If present and not referenced by components, it can be removed or cleaned up.

---

## Responsiveness

Responsiveness is handled almost entirely via **Tailwind breakpoints**:

- Grids:
  - `sm:grid-cols-2`, `lg:grid-cols-4`, etc. on KPI cards and dashboard grids.
  - `grid gap-4 md:grid-cols-2 lg:grid-cols-3` for plans, students, etc.
- Flex layouts:
  - `flex-col` on small viewports, `sm:flex-row` on larger ones (headers).
- Tables:
  - `overflow-x-auto` wrappers around tables to enable horizontal scrolling on mobile.

Specific patterns:

- `AppSidebar`:
  - Fixed, full‑height sidebar on desktop.
  - Overlaid drawer on mobile with backdrop (`lg:hidden` vs `lg:relative`).
  - Floating button toggles the sidebar on mobile.
- Headers:
  - Search bar hidden on small screens (`hidden md:block`).

---

## Accessibility Considerations

Positive aspects:

- Text and background colors are generally high contrast due to design tokens.
- Focus states are present by default from Tailwind; some components override them minimally.
- Tables use semantic `<table>`, `<thead>`, `<tbody>`, and appropriate `<th>` elements.

Current limitations:

- Many icon‑only buttons lack `aria-label`:
  - Notification bell.
  - “...” (More) menus.
  - Icon buttons in tables and cards (e.g., send, download).
- No explicit skip‑to‑content links.
- Inputs do not use explicit `<label htmlFor="...">` in all places; some use `<label>` with implicit association.
- No role descriptions or captions on charts; screen readers may not convey chart meaning.

Recommendations can be documented in a separate improvements or accessibility doc as needed.

---

## Login and Consistency

The Login page uses the same design system (e.g. `card-elevated`, `text-gradient`, `bg-primary`, `text-destructive`, RTL) so it is visually consistent with the rest of the app.

---

## Visual System Summary

The styling system is:

- **Token‑driven** – CSS variables define semantic colors and are shared across light/dark modes.
- **RTL‑native** – Layout, copy, and design cater to Farsi/RTL users by default.
- **Componentized** – `card-elevated`, `number-display`, and status utilities ensure consistent visuals.
- **Responsive** – Layouts adjust with Tailwind breakpoints with minimal custom media queries.

This architecture supports:

- Easy theming (e.g., adding brand variants).
- Extending to dynamic data without visual changes.
- Adding dark mode via a simple `.dark` toggle.


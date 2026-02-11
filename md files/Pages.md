## Pages and Routes

This document describes **every route/page** in the application, with purpose, layout, data, and interactions.

Route configuration lives in `src/App.tsx` via React Router v6:

```tsx
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
  <Route path="*" element={<NotFound />} />
</Routes>
```

All of these pages (except `NotFound`) use the shared `MainLayout` shell.

---

## `/` – Dashboard (Index)

- **File**: `src/pages/Index.tsx`
- **Component name**: `Dashboard` (default export).

### Description

The dashboard is the **landing page** of the app. It gives a high‑level financial overview:

- KPI cards for:
  - Total revenue
  - Debts
  - Payroll
  - Active students
- A combined revenue vs. expense chart.
- Sidebar widgets for quick actions and debt alerts.
- A table of recent payments.

### Components Used

- `MainLayout`
  - Props:
    - `title="داشبورد"`
    - `subtitle="خلاصه وضعیت مالی سیستم"`
- `KPICard` ×4 (from `components/dashboard/KPICard`).
- `RevenueChart` – area chart (revenue vs. expenses).
- `QuickActions` – buttons for common flows (e.g., register payment).
- `DebtAlerts` – compact list of overdue debts.
- `RecentPaymentsTable` – table of the latest payments.

### Functionality and User Flow

1. User lands on `/`.
2. Reads key KPIs at the top of the page.
3. Analyzes trends via the line chart.
4. Checks alerts and quick actions in the sidebar.
5. Reviews the latest payments in the bottom table.

Currently all numbers and lists are **mock data**, but the structure supports plugging in live data from the backend.

### Edge Cases & Behavior

- No loading or error states; data is always present (hardcoded).
- Layout is responsive:
  - KPI cards arrange into 2 columns on small screens, 4 on large.
  - Main grid becomes stacked on narrow viewports.

---

## `/users` – Users & Roles Management

- **File**: `src/pages/Users.tsx`
- **Component name**: `Users`.

### Description

Manages system users and roles with:

- Search input for filtering users (stateful text box; filtering not yet applied).
- Summary cards per role (e.g., admin, accountant).
- Tabular listing of all users with role, status, last activity, and actions.

### Components Used

- `MainLayout` – page shell.
- UI primitives:
  - `Button`, `Input`.
  - Icons: `Plus`, `Search`, `MoreHorizontal`, `Shield`, `UserCheck`, `UserX`, `Filter`, `Download`.
- Utility:
  - `cn` from `lib/utils` for dynamic class names.

### Functionality and User Flow

1. User opens `/users`.
2. Can type into the search box (`searchQuery` state) – **currently this does not filter the table**; it is a UI‑only placeholder.
3. Header buttons:
   - “فیلتر” – intended to filter, but handler is not yet implemented.
   - “خروجی” – intended to export, not implemented.
   - “کاربر جدید” – intended to create a user, not implemented.
4. Role cards show counts and colors per role, also mock data.
5. The main table lists `mockUsers` and displays:
   - Name, email.
   - Role (pill with color based on `roleColors`).
   - Status (active/inactive) with colored indicator.
   - Last activity.
   - An action button with a “…” icon (no menu attached yet).

### Edge Cases & Status

- No pagination; simple static table.
- No actual search, filtering, or CRUD; all logic would need to be added.
- Visual statuses are driven by string enums (`"active"` / `"inactive"`).

---

## `/students` – Students Management

- **File**: `src/pages/Students.tsx`
- **Component name**: `Students`.

### Description

Shows student profiles and financial data in **two view modes**:

- Grid of cards.
- Tabular list.

Includes summary stats and search/filter controls.

### Components Used

- `MainLayout`.
- `Button`, `Input`.
- `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` (view toggle is custom, not Radix Tabs; tabs are used elsewhere).
- Icons: `Plus`, `Search`, `MoreHorizontal`, `User`, `Phone`, `Mail`, `Calendar`, `Filter`, `Grid`, `List`.
- Utility: `cn`.

### Functionality and User Flow

State:

- `searchQuery` – bound to the search `<Input>`, but not yet used to filter `mockStudents`.
- `viewMode` – `"grid"` or `"list"`.

Flow:

1. User can toggle between list and grid via two small icon buttons.
2. Header buttons:
   - “فیلتر” – planned filter behavior, not implemented.
   - “دانش‌آموز جدید” – planned create flow, not implemented.
3. Stats cards summarize:
   - Total students.
   - Active / inactive counts.
   - Debtors.
4. Content:
   - **Grid view**:
     - Each card shows avatar, name, plan, advisor, phone, balance, and status dot.
   - **List view**:
     - Table columns: student, contact, advisor, plan, balance, status, actions.
     - “More” button per row (no attached menu yet).

### Edge Cases & Responsiveness

- Grid layout adjusts from 1 → 2 → 3 columns.
- List uses horizontal scroll for small viewports.
- All balances are strings in Persian digits; negative values are styled as debt.

---

## `/plans` – Plans & Services

- **File**: `src/pages/Plans.tsx`
- **Component name**: `Plans`.

### Description

Manages financial plans (monthly, yearly, workshops, courses), showing:

- A search input.
- Summary stats for total/active plans, active enrollments, and monthly revenue.
- Cards for each plan with type labels, prices, discounts, features, and actions.

### Components Used

- `MainLayout`.
- `Button`, `Input`, `Badge`.
- Icons: `Plus`, `Search`, `MoreHorizontal`, `Calendar`, `Users`, `Tag`, `Check`.
- Utility: `cn`.

### Functionality and User Flow

1. Search input is present but does not yet filter `mockPlans`.
2. “پلن جدید” button is intended to trigger plan creation; no handler is wired.
3. Each plan card displays:
   - Type (mapped via `typeLabels`, styled via `typeColors`).
   - Name and price.
   - Optional discount badge.
   - Number of students and billing cadence.
   - List of features with check icons.
   - Footer buttons: “ویرایش” and “مشاهده” (no navigation or dialogs yet).
4. A special “Add New Plan” card encourages creating new plans.

### Edge Cases

- Cards are static; no pagination.
- Type and colors are derived from discriminated unions on the `type` field.

---

## `/payments` – Payments

- **File**: `src/pages/Payments.tsx`
- **Component name**: `Payments`.

### Description

Central screen for **incoming payments**:

- Summary cards (today’s received, pending, overdue, monthly received).
- Search bar and control buttons.
- Tabbed table view for different payment statuses.

### Components Used

- `MainLayout`.
- `Button`, `Input`, `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger`.
- Icons: `Plus`, `Search`, `Link2`, `Download`, `Filter`, `MoreHorizontal`, `ArrowUpRight`, `ArrowDownRight`, `Clock`.
- Utility: `cn`.

### Functionality and User Flow

State:

- `searchQuery` – bound to input, unused for filtering.
- `activeTab` – `"all" | "paid" | "pending" | "overdue"`; controls which subset of `mockPayments` is shown.

Flow:

1. Stats cards show aggregated, mock values.
2. Header actions:
   - “فیلتر” – placeholder.
   - “خروجی” – placeholder for export.
   - “لینک پرداخت” – placeholder for generating a payment link.
   - “ثبت پرداخت” – placeholder for manual payment registration.
3. Tabs:
   - `all` shows all `mockPayments`.
   - Other tabs filter by `status`.
4. Table columns:
   - Student name.
   - Description.
   - Amount.
   - Due date.
   - Payment date.
   - Method.
   - Status (with colored chip).
   - Actions (“…” button).

### Edge Cases

- No empty‑state message if filters yield zero results (but current mock data always yields some results).
- No real search/filter logic beyond tab filtering.

---

## `/payroll` – Payroll & Salaries

- **File**: `src/pages/Payroll.tsx`
- **Component name**: `Payroll`.

### Description

Handles the **salary side** of the system:

- Summary cards for monthly totals (fixed, variable, paid).
- Tabs for:
  - Employees.
  - Salary structure (fixed & variable).
  - Payslips.

### Components Used

- `MainLayout`.
- `Button`, `Input`, `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger`.
- Icons: `Plus`, `Search`, `FileText`, `Settings`, `Calculator`, `Download`, `Send`, `MoreHorizontal`.
- Utility: `cn`.

### Functionality and User Flow

1. User sees high‑level salary metrics at the top (hardcoded).
2. Tabs:
   - **Employees**:
     - Table of `mockEmployees` with:
       - Employee name and role.
       - Number of students attributed to them.
       - Base / variable salary and total.
       - Payment status (paid / pending) with stylized chip.
       - Action buttons (“فیش حقوقی”, “ارسال”, “…”).
   - **Structure**:
     - Two cards:
       - Fixed salary structure by role.
       - Variable salary structure (per student, percentage, bonus).
     - Each card includes a “ویرایش ساختار” button.
   - **Payslips**:
     - Illustration card and CTA “صدور فیش حقوقی جدید”.
3. Buttons such as “محاسبه خودکار” and “ثبت حقوق” exist but have no handlers yet.

### Edge Cases

- No month selector; all numbers are implied to be “this month”.
- No actual salary calculations; everything is static.

---

## `/reminders` – Payment Reminders

- **File**: `src/pages/Reminders.tsx`
- **Component name**: `Reminders`.

### Description

Configures and monitors **payment reminder logic**:

- Three cards configuring pre‑due, due‑day, and overdue reminders (with toggles).
- Search bar and actions for bulk send and new reminder.
- Table of individual reminder entries per student.

### Components Used

- `MainLayout`.
- `Button`, `Input`, `Switch`.
- Icons: `Plus`, `Search`, `Bell`, `Send`, `Clock`, `CheckCircle`, `XCircle`, `Calendar`, `MoreHorizontal`.
- Utility: `cn`.

### Functionality and User Flow

1. Settings cards:
   - Each has a `Switch` controlling whether that reminder type is active (default values are all `true`; no persistence).
2. Actions:
   - “ارسال گروهی” – placeholder for bulk sending.
   - “یادآور جدید” – placeholder for creating a new reminder.
3. Table:
   - Data `mockReminders` contains:
     - Student, type, amount, lastSent, channel, status.
   - Type label styles differ by `before` / `due` / `overdue`.
   - Status uses icon + color (sent, pending, failed).
   - Action buttons for resend and “more”.

### Edge Cases

- No handling for empty data or errors.
- Switch state is local only; no API or global store.

---

## `/reports` – Reports & Analytics

- **File**: `src/pages/Reports.tsx`
- **Component name**: `Reports`.

### Description

Aggregated **financial reports and visualizations**:

- Date range and filter controls.
- Summary cards for revenue, payroll, debts, net profit.
- Tabs:
  - Revenue trends.
  - Payroll over last 3 months.
  - Debts by advisor.

### Components Used

- `MainLayout`.
- `Button`, `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger`.
- Icons: `Download`, `Calendar`, `Filter`, `TrendingUp`, `TrendingDown`, `Wallet`, `AlertCircle`.
- `recharts`:
  - `AreaChart`, `Area`, `BarChart`, `Bar`, `PieChart`, `Pie`, `Cell`, `ResponsiveContainer`, `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`.

### Functionality and User Flow

1. User can:
   - Choose a month (currently a static button “آذر ۱۴۰۳”).
   - Click “فیلتر” and “خروجی Excel” (placeholders).
2. Summary cards give key totals.
3. Tabs:
   - **درآمد**:
     - Area chart of monthly revenue (`revenueData`).
     - Uses gradient fills and Y‑axis million formatting.
   - **حقوق**:
     - Bar chart over three months (`payrollData`).
   - **بدهی‌ها**:
     - Pie chart of debt by advisor.
     - Legend, plus list of detailed amounts.

### Edge Cases & Notes

- All chart data is static mock values.
- RTL layout but charts render inside `dir="ltr"` containers for correct axis orientation.

---

## `/settings` – Settings

- **File**: `src/pages/Settings.tsx`
- **Component name**: `Settings`.

### Description

Central place for configuration:

- General organization info.
- Personal profile details.
- Security (password and 2FA).
- Notifications preferences.
- Payment configuration.

### Components Used

- `MainLayout`.
- `Button`, `Input`, `Switch`, `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger`.
- Icons: `Building2`, `User`, `Shield`, `Bell`, `CreditCard`, `Palette`, `Save`.

### Functionality and User Flow

Tabs:

1. **عمومی (general)**:
   - Organization name, phone, address, email.
   - “ذخیره تغییرات” button (no API).
2. **پروفایل (profile)**:
   - Avatar placeholder; “تغییر تصویر” button.
   - First/last name.
   - Email and mobile.
   - Save button.
3. **امنیت (security)**:
   - Current and new password fields.
   - 2FA switch block.
   - Save button.
4. **اعلان‌ها (notifications)**:
   - List of specific notification types with `Switch` toggles.
5. **پرداخت (payments)**:
   - Card and IBAN inputs.
   - “اتصال به درگاه پرداخت” section (Zarinpal mention).
   - Save button.

### Edge Cases

- All input fields use uncontrolled defaults with no validation or persistence.
- Security forms do not enforce any constraints yet.

---

## `*` – Not Found (404)

- **File**: `src/pages/NotFound.tsx`
- **Component name**: `NotFound`.

### Description

Catch‑all 404 route for any path not matched by the above routes.

### Behavior

- Uses `useLocation()` to read the current path.
- `useEffect` logs a **console error** whenever this page renders:

```tsx
useEffect(() => {
  console.error(
    "404 Error: User attempted to access non-existent route:",
    location.pathname
  );
}, [location.pathname]);
```

- Renders a centered full‑screen card with:
  - “404” heading.
  - “Oops! Page not found” text (English).
  - A link back to `/`.

### Improvement Note

- The “Return to Home” link uses a plain `<a href="/">` which triggers a **full page reload**.
  - It should be replaced with a React Router `<Link to="/">` to stay within the SPA.


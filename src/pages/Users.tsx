import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Search,
  Shield,
  ShieldCheck,
  UserCheck,
  UserCog,
  Users2,
  User,
  Headset,
  Briefcase,
  GraduationCap,
  FileText,
  Send,
  Zap,
  Download,
  Pencil,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatGroupedFaIntInput, parseLocalizedFloat, parseLocalizedInt } from "@/lib/numberInput";
import { formatIsoDateShamsi, formatIsoDateTimeShamsi, toPersianDigits } from "@/lib/jalaliDate";
import {
  createUser,
  getUsersSummary,
  listUsers,
  exportUsers,
  getUser,
  updateUser,
  deactivateUser,
  UserApi,
  UpdateUserPayload,
} from "@/api/usersApi";
import {
  listRoles,
  createRole,
  type RoleApi,
  type CompensationKind,
  type CreateRolePayload,
} from "@/api/rolesApi";
import { DeleteRoleDialog } from "@/components/users/DeleteRoleDialog";
import { PERMISSIONS, type PermissionCode } from "@/api/settingsApi";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PERMISSION_LABELS: Record<string, string> = {
  DASHBOARD: "داشبورد",
  STUDENTS: "دانش‌آموزان",
  USERS: "کاربران و نقش‌ها",
  PLANS: "پلن‌ها و خدمات",
  PAYMENTS: "پرداخت‌ها",
  PAYROLL: "حقوق و دستمزد",
  REMINDERS: "یادآوری‌ها",
  REPORTS: "گزارش‌ها",
  SETTINGS: "مدیریت سال مالی",
};

interface UserRow {
  id: number;
  name: string;
  email: string;
  roleLabel: string;
  roleCode: string;
  status: "active" | "inactive";
  createdAt: string;
  phone: string;
  lastLogin: string;
  assignedStudentsCount: number;
}

const ROLE_BADGE_STYLES = [
  "bg-primary text-primary-foreground",
  "bg-chart-2/20 text-chart-2",
  "bg-chart-5/20 text-chart-5",
  "bg-chart-3/20 text-chart-3",
  "bg-chart-4/20 text-chart-4",
  "bg-secondary text-secondary-foreground",
];

function roleBadgeClass(code: string): string {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h + code.charCodeAt(i) * (i + 1)) % 997;
  return ROLE_BADGE_STYLES[h % ROLE_BADGE_STYLES.length];
}

/** Tones for role cards/icons (cycled by role order). */
const ROLE_TONES = [
  "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
];

function roleIcon(r: Pick<RoleApi, "code" | "name" | "full_access" | "compensation_kind">): LucideIcon {
  const code = (r.code || "").toLowerCase();
  const name = r.name || "";
  if (r.full_access || r.compensation_kind === "NET_REVENUE" || code === "general_manager") return ShieldCheck;
  if (code === "advisor" || (name.includes("مشاور") && !name.includes("مدیر"))) return GraduationCap;
  if (code.includes("secretary") || name.includes("منشی")) return Headset;
  if (name.includes("مدیر") || code.includes("manager")) return Briefcase;
  return User;
}

function roleCompensationSummary(r: RoleApi): string {
  if (r.compensation_kind === "NET_REVENUE" || r.full_access) return "مدیرکل: درآمد خالص";
  const months = r.payroll_months_count ?? (r.compensation_kind === "VARIABLE" ? 10 : 12);
  if (r.compensation_kind === "FIXED") {
    const fixed = r.fixed_cents ? Math.floor(r.fixed_cents / 10).toLocaleString("fa-IR") : "۰";
    return `ثابت ${fixed} تومان · ${months.toLocaleString("fa-IR")} ماه در سال`;
  }
  return `متغیر (سهم دانش‌آموزان) · ${months.toLocaleString("fa-IR")} ماه در سال`;
}

function formatLastLogin(iso: string): string {
  const s = formatIsoDateTimeShamsi(iso);
  return s === "—" ? s : toPersianDigits(s);
}

/** Page numbers to show (null = gap), e.g. 1 … 4 5 6 … 12. */
function pageWindow(page: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | null)[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(total - 1, page + 1);
  if (from > 2) out.push(null);
  for (let i = from; i <= to; i++) out.push(i);
  if (to < total - 1) out.push(null);
  out.push(total);
  return out;
}

function mapUser(u: UserApi): UserRow {
  const name = `${u.first_name} ${u.last_name}`.trim();
  const roleCode = (u.role_code || u.role || "").toLowerCase();
  const roleLabel = u.role_name || roleCode || "—";
  return {
    id: u.id,
    name: name || u.email,
    email: u.email,
    roleLabel,
    roleCode,
    status: u.is_active ? "active" : "inactive",
    createdAt: formatIsoDateShamsi(u.created_at),
    phone: u.phone ?? "",
    lastLogin: u.last_login_at ? formatLastLogin(u.last_login_at) : "هنوز وارد نشده",
    assignedStudentsCount: u.assigned_students_count ?? 0,
  } as UserRow;
}

const COMP_KIND_LABELS: Record<string, string> = {
  FIXED: "حقوق ثابت ماهانه",
  VARIABLE: "متغیر (بر اساس دانش‌آموزان)",
  NET_REVENUE: "درآمد خالص (مجموع پرداخت‌ها − سهم نقش‌ها)",
};

const ALL_PERMISSION_CODES: PermissionCode[] = [
  PERMISSIONS.DASHBOARD, PERMISSIONS.STUDENTS, PERMISSIONS.USERS, PERMISSIONS.PLANS,
  PERMISSIONS.PAYMENTS, PERMISSIONS.PAYROLL, PERMISSIONS.REMINDERS, PERMISSIONS.REPORTS, PERMISSIONS.SETTINGS,
];

function EditUserForm({
  user,
  roles,
  onCancel,
  onSuccess,
  mutation,
}: {
  user: UserApi;
  roles: RoleApi[];
  onCancel: () => void;
  onSuccess: () => void;
  mutation: ReturnType<typeof useMutation<UserApi, Error, { id: number; payload: UpdateUserPayload }>>;
}) {
  const [firstName, setFirstName] = useState(user.first_name || "");
  const [lastName, setLastName] = useState(user.last_name || "");
  const [email, setEmail] = useState(user.email || "");
  const [phone, setPhone] = useState(user.phone || "");
  const initialRoleId = user.role_id > 0 ? String(user.role_id) : "";
  const [roleId, setRoleId] = useState(initialRoleId);
  const [isActive, setIsActive] = useState(user.is_active ?? true);
  const [newPassword, setNewPassword] = useState("");
  const [permissions, setPermissions] = useState<string[]>(user.permissions ?? []);
  const [formError, setFormError] = useState<string | null>(null);
  const roleMissingFromList = Boolean(roleId && !roles.some((r) => String(r.id) === roleId));

  const togglePermission = (code: string) => {
    setPermissions((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]
    );
  }

  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">نام</label>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="نام" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">نام خانوادگی</label>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="نام خانوادگی" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">ایمیل</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">موبایل</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="۰۹۱۲..." />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">رمز عبور جدید (اختیاری؛ خالی بگذارید تا تغییر نکند)</label>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="حداقل ۸ کاراکتر"
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-muted-foreground">نقش</span>
        <Select value={roleId || undefined} onValueChange={setRoleId}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="انتخاب نقش" />
          </SelectTrigger>
          <SelectContent>
            {roleMissingFromList && (
              <SelectItem value={roleId}>نقش فعلی (#{roleId})</SelectItem>
            )}
            {roles.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">وضعیت</span>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>
      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">دسترسی‌ها (بخش‌های قابل مشاهده)</label>
        <div className="flex flex-wrap gap-3">
          {ALL_PERMISSION_CODES.map((code) => (
            <label key={code} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={permissions.includes(code)}
                onChange={() => togglePermission(code)}
                className="rounded border-input"
              />
              <span className="text-sm">{PERMISSION_LABELS[code] ?? code}</span>
            </label>
          ))}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={mutation.isPending}>انصراف</Button>
        <Button
          onClick={() => {
            setFormError(null);
            const parsedRoleId = parseInt(roleId, 10);
            if (!Number.isFinite(parsedRoleId) || parsedRoleId <= 0) {
              setFormError("لطفاً یک نقش معتبر انتخاب کنید.");
              return;
            }
            const payload: UpdateUserPayload = {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              email: email.trim(),
              phone: phone.trim() || undefined,
              role_id: parsedRoleId,
              is_active: isActive,
            };
            if (user.permissions != null || permissions.length > 0) {
              payload.permissions = permissions;
            }
            if (newPassword.trim()) payload.password = newPassword.trim();
            mutation.mutate(
              { id: user.id, payload },
              {
                onSuccess: onSuccess,
                onError: (err) => setFormError((err as Error)?.message || "ذخیره با خطا مواجه شد"),
              }
            );
          }}
          disabled={mutation.isPending || !firstName.trim() || !lastName.trim() || !email.trim() || !roleId}
        >
          {mutation.isPending ? "در حال ذخیره..." : "ذخیره"}
        </Button>
      </DialogFooter>
      {(formError || mutation.isError) && (
        <p className="text-xs text-destructive">
          {formError || (mutation.error as Error)?.message || "ذخیره با خطا مواجه شد"}
        </p>
      )}
    </div>
  );
}

const Users = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const navigate = useNavigate();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailsUserId, setDetailsUserId] = useState<number | null>(null);
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<UserRow | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [createRoleId, setCreateRoleId] = useState<string>("");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleApi | null>(null);
  const [newRoleCode, setNewRoleCode] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRoleFullAccess, setNewRoleFullAccess] = useState(false);
  const [newCompKind, setNewCompKind] = useState<CompensationKind>("FIXED");
  const [newFixedTomans, setNewFixedTomans] = useState("");
  const [newPayrollMonths, setNewPayrollMonths] = useState("12");
  /** درصد از مبلغ کل هر پرداخت دانش‌آموز (اختیاری، مثلاً برای مدیر اجرایی) */
  const [newRolePerms, setNewRolePerms] = useState<string[]>([PERMISSIONS.STUDENTS]);

  const queryClient = useQueryClient();

  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: listRoles,
  });

  const defaultAdvisorRoleId = useMemo(() => {
    const adv = roles.find((r) => r.code === "advisor");
    return adv ? String(adv.id) : roles[0] ? String(roles[0].id) : "";
  }, [roles]);

  useEffect(() => {
    if (createRoleId || !defaultAdvisorRoleId) return;
    setCreateRoleId(defaultAdvisorRoleId);
  }, [createRoleId, defaultAdvisorRoleId]);

  const { data: detailsUserData } = useQuery({
    queryKey: ["user", "details", detailsUserId],
    queryFn: () => getUser(detailsUserId!),
    enabled: detailsUserId != null,
  });

  const {
    data: editUserData,
    isLoading: isEditUserLoading,
    isError: isEditUserError,
    error: editUserError,
  } = useQuery({
    queryKey: ["user", "edit", editUserId],
    queryFn: () => getUser(editUserId!),
    enabled: editUserId != null,
    retry: 1,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateUserPayload }) =>
      updateUser(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["users-summary"] });
      queryClient.invalidateQueries({ queryKey: ["user", "details", id] });
      queryClient.invalidateQueries({ queryKey: ["user", "edit", id] });
      queryClient.invalidateQueries({ queryKey: ["advisors"] });
      setEditUserId(null);
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["users-summary"] });
      setRoleDialogOpen(false);
      setNewRoleCode("");
      setNewRoleName("");
      setNewRoleDesc("");
      setNewRoleFullAccess(false);
      setNewCompKind("FIXED");
      setNewFixedTomans("");
      setNewPayrollMonths("12");
      setNewRolePerms([PERMISSIONS.STUDENTS]);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["users-summary"] });
      queryClient.invalidateQueries({ queryKey: ["advisors"] });
      setDeleteUserTarget(null);
    },
  });

  const {
    data: summary,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
  } = useQuery({
    queryKey: ["users-summary"],
    queryFn: getUsersSummary,
  });

  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
  } = useQuery({
    queryKey: ["users", { search: searchQuery, role: roleFilter, status: statusFilter, page, pageSize }],
    queryFn: () =>
      listUsers({
        search: searchQuery || undefined,
        role_id:
          roleFilter && roleFilter !== "none"
            ? parseInt(roleFilter, 10)
            : undefined,
        status: statusFilter || undefined,
        page,
        page_size: pageSize,
      }),
    placeholderData: (prev) => prev,
  });

  const totalItems = data?.meta?.total_items ?? 0;
  const totalPages = Math.max(1, data?.meta?.total_pages ?? 1);
  const rangeFrom = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, totalItems);

  // با تغییر جستجو یا فیلترها به صفحه اول برگرد
  useEffect(() => {
    setPage(1);
  }, [searchQuery, roleFilter, statusFilter, pageSize]);

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["users-summary"] });
      queryClient.invalidateQueries({ queryKey: ["advisors"] });
      setIsCreateOpen(false);
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setCreateRoleId(defaultAdvisorRoleId);
      setPassword("");
      setIsActive(true);
    },
  });

  const users: UserRow[] = (data?.data || []).map(mapUser);
  const userApiList: UserApi[] = data?.data ?? [];
  const editUserResolved =
    editUserData ?? userApiList.find((u) => u.id === editUserId) ?? null;

  const handleExport = async () => {
    try {
      const blob = await exportUsers({
        search: searchQuery || undefined,
        role_id:
          roleFilter && roleFilter !== "none"
            ? parseInt(roleFilter, 10)
            : undefined,
        status: statusFilter || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "users_export.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert((e as Error).message);
    }
  };

  const fa = (n: number) => n.toLocaleString("fa-IR");
  const roleCounts = new Map((summary?.by_role ?? []).map((r) => [r.role_id, r]));
  const totalUsers = summary?.total ?? (summary?.by_role ?? []).reduce((a, r) => a + r.count, 0);
  const activeUsers =
    summary?.active ?? (summary?.by_role ?? []).reduce((a, r) => a + (r.active_count ?? r.count), 0);
  const inactiveUsers = summary?.inactive ?? Math.max(0, totalUsers - activeUsers);
  const summaryReady = !isSummaryLoading && !isSummaryError;
  const pageNumbers = pageWindow(page, totalPages);

  const quickActions = [
    { label: "افزودن کاربر", icon: Plus, primary: true, onClick: () => setIsCreateOpen(true) },
    { label: "تعریف نقش جدید", icon: Shield, onClick: () => setRoleDialogOpen(true) },
    { label: "فیش حقوقی", icon: FileText, onClick: () => navigate("/payroll") },
    { label: "ارسال یادآوری", icon: Send, onClick: () => navigate("/reminders") },
  ];

  return (
    <MainLayout
      title="کاربران و نقش‌ها"
      subtitle="مدیریت دسترسی‌ها و کاربران سیستم"
    >
      <div dir="rtl" className="space-y-4 text-right">
      {/* Role cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {roles.map((r, i) => {
          const row = roleCounts.get(r.id);
          const tone = ROLE_TONES[i % ROLE_TONES.length];
          const Icon = roleIcon(r);
          const selected = roleFilter === String(r.id);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setRoleFilter(selected ? "" : String(r.id))}
              className={cn(
                "card-elevated flex items-center justify-between gap-3 p-4 text-right transition-colors hover:border-primary/50",
                selected && "border-primary ring-1 ring-primary/40",
              )}
              title="نمایش کاربران این نقش"
            >
              <div className="min-w-0">
                <p className="truncate font-bold text-foreground">{r.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {summaryReady ? fa(row?.count ?? 0) : "—"} کاربر
                  <span className="text-primary"> · {summaryReady ? fa(row?.students_count ?? 0) : "—"} دانش‌آموز</span>
                </p>
              </div>
              <span className={cn("shrink-0 rounded-xl p-3", tone)}>
                <Icon className="h-5 w-5" />
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Defined roles */}
        <section className="card-elevated min-w-0 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-bold">
              <Users2 className="h-4 w-4 text-primary" />
              نقش‌های تعریف‌شده
            </h3>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setRoleDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              نقش جدید
            </Button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {roles.map((r, i) => {
              const Icon = roleIcon(r);
              return (
                <div key={r.id} className="group flex items-center justify-between gap-2 border-b py-2 last:border-b-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn("shrink-0 rounded-md p-1", ROLE_TONES[i % ROLE_TONES.length])}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        {r.name}
                        {r.is_system && <span className="mr-1 text-[10px] text-muted-foreground">(سیستمی)</span>}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{roleCompensationSummary(r)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-sm font-bold number-display">
                      {summaryReady ? fa(roleCounts.get(r.id)?.count ?? 0) : "—"}
                    </span>
                    {!r.is_system && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteRoleTarget(r)}
                        title="حذف نقش"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Users status */}
        <section className="card-elevated min-w-0 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-bold">
              <UserCheck className="h-4 w-4 text-primary" />
              وضعیت کاربران
            </h3>
            {statusFilter && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setStatusFilter("")}>
                <Eye className="h-3.5 w-3.5" />
                نمایش همه
              </Button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "", label: "کل کاربران", value: totalUsers, cls: "text-foreground", dot: "bg-primary" },
              { key: "active", label: "فعال", value: activeUsers, cls: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
              { key: "inactive", label: "غیرفعال", value: inactiveUsers, cls: "text-destructive", dot: "bg-destructive" },
            ].map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => setStatusFilter(t.key)}
                className={cn(
                  "rounded-xl border bg-muted/30 p-3 text-center transition-colors hover:border-primary/50",
                  statusFilter === t.key && "border-primary bg-primary/5",
                )}
              >
                <p className={cn("text-2xl font-bold number-display", t.cls)}>{summaryReady ? fa(t.value) : "—"}</p>
                <p className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />
                  {t.label}
                </p>
              </button>
            ))}
          </div>
          {summaryReady && totalUsers > 0 && (
            <div className="mt-4 space-y-1.5">
              {(summary?.by_role ?? []).map((r) => {
                const active = r.active_count ?? r.count;
                return (
                  <div key={r.role_id} className="flex items-center gap-2 text-xs">
                    <span className="w-24 truncate text-muted-foreground">{r.name || "بدون نقش"}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-destructive/20">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${r.count ? Math.round((active / r.count) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="w-14 text-left number-display" dir="ltr">
                      {fa(active)}/{fa(r.count)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Quick access */}
        <section className="card-elevated min-w-0 p-4">
          <h3 className="mb-3 flex items-center gap-2 font-bold">
            <Zap className="h-4 w-4 text-primary" />
            دسترسی سریع
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={q.onClick}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border px-2 py-5 text-sm font-medium transition-colors",
                  q.primary
                    ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-card hover:border-primary/50 hover:bg-muted/40",
                )}
              >
                <q.icon className="h-5 w-5" />
                {q.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Users table */}
      <section className="card-elevated min-w-0 overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="flex items-center gap-2 font-bold">
            <UserCog className="h-4 w-4 text-primary" />
            فهرست کاربران و دسترسی‌ها
          </h3>
          <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
            <div className="relative min-w-[200px] flex-1 lg:max-w-sm">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="جستجو در نام، ایمیل یا شماره تماس..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={roleFilter || "none"} onValueChange={(val) => setRoleFilter(val === "none" ? "" : val)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="همه نقش‌ها" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">همه نقش‌ها</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter || "none"} onValueChange={(val) => setStatusFilter(val === "none" ? "" : val)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="وضعیت: همه" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">وضعیت: همه</SelectItem>
                <SelectItem value="active">فعال</SelectItem>
                <SelectItem value="inactive">غیرفعال</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExport} title="خروجی CSV">
              <Download className="ml-1 h-4 w-4" />
              خروجی
            </Button>
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="ml-1 h-4 w-4" />
              افزودن کاربر
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                <th className="p-3 font-semibold">نام و نام خانوادگی</th>
                <th className="p-3 font-semibold">نقش</th>
                <th className="p-3 font-semibold">تلفن</th>
                <th className="p-3 font-semibold">ایمیل</th>
                <th className="p-3 font-semibold">دانش‌آموزان</th>
                <th className="p-3 font-semibold">آخرین ورود</th>
                <th className="p-3 font-semibold">وضعیت</th>
                <th className="p-3 font-semibold">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-sm text-muted-foreground">
                    در حال بارگذاری کاربران...
                  </td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-sm text-destructive">
                    {(error as Error)?.message || "خطا در دریافت لیست کاربران"}
                  </td>
                </tr>
              )}
              {!isLoading && !isError && users.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-sm text-muted-foreground">
                    کاربری یافت نشد.
                  </td>
                </tr>
              )}
              {!isLoading &&
                !isError &&
                users.map((user) => (
                  <tr key={user.id} className="border-b last:border-0 transition-colors hover:bg-muted/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {user.name.charAt(0)}
                        </div>
                        <span className="whitespace-nowrap font-medium text-foreground">{user.name}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                          roleBadgeClass(user.roleCode),
                        )}
                      >
                        {user.roleLabel}
                      </span>
                    </td>
                    <td className="p-3 number-display" dir="ltr">
                      <span className="block text-right">{user.phone ? toPersianDigits(user.phone) : "—"}</span>
                    </td>
                    <td className="p-3 text-muted-foreground" dir="ltr">
                      <span className="block text-right">{user.email}</span>
                    </td>
                    <td className="p-3">
                      {user.assignedStudentsCount > 0 ? (
                        <span>{fa(user.assignedStudentsCount)} نفر</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">{user.lastLogin}</td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          user.status === "active" ? "status-paid" : "status-debt",
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", user.status === "active" ? "bg-success" : "bg-destructive")} />
                        {user.status === "active" ? "فعال" : "غیرفعال"}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailsUserId(user.id)} title="جزئیات کاربر">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditUserId(user.id)} title="ویرایش کاربر">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeleteUserTarget(user)}
                          title="غیرفعال‌سازی کاربر"
                          disabled={user.status !== "active"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!isError && totalItems > 0 && (
          <div className="flex flex-col gap-3 border-t p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>تعداد در صفحه:</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-8 w-[76px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {fa(n)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">
                نمایش {fa(rangeFrom)} تا {fa(rangeTo)} از {fa(totalItems)} مورد
                {isFetching && " — در حال بروزرسانی..."}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label="صفحه قبل"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                {pageNumbers.map((n, i) =>
                  n === null ? (
                    <span key={`gap-${i}`} className="px-1 text-muted-foreground">…</span>
                  ) : (
                    <Button
                      key={n}
                      variant={n === page ? "default" : "outline"}
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPage(n)}
                    >
                      {fa(n)}
                    </Button>
                  ),
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  aria-label="صفحه بعد"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>
      </div>

      {/* Create user dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>کاربر جدید</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  نام
                </label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="نام"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  نام خانوادگی
                </label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="نام خانوادگی"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  ایمیل
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  موبایل
                </label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="۰۹۱۲..."
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  نقش
                </label>
                <Select value={createRoleId} onValueChange={setCreateRoleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب نقش" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  رمز عبور اولیه
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="حداقل ۸ کاراکتر"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                وضعیت کاربر
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {isActive ? "فعال" : "غیرفعال"}
                </span>
                <Switch
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={createMutation.isPending}
            >
              انصراف
            </Button>
            <Button
              onClick={() =>
                createMutation.mutate({
                  first_name: firstName.trim(),
                  last_name: lastName.trim(),
                  email: email.trim(),
                  phone: phone.trim() || undefined,
                  role_id: parseInt(createRoleId, 10),
                  password,
                  is_active: isActive,
                })
              }
              disabled={
                createMutation.isPending ||
                !firstName.trim() ||
                !lastName.trim() ||
                !email.trim() ||
                !password.trim() ||
                !createRoleId
              }
            >
              {createMutation.isPending ? "در حال ثبت..." : "ثبت کاربر"}
            </Button>
          </DialogFooter>
          {createMutation.isError && (
            <p className="pt-2 text-xs text-destructive">
              {(createMutation.error as Error)?.message ||
                "ثبت کاربر با خطا مواجه شد"}
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Details dialog */}
      <Dialog open={detailsUserId != null} onOpenChange={(open) => !open && setDetailsUserId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>جزئیات کاربر</DialogTitle>
          </DialogHeader>
          {detailsUserData && (
            <div className="space-y-3 text-sm">
              <p><span className="text-muted-foreground">نام:</span> {detailsUserData.first_name} {detailsUserData.last_name}</p>
              <p><span className="text-muted-foreground">ایمیل:</span> {detailsUserData.email}</p>
              <p><span className="text-muted-foreground">موبایل:</span> {detailsUserData.phone || "—"}</p>
              <p><span className="text-muted-foreground">نقش:</span> {detailsUserData.role_name || detailsUserData.role_code || detailsUserData.role}</p>
              <p>
                <span className="text-muted-foreground">دانش‌آموزان ثبت‌شده:</span>{" "}
                {(detailsUserData.assigned_students_count ?? 0) > 0
                  ? `${(detailsUserData.assigned_students_count ?? 0).toLocaleString("fa-IR")} نفر`
                  : "—"}
              </p>
              <p><span className="text-muted-foreground">وضعیت:</span> {detailsUserData.is_active ? "فعال" : "غیرفعال"}</p>
              <p><span className="text-muted-foreground">دسترسی‌ها:</span> {(detailsUserData.permissions ?? []).length ? (detailsUserData.permissions ?? []).map((p) => PERMISSION_LABELS[p] ?? p).join("، ") : "—"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog open={editUserId != null} onOpenChange={(open) => !open && setEditUserId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>ویرایش کاربر</DialogTitle>
          </DialogHeader>
          {isEditUserLoading && !editUserResolved && (
            <p className="text-sm text-muted-foreground">در حال بارگذاری اطلاعات کاربر...</p>
          )}
          {isEditUserError && !editUserResolved && (
            <p className="text-sm text-destructive">
              {(editUserError as Error)?.message || "خطا در دریافت اطلاعات کاربر"}
            </p>
          )}
          {editUserResolved && (
            <EditUserForm
              key={`${editUserResolved.id}-${editUserData ? "full" : "list"}`}
              user={editUserResolved}
              roles={roles}
              onCancel={() => setEditUserId(null)}
              onSuccess={() => setEditUserId(null)}
              mutation={updateMutation}
            />
          )}
          {isEditUserError && editUserResolved && (
            <p className="text-xs text-amber-600">
              دسترسی‌های دقیق بارگذاری نشد؛ بقیه فیلدها از لیست پر شده‌اند.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Create role dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>نقش و حقوق جدید</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">کد نقش (انگلیسی کوچک؛ حتی تک‌حرفی مثل m)</label>
              <Input
                dir="ltr"
                value={newRoleCode}
                onChange={(e) => setNewRoleCode(e.target.value)}
                placeholder="e.g. m"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">نام نمایشی</label>
              <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="نام فارسی" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">توضیحات</label>
              <Input value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground">دسترسی کامل (مثل مدیرکل)</span>
                {newRoleFullAccess && (
                  <p className="mt-0.5 text-[11px] text-primary">
                    حقوق = مجموع پرداخت‌های ماه − مجموع حقوق سایر کارمندان
                  </p>
                )}
              </div>
              <Switch
                checked={newRoleFullAccess}
                onCheckedChange={(v) => {
                  setNewRoleFullAccess(v);
                  if (v) setNewCompKind("NET_REVENUE");
                  else setNewCompKind("FIXED");
                }}
              />
            </div>
            {!newRoleFullAccess && (
              <div>
                <label className="mb-2 block text-xs text-muted-foreground">دسترسی‌های پیش‌فرض نقش</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_PERMISSION_CODES.map((code) => (
                    <label key={code} className="flex items-center gap-1 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={newRolePerms.includes(code)}
                        onChange={() =>
                          setNewRolePerms((prev) =>
                            prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code]
                          )
                        }
                        className="rounded border-input"
                      />
                      {PERMISSION_LABELS[code] ?? code}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">نوع حقوق</label>
              <Select
                value={newCompKind}
                onValueChange={(v) => {
                  const kind = v as CompensationKind;
                  setNewCompKind(kind);
                  setNewPayrollMonths(kind === "VARIABLE" ? "10" : "12");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">حقوق ثابت ماهانه (مثلاً منشی)</SelectItem>
                  <SelectItem value="VARIABLE">متغیر — بر اساس دانش‌آموزان (مثلاً مشاور)</SelectItem>
                </SelectContent>
              </Select>
              {newCompKind === "VARIABLE" && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  میزان سهم این نقش از هر دانش‌آموز هنگام ثبت‌نام مشخص می‌شود. معمولاً ۱۰ ماه در سال (دوره مشاوره).
                </p>
              )}
            </div>
            {!newRoleFullAccess && newCompKind !== "NET_REVENUE" && (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">تعداد ماه‌های حقوق در سال</label>
                <Input
                  inputMode="numeric"
                  value={newPayrollMonths}
                  onChange={(e) => setNewPayrollMonths(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder={newCompKind === "VARIABLE" ? "10" : "12"}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {newCompKind === "FIXED"
                    ? "منشی و کارکنان ثابت معمولاً ۱۲ ماه."
                    : "مشاوران معمولاً ۱۰ ماه (مثلاً مهر تا تیر)."}
                </p>
              </div>
            )}
            {!newRoleFullAccess && newCompKind === "FIXED" && (
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">حقوق ثابت ماهانه (تومان)</label>
                <Input
                  inputMode="numeric"
                  value={newFixedTomans}
                  onChange={(e) => setNewFixedTomans(formatGroupedFaIntInput(e.target.value))}
                  placeholder="مثلاً 10,000,000"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)} disabled={createRoleMutation.isPending}>
              انصراف
            </Button>
            <Button
              disabled={
                createRoleMutation.isPending ||
                !newRoleCode.trim() ||
                !newRoleName.trim()
              }
              onClick={() => {
                const tomansToCents = (s: string) => parseLocalizedInt(s) * 10;
                const payload: CreateRolePayload = {
                  code: newRoleCode.trim().toLowerCase(),
                  name: newRoleName.trim(),
                  description: newRoleDesc.trim() || undefined,
                  full_access: newRoleFullAccess,
                  compensation_kind: newRoleFullAccess ? "NET_REVENUE" : newCompKind,
                  permissions: newRoleFullAccess ? [...ALL_PERMISSION_CODES] : newRolePerms,
                };
                if (!newRoleFullAccess && newCompKind === "FIXED") {
                  payload.fixed_cents = tomansToCents(newFixedTomans);
                }
                if (!newRoleFullAccess && newCompKind !== "NET_REVENUE") {
                  const months = parseLocalizedInt(newPayrollMonths);
                  payload.payroll_months_count =
                    months >= 1 && months <= 12
                      ? months
                      : newCompKind === "VARIABLE"
                        ? 10
                        : 12;
                }
                createRoleMutation.mutate(payload);
              }}
            >
              {createRoleMutation.isPending ? "در حال ثبت..." : "ثبت نقش"}
            </Button>
          </DialogFooter>
          {createRoleMutation.isError && (
            <p className="text-xs text-destructive">{(createRoleMutation.error as Error)?.message}</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete role (permanent) */}
      <DeleteRoleDialog role={deleteRoleTarget} roles={roles} onClose={() => setDeleteRoleTarget(null)} />

      {/* Delete (deactivate) confirm */}
      <AlertDialog
        open={deleteUserTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteUserTarget(null);
            deactivateMutation.reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>غیرفعال کردن کاربر</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از غیرفعال کردن کاربر «{deleteUserTarget?.name}» اطمینان دارید؟ این کاربر دیگر نمی‌تواند وارد سیستم شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deactivateMutation.isError && (
            <p className="text-xs text-destructive px-1">
              {(deactivateMutation.error as Error)?.message || "غیرفعال کردن کاربر با خطا مواجه شد"}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivateMutation.isPending}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deactivateMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!deleteUserTarget) return;
                deactivateMutation.mutate(deleteUserTarget.id);
              }}
            >
              {deactivateMutation.isPending ? "در حال انجام..." : "غیرفعال کردن"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default Users;

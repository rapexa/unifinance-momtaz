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
  UserCheck,
  Filter,
  Download,
  Pencil,
  Trash2,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatGroupedFaIntInput, parseLocalizedFloat, parseLocalizedInt } from "@/lib/numberInput";
import { formatIsoDateShamsi } from "@/lib/jalaliDate";
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
  deleteRole,
  type RoleApi,
  type CompensationKind,
  type CreateRolePayload,
} from "@/api/rolesApi";
import { PERMISSIONS, type PermissionCode } from "@/api/settingsApi";

const PERMISSION_LABELS: Record<string, string> = {
  DASHBOARD: "داشبورد",
  STUDENTS: "دانش‌آموزان",
  USERS: "کاربران و نقش‌ها",
  PLANS: "پلن‌ها و خدمات",
  PAYMENTS: "پرداخت‌ها",
  PAYROLL: "حقوق و دستمزد",
  REMINDERS: "یادآوری‌ها",
  REPORTS: "گزارش‌ها",
  SETTINGS: "تنظیمات",
};
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

interface UserRow {
  id: number;
  name: string;
  email: string;
  roleLabel: string;
  roleCode: string;
  status: "active" | "inactive";
  createdAt: string;
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
    createdAt: formatIsoDateShamsi((u as any).created_at),
  } as UserRow;
}

const COMP_KIND_LABELS: Record<string, string> = {
  FIXED: "حقوق ثابت ماهانه",
  VARIABLE: "متغیر (بر اساس دانش‌آموزان)",
  NET_REVENUE: "درآمد خالص (مجموع پرداخت‌ها − حقوق کارمندان)",
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
  const [roleId, setRoleId] = useState(String(user.role_id || ""));
  const [isActive, setIsActive] = useState(user.is_active ?? true);
  const [newPassword, setNewPassword] = useState("");
  const [permissions, setPermissions] = useState<string[]>(user.permissions ?? []);

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
        <Select value={roleId} onValueChange={setRoleId}>
          <SelectTrigger className="w-full sm:w-[200px]">
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
            const payload: UpdateUserPayload = {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              email: email.trim(),
              phone: phone.trim() || undefined,
              role_id: parseInt(roleId, 10),
              is_active: isActive,
              permissions,
            };
            if (newPassword.trim()) payload.password = newPassword.trim();
            mutation.mutate(
              { id: user.id, payload },
              { onSuccess: onSuccess }
            );
          }}
          disabled={mutation.isPending || !firstName.trim() || !lastName.trim() || !email.trim()}
        >
          {mutation.isPending ? "در حال ذخیره..." : "ذخیره"}
        </Button>
      </DialogFooter>
      {mutation.isError && (
        <p className="text-xs text-destructive">{(mutation.error as Error)?.message}</p>
      )}
    </div>
  );
}

const Users = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailsUserId, setDetailsUserId] = useState<number | null>(null);
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
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
    queryKey: ["user", detailsUserId],
    queryFn: () => getUser(detailsUserId!),
    enabled: detailsUserId != null,
  });

  const { data: editUserData } = useQuery({
    queryKey: ["user", editUserId],
    queryFn: () => getUser(editUserId!),
    enabled: editUserId != null,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateUserPayload }) =>
      updateUser(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["users-summary"] });
      queryClient.invalidateQueries({ queryKey: ["user", id] });
      queryClient.invalidateQueries({ queryKey: ["advisors"] });
      setEditUserId(null);
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id: number) => deleteRole(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["users-summary"] });
      setDeleteRoleTarget(null);
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
      setNewRolePerms([PERMISSIONS.STUDENTS]);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["users-summary"] });
      queryClient.invalidateQueries({ queryKey: ["advisors"] });
      setDeleteUser(null);
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
  } = useQuery({
    queryKey: ["users", { search: searchQuery, role: roleFilter, status: statusFilter }],
    queryFn: () =>
      listUsers({
        search: searchQuery || undefined,
        role_id:
          roleFilter && roleFilter !== "none"
            ? parseInt(roleFilter, 10)
            : undefined,
        status: statusFilter || undefined,
        page: 1,
        page_size: 50,
      }),
  });

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

  return (
    <MainLayout
      title="کاربران و نقش‌ها"
      subtitle="مدیریت دسترسی‌ها و کاربران سیستم"
    >
      {/* Header actions */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="جستجوی کاربر..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9"
          />
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="ml-2 h-4 w-4" />
            فیلتر
          </Button>
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={handleExport}>
            <Download className="ml-2 h-4 w-4" />
            خروجی
          </Button>
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => setRoleDialogOpen(true)}>
            <Shield className="ml-2 h-4 w-4" />
            نقش جدید
          </Button>
          <Button size="sm" className="flex-1 sm:flex-none" onClick={() => setIsCreateOpen(true)}>
            <Plus className="ml-2 h-4 w-4" />
            کاربر جدید
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex-1 max-w-xs">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              فیلتر نقش
            </label>
            <Select
              value={roleFilter || "none"}
              onValueChange={(val) => setRoleFilter(val === "none" ? "" : val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="همه نقش‌ها" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">همه</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 max-w-xs">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              فیلتر وضعیت
            </label>
            <Select
              value={statusFilter}
              onValueChange={(val) =>
                setStatusFilter(val === "none" ? "" : val)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="همه وضعیت‌ها" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">همه</SelectItem>
                <SelectItem value="active">فعال</SelectItem>
                <SelectItem value="inactive">غیرفعال</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Role summary cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(summary?.by_role ?? []).map((row) => (
          <div
            key={row.role_id}
            className="card-elevated p-4 cursor-pointer hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className={cn("rounded-lg p-2", roleBadgeClass(row.code))}>
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-foreground">{row.name}</p>
                <p className="text-sm text-muted-foreground">
                  {isSummaryLoading || isSummaryError ? "—" : row.count} کاربر
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Roles & compensation table */}
      <div className="mb-6 card-elevated overflow-hidden">
        <div className="border-b bg-muted/40 px-4 py-3">
          <h2 className="text-sm font-semibold">نقش‌ها و قوانین حقوق</h2>
          <p className="text-xs text-muted-foreground">
            هر نقش یکی از انواع حقوق ثابت، درصدی از پرداخت‌های دانش‌آموزان، یا مبلغ به‌ازای واحد حجم پرداخت دارد؛ علاوه بر آن می‌توان درصد جدا از مبلغ کل هر پرداخت دانش‌آموز تعریف کرد.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-right">
                <th className="p-3 font-medium">نقش</th>
                <th className="p-3 font-medium">نوع حقوق</th>
                <th className="p-3 font-medium">جزئیات</th>
                <th className="p-3 font-medium w-24">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="p-3">
                    {r.name}
                    {r.is_system && (
                      <span className="mr-2 text-xs text-muted-foreground">(سیستمی)</span>
                    )}
                  </td>
                  <td className="p-3">{COMP_KIND_LABELS[r.compensation_kind] ?? r.compensation_kind}</td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {r.compensation_kind === "FIXED" && r.fixed_cents != null && r.fixed_cents > 0 &&
                      `${Math.floor(r.fixed_cents / 10).toLocaleString("fa-IR")} تومان ماهانه`}
                    {r.compensation_kind === "FIXED" && (r.fixed_cents == null || r.fixed_cents === 0) &&
                      "۰ تومان ماهانه"}
                    {r.compensation_kind === "VARIABLE" &&
                      "بر اساس سهم‌های ثبت‌نام دانش‌آموزان"}
                    {r.compensation_kind === "NET_REVENUE" &&
                      "مجموع پرداخت‌های ماه − مجموع حقوق سایر کارمندان"}
                    {(r.full_access && r.compensation_kind !== "NET_REVENUE") &&
                      " — مدیرکل: درآمد خالص"}
                  </td>
                  <td className="p-3">
                    {!r.is_system && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteRoleTarget(r)}
                      >
                        <Trash2 className="ml-1 h-3.5 w-3.5" />
                        حذف
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Users table */}
      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">کاربر</th>
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">نقش</th>
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">وضعیت</th>
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">آخرین فعالیت</th>
                <th className="p-4 text-right text-xs font-semibold text-muted-foreground">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={5}
                    className="p-4 text-center text-sm text-muted-foreground"
                  >
                    در حال بارگذاری کاربران...
                  </td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td
                    colSpan={5}
                    className="p-4 text-center text-sm text-destructive"
                  >
                    {(error as Error)?.message ||
                      "خطا در دریافت لیست کاربران"}
                  </td>
                </tr>
              )}
              {!isLoading && !isError && users.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="p-4 text-center text-sm text-muted-foreground"
                  >
                    کاربری یافت نشد.
                  </td>
                </tr>
              )}
              {!isLoading &&
                !isError &&
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                        roleBadgeClass(user.roleCode),
                      )}
                    >
                      {user.roleLabel}
                    </span>
                  </td>
                  <td className="p-4">
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
                  <td className="p-4 text-muted-foreground">
                    {user.createdAt}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-1 flex-wrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => setDetailsUserId(user.id)}
                        title="جزئیات کاربر"
                      >
                        <Eye className="h-4 w-4" />
                        جزئیات
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1"
                        onClick={() => setEditUserId(user.id)}
                        title="ویرایش کاربر"
                      >
                        <Pencil className="h-4 w-4" />
                        ویرایش
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteUser(user)}
                        title="حذف (غیرفعال‌سازی)"
                      >
                        <Trash2 className="h-4 w-4" />
                        حذف
                      </Button>
                    </div>
                  </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
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
              <p><span className="text-muted-foreground">وضعیت:</span> {detailsUserData.is_active ? "فعال" : "غیرفعال"}</p>
              <p><span className="text-muted-foreground">دسترسی‌ها:</span> {(detailsUserData.permissions ?? []).length ? (detailsUserData.permissions ?? []).map((p) => PERMISSION_LABELS[p] ?? p).join("، ") : "—"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog open={editUserId != null} onOpenChange={(open) => !open && setEditUserId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ویرایش کاربر</DialogTitle>
          </DialogHeader>
          {editUserData && (
            <EditUserForm
              user={editUserData}
              roles={roles}
              onCancel={() => setEditUserId(null)}
              onSuccess={() => setEditUserId(null)}
              mutation={updateMutation}
            />
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
              <label className="mb-1 block text-xs text-muted-foreground">کد نقش (انگلیسی، کوچک)</label>
              <Input
                dir="ltr"
                value={newRoleCode}
                onChange={(e) => setNewRoleCode(e.target.value)}
                placeholder="e.g. sales_lead"
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
              <Select value={newCompKind} onValueChange={(v) => setNewCompKind(v as CompensationKind)}>
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
                  میزان سهم این نقش از هر دانش‌آموز هنگام ثبت‌نام دانش‌آموز مشخص می‌شود.
                </p>
              )}
            </div>
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

      {/* Delete role confirm */}
      <AlertDialog open={deleteRoleTarget != null} onOpenChange={(open) => !open && setDeleteRoleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف نقش</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف نقش «{deleteRoleTarget?.name}» اطمینان دارید؟ این نقش فقط در صورتی حذف می‌شود که هیچ کاربری به آن تعلق نداشته باشد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteRoleMutation.isError && (
            <p className="text-xs text-destructive px-1">
              {(deleteRoleMutation.error as Error)?.message || "حذف نقش با خطا مواجه شد"}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => deleteRoleMutation.reset()}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleteRoleTarget) deleteRoleMutation.mutate(deleteRoleTarget.id);
              }}
              disabled={deleteRoleMutation.isPending}
            >
              {deleteRoleMutation.isPending ? "در حال حذف..." : "حذف نقش"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete (deactivate) confirm */}
      <AlertDialog open={deleteUser != null} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>غیرفعال کردن کاربر</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از غیرفعال کردن کاربر «{deleteUser?.name}» اطمینان دارید؟ این کاربر دیگر نمی‌تواند وارد سیستم شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteUser && deactivateMutation.mutate(deleteUser.id)}
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

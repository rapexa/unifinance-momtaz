import { useState } from "react";
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
  MoreHorizontal,
  Shield,
  UserCheck,
  UserX,
  Filter,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createUser,
  getUsersSummary,
  listUsers,
  exportUsers,
  UserApi,
} from "@/api/usersApi";

interface UserRow {
  id: number;
  name: string;
  email: string;
  roleLabel: string;
  roleCode: string;
  status: "active" | "inactive";
  createdAt: string;
}

const roleLabelMap: Record<string, string> = {
  ADMIN: "مدیر کل",
  ACCOUNTANT: "حسابدار",
  ADVISOR: "مشاور",
  OPERATOR: "اپراتور",
};

const roleColors: Record<string, string> = {
  ADMIN: "bg-primary text-primary-foreground",
  ACCOUNTANT: "bg-chart-2/20 text-chart-2",
  ADVISOR: "bg-chart-5/20 text-chart-5",
  OPERATOR: "bg-chart-3/20 text-chart-3",
};

function mapUser(u: UserApi): UserRow {
  const name = `${u.first_name} ${u.last_name}`.trim();
  const roleCode = u.role.toUpperCase();
  const roleLabel = roleLabelMap[roleCode] || roleCode;
  return {
    id: u.id,
    name: name || u.email,
    email: u.email,
    roleLabel,
    roleCode,
    status: u.is_active ? "active" : "inactive",
    createdAt: new Date(u.created_at as any).toLocaleDateString("fa-IR"),
  } as any;
}

const Users = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>("ADVISOR");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(true);

  const queryClient = useQueryClient();

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
        role: roleFilter || undefined,
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
      setIsCreateOpen(false);
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setRole("ADVISOR");
      setPassword("");
      setIsActive(true);
    },
  });

  const users: UserRow[] = (data?.data || []).map(mapUser);

  const handleExport = async () => {
    try {
      const blob = await exportUsers({
        search: searchQuery || undefined,
        role: roleFilter || undefined,
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
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="ml-2 h-4 w-4" />
            فیلتر
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="ml-2 h-4 w-4" />
            خروجی
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
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
              value={roleFilter}
              onValueChange={(val) => setRoleFilter(val === "none" ? "" : val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="همه نقش‌ها" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">همه</SelectItem>
                <SelectItem value="ADMIN">مدیر کل</SelectItem>
                <SelectItem value="ACCOUNTANT">حسابدار</SelectItem>
                <SelectItem value="ADVISOR">مشاور</SelectItem>
                <SelectItem value="OPERATOR">اپراتور</SelectItem>
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

      {/* Role cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "مدیر کل",
            key: "ADMIN",
            count: summary?.admins ?? 0,
            icon: Shield,
          },
          {
            label: "حسابدار",
            key: "ACCOUNTANT",
            count: summary?.accountants ?? 0,
            icon: UserCheck,
          },
          {
            label: "مشاور",
            key: "ADVISOR",
            count: summary?.advisors ?? 0,
            icon: UserCheck,
          },
          {
            label: "اپراتور",
            key: "OPERATOR",
            count: summary?.operators ?? 0,
            icon: UserX,
          },
        ].map((item) => (
          <div
            key={item.key}
            className="card-elevated p-4 cursor-pointer hover:border-primary/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className={cn("rounded-lg p-2", roleColors[item.key])}>
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-foreground">{item.label}</p>
                <p className="text-sm text-muted-foreground">
                  {isSummaryLoading || isSummaryError ? "—" : item.count} کاربر
                </p>
              </div>
            </div>
          </div>
        ))}
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
                        roleColors[user.roleCode] || "bg-secondary text-secondary-foreground",
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
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
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
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب نقش" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">مدیر کل</SelectItem>
                    <SelectItem value="ACCOUNTANT">حسابدار</SelectItem>
                    <SelectItem value="ADVISOR">مشاور</SelectItem>
                    <SelectItem value="OPERATOR">اپراتور</SelectItem>
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
                  role,
                  password,
                  is_active: isActive,
                })
              }
              disabled={
                createMutation.isPending ||
                !firstName.trim() ||
                !lastName.trim() ||
                !email.trim() ||
                !password.trim()
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
    </MainLayout>
  );
};

export default Users;

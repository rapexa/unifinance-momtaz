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
  Plus,
  Search,
  MoreHorizontal,
  User,
  Phone,
  Mail,
  Calendar,
  Filter,
  Grid,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createStudent,
  listStudents,
  getStudentsSummary,
  StudentApi,
} from "@/api/studentsApi";

interface StudentRow {
  id: number;
  name: string;
  phone: string;
  email: string;
  advisor: string;
  plan: string;
  balance: string;
  status: "active" | "inactive";
}

function mapStudent(api: StudentApi): StudentRow {
  const name = `${api.first_name ?? ""} ${api.last_name ?? ""}`.trim();
  return {
    id: api.id,
    name: name || "بدون نام",
    phone: api.phone || "",
    email: api.email || "",
    advisor: "—",
    plan: "—",
    balance: "۰",
    status: api.status === "INACTIVE" ? "inactive" : "active",
  };
}

const Students = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [advisorId, setAdvisorId] = useState("");
  const [planId, setPlanId] = useState("");
  const [balance, setBalance] = useState("");

  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["students", { search: searchQuery }],
    queryFn: () =>
      listStudents({
        search: searchQuery || undefined,
        page: 1,
        page_size: 50,
      }),
  });

  const {
    data: summary,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
  } = useQuery({
    queryKey: ["students-summary"],
    queryFn: getStudentsSummary,
  });

  const createMutation = useMutation({
    mutationFn: createStudent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
       queryClient.invalidateQueries({ queryKey: ["students-summary"] });
      setIsCreateOpen(false);
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setAdvisorId("");
      setPlanId("");
      setBalance("");
    },
  });

  const students: StudentRow[] = (data?.data || []).map(mapStudent);

  return (
    <MainLayout title="دانش‌آموزان" subtitle="مدیریت پروفایل و اطلاعات مالی دانش‌آموزان">
      {/* Header actions */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="جستجوی دانش‌آموز..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border p-1">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode("grid")}
            >
              <Grid className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm">
            <Filter className="ml-2 h-4 w-4" />
            فیلتر
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="ml-2 h-4 w-4" />
            دانش‌آموز جدید
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">کل دانش‌آموزان</p>
          <p className="text-2xl font-bold text-foreground">
            {isSummaryLoading || isSummaryError
              ? "—"
              : summary?.total ?? 0}
          </p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">فعال</p>
          <p className="text-2xl font-bold text-success">
            {isSummaryLoading || isSummaryError
              ? "—"
              : summary?.active ?? 0}
          </p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">غیرفعال</p>
          <p className="text-2xl font-bold text-muted-foreground">
            {isSummaryLoading || isSummaryError
              ? "—"
              : summary?.inactive ?? 0}
          </p>
        </div>
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">بدهکار</p>
          <p className="text-2xl font-bold text-destructive">
            {isSummaryLoading || isSummaryError
              ? "—"
              : summary?.debtors ?? 0}
          </p>
        </div>
      </div>

      {/* Students grid/list */}
      {isLoading && (
        <div className="card-elevated p-6 text-sm text-muted-foreground">
          در حال بارگذاری لیست دانش‌آموزان...
        </div>
      )}
      {isError && (
        <div className="card-elevated p-6 text-sm text-destructive">
          {(error as Error)?.message || "خطا در دریافت لیست دانش‌آموزان"}
        </div>
      )}
      {!isLoading && !isError && students.length === 0 && (
        <div className="card-elevated p-6 text-sm text-muted-foreground">
          هیچ دانش‌آموزی ثبت نشده است.
        </div>
      )}
      {!isLoading && !isError && students.length > 0 && (viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((student) => (
            <div
              key={student.id}
              className="card-elevated p-5 hover:border-primary/50 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                    {student.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{student.name}</h3>
                    <p className="text-sm text-muted-foreground">{student.plan}</p>
                  </div>
                </div>
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    student.status === "active" ? "bg-success" : "bg-muted-foreground"
                  )}
                />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-4 w-4" />
                  <span>مشاور: {student.advisor}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span dir="ltr">{student.phone}</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <span className="text-xs text-muted-foreground">مانده حساب</span>
                <span
                  className={cn(
                    "font-bold number-display",
                    student.balance.startsWith("-")
                      ? "text-destructive"
                      : "text-success"
                  )}
                >
                  {student.balance} تومان
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null)}
      {!isLoading && !isError && students.length > 0 && viewMode === "list" && (
        <div className="card-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">دانش‌آموز</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">تماس</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">مشاور</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">پلن</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">مانده حساب</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">وضعیت</th>
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr
                    key={student.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{student.name}</p>
                          <p className="text-sm text-muted-foreground">{student.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-muted-foreground" dir="ltr">
                      {student.phone}
                    </td>
                    <td className="p-4 text-foreground">{student.advisor}</td>
                    <td className="p-4">
                      <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                        {student.plan}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className={cn(
                          "font-bold number-display",
                          student.balance.startsWith("-")
                            ? "text-destructive"
                            : "text-success"
                        )}
                      >
                        {student.balance}
                      </span>
                    </td>
                    <td className="p-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          student.status === "active" ? "status-paid" : "status-debt"
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", student.status === "active" ? "bg-success" : "bg-destructive")} />
                        {student.status === "active" ? "فعال" : "غیرفعال"}
                      </span>
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
      )}

      {/* Create student dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>دانش‌آموز جدید</DialogTitle>
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
                  placeholder="example@email.com"
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  شناسه مشاور (اختیاری)
                </label>
                <Input
                  value={advisorId}
                  onChange={(e) => setAdvisorId(e.target.value)}
                  placeholder="ID مشاور"
                  inputMode="numeric"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  شناسه پلن خریداری‌شده (اختیاری)
                </label>
                <Input
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  placeholder="ID پلن"
                  inputMode="numeric"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  مانده حساب اولیه (ریال)
                </label>
                <Input
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  placeholder="مثلاً -2500000"
                  inputMode="numeric"
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
                  email: email.trim() || undefined,
                  phone: phone.trim() || undefined,
                  advisor_id: advisorId ? Number(advisorId) : undefined,
                  current_plan_id: planId ? Number(planId) : undefined,
                  balance_cents: balance ? Number(balance) : undefined,
                })
              }
              disabled={
                createMutation.isPending ||
                !firstName.trim() ||
                !lastName.trim()
              }
            >
              {createMutation.isPending ? "در حال ثبت..." : "ثبت دانش‌آموز"}
            </Button>
          </DialogFooter>
          {createMutation.isError && (
            <p className="pt-2 text-xs text-destructive">
              {(createMutation.error as Error)?.message ||
                "ثبت دانش‌آموز با خطا مواجه شد"}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Students;

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
import {
  Plus,
  Search,
  User,
  Phone,
  Mail,
  Calendar,
  Filter,
  Grid,
  List,
  Pencil,
  Trash2,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createStudent,
  listStudents,
  getStudentsSummary,
  getStudent,
  updateStudent,
  deleteStudent,
  StudentApi,
  UpdateStudentPayload,
} from "@/api/studentsApi";
import { listAdvisors, UserApi } from "@/api/usersApi";
import { listActivePlans, PlanApi } from "@/api/plansApi";
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

function formatBalance(cents: number | undefined): string {
  const n = cents ?? 0;
  const s = Math.abs(n).toLocaleString("fa-IR");
  return n < 0 ? `-${s}` : s;
}

function mapStudent(api: StudentApi): StudentRow {
  const name = `${api.first_name ?? ""} ${api.last_name ?? ""}`.trim();
  return {
    id: api.id,
    name: name || "بدون نام",
    phone: api.phone || "",
    email: api.email || "",
    advisor: api.advisor_name?.trim() || "—",
    plan: api.current_plan_name?.trim() || "—",
    balance: formatBalance(api.balance_cents),
    status: api.status === "INACTIVE" ? "inactive" : "active",
  };
}

function EditStudentForm({
  student,
  advisors,
  plans,
  onCancel,
  onSuccess,
  mutation,
}: {
  student: StudentApi;
  advisors: UserApi[];
  plans: PlanApi[];
  onCancel: () => void;
  onSuccess: () => void;
  mutation: ReturnType<typeof useMutation<StudentApi, Error, { id: number; payload: UpdateStudentPayload }>>;
}) {
  const [firstName, setFirstName] = useState(student.first_name || "");
  const [lastName, setLastName] = useState(student.last_name || "");
  const [email, setEmail] = useState(student.email || "");
  const [phone, setPhone] = useState(student.phone || "");
  const [fatherPhone, setFatherPhone] = useState(student.father_phone || "");
  const [motherPhone, setMotherPhone] = useState(student.mother_phone || "");
  const [schoolName, setSchoolName] = useState(student.school_name || "");
  const [schoolAddress, setSchoolAddress] = useState(student.school_address || "");
  const [homeAddress, setHomeAddress] = useState(student.home_address || "");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">(student.status === "INACTIVE" ? "INACTIVE" : "ACTIVE");
  const [advisorId, setAdvisorId] = useState(student.advisor_id != null ? String(student.advisor_id) : "none");
  const [planId, setPlanId] = useState(student.current_plan_id != null ? String(student.current_plan_id) : "none");
  const [balance, setBalance] = useState(student.balance_cents != null ? String(student.balance_cents) : "0");

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
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="۰۹۱۲..." dir="ltr" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">شماره پدر</label>
          <Input value={fatherPhone} onChange={(e) => setFatherPhone(e.target.value)} placeholder="۰۹۱۲..." dir="ltr" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">شماره مادر</label>
          <Input value={motherPhone} onChange={(e) => setMotherPhone(e.target.value)} placeholder="۰۹۱۲..." dir="ltr" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">اسم مدرسه</label>
        <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="نام مدرسه" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">آدرس مدرسه</label>
        <Input value={schoolAddress} onChange={(e) => setSchoolAddress(e.target.value)} placeholder="آدرس مدرسه" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">آدرس خانه</label>
        <Input value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} placeholder="آدرس منزل" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">مشاور</label>
          <Select value={advisorId} onValueChange={setAdvisorId}>
            <SelectTrigger>
              <SelectValue placeholder="انتخاب مشاور" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون مشاور</SelectItem>
              {advisors.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.first_name} {a.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">پلن</label>
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger>
              <SelectValue placeholder="انتخاب پلن" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون پلن</SelectItem>
              {plans.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">مانده حساب (ریال)</label>
          <Input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} dir="ltr" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">وضعیت</span>
        <Select value={status} onValueChange={(v) => setStatus(v as "ACTIVE" | "INACTIVE")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">فعال</SelectItem>
            <SelectItem value="INACTIVE">غیرفعال</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={mutation.isPending}>انصراف</Button>
        <Button
          onClick={() => {
            const payload: UpdateStudentPayload = {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              email: email.trim() || undefined,
              phone: phone.trim() || undefined,
              father_phone: fatherPhone.trim() || undefined,
              mother_phone: motherPhone.trim() || undefined,
              school_name: schoolName.trim() || undefined,
              school_address: schoolAddress.trim() || undefined,
              home_address: homeAddress.trim() || undefined,
              status,
              advisor_id: advisorId === "none" ? null : Number(advisorId),
              current_plan_id: planId === "none" ? null : Number(planId),
              balance_cents: Number(balance) || 0,
            };
            mutation.mutate({ id: student.id, payload }, { onSuccess });
          }}
          disabled={mutation.isPending || !firstName.trim() || !lastName.trim()}
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

const Students = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailsStudentId, setDetailsStudentId] = useState<number | null>(null);
  const [editStudentId, setEditStudentId] = useState<number | null>(null);
  const [deleteStudent, setDeleteStudent] = useState<StudentRow | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [advisorId, setAdvisorId] = useState("");
  const [planId, setPlanId] = useState("");
  const [balance, setBalance] = useState("");
  const [fatherPhone, setFatherPhone] = useState("");
  const [motherPhone, setMotherPhone] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [homeAddress, setHomeAddress] = useState("");

  const queryClient = useQueryClient();

  const { data: detailsStudentData } = useQuery({
    queryKey: ["student", detailsStudentId],
    queryFn: () => getStudent(detailsStudentId!),
    enabled: detailsStudentId != null,
  });

  const { data: editStudentData } = useQuery({
    queryKey: ["student", editStudentId],
    queryFn: () => getStudent(editStudentId!),
    enabled: editStudentId != null,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateStudentPayload }) =>
      updateStudent(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["students-summary"] });
      setEditStudentId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStudent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["students-summary"] });
      setDeleteStudent(null);
    },
  });

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

  const { data: advisors } = useQuery({
    queryKey: ["advisors"],
    queryFn: listAdvisors,
  });

  const { data: plans } = useQuery({
    queryKey: ["plans-active"],
    queryFn: listActivePlans,
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
      setFatherPhone("");
      setMotherPhone("");
      setSchoolName("");
      setSchoolAddress("");
      setHomeAddress("");
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
                      <div className="flex gap-1 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => setDetailsStudentId(student.id)}
                          title="جزئیات دانش‌آموز"
                        >
                          <Eye className="h-4 w-4" />
                          جزئیات
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => setEditStudentId(student.id)}
                          title="ویرایش دانش‌آموز"
                        >
                          <Pencil className="h-4 w-4" />
                          ویرایش
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteStudent(student)}
                          title="حذف دانش‌آموز"
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
      )}

      {/* Details dialog */}
      <Dialog open={detailsStudentId != null} onOpenChange={(open) => !open && setDetailsStudentId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>جزئیات دانش‌آموز</DialogTitle>
          </DialogHeader>
          {detailsStudentData && (
            <div className="space-y-3 text-sm max-h-[70vh] overflow-y-auto">
              <p><span className="text-muted-foreground">نام و نام خانوادگی:</span> {detailsStudentData.first_name} {detailsStudentData.last_name}</p>
              <p><span className="text-muted-foreground">ایمیل:</span> {detailsStudentData.email || "—"}</p>
              <p><span className="text-muted-foreground">موبایل:</span> {detailsStudentData.phone ? <span dir="ltr">{detailsStudentData.phone}</span> : "—"}</p>
              <p><span className="text-muted-foreground">شماره پدر:</span> {detailsStudentData.father_phone ? <span dir="ltr">{detailsStudentData.father_phone}</span> : "—"}</p>
              <p><span className="text-muted-foreground">شماره مادر:</span> {detailsStudentData.mother_phone ? <span dir="ltr">{detailsStudentData.mother_phone}</span> : "—"}</p>
              <p><span className="text-muted-foreground">اسم مدرسه:</span> {detailsStudentData.school_name || "—"}</p>
              <p><span className="text-muted-foreground">آدرس مدرسه:</span> {detailsStudentData.school_address || "—"}</p>
              <p><span className="text-muted-foreground">آدرس خانه:</span> {detailsStudentData.home_address || "—"}</p>
              <p><span className="text-muted-foreground">مشاور:</span> {detailsStudentData.advisor_name || "—"}</p>
              <p><span className="text-muted-foreground">پلن:</span> {detailsStudentData.current_plan_name || "—"}</p>
              <p><span className="text-muted-foreground">مانده حساب:</span> {formatBalance(detailsStudentData.balance_cents)}</p>
              <p><span className="text-muted-foreground">وضعیت:</span> {detailsStudentData.status === "INACTIVE" ? "غیرفعال" : "فعال"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit student dialog */}
      <Dialog open={editStudentId != null} onOpenChange={(open) => !open && setEditStudentId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ویرایش دانش‌آموز</DialogTitle>
          </DialogHeader>
          {editStudentData && (
            <EditStudentForm
              student={editStudentData}
              advisors={advisors || []}
              plans={plans || []}
              onCancel={() => setEditStudentId(null)}
              onSuccess={() => setEditStudentId(null)}
              mutation={updateMutation}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteStudent != null} onOpenChange={(open) => !open && setDeleteStudent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف دانش‌آموز</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف دانش‌آموز «{deleteStudent?.name}» اطمینان دارید؟ این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteStudent && deleteMutation.mutate(deleteStudent.id)}
            >
              {deleteMutation.isPending ? "در حال حذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  شماره پدر
                </label>
                <Input
                  value={fatherPhone}
                  onChange={(e) => setFatherPhone(e.target.value)}
                  placeholder="۰۹۱۲..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  شماره مادر
                </label>
                <Input
                  value={motherPhone}
                  onChange={(e) => setMotherPhone(e.target.value)}
                  placeholder="۰۹۱۲..."
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                اسم مدرسه
              </label>
              <Input
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="نام مدرسه"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                آدرس مدرسه
              </label>
              <Input
                value={schoolAddress}
                onChange={(e) => setSchoolAddress(e.target.value)}
                placeholder="آدرس مدرسه"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                آدرس خانه
              </label>
              <Input
                value={homeAddress}
                onChange={(e) => setHomeAddress(e.target.value)}
                placeholder="آدرس منزل"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  مشاور (اختیاری)
                </label>
                <Select
                  value={advisorId}
                  onValueChange={(val) =>
                    setAdvisorId(val === "none" ? "" : val)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب مشاور" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون مشاور</SelectItem>
                    {(advisors || []).map((advisor: UserApi) => (
                      <SelectItem key={advisor.id} value={String(advisor.id)}>
                        {advisor.first_name} {advisor.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  پلن خریداری‌شده (اختیاری)
                </label>
                <Select
                  value={planId}
                  onValueChange={(val) => setPlanId(val === "none" ? "" : val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب پلن" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون پلن</SelectItem>
                    {(plans || []).map((plan: PlanApi) => (
                      <SelectItem key={plan.id} value={String(plan.id)}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  father_phone: fatherPhone.trim() || undefined,
                  mother_phone: motherPhone.trim() || undefined,
                  school_name: schoolName.trim() || undefined,
                  school_address: schoolAddress.trim() || undefined,
                  home_address: homeAddress.trim() || undefined,
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

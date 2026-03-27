import { useState, useEffect } from "react";
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
import { formatGroupedFaIntInput, parseLocalizedFloat, parseLocalizedInt } from "@/lib/numberInput";
import { gregorianIsoToJalali, jalaliToGregorianIso } from "@/lib/jalaliDate";
import {
  createStudent,
  listStudents,
  getStudentsSummary,
  getStudent,
  updateStudent,
  deleteStudent as deleteStudentApi,
  StudentApi,
  UpdateStudentPayload,
  StudentRolePayoutPayload,
} from "@/api/studentsApi";
import { listAdvisors, listUsers, UserApi } from "@/api/usersApi";
import { listActivePlans, PlanApi } from "@/api/plansApi";
import { listRoles, RoleApi } from "@/api/rolesApi";
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
import { Separator } from "@/components/ui/separator";

interface StudentRow {
  id: number;
  name: string;
  phone: string;
  email: string;
  advisor: string;
  plan: string;
  balance: string;
  status: "active" | "inactive" | "deleted";
  advisoryStart: string;
}

function formatBalance(cents: number | undefined): string {
  const n = cents ?? 0;
  const s = Math.abs(n).toLocaleString("fa-IR");
  return n < 0 ? `-${s}` : s;
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayJalaliDate(): string {
  return gregorianIsoToJalali(todayIsoDate());
}

type AdvisorCommKind = "NONE" | "PERCENT" | "FIXED_PER_PAYMENT";
type PayoutAmountKind = "PERCENT" | "FIXED_PER_PAYMENT";

interface RolePayoutFormRow {
  key: string;
  roleId: string;
  userId: string;
  amountKind: PayoutAmountKind;
  percent: string;
  fixedCents: string;
}

function parseCommKind(raw: string | undefined): AdvisorCommKind {
  if (raw === "PERCENT" || raw === "FIXED_PER_PAYMENT") return raw;
  return "NONE";
}

function makeRolePayoutRow(seed?: Partial<RolePayoutFormRow>): RolePayoutFormRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    roleId: seed?.roleId ?? "",
    userId: seed?.userId ?? "",
    amountKind: seed?.amountKind ?? "PERCENT",
    percent: seed?.percent ?? "",
    fixedCents: seed?.fixedCents ?? "",
  };
}

function mapApiRolePayoutsToRows(student: StudentApi): RolePayoutFormRow[] {
  return (student.role_payouts ?? []).map((p) =>
    makeRolePayoutRow({
      roleId: String(p.role_id),
      userId: String(p.user_id),
      amountKind: p.amount_kind,
      percent: p.percent != null ? String(p.percent) : "",
      fixedCents: p.fixed_cents != null ? String(p.fixed_cents) : "",
    })
  );
}

function buildRolePayoutPayload(rows: RolePayoutFormRow[]): StudentRolePayoutPayload[] {
  return rows
    .filter((r) => r.roleId && r.userId)
    .map((r) => ({
      role_id: Number(r.roleId),
      user_id: Number(r.userId),
      amount_kind: r.amountKind,
      ...(r.amountKind === "PERCENT" ? { percent: parseLocalizedFloat(r.percent) } : {}),
      ...(r.amountKind === "FIXED_PER_PAYMENT" ? { fixed_cents: parseLocalizedInt(r.fixedCents) } : {}),
    }));
}

function mapStudent(api: StudentApi): StudentRow {
  const name = `${api.first_name ?? ""} ${api.last_name ?? ""}`.trim();
  let advisoryStart = "—";
  if (api.advisory_start_date) {
    advisoryStart = gregorianIsoToJalali(api.advisory_start_date) || api.advisory_start_date;
  }
  return {
    id: api.id,
    name: name || "بدون نام",
    phone: api.phone || "",
    email: api.email || "",
    advisor: api.advisor_name?.trim() || "—",
    plan: api.current_plan_name?.trim() || "—",
    balance: formatBalance(api.balance_cents),
    status:
      api.status === "DELETED"
        ? "deleted"
        : api.status === "INACTIVE"
          ? "inactive"
          : "active",
    advisoryStart,
  };
}

function EditStudentForm({
  student,
  advisors,
  users,
  roles,
  plans,
  onCancel,
  onSuccess,
  mutation,
}: {
  student: StudentApi;
  advisors: UserApi[];
  users: UserApi[];
  roles: RoleApi[];
  plans: PlanApi[];
  onCancel: () => void;
  onSuccess: () => void;
  mutation: ReturnType<typeof useMutation<StudentApi, Error, { id: number; payload: UpdateStudentPayload }>>;
}) {
  const [firstName, setFirstName] = useState(student.first_name || "");
  const [lastName, setLastName] = useState(student.last_name || "");
  const [email, setEmail] = useState(student.email || "");
  const [phone, setPhone] = useState(student.phone || "");
  const [fatherName, setFatherName] = useState(student.father_name || "");
  const [motherName, setMotherName] = useState(student.mother_name || "");
  const [fatherPhone, setFatherPhone] = useState(student.father_phone || "");
  const [motherPhone, setMotherPhone] = useState(student.mother_phone || "");
  const [fatherJob, setFatherJob] = useState(student.father_job || "");
  const [motherJob, setMotherJob] = useState(student.mother_job || "");
  const [schoolName, setSchoolName] = useState(student.school_name || "");
  const [schoolAddress, setSchoolAddress] = useState(student.school_address || "");
  const [homeAddress, setHomeAddress] = useState(student.home_address || "");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "DELETED">(
    student.status === "DELETED" ? "DELETED" : student.status === "INACTIVE" ? "INACTIVE" : "ACTIVE"
  );
  const [advisorId, setAdvisorId] = useState(student.advisor_id != null ? String(student.advisor_id) : "none");
  const [planId, setPlanId] = useState(student.current_plan_id != null ? String(student.current_plan_id) : "none");
  const [enrollmentAmount, setEnrollmentAmount] = useState(
    student.enrollment_amount_cents != null && student.enrollment_amount_cents > 0
      ? formatGroupedFaIntInput(String(Math.round(student.enrollment_amount_cents / 10)))
      : ""
  );
  const [balance, setBalance] = useState(student.balance_cents != null ? String(student.balance_cents) : "0");
  const [advisorCommKind, setAdvisorCommKind] = useState<AdvisorCommKind>(
    parseCommKind(student.advisor_commission_kind)
  );
  const [commPercent, setCommPercent] = useState(
    student.advisor_commission_percent != null ? String(student.advisor_commission_percent) : ""
  );
  const [commFixed, setCommFixed] = useState(
    student.advisor_commission_fixed_cents != null ? String(student.advisor_commission_fixed_cents) : ""
  );
  const [advisoryStartDate, setAdvisoryStartDate] = useState(
    gregorianIsoToJalali(student.advisory_start_date) || ""
  );
  const [rolePayoutRows, setRolePayoutRows] = useState<RolePayoutFormRow[]>(
    mapApiRolePayoutsToRows(student)
  );

  const advisorSelected = advisorId !== "none";
  const commissionInvalid =
    advisorSelected &&
    ((advisorCommKind === "PERCENT" &&
      (!commPercent.trim() || parseLocalizedFloat(commPercent) <= 0 || parseLocalizedFloat(commPercent) > 100)) ||
      (advisorCommKind === "FIXED_PER_PAYMENT" &&
        (!commFixed.trim() || parseLocalizedInt(commFixed) < 0)));
  const rolePayoutInvalid = rolePayoutRows.some((r) =>
    !r.roleId ||
    !r.userId ||
    (r.amountKind === "PERCENT" &&
      (!r.percent.trim() || parseLocalizedFloat(r.percent) <= 0 || parseLocalizedFloat(r.percent) > 100)) ||
    (r.amountKind === "FIXED_PER_PAYMENT" &&
      (!r.fixedCents.trim() || parseLocalizedInt(r.fixedCents) < 0))
  );

  return (
    <div className="space-y-6 py-2">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">اطلاعات اولیه دانش‌آموز</h3>
        <Separator className="mb-3" />
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
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">ایمیل</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">موبایل</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="۰۹۱۲..." dir="ltr" />
          </div>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">تاریخ شروع مشاوره</label>
          <Input
            type="text"
            value={advisoryStartDate}
            onChange={(e) => setAdvisoryStartDate(e.target.value)}
            placeholder="۱۴۰۳/۰۱/۱۵"
            dir="ltr"
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">اطلاعات تکمیلی دانش‌آموز</h3>
        <Separator className="mb-3" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">نام پدر</label>
            <Input value={fatherName} onChange={(e) => setFatherName(e.target.value)} placeholder="نام پدر" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">نام مادر</label>
            <Input value={motherName} onChange={(e) => setMotherName(e.target.value)} placeholder="نام مادر" />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">شماره پدر</label>
            <Input value={fatherPhone} onChange={(e) => setFatherPhone(e.target.value)} placeholder="۰۹۱۲..." dir="ltr" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">شماره مادر</label>
            <Input value={motherPhone} onChange={(e) => setMotherPhone(e.target.value)} placeholder="۰۹۱۲..." dir="ltr" />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">شغل پدر</label>
            <Input value={fatherJob} onChange={(e) => setFatherJob(e.target.value)} placeholder="شغل پدر" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">شغل مادر</label>
            <Input value={motherJob} onChange={(e) => setMotherJob(e.target.value)} placeholder="شغل مادر" />
          </div>
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">اسم مدرسه</label>
          <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="نام مدرسه" />
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">آدرس مدرسه</label>
          <Input value={schoolAddress} onChange={(e) => setSchoolAddress(e.target.value)} placeholder="آدرس مدرسه" />
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">آدرس خانه</label>
          <Input value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} placeholder="آدرس منزل" />
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">مشاور (اختیاری)</label>
          <Select
            value={advisorId}
            onValueChange={(v) => {
              setAdvisorId(v);
              if (v === "none") {
                setAdvisorCommKind("NONE");
                setCommPercent("");
                setCommFixed("");
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="انتخاب مشاور" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون مشاور</SelectItem>
              {advisors.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.first_name} {a.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {advisorSelected && (
          <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              سهم مشاور از هر پرداخت (به‌صورت خودکار محاسبه می‌شود)
            </p>
            <Select value={advisorCommKind} onValueChange={(v) => setAdvisorCommKind(v as AdvisorCommKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">بدون سهم</SelectItem>
                <SelectItem value="PERCENT">درصدی از مبلغ پرداخت</SelectItem>
                <SelectItem value="FIXED_PER_PAYMENT">مبلغ ثابت به ازای هر پرداخت</SelectItem>
              </SelectContent>
            </Select>
            {advisorCommKind === "PERCENT" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">درصد از مبلغ پرداخت</label>
                <Input value={commPercent} onChange={(e) => setCommPercent(e.target.value)} placeholder="مثلاً ۱۰" inputMode="decimal" dir="ltr" />
              </div>
            )}
            {advisorCommKind === "FIXED_PER_PAYMENT" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">مبلغ ثابت (تومان، به ازای هر پرداخت)</label>
                <Input value={commFixed} onChange={(e) => setCommFixed(formatGroupedFaIntInput(e.target.value))} placeholder="مبلغ به تومان" inputMode="numeric" dir="ltr" />
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">اطلاعات ثبت‌نام</h3>
        <Separator className="mb-3" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">نوع ثبت‌نام (پلن)</label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب نوع ثبت‌نام" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون پلن</SelectItem>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">مبلغ ثبت‌نامی (تومان)</label>
            <Input
              inputMode="numeric"
              value={enrollmentAmount}
              onChange={(e) => setEnrollmentAmount(formatGroupedFaIntInput(e.target.value))}
              placeholder="مثلاً 2,500,000"
              dir="ltr"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">مبلغ خاص این دانش‌آموز برای پلن انتخاب‌شده</p>
          </div>
        </div>
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">تقسیم مبلغ ثبت‌نام به نقش‌ها (اختیاری)</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setRolePayoutRows((prev) => [...prev, makeRolePayoutRow()])}>
              افزودن نقش
            </Button>
          </div>
          {rolePayoutRows.length === 0 && (
            <p className="text-xs text-muted-foreground">هنوز سهمی تعریف نشده است.</p>
          )}
          {rolePayoutRows.map((row) => {
            const roleUsers = users.filter((u) => String(u.role_id) === row.roleId);
            return (
              <div key={row.key} className="space-y-2 rounded-md border border-border bg-background p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Select value={row.roleId || "none"} onValueChange={(v) => setRolePayoutRows((prev) => prev.map((x) => x.key === row.key ? { ...x, roleId: v === "none" ? "" : v, userId: "" } : x))}>
                    <SelectTrigger><SelectValue placeholder="نقش" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">انتخاب نقش</SelectItem>
                      {roles.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={row.userId || "none"} onValueChange={(v) => setRolePayoutRows((prev) => prev.map((x) => x.key === row.key ? { ...x, userId: v === "none" ? "" : v } : x))}>
                    <SelectTrigger><SelectValue placeholder="کاربر" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">انتخاب کاربر</SelectItem>
                      {roleUsers.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.first_name} {u.last_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={row.amountKind} onValueChange={(v) => setRolePayoutRows((prev) => prev.map((x) => x.key === row.key ? { ...x, amountKind: v as PayoutAmountKind } : x))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENT">درصدی از مبلغ</SelectItem>
                      <SelectItem value="FIXED_PER_PAYMENT">مبلغ ثابت</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {row.amountKind === "PERCENT" ? (
                  <Input value={row.percent} onChange={(e) => setRolePayoutRows((prev) => prev.map((x) => x.key === row.key ? { ...x, percent: e.target.value } : x))} placeholder="درصد (مثلاً ۲۰)" inputMode="decimal" dir="ltr" />
                ) : (
                  <Input value={row.fixedCents} onChange={(e) => setRolePayoutRows((prev) => prev.map((x) => x.key === row.key ? { ...x, fixedCents: formatGroupedFaIntInput(e.target.value) } : x))} placeholder="مبلغ ثابت (تومان)" inputMode="numeric" dir="ltr" />
                )}
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setRolePayoutRows((prev) => prev.filter((x) => x.key !== row.key))}>حذف</Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">وضعیت</span>
        <Select value={status} onValueChange={(v) => setStatus(v as "ACTIVE" | "INACTIVE" | "DELETED")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">فعال</SelectItem>
            <SelectItem value="INACTIVE">غیرفعال</SelectItem>
            <SelectItem value="DELETED">حذف‌شده (خروج کامل)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={mutation.isPending}>
          انصراف
        </Button>
        <Button
          onClick={() => {
            const advTrim = advisoryStartDate.trim();
            const advGregorian = advTrim ? jalaliToGregorianIso(advTrim) : "";
            const enrollAmountTomans = parseLocalizedInt(enrollmentAmount);
            const payload: UpdateStudentPayload = {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              email: email.trim() || undefined,
              phone: phone.trim() || undefined,
              father_name: fatherName.trim() || undefined,
              mother_name: motherName.trim() || undefined,
              father_phone: fatherPhone.trim() || undefined,
              mother_phone: motherPhone.trim() || undefined,
              father_job: fatherJob.trim() || undefined,
              mother_job: motherJob.trim() || undefined,
              school_name: schoolName.trim() || undefined,
              school_address: schoolAddress.trim() || undefined,
              home_address: homeAddress.trim() || undefined,
              status,
              advisor_id: advisorId === "none" ? null : Number(advisorId),
              current_plan_id: planId === "none" ? null : Number(planId),
              enrollment_amount_cents: enrollAmountTomans > 0 ? enrollAmountTomans * 10 : 0,
              balance_cents: parseLocalizedInt(balance) || 0,
            };
            if (advTrim && advGregorian) {
              payload.advisory_start_date = advGregorian;
            } else if (student.advisory_start_date) {
              payload.advisory_start_date = "";
            }
            if (advisorSelected) {
              payload.advisor_commission_kind = advisorCommKind;
              if (advisorCommKind === "PERCENT") {
                payload.advisor_commission_percent = parseLocalizedFloat(commPercent);
              }
              if (advisorCommKind === "FIXED_PER_PAYMENT") {
                payload.advisor_commission_fixed_cents = parseLocalizedInt(commFixed);
              }
            }
            payload.role_payouts = buildRolePayoutPayload(rolePayoutRows);
            mutation.mutate({ id: student.id, payload }, { onSuccess });
          }}
          disabled={mutation.isPending || !firstName.trim() || !lastName.trim() || commissionInvalid || rolePayoutInvalid}
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
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "deleted">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailsStudentId, setDetailsStudentId] = useState<number | null>(null);
  const [editStudentId, setEditStudentId] = useState<number | null>(null);
  const [deleteStudent, setDeleteStudent] = useState<StudentRow | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [motherName, setMotherName] = useState("");
  const [advisorId, setAdvisorId] = useState("");
  const [planId, setPlanId] = useState("");
  const [enrollmentAmount, setEnrollmentAmount] = useState("");
  const [balance, setBalance] = useState("");
  const [fatherPhone, setFatherPhone] = useState("");
  const [motherPhone, setMotherPhone] = useState("");
  const [fatherJob, setFatherJob] = useState("");
  const [motherJob, setMotherJob] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [advisorCommKind, setAdvisorCommKind] = useState<AdvisorCommKind>("NONE");
  const [commPercent, setCommPercent] = useState("");
  const [commFixed, setCommFixed] = useState("");
  const [rolePayoutRows, setRolePayoutRows] = useState<RolePayoutFormRow[]>([]);
  const [createAdvisoryStartDate, setCreateAdvisoryStartDate] = useState(todayJalaliDate);

  const queryClient = useQueryClient();

  useEffect(() => {
    if (isCreateOpen) {
      setCreateAdvisoryStartDate(todayJalaliDate());
      setRolePayoutRows([]);
    }
  }, [isCreateOpen]);

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
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      setEditStudentId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStudentApi,
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
  const { data: usersData } = useQuery({
    queryKey: ["users", "student-role-payouts"],
    queryFn: () => listUsers({ status: "active", page: 1, page_size: 300 }),
  });
  const users = usersData?.data ?? [];
  const { data: roles = [] } = useQuery({
    queryKey: ["roles", "student-role-payouts"],
    queryFn: listRoles,
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
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      setIsCreateOpen(false);
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setFatherName("");
      setMotherName("");
      setAdvisorId("");
      setPlanId("");
      setEnrollmentAmount("");
      setBalance("");
      setFatherPhone("");
      setMotherPhone("");
      setFatherJob("");
      setMotherJob("");
      setSchoolName("");
      setSchoolAddress("");
      setHomeAddress("");
      setAdvisorCommKind("NONE");
      setCommPercent("");
      setCommFixed("");
      setRolePayoutRows([]);
      setCreateAdvisoryStartDate(todayJalaliDate());
    },
  });

  const studentsAll: StudentRow[] = (data?.data || []).map(mapStudent);
  const students: StudentRow[] =
    statusFilter === "all"
      ? studentsAll
      : studentsAll.filter((s) => s.status === statusFilter);

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
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <div className="flex w-full overflow-x-auto rounded-lg border p-1 sm:w-auto">
            <Button
              variant={statusFilter === "all" ? "secondary" : "ghost"}
              size="sm"
              className="h-10 sm:h-8"
              onClick={() => setStatusFilter("all")}
            >
              همه
            </Button>
            <Button
              variant={statusFilter === "active" ? "secondary" : "ghost"}
              size="sm"
              className="h-10 sm:h-8"
              onClick={() => setStatusFilter("active")}
            >
              فعال
            </Button>
            <Button
              variant={statusFilter === "inactive" ? "secondary" : "ghost"}
              size="sm"
              className="h-10 sm:h-8"
              onClick={() => setStatusFilter("inactive")}
            >
              غیرفعال
            </Button>
            <Button
              variant={statusFilter === "deleted" ? "secondary" : "ghost"}
              size="sm"
              className="h-10 sm:h-8"
              onClick={() => setStatusFilter("deleted")}
            >
              حذف‌شده
            </Button>
          </div>
          <div className="flex rounded-lg border p-1">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-10 w-10 sm:h-8 sm:w-8"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-10 w-10 sm:h-8 sm:w-8"
              onClick={() => setViewMode("grid")}
            >
              <Grid className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none">
            <Filter className="ml-2 h-4 w-4" />
            فیلتر
          </Button>
          <Button size="sm" className="flex-1 sm:flex-none" onClick={() => setIsCreateOpen(true)}>
            <Plus className="ml-2 h-4 w-4" />
            دانش‌آموز جدید
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-5">
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
          <p className="text-sm text-muted-foreground">حذف‌شده</p>
          <p className="text-2xl font-bold text-muted-foreground">
            {isSummaryLoading || isSummaryError
              ? "—"
              : summary?.deleted ?? 0}
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
                    student.status === "active" ? "bg-success" : student.status === "inactive" ? "bg-warning" : "bg-destructive"
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
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>شروع مشاوره: {student.advisoryStart}</span>
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
                  <th className="p-4 text-right text-xs font-semibold text-muted-foreground">شروع مشاوره</th>
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
                    <td className="p-4 text-muted-foreground text-sm">{student.advisoryStart}</td>
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
                          student.status === "active"
                            ? "status-paid"
                            : student.status === "inactive"
                              ? "status-pending"
                              : "status-debt"
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            student.status === "active"
                              ? "bg-success"
                              : student.status === "inactive"
                                ? "bg-warning"
                                : "bg-destructive"
                          )}
                        />
                        {student.status === "active" ? "فعال" : student.status === "inactive" ? "غیرفعال" : "حذف‌شده"}
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
              <p><span className="text-muted-foreground">نام پدر:</span> {detailsStudentData.father_name || "—"}</p>
              <p><span className="text-muted-foreground">نام مادر:</span> {detailsStudentData.mother_name || "—"}</p>
              <p><span className="text-muted-foreground">شماره پدر:</span> {detailsStudentData.father_phone ? <span dir="ltr">{detailsStudentData.father_phone}</span> : "—"}</p>
              <p><span className="text-muted-foreground">شماره مادر:</span> {detailsStudentData.mother_phone ? <span dir="ltr">{detailsStudentData.mother_phone}</span> : "—"}</p>
              <p><span className="text-muted-foreground">شغل پدر:</span> {detailsStudentData.father_job || "—"}</p>
              <p><span className="text-muted-foreground">شغل مادر:</span> {detailsStudentData.mother_job || "—"}</p>
              <p><span className="text-muted-foreground">اسم مدرسه:</span> {detailsStudentData.school_name || "—"}</p>
              <p><span className="text-muted-foreground">آدرس مدرسه:</span> {detailsStudentData.school_address || "—"}</p>
              <p><span className="text-muted-foreground">آدرس خانه:</span> {detailsStudentData.home_address || "—"}</p>
              <p>
                <span className="text-muted-foreground">تاریخ شروع مشاوره:</span>{" "}
                {detailsStudentData.advisory_start_date
                  ? gregorianIsoToJalali(detailsStudentData.advisory_start_date) || detailsStudentData.advisory_start_date
                  : "—"}
              </p>
              <p><span className="text-muted-foreground">مشاور:</span> {detailsStudentData.advisor_name || "—"}</p>
              {detailsStudentData.advisor_id != null && (
                <p>
                  <span className="text-muted-foreground">سهم مشاور (هر پرداخت پرداخت‌شده):</span>{" "}
                  {detailsStudentData.advisor_commission_kind === "PERCENT" &&
                  detailsStudentData.advisor_commission_percent != null
                    ? `${detailsStudentData.advisor_commission_percent}٪ از مبلغ`
                    : detailsStudentData.advisor_commission_kind === "FIXED_PER_PAYMENT" &&
                        detailsStudentData.advisor_commission_fixed_cents != null
                      ? `${formatBalance(detailsStudentData.advisor_commission_fixed_cents)} ریال ثابت`
                      : "بدون سهم"}
                </p>
              )}
              {Array.isArray(detailsStudentData.role_payouts) && detailsStudentData.role_payouts.length > 0 && (
                <div>
                  <p className="text-muted-foreground">سهم نقش‌های اضافه:</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {detailsStudentData.role_payouts.map((rp) => (
                      <li key={rp.id}>
                        {(rp.role_name || `نقش #${rp.role_id}`)} / {(rp.user_name || `کاربر #${rp.user_id}`)}:{" "}
                        {rp.amount_kind === "PERCENT"
                          ? `${rp.percent ?? 0}٪`
                          : `${formatBalance(rp.fixed_cents)} ریال`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p><span className="text-muted-foreground">پلن:</span> {detailsStudentData.current_plan_name || "—"}</p>
              {detailsStudentData.enrollment_amount_cents != null && detailsStudentData.enrollment_amount_cents > 0 && (
                <p>
                  <span className="text-muted-foreground">مبلغ ثبت‌نامی:</span>{" "}
                  {Math.round(detailsStudentData.enrollment_amount_cents / 10).toLocaleString("fa-IR")} تومان
                </p>
              )}
              <p><span className="text-muted-foreground">مانده حساب:</span> {formatBalance(detailsStudentData.balance_cents)}</p>
              <p>
                <span className="text-muted-foreground">وضعیت:</span>{" "}
                {detailsStudentData.status === "DELETED"
                  ? "حذف‌شده"
                  : detailsStudentData.status === "INACTIVE"
                    ? "غیرفعال"
                    : "فعال"}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit student dialog */}
      <Dialog open={editStudentId != null} onOpenChange={(open) => !open && setEditStudentId(null)}>
        <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>ویرایش دانش‌آموز</DialogTitle>
          </DialogHeader>
          {editStudentData && (
            <EditStudentForm
              key={editStudentData.id}
              student={editStudentData}
              advisors={advisors || []}
              users={users}
              roles={roles}
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
              دانش‌آموز «{deleteStudent?.name}» از چرخه مشاوره خارج و به وضعیت «حذف‌شده» منتقل می‌شود، اما برای گزارش سالانه در لیست باقی می‌ماند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteStudent && deleteMutation.mutate(deleteStudent.id)}
            >
              {deleteMutation.isPending ? "در حال ثبت..." : "تبدیل به حذف‌شده"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create student dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>دانش‌آموز جدید</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">اطلاعات اولیه دانش‌آموز</h3>
              <Separator className="mb-3" />
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
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">ایمیل</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@email.com"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">موبایل</label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="۰۹۱۲..." dir="ltr" />
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">تاریخ شروع مشاوره</label>
                <Input
                  type="text"
                  value={createAdvisoryStartDate}
                  onChange={(e) => setCreateAdvisoryStartDate(e.target.value)}
                  placeholder="۱۴۰۳/۰۱/۱۵"
                  dir="ltr"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">فرمت: سال/ماه/روز شمسی (مثلا ۱۴۰۳/۰۱/۱۵)</p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">اطلاعات تکمیلی دانش‌آموز</h3>
              <Separator className="mb-3" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">نام پدر</label>
                  <Input value={fatherName} onChange={(e) => setFatherName(e.target.value)} placeholder="نام پدر" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">نام مادر</label>
                  <Input value={motherName} onChange={(e) => setMotherName(e.target.value)} placeholder="نام مادر" />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">شماره پدر</label>
                  <Input value={fatherPhone} onChange={(e) => setFatherPhone(e.target.value)} placeholder="۰۹۱۲..." dir="ltr" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">شماره مادر</label>
                  <Input value={motherPhone} onChange={(e) => setMotherPhone(e.target.value)} placeholder="۰۹۱۲..." dir="ltr" />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">شغل پدر</label>
                  <Input value={fatherJob} onChange={(e) => setFatherJob(e.target.value)} placeholder="شغل پدر" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">شغل مادر</label>
                  <Input value={motherJob} onChange={(e) => setMotherJob(e.target.value)} placeholder="شغل مادر" />
                </div>
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">اسم مدرسه</label>
                <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="نام مدرسه" />
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">آدرس مدرسه</label>
                <Input value={schoolAddress} onChange={(e) => setSchoolAddress(e.target.value)} placeholder="آدرس مدرسه" />
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">آدرس خانه</label>
                <Input value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} placeholder="آدرس منزل" />
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">مشاور (اختیاری)</label>
                <Select
                  value={advisorId || "none"}
                  onValueChange={(val) => {
                    setAdvisorId(val === "none" ? "" : val);
                    if (val === "none") {
                      setAdvisorCommKind("NONE");
                      setCommPercent("");
                      setCommFixed("");
                    }
                  }}
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
              {!!advisorId && (
                <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    سهم مشاور از هر پرداخت (به‌صورت خودکار محاسبه می‌شود)
                  </p>
                  <Select value={advisorCommKind} onValueChange={(v) => setAdvisorCommKind(v as AdvisorCommKind)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">بدون سهم</SelectItem>
                      <SelectItem value="PERCENT">درصدی از مبلغ پرداخت</SelectItem>
                      <SelectItem value="FIXED_PER_PAYMENT">مبلغ ثابت به ازای هر پرداخت</SelectItem>
                    </SelectContent>
                  </Select>
                  {advisorCommKind === "PERCENT" && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">درصد از مبلغ پرداخت</label>
                      <Input value={commPercent} onChange={(e) => setCommPercent(e.target.value)} placeholder="مثلاً ۱۰" inputMode="decimal" dir="ltr" />
                    </div>
                  )}
                  {advisorCommKind === "FIXED_PER_PAYMENT" && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">مبلغ ثابت (تومان، به ازای هر پرداخت)</label>
                      <Input value={commFixed} onChange={(e) => setCommFixed(formatGroupedFaIntInput(e.target.value))} placeholder="مبلغ به تومان" inputMode="numeric" dir="ltr" />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">اطلاعات ثبت‌نام</h3>
              <Separator className="mb-3" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">نوع ثبت‌نام (پلن)</label>
                  <Select
                    value={planId || "none"}
                    onValueChange={(val) => setPlanId(val === "none" ? "" : val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="انتخاب نوع ثبت‌نام" />
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
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">مبلغ ثبت‌نامی (تومان)</label>
                  <Input
                    value={enrollmentAmount}
                    onChange={(e) => setEnrollmentAmount(formatGroupedFaIntInput(e.target.value))}
                    placeholder="مثلاً 2,500,000"
                    inputMode="numeric"
                    dir="ltr"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">مبلغ خاص این دانش‌آموز برای پلن انتخاب‌شده</p>
                </div>
              </div>
              <div className="mt-4 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">تقسیم مبلغ ثبت‌نام به نقش‌ها (اختیاری)</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => setRolePayoutRows((prev) => [...prev, makeRolePayoutRow()])}>
                    افزودن نقش
                  </Button>
                </div>
                {rolePayoutRows.length === 0 && (
                  <p className="text-xs text-muted-foreground">هنوز سهمی تعریف نشده است.</p>
                )}
                {rolePayoutRows.map((row) => {
                  const roleUsers = users.filter((u) => String(u.role_id) === row.roleId);
                  return (
                    <div key={row.key} className="space-y-2 rounded-md border border-border bg-background p-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <Select value={row.roleId || "none"} onValueChange={(v) => setRolePayoutRows((prev) => prev.map((x) => x.key === row.key ? { ...x, roleId: v === "none" ? "" : v, userId: "" } : x))}>
                          <SelectTrigger><SelectValue placeholder="نقش" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">انتخاب نقش</SelectItem>
                            {roles.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={row.userId || "none"} onValueChange={(v) => setRolePayoutRows((prev) => prev.map((x) => x.key === row.key ? { ...x, userId: v === "none" ? "" : v } : x))}>
                          <SelectTrigger><SelectValue placeholder="کاربر" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">انتخاب کاربر</SelectItem>
                            {roleUsers.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.first_name} {u.last_name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={row.amountKind} onValueChange={(v) => setRolePayoutRows((prev) => prev.map((x) => x.key === row.key ? { ...x, amountKind: v as PayoutAmountKind } : x))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PERCENT">درصدی از مبلغ</SelectItem>
                            <SelectItem value="FIXED_PER_PAYMENT">مبلغ ثابت</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {row.amountKind === "PERCENT" ? (
                        <Input value={row.percent} onChange={(e) => setRolePayoutRows((prev) => prev.map((x) => x.key === row.key ? { ...x, percent: e.target.value } : x))} placeholder="درصد (مثلاً ۲۰)" inputMode="decimal" dir="ltr" />
                      ) : (
                        <Input value={row.fixedCents} onChange={(e) => setRolePayoutRows((prev) => prev.map((x) => x.key === row.key ? { ...x, fixedCents: formatGroupedFaIntInput(e.target.value) } : x))} placeholder="مبلغ ثابت (تومان)" inputMode="numeric" dir="ltr" />
                      )}
                      <div className="flex justify-end">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setRolePayoutRows((prev) => prev.filter((x) => x.key !== row.key))}>حذف</Button>
                      </div>
                    </div>
                  );
                })}
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
              onClick={() => {
                const createAdvisorSelected = !!advisorId;
                const createCommissionInvalid =
                  createAdvisorSelected &&
                  ((advisorCommKind === "PERCENT" &&
                    (!commPercent.trim() || parseLocalizedFloat(commPercent) <= 0 || parseLocalizedFloat(commPercent) > 100)) ||
                    (advisorCommKind === "FIXED_PER_PAYMENT" &&
                      (!commFixed.trim() || parseLocalizedInt(commFixed) < 0)));
                const createRolePayoutInvalid = rolePayoutRows.some((r) =>
                  !r.roleId ||
                  !r.userId ||
                  (r.amountKind === "PERCENT" &&
                    (!r.percent.trim() || parseLocalizedFloat(r.percent) <= 0 || parseLocalizedFloat(r.percent) > 100)) ||
                  (r.amountKind === "FIXED_PER_PAYMENT" &&
                    (!r.fixedCents.trim() || parseLocalizedInt(r.fixedCents) < 0))
                );
                if (createCommissionInvalid || createRolePayoutInvalid) return;
                const enrollAmountTomans = parseLocalizedInt(enrollmentAmount);
                createMutation.mutate({
                  first_name: firstName.trim(),
                  last_name: lastName.trim(),
                  email: email.trim() || undefined,
                  phone: phone.trim() || undefined,
                  father_name: fatherName.trim() || undefined,
                  mother_name: motherName.trim() || undefined,
                  father_phone: fatherPhone.trim() || undefined,
                  mother_phone: motherPhone.trim() || undefined,
                  father_job: fatherJob.trim() || undefined,
                  mother_job: motherJob.trim() || undefined,
                  school_name: schoolName.trim() || undefined,
                  school_address: schoolAddress.trim() || undefined,
                  home_address: homeAddress.trim() || undefined,
                  advisory_start_date: (() => {
                    const g = jalaliToGregorianIso(createAdvisoryStartDate.trim());
                    return g || undefined;
                  })(),
                  advisor_id: advisorId ? Number(advisorId) : undefined,
                  ...(createAdvisorSelected
                    ? {
                        advisor_commission_kind: advisorCommKind,
                        ...(advisorCommKind === "PERCENT"
                          ? { advisor_commission_percent: parseLocalizedFloat(commPercent) }
                          : {}),
                        ...(advisorCommKind === "FIXED_PER_PAYMENT"
                          ? { advisor_commission_fixed_cents: parseLocalizedInt(commFixed) * 10 }
                          : {}),
                      }
                    : {}),
                  role_payouts: buildRolePayoutPayload(rolePayoutRows),
                  current_plan_id: planId ? Number(planId) : undefined,
                  enrollment_amount_cents: enrollAmountTomans > 0 ? enrollAmountTomans * 10 : undefined,
                });
              }}
              disabled={
                createMutation.isPending ||
                !firstName.trim() ||
                !lastName.trim() ||
                (!!advisorId &&
                  ((advisorCommKind === "PERCENT" &&
                    (!commPercent.trim() || parseLocalizedFloat(commPercent) <= 0 || parseLocalizedFloat(commPercent) > 100)) ||
                    (advisorCommKind === "FIXED_PER_PAYMENT" &&
                      (!commFixed.trim() || parseLocalizedInt(commFixed) < 0)))) ||
                rolePayoutRows.some((r) =>
                  !r.roleId ||
                  !r.userId ||
                  (r.amountKind === "PERCENT" &&
                    (!r.percent.trim() || parseLocalizedFloat(r.percent) <= 0 || parseLocalizedFloat(r.percent) > 100)) ||
                  (r.amountKind === "FIXED_PER_PAYMENT" &&
                    (!r.fixedCents.trim() || parseLocalizedInt(r.fixedCents) < 0))
                )
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

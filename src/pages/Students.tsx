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
  Download,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatGroupedFaIntInput, parseLocalizedFloat, parseLocalizedInt } from "@/lib/numberInput";
import { gregorianIsoToJalali, jalaliToGregorianIso, todayJalaliString, isoToJalaliString } from "@/lib/jalaliDate";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import {
  createStudent,
  listStudents,
  listAllStudents,
  listStudentSchools,
  getStudentsSummary,
  getStudent,
  updateStudent,
  deleteStudent as deleteStudentApi,
  purgeStudent as purgeStudentApi,
  StudentApi,
  UpdateStudentPayload,
  CreateStudentPayload,
  StudentRolePayoutPayload,
  type AdvisorCommissionKind,
  type DeliveryMode,
  type EnrollmentBillingMode,
  type RegistrationChannel,
  type StudentSort,
  type StudentStatusFilter,
} from "@/api/studentsApi";
import {
  createSchoolContract,
  listAllSchoolContracts,
  type SchoolContractApi,
} from "@/api/schoolContractsApi";
import { SchoolContractsSection } from "@/components/students/SchoolContractsSection";
import { listAdvisors, listAllUsers, UserApi } from "@/api/usersApi";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  EnrollmentRegistrationFields,
  makeRolePayoutRow,
  type RolePayoutFormRow,
} from "@/components/students/EnrollmentRegistrationFields";
import {
  defaultAccrualMonthMask,
  parseBillingMode,
  parseCommKind,
  accrualMonthCountFromMask,
  billingModeLabel,
  monthsFromMask,
} from "@/components/students/enrollmentBillingUtils";
import { JALALI_MONTH_NAMES } from "@/lib/jalaliDate";
import { useToast } from "@/hooks/use-toast";

interface StudentRow {
  id: number;
  name: string;
  phone: string;
  email: string;
  advisor: string;
  plan: string;
  /** مانده به ریال×۱۰ (هم‌واحد API) — برای بستانکار/بدهکار منفی یعنی پیش‌پرداخت نسبت به ثبت‌نام */
  remainingCents: number;
  /** مانده ماه (بدهی تا پایان ماه جاری از تاریخ ثبت‌نام − پرداخت‌شده) */
  monthRemainingCents: number;
  enrollmentCents: number;
  paidTotalCents: number;
  dueToDateCents: number;
  billingMode: string;
  status: "active" | "inactive" | "deleted";
  advisoryStart: string;
}

function studentCanHardDelete(student: StudentRow): boolean {
  return student.status === "deleted" || student.paidTotalCents === 0;
}

function studentNeedsSoftDeleteFirst(student: StudentRow): boolean {
  return student.status !== "deleted" && student.paidTotalCents > 0;
}

function formatBalance(cents: number | undefined): string {
  const n = Math.round((cents ?? 0) / 10);
  const s = Math.abs(n).toLocaleString("fa-IR");
  return n < 0 ? `-${s}` : s;
}

type StudentBalanceKind = "creditor" | "debtor" | "clear" | "open_charges";

function classifyStudentBalance(
  remainingCents: number,
  enrollmentCents: number
): { kind: StudentBalanceKind; amountTomansFa: string } {
  const tomans = Math.round(remainingCents / 10);
  const amountTomansFa = Math.abs(tomans).toLocaleString("fa-IR");
  if (remainingCents < 0) {
    return { kind: "creditor", amountTomansFa };
  }
  if (remainingCents === 0) {
    return { kind: "clear", amountTomansFa: "۰" };
  }
  if (enrollmentCents > 0) {
    return { kind: "debtor", amountTomansFa };
  }
  return { kind: "open_charges", amountTomansFa };
}

function studentBalanceExportText(remainingCents: number, enrollmentCents: number): string {
  const { kind, amountTomansFa } = classifyStudentBalance(remainingCents, enrollmentCents);
  const n = Math.round(remainingCents / 10);
  const absPlain = String(Math.abs(n));
  switch (kind) {
    case "creditor":
      return `بستانکار ${absPlain}`;
    case "debtor":
      return `بدهکار ${absPlain}`;
    case "clear":
      return enrollmentCents > 0 ? "تسویه" : "۰";
    default:
      return `${absPlain} (قبوض باز)`;
  }
}

function StudentBalanceCell({
  remainingCents,
  enrollmentCents,
  align = "end",
}: {
  remainingCents: number;
  enrollmentCents: number;
  align?: "end" | "start";
}) {
  const { kind, amountTomansFa } = classifyStudentBalance(remainingCents, enrollmentCents);
  const alignCls = align === "end" ? "items-end" : "items-start";
  if (kind === "clear") {
    return (
      <span className="text-sm text-muted-foreground">{enrollmentCents > 0 ? "تسویه" : "۰"}</span>
    );
  }
  if (kind === "creditor") {
    return (
      <div className={cn("flex flex-col gap-0.5", alignCls)}>
        <span className="text-[10px] font-semibold text-sky-600">بستانکار</span>
        <span className="font-bold number-display text-sky-700">
          {amountTomansFa}{" "}
          <span className="text-xs font-normal text-muted-foreground">تومان</span>
        </span>
      </div>
    );
  }
  if (kind === "debtor") {
    return (
      <div className={cn("flex flex-col gap-0.5", alignCls)}>
        <span className="text-[10px] font-semibold text-destructive">بدهکار</span>
        <span className="font-bold number-display text-destructive">
          {amountTomansFa}{" "}
          <span className="text-xs font-normal text-muted-foreground">تومان</span>
        </span>
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col gap-0.5", alignCls)}>
      <span className="font-bold number-display text-amber-800">
        {amountTomansFa}{" "}
        <span className="text-xs font-normal text-muted-foreground">تومان</span>
      </span>
      <span className="text-[10px] text-muted-foreground">قبوض باز</span>
    </div>
  );
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayJalaliDate(): string {
  return todayJalaliString();
}

type PayoutAmountKind = "PERCENT" | "FIXED_PER_PAYMENT";

function appendAdvisorCommissionFields(
  payload: UpdateStudentPayload | CreateStudentPayload,
  opts: {
    advisorSelected: boolean;
    billingMode: EnrollmentBillingMode;
    kind: AdvisorCommissionKind;
    commPercent: string;
    commFixed: string;
    accrualMonthMask: number;
  },
) {
  payload.enrollment_billing_mode = opts.billingMode;
  if (opts.billingMode === "SCHOOL_ENROLLMENT") {
    if (opts.accrualMonthMask > 0) {
      payload.advisor_accrual_month_mask = opts.accrualMonthMask;
    } else {
      payload.advisor_accrual_months = 10;
    }
  }
  if (!opts.advisorSelected) return;
  payload.advisor_commission_kind = opts.kind;
  if (opts.billingMode === "SCHOOL_ENROLLMENT") {
    if (opts.kind === "PERCENT_OF_CONTRACT") {
      payload.advisor_commission_percent = parseLocalizedFloat(opts.commPercent);
    }
    if (opts.kind === "FIXED_MONTHLY") {
      payload.advisor_commission_fixed_cents = parseLocalizedInt(opts.commFixed) * 10;
    }
    return;
  }
  if (opts.kind === "PERCENT") {
    payload.advisor_commission_percent = parseLocalizedFloat(opts.commPercent);
  }
  if (opts.kind === "FIXED_PER_PAYMENT") {
    payload.advisor_commission_fixed_cents = parseLocalizedInt(opts.commFixed) * 10;
  }
}

function isAdvisorCommissionInvalid(
  advisorSelected: boolean,
  billingMode: EnrollmentBillingMode,
  kind: AdvisorCommissionKind,
  commPercent: string,
  commFixed: string,
  accrualMonthMask: number,
  enrollmentAmount: string,
): boolean {
  if (!advisorSelected || kind === "NONE") return false;
  if (billingMode === "SINGLE_SESSION") {
    if (parseLocalizedInt(enrollmentAmount) <= 0) return true;
    if (kind === "PERCENT") {
      const p = parseLocalizedFloat(commPercent);
      return !commPercent.trim() || p <= 0 || p > 100;
    }
    if (kind === "FIXED_PER_PAYMENT") {
      return !commFixed.trim() || parseLocalizedInt(commFixed) < 0;
    }
    return true;
  }
  if (billingMode === "SCHOOL_ENROLLMENT") {
    const enroll = parseLocalizedInt(enrollmentAmount);
    const monthCount = accrualMonthCountFromMask(accrualMonthMask);
    if (monthCount <= 0 || monthCount > 12 || enroll <= 0) return true;
    if (kind === "PERCENT_OF_CONTRACT") {
      const p = parseLocalizedFloat(commPercent);
      return !commPercent.trim() || p <= 0 || p > 100;
    }
    if (kind === "FIXED_MONTHLY") {
      return !commFixed.trim() || parseLocalizedInt(commFixed) <= 0;
    }
    return true;
  }
  if (kind === "PERCENT") {
    const p = parseLocalizedFloat(commPercent);
    return !commPercent.trim() || p <= 0 || p > 100;
  }
  if (kind === "FIXED_PER_PAYMENT") {
    return !commFixed.trim() || parseLocalizedInt(commFixed) < 0;
  }
  return false;
}

function mapApiRolePayoutsToRows(student: StudentApi): RolePayoutFormRow[] {
  return (student.role_payouts ?? []).map((p) =>
    makeRolePayoutRow({
      roleId: String(p.role_id),
      userId: String(p.user_id),
      amountKind: p.amount_kind,
      percent: p.percent != null ? String(p.percent) : "",
      fixedCents: p.fixed_cents != null && p.fixed_cents > 0
        ? formatGroupedFaIntInput(String(Math.round(p.fixed_cents / 10)))
        : "",
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
      ...(r.amountKind === "FIXED_PER_PAYMENT" ? { fixed_cents: parseLocalizedInt(r.fixedCents) * 10 } : {}),
    }));
}

function advisorPayrollMonths(advisorId: string, users: UserApi[], roles: RoleApi[]): number {
  if (!advisorId) return 10;
  const user = users.find((u) => String(u.id) === advisorId);
  if (!user) return 10;
  const role = roles.find((r) => r.id === user.role_id);
  if (!role) return 10;
  if (role.payroll_months_count != null && role.payroll_months_count > 0) {
    return role.payroll_months_count;
  }
  return role.compensation_kind === "VARIABLE" ? 10 : 12;
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
    remainingCents: api.total_remaining_cents ?? api.remaining_balance_cents ?? api.balance_cents ?? 0,
    monthRemainingCents:
      api.month_remaining_cents ?? api.total_remaining_cents ?? api.remaining_balance_cents ?? 0,
    enrollmentCents: api.enrollment_amount_cents ?? 0,
    paidTotalCents: api.paid_total_cents ?? 0,
    dueToDateCents: api.due_to_date_cents ?? 0,
    billingMode: api.enrollment_billing_mode ?? "MONTHLY",
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
  const { toast } = useToast();
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
  const [registrationChannel, setRegistrationChannel] = useState<RegistrationChannel>(
    student.registration_channel === "SCHOOL" ? "SCHOOL" : "PRIVATE",
  );
  const isSchoolChannel = registrationChannel === "SCHOOL";
  const [schoolName, setSchoolName] = useState(student.school_name || "");
  const [schoolAddress, setSchoolAddress] = useState(student.school_address || "");
  const [homeAddress, setHomeAddress] = useState(student.home_address || "");
  const [schoolContractId, setSchoolContractId] = useState(
    student.school_contract_id != null ? String(student.school_contract_id) : "",
  );
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(
    student.delivery_mode === "ONLINE" ? "ONLINE" : "IN_PERSON",
  );
  const { data: editSchoolContracts = [] } = useQuery({
    queryKey: ["school-contracts", "all-active"],
    queryFn: () => listAllSchoolContracts({ status: "ACTIVE" }),
    enabled: isSchoolChannel,
  });
  const { data: editSchoolPeers } = useQuery({
    queryKey: ["students", "school-enroll-sum-edit", schoolContractId, student.id],
    queryFn: () =>
      listStudents({
        school_contract_id: Number(schoolContractId),
        registration_channel: "SCHOOL",
        page: 1,
        page_size: 200,
      }),
    enabled: isSchoolChannel && !!schoolContractId && Number(schoolContractId) > 0,
  });
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
  const selectedEditSchoolContract = editSchoolContracts.find((c) => String(c.id) === schoolContractId);
  const editPeersEnrollmentSumCents = (editSchoolPeers?.data ?? [])
    .filter((st) => st.id !== student.id)
    .reduce((sum, st) => sum + (st.enrollment_amount_cents ?? 0), 0);
  const editSchoolEnrollmentMismatch =
    isSchoolChannel &&
    !!selectedEditSchoolContract &&
    selectedEditSchoolContract.total_amount_cents > 0 &&
    editPeersEnrollmentSumCents + parseLocalizedInt(enrollmentAmount) * 10 !==
      selectedEditSchoolContract.total_amount_cents;
  const [billingMode, setBillingMode] = useState<EnrollmentBillingMode>(
    parseBillingMode(student.enrollment_billing_mode)
  );
  const [accrualMonthMask, setAccrualMonthMask] = useState(() =>
    student.advisor_accrual_month_mask && student.advisor_accrual_month_mask > 0
      ? student.advisor_accrual_month_mask
      : defaultAccrualMonthMask(student.advisor_accrual_months ?? 10),
  );
  const [advisorCommKind, setAdvisorCommKind] = useState<AdvisorCommissionKind>(
    parseCommKind(student.advisor_commission_kind, parseBillingMode(student.enrollment_billing_mode))
  );
  const [commPercent, setCommPercent] = useState(
    student.advisor_commission_percent != null ? String(student.advisor_commission_percent) : ""
  );
  const [commFixed, setCommFixed] = useState(
    student.advisor_commission_fixed_cents != null && student.advisor_commission_fixed_cents > 0
      ? formatGroupedFaIntInput(String(Math.round(student.advisor_commission_fixed_cents / 10)))
      : ""
  );
  const [advisoryStartDate, setAdvisoryStartDate] = useState(
    isoToJalaliString(student.advisory_start_date) || ""
  );
  const [rolePayoutRows, setRolePayoutRows] = useState<RolePayoutFormRow[]>(
    mapApiRolePayoutsToRows(student)
  );

  const advisorSelected = advisorId !== "none";
  const commissionInvalid = isAdvisorCommissionInvalid(
    advisorSelected,
    billingMode,
    advisorCommKind,
    commPercent,
    commFixed,
    accrualMonthMask,
    enrollmentAmount,
  );
  const rolePayoutInvalid = rolePayoutRows.some((r) =>
    !r.roleId ||
    !r.userId ||
    (r.amountKind === "PERCENT" &&
      (!r.percent.trim() || parseLocalizedFloat(r.percent) <= 0 || parseLocalizedFloat(r.percent) > 100)) ||
    (r.amountKind === "FIXED_PER_PAYMENT" &&
      (!r.fixedCents.trim() || parseLocalizedInt(r.fixedCents) < 0))
  );

  const enrollmentMissingButHasPaidPayments =
    (student.paid_total_cents ?? 0) > 0 && (student.enrollment_amount_cents ?? 0) === 0;

  return (
    <div className="space-y-6 py-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">نوع ثبت‌نام</label>
        <Select
          value={registrationChannel}
          onValueChange={(v) => {
            const ch = v as RegistrationChannel;
            setRegistrationChannel(ch);
            if (ch === "PRIVATE") setSchoolContractId("");
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PRIVATE">خصوصی</SelectItem>
            <SelectItem value="SCHOOL">مدرسه‌ای</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
          <JalaliDatePicker
            value={advisoryStartDate}
            onChange={setAdvisoryStartDate}
            placeholder="انتخاب تاریخ شروع مشاوره"
            clearable={false}
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
        {isSchoolChannel ? (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">مدرسه</label>
            <Select value={schoolContractId} onValueChange={setSchoolContractId}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب مدرسه" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {editSchoolContracts.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.school_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              مبلغ ثبت‌نام و پرداخت این دانش‌آموز به‌صورت فردی ثبت می‌شود؛ خلاصه مالی مدرسه در «پرداخت‌ها ← مدارس».
            </p>
          </div>
        ) : (
          <>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">اسم مدرسه</label>
              <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="نام مدرسه" />
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">آدرس مدرسه</label>
              <Input value={schoolAddress} onChange={(e) => setSchoolAddress(e.target.value)} placeholder="آدرس مدرسه" />
            </div>
          </>
        )}
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">آدرس خانه</label>
          <Input value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} placeholder="آدرس منزل" />
        </div>
        {!isSchoolChannel && (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">نحوه برگزاری</label>
            <Select value={deliveryMode} onValueChange={(v) => setDeliveryMode(v as DeliveryMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN_PERSON">حضوری</SelectItem>
                <SelectItem value="ONLINE">آنلاین</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">اطلاعات ثبت‌نام</h3>
        <Separator className="mb-3" />
        {enrollmentMissingButHasPaidPayments && (
          <Alert
            className="mb-3 border-amber-500/40 bg-amber-50/90 text-amber-950 dark:border-amber-600/40 dark:bg-amber-950/25 dark:text-amber-50"
            dir="rtl"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-sm">مبلغ ثبت‌نامی ثبت نشده است</AlertTitle>
            <AlertDescription className="text-xs text-amber-900/90 dark:text-amber-100/90">
              برای این دانش‌آموز پرداخت ثبت‌شده وجود دارد، اما مبلغ ثبت‌نامی خالی است. لطفاً مبلغ ثبت‌نامی را وارد
              کنید تا مانده حساب درست محاسبه شود.
            </AlertDescription>
          </Alert>
        )}
        {editSchoolEnrollmentMismatch && (
          <Alert
            className="mb-3 border-amber-500/40 bg-amber-50/90 text-amber-950 dark:border-amber-600/40 dark:bg-amber-950/25 dark:text-amber-50"
            dir="rtl"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-sm">عدم تطابق با مبلغ قرارداد</AlertTitle>
            <AlertDescription className="text-xs text-amber-900/90 dark:text-amber-100/90">
              جمع مبالغ ثبت‌نامی دانش‌آموزان این مدرسه با مبلغ کل قرارداد برابر نیست. ذخیره بلاک نمی‌شود؛ فقط هشدار
              است. خلاصه مالی در «پرداخت‌ها ← مدارس».
            </AlertDescription>
          </Alert>
        )}
        <EnrollmentRegistrationFields
          billingMode={billingMode}
          onBillingModeChange={setBillingMode}
          planId={planId === "none" ? "" : planId}
          onPlanIdChange={(id) => setPlanId(id || "none")}
          plans={plans}
          enrollmentAmount={enrollmentAmount}
          onEnrollmentAmountChange={setEnrollmentAmount}
          accrualMonthMask={accrualMonthMask}
          onAccrualMonthMaskChange={setAccrualMonthMask}
          rolePayoutRows={rolePayoutRows}
          onRolePayoutRowsChange={setRolePayoutRows}
          roles={roles}
          users={users}
          advisorId={advisorId === "none" ? "" : advisorId}
          onAdvisorIdChange={(id) => setAdvisorId(id || "none")}
          advisorOptions={users}
          advisorCommKind={advisorCommKind}
          onAdvisorCommKindChange={setAdvisorCommKind}
          commPercent={commPercent}
          onCommPercentChange={setCommPercent}
          commFixed={commFixed}
          onCommFixedChange={setCommFixed}
        />
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
              home_address: homeAddress.trim() || undefined,
              registration_channel: registrationChannel,
              status,
              advisor_id: advisorId === "none" ? null : Number(advisorId),
            };
            if (registrationChannel === "SCHOOL") {
              payload.school_contract_id = Number(schoolContractId);
            } else {
              payload.school_name = schoolName.trim() || undefined;
              payload.school_address = schoolAddress.trim() || undefined;
              payload.delivery_mode = deliveryMode;
            }
            payload.current_plan_id = planId === "none" ? null : Number(planId);
            payload.enrollment_amount_cents = enrollAmountTomans > 0 ? enrollAmountTomans * 10 : 0;
            appendAdvisorCommissionFields(payload, {
              advisorSelected,
              billingMode,
              kind: advisorCommKind,
              commPercent,
              commFixed,
              accrualMonthMask,
            });
            payload.role_payouts = buildRolePayoutPayload(rolePayoutRows);
            if (advTrim && advGregorian) {
              payload.advisory_start_date = advGregorian;
            } else if (student.advisory_start_date) {
              payload.advisory_start_date = "";
            }
            mutation.mutate(
              { id: student.id, payload },
              {
                onSuccess: (updated) => {
                  if (updated.warnings?.length) {
                    toast({
                      title: "ذخیره شد — هشدار مالی مدرسه",
                      description: updated.warnings.join(" "),
                    });
                  }
                  onSuccess();
                },
              },
            );
          }}
          disabled={
            mutation.isPending ||
            !firstName.trim() ||
            !lastName.trim() ||
            commissionInvalid ||
            rolePayoutInvalid ||
            (isSchoolChannel && !schoolContractId)
          }
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

function downloadCsvBlob(filename: string, rows: string[][]): void {
  const BOM = "\uFEFF";
  const csv = BOM + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const Students = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  // مقدار جستجو با تأخیر، تا هر حرف یک درخواست به سرور نفرستد
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "deleted">("all");
  const [advisorFilter, setAdvisorFilter] = useState<string>("all");
  const [billingFilter, setBillingFilter] = useState<string>("all");
  const [schoolFilter, setSchoolFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [debtOnly, setDebtOnly] = useState(false);
  const [sortBy, setSortBy] = useState<StudentSort>("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateSchoolOpen, setIsCreateSchoolOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [detailsStudentId, setDetailsStudentId] = useState<number | null>(null);
  const [editStudentId, setEditStudentId] = useState<number | null>(null);
  const [deleteStudent, setDeleteStudent] = useState<StudentRow | null>(null);
  const [purgeStudent, setPurgeStudent] = useState<StudentRow | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [motherName, setMotherName] = useState("");
  const [advisorId, setAdvisorId] = useState("");
  const [planId, setPlanId] = useState("");
  const [enrollmentAmount, setEnrollmentAmount] = useState("");
  const [fatherPhone, setFatherPhone] = useState("");
  const [motherPhone, setMotherPhone] = useState("");
  const [fatherJob, setFatherJob] = useState("");
  const [motherJob, setMotherJob] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [schoolAddress, setSchoolAddress] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [advisorCommKind, setAdvisorCommKind] = useState<AdvisorCommissionKind>("NONE");
  const [billingMode, setBillingMode] = useState<EnrollmentBillingMode>("MONTHLY");
  const [accrualMonthMask, setAccrualMonthMask] = useState(() => defaultAccrualMonthMask(10));
  const [commPercent, setCommPercent] = useState("");
  const [commFixed, setCommFixed] = useState("");
  const [rolePayoutRows, setRolePayoutRows] = useState<RolePayoutFormRow[]>([]);
  const [createAdvisoryStartDate, setCreateAdvisoryStartDate] = useState(todayJalaliDate);
  const [listTab, setListTab] = useState<"private" | "schools">("private");
  const [registrationChannel, setRegistrationChannel] = useState<RegistrationChannel>("PRIVATE");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("IN_PERSON");
  const [createSchoolContractId, setCreateSchoolContractId] = useState("");
  const [contractSchoolName, setContractSchoolName] = useState("");
  const [contractStudentCount, setContractStudentCount] = useState("");
  const [contractTotalAmount, setContractTotalAmount] = useState("");
  const [contractNotes, setContractNotes] = useState("");
  const [createError, setCreateError] = useState("");
  const [createSchoolError, setCreateSchoolError] = useState("");

  const queryClient = useQueryClient();

  useEffect(() => {
    if (isCreateOpen) {
      setCreateAdvisoryStartDate(todayJalaliDate());
      setRolePayoutRows([]);
      setBillingMode("MONTHLY");
      setAccrualMonthMask(defaultAccrualMonthMask(10));
      setDeliveryMode("IN_PERSON");
      setCreateError("");
      if (!createSchoolContractId) {
        setRegistrationChannel("PRIVATE");
      }
    }
  }, [isCreateOpen, createSchoolContractId]);

  useEffect(() => {
    if (isCreateSchoolOpen) {
      setContractSchoolName("");
      setContractStudentCount("");
      setContractTotalAmount("");
      setContractNotes("");
      setCreateSchoolError("");
    }
  }, [isCreateSchoolOpen]);

  const contractCountNum = parseLocalizedInt(contractStudentCount);
  const contractTotalTomans = parseLocalizedInt(contractTotalAmount);

  const { data: activeSchoolContracts = [] } = useQuery({
    queryKey: ["school-contracts", "all-active"],
    queryFn: () => listAllSchoolContracts({ status: "ACTIVE" }),
    enabled: isCreateOpen && registrationChannel === "SCHOOL",
  });

  const { data: schoolPeersForWarning } = useQuery({
    queryKey: ["students", "school-enroll-sum", createSchoolContractId],
    queryFn: () =>
      listStudents({
        school_contract_id: Number(createSchoolContractId),
        registration_channel: "SCHOOL",
        page: 1,
        page_size: 200,
      }),
    enabled:
      isCreateOpen &&
      registrationChannel === "SCHOOL" &&
      !!createSchoolContractId &&
      Number(createSchoolContractId) > 0,
  });

  const selectedCreateSchoolContract = activeSchoolContracts.find(
    (c) => String(c.id) === createSchoolContractId,
  );
  const schoolPeersEnrollmentSumCents = (schoolPeersForWarning?.data ?? []).reduce(
    (sum, st) => sum + (st.enrollment_amount_cents ?? 0),
    0,
  );
  const createEnrollmentCentsPreview = parseLocalizedInt(enrollmentAmount) * 10;
  const schoolEnrollmentMismatch =
    registrationChannel === "SCHOOL" &&
    !!selectedCreateSchoolContract &&
    selectedCreateSchoolContract.total_amount_cents > 0 &&
    schoolPeersEnrollmentSumCents + createEnrollmentCentsPreview !==
      selectedCreateSchoolContract.total_amount_cents;

  const createSchoolMutation = useMutation({
    mutationFn: createSchoolContract,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-contracts"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      setIsCreateSchoolOpen(false);
      setListTab("schools");
      setContractSchoolName("");
      setContractStudentCount("");
      setContractTotalAmount("");
      setContractNotes("");
      setCreateSchoolError("");
    },
    onError: (e: Error) => setCreateSchoolError(e.message),
  });

  const openCreateStudent = (opts?: {
    channel?: RegistrationChannel;
    schoolContractId?: number;
  }) => {
    setRegistrationChannel(opts?.channel ?? "PRIVATE");
    setCreateSchoolContractId(
      opts?.schoolContractId != null ? String(opts.schoolContractId) : "",
    );
    setIsCreateOpen(true);
  };

  const openCreateStudentForSchool = (contract: SchoolContractApi) => {
    openCreateStudent({ channel: "SCHOOL", schoolContractId: contract.id });
  };

  const createCommissionInvalid = isAdvisorCommissionInvalid(
    !!advisorId,
    billingMode,
    advisorCommKind,
    commPercent,
    commFixed,
    accrualMonthMask,
    enrollmentAmount,
  );

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
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["students-summary"] });
      queryClient.invalidateQueries({ queryKey: ["student-schools"] });
      queryClient.invalidateQueries({ queryKey: ["student", id] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      setEditStudentId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStudentApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["students-summary"] });
      queryClient.invalidateQueries({ queryKey: ["student-schools"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setDeleteStudent(null);
    },
  });

  const purgeMutation = useMutation({
    mutationFn: purgeStudentApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["students-summary"] });
      queryClient.invalidateQueries({ queryKey: ["student-schools"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payments-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      setPurgeStudent(null);
    },
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const statusParam: StudentStatusFilter | undefined =
    statusFilter === "all"
      ? undefined
      : statusFilter === "active"
        ? "ACTIVE"
        : statusFilter === "inactive"
          ? "INACTIVE"
          : "DELETED";

  const listParams = {
    search: debouncedSearch || undefined,
    status: statusParam,
    advisor_id: advisorFilter === "all" ? undefined : Number(advisorFilter),
    billing_mode:
      billingFilter === "all" ? undefined : (billingFilter as EnrollmentBillingMode),
    school_name: schoolFilter === "all" ? undefined : schoolFilter,
    registration_channel: "PRIVATE" as const,
    plan_id: planFilter === "all" ? undefined : Number(planFilter),
    has_debt: debtOnly || undefined,
    sort: sortBy,
  };

  const activeFilterCount =
    (advisorFilter !== "all" ? 1 : 0) +
    (billingFilter !== "all" ? 1 : 0) +
    (schoolFilter !== "all" ? 1 : 0) +
    (planFilter !== "all" ? 1 : 0) +
    (debtOnly ? 1 : 0);

  const resetFilters = () => {
    setAdvisorFilter("all");
    setBillingFilter("all");
    setSchoolFilter("all");
    setPlanFilter("all");
    setDebtOnly(false);
    setSortBy("newest");
  };

  // هر بار فیلتر/جستجو عوض شد، به صفحه اول برگرد
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, advisorFilter, billingFilter, schoolFilter, planFilter, debtOnly, sortBy, pageSize]);

  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
  } = useQuery({
    queryKey: ["students", { ...listParams, page, pageSize }],
    queryFn: () => listStudents({ ...listParams, page, page_size: pageSize }),
    placeholderData: (prev) => prev,
    enabled: listTab === "private",
  });

  const { data: schoolNames = [] } = useQuery({
    queryKey: ["student-schools"],
    queryFn: listStudentSchools,
  });

  const {
    data: summary,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
  } = useQuery({
    queryKey: ["students-summary"],
    queryFn: getStudentsSummary,
  });

  // همه کاربران فعال — برای سهم نقش‌ها؛ مشاوران جداگانه فقط نقش مشاور.
  const { data: usersData } = useQuery({
    queryKey: ["users", "student-role-payouts"],
    queryFn: () => listAllUsers({ status: "active" }),
  });
  const users = usersData ?? [];
  const { data: advisorsData } = useQuery({
    queryKey: ["users", "advisors"],
    queryFn: listAdvisors,
  });
  const advisors = advisorsData ?? [];
  const { data: roles = [] } = useQuery({
    queryKey: ["roles", "student-role-payouts"],
    queryFn: listRoles,
  });

  useEffect(() => {
    if (billingMode !== "SCHOOL_ENROLLMENT" || !advisorId) return;
    setAccrualMonthMask(defaultAccrualMonthMask(advisorPayrollMonths(advisorId, users, roles)));
  }, [advisorId, billingMode, users, roles]);

  const { data: plans } = useQuery({
    queryKey: ["plans-active"],
    queryFn: listActivePlans,
  });

  const handleExportStudents = async () => {
    setIsExporting(true);
    try {
      // همه صفحات با همان فیلترهای فعلی
      const allStudents = await listAllStudents(listParams);
      const header = ["شناسه", "نام", "نام خانوادگی", "موبایل", "ایمیل", "مشاور", "پلن", "وضعیت", "مانده ماه", "مانده کل", "مبلغ ثبت‌نامی (تومان)", "تاریخ شروع مشاوره"];
      const rows = allStudents.map((s) => {
        const remain =
          s.total_remaining_cents ?? (s.remaining_balance_cents !== undefined ? s.remaining_balance_cents : s.balance_cents ?? 0);
        const monthRemain = s.month_remaining_cents ?? remain;
        const enc = s.enrollment_amount_cents ?? 0;
        return [
        String(s.id),
        s.first_name ?? "",
        s.last_name ?? "",
        s.phone ?? "",
        s.email ?? "",
        s.advisor_name ?? "",
        s.current_plan_name ?? "",
        s.status === "ACTIVE" ? "فعال" : s.status === "INACTIVE" ? "غیرفعال" : "حذف‌شده",
        studentBalanceExportText(monthRemain, enc),
        studentBalanceExportText(remain, enc),
        String(Math.round(enc / 10)),
        s.advisory_start_date ? gregorianIsoToJalali(s.advisory_start_date) : "",
      ];
      });
      downloadCsvBlob(`students_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
    } finally {
      setIsExporting(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: createStudent,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["students-summary"] });
      queryClient.invalidateQueries({ queryKey: ["student-schools"] });
      queryClient.invalidateQueries({ queryKey: ["school-contracts"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      if (created.warnings?.length) {
        toast({
          title: "ثبت شد — هشدار مالی مدرسه",
          description: created.warnings.join(" "),
        });
      }
      setIsCreateOpen(false);
      setCreateSchoolContractId("");
      if (created.registration_channel === "SCHOOL") {
        setListTab("schools");
      }
      setRegistrationChannel("PRIVATE");
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setFatherName("");
      setMotherName("");
      setAdvisorId("");
      setPlanId("");
      setEnrollmentAmount("");
      setFatherPhone("");
      setMotherPhone("");
      setFatherJob("");
      setMotherJob("");
      setSchoolName("");
      setSchoolAddress("");
      setHomeAddress("");
      setAdvisorCommKind("NONE");
      setBillingMode("MONTHLY");
      setAccrualMonthMask(defaultAccrualMonthMask(10));
      setCommPercent("");
      setCommFixed("");
      setRolePayoutRows([]);
      setCreateAdvisoryStartDate(todayJalaliDate());
    },
  });

  // فیلتر و صفحه‌بندی سمت سرور انجام می‌شود؛ اینجا فقط نگاشت به ردیف جدول.
  const students: StudentRow[] = (data?.data || []).map(mapStudent);
  const totalItems = data?.meta?.total_items ?? 0;
  const totalPages = Math.max(1, data?.meta?.total_pages ?? 1);
  const rangeFrom = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeTo = Math.min(page * pageSize, totalItems);

  return (
    <MainLayout title="دانش‌آموزان" subtitle="مدیریت پروفایل، قرارداد مدارس و اطلاعات مالی">
      <div className="mb-4 flex rounded-lg border p-1 w-fit">
        <Button
          variant={listTab === "private" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setListTab("private")}
        >
          دانش‌آموزان خصوصی
        </Button>
        <Button
          variant={listTab === "schools" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setListTab("schools")}
        >
          مدارس
        </Button>
      </div>

      {/* Header actions */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={listTab === "schools" ? "جستجوی مدرسه..." : "جستجوی دانش‌آموز..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9"
          />
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {listTab === "private" && (
          <>
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
          <Popover>
            <PopoverTrigger asChild>
              <Button variant={activeFilterCount > 0 ? "secondary" : "outline"} size="sm" className="flex-1 sm:flex-none">
                <Filter className="ml-2 h-4 w-4" />
                فیلتر
                {activeFilterCount > 0 && (
                  <span className="mr-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[320px] space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">مشاور</label>
                <Select value={advisorFilter} onValueChange={setAdvisorFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="همه مشاوران" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="all">همه مشاوران</SelectItem>
                    {advisors.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.first_name} {u.last_name}
                        {u.role_name ? ` — ${u.role_name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">نوع پرداخت</label>
                <Select value={billingFilter} onValueChange={setBillingFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="همه" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه</SelectItem>
                    <SelectItem value="SCHOOL_ENROLLMENT">سالانه — قرارداد با اقساط</SelectItem>
                    <SelectItem value="MONTHLY">ماهانه</SelectItem>
                    <SelectItem value="SINGLE_SESSION">تک‌جلسه‌ای</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">مدرسه</label>
                <Select value={schoolFilter} onValueChange={setSchoolFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="همه مدارس" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="all">همه مدارس</SelectItem>
                    {schoolNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">پلن</label>
                <Select value={planFilter} onValueChange={setPlanFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="همه پلن‌ها" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="all">همه پلن‌ها</SelectItem>
                    {(plans ?? []).map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">مرتب‌سازی</label>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as StudentSort)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">جدیدترین</SelectItem>
                    <SelectItem value="oldest">قدیمی‌ترین</SelectItem>
                    <SelectItem value="name">نام (الف تا ی)</SelectItem>
                    <SelectItem value="name_desc">نام (ی تا الف)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-2 text-xs">
                <Checkbox checked={debtOnly} onCheckedChange={(v) => setDebtOnly(v === true)} />
                <span>فقط بدهکاران</span>
              </label>

              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={resetFilters}
                disabled={activeFilterCount === 0 && sortBy === "newest"}
              >
                پاک کردن فیلترها
              </Button>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={handleExportStudents}
            disabled={isExporting}
          >
            <Download className="ml-2 h-4 w-4" />
            {isExporting ? "در حال دانلود..." : "خروجی اکسل"}
          </Button>
          </>
          )}
          {listTab === "private" ? (
            <Button size="sm" className="flex-1 sm:flex-none" onClick={() => openCreateStudent()}>
              <Plus className="ml-2 h-4 w-4" />
              افزودن دانش‌آموز
            </Button>
          ) : (
            <Button
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => setIsCreateSchoolOpen(true)}
            >
              <Plus className="ml-2 h-4 w-4" />
              افزودن مدرسه
            </Button>
          )}
        </div>
      </div>

      {listTab === "schools" && (
        <SchoolContractsSection
          search={debouncedSearch}
          onAddStudentForSchool={openCreateStudentForSchool}
          onOpenStudent={(st) => setDetailsStudentId(st.id)}
        />
      )}

      {/* Stats */}
      {listTab === "private" && <div className="mb-6 grid gap-4 sm:grid-cols-5">
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
      </div>}

      {/* Students grid/list */}
      {listTab === "private" && isLoading && (
        <div className="card-elevated p-6 text-sm text-muted-foreground">
          در حال بارگذاری لیست دانش‌آموزان...
        </div>
      )}
      {listTab === "private" && isError && (
        <div className="card-elevated p-6 text-sm text-destructive">
          {(error as Error)?.message || "خطا در دریافت لیست دانش‌آموزان"}
        </div>
      )}
      {listTab === "private" && !isLoading && !isError && students.length === 0 && (
        <div className="card-elevated p-6 text-sm text-muted-foreground">
          {debouncedSearch || activeFilterCount > 0 || statusFilter !== "all"
            ? "دانش‌آموزی با این جستجو/فیلتر پیدا نشد."
            : "هیچ دانش‌آموزی ثبت نشده است."}
        </div>
      )}
      {listTab === "private" && !isLoading && !isError && students.length > 0 && (viewMode === "grid" ? (
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
              <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">مانده ماه</span>
                  <StudentBalanceCell
                    remainingCents={student.monthRemainingCents}
                    enrollmentCents={student.enrollmentCents}
                    align="start"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">مانده کل</span>
                  <StudentBalanceCell
                    remainingCents={student.remainingCents}
                    enrollmentCents={student.enrollmentCents}
                    align="start"
                  />
                </div>
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
                  <th
                    className="p-4 text-right text-xs font-semibold text-muted-foreground"
                    title="شهریه/اقساطی که از تاریخ ثبت‌نام تا پایان ماه جاری باید پرداخت می‌شد، منهای پرداخت‌شده"
                  >
                    مانده ماه
                  </th>
                  <th
                    className="p-4 text-right text-xs font-semibold text-muted-foreground"
                    title="کل مبلغ قرارداد منهای پرداخت‌شده (ماهانه: شهریه ماه‌های گذشته تا امروز منهای پرداخت‌شده)"
                  >
                    مانده کل
                  </th>
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
                    <td className="p-4 text-left">
                      <StudentBalanceCell
                        remainingCents={student.monthRemainingCents}
                        enrollmentCents={student.enrollmentCents}
                        align="end"
                      />
                    </td>
                    <td className="p-4 text-left">
                      <StudentBalanceCell
                        remainingCents={student.remainingCents}
                        enrollmentCents={student.enrollmentCents}
                        align="end"
                      />
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
                        {studentNeedsSoftDeleteFirst(student) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteStudent(student)}
                            title="خروج از چرخه — سوابق پرداخت حفظ می‌شود"
                          >
                            <Trash2 className="h-4 w-4" />
                            حذف
                          </Button>
                        )}
                        {studentCanHardDelete(student) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setPurgeStudent(student)}
                            title="حذف کامل از سیستم همراه با پرداخت‌ها"
                          >
                            <Trash2 className="h-4 w-4" />
                            حذف کامل
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {listTab === "private" && !isError && totalItems > 0 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            نمایش {rangeFrom.toLocaleString("fa-IR")} تا {rangeTo.toLocaleString("fa-IR")} از{" "}
            {totalItems.toLocaleString("fa-IR")} دانش‌آموز
            {isFetching && " — در حال بروزرسانی..."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">۲۵ در هر صفحه</SelectItem>
                <SelectItem value="50">۵۰ در هر صفحه</SelectItem>
                <SelectItem value="100">۱۰۰ در هر صفحه</SelectItem>
                <SelectItem value="200">۲۰۰ در هر صفحه</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(1)}
              disabled={page <= 1}
            >
              اول
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              قبلی
            </Button>
            <span className="text-sm text-muted-foreground">
              صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              بعدی
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
            >
              آخر
            </Button>
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
              <p>
                <span className="text-muted-foreground">نوع ثبت‌نام:</span>{" "}
                {detailsStudentData.registration_channel === "SCHOOL" ? "مدرسه‌ای" : "خصوصی"}
              </p>
              {detailsStudentData.registration_channel === "SCHOOL" ? (
                <p>
                  <span className="text-muted-foreground">مدرسه:</span>{" "}
                  {detailsStudentData.school_contract_name || detailsStudentData.school_name || "—"}
                </p>
              ) : (
                <>
                  <p><span className="text-muted-foreground">اسم مدرسه:</span> {detailsStudentData.school_name || "—"}</p>
                  <p><span className="text-muted-foreground">آدرس مدرسه:</span> {detailsStudentData.school_address || "—"}</p>
                </>
              )}
              <p><span className="text-muted-foreground">آدرس خانه:</span> {detailsStudentData.home_address || "—"}</p>
              <p>
                <span className="text-muted-foreground">تاریخ شروع مشاوره:</span>{" "}
                {detailsStudentData.advisory_start_date
                  ? gregorianIsoToJalali(detailsStudentData.advisory_start_date) || detailsStudentData.advisory_start_date
                  : "—"}
              </p>
              {detailsStudentData.registration_channel !== "SCHOOL" && (
              <p>
                <span className="text-muted-foreground">نحوه برگزاری:</span>{" "}
                {detailsStudentData.delivery_mode === "ONLINE"
                  ? "آنلاین"
                  : detailsStudentData.delivery_mode === "IN_PERSON"
                    ? "حضوری"
                    : "—"}
              </p>
              )}
              <p>
                <span className="text-muted-foreground">نوع پرداخت:</span>{" "}
                {billingModeLabel(parseBillingMode(detailsStudentData.enrollment_billing_mode))}
              </p>
              {detailsStudentData.registration_channel === "SCHOOL" && (
                <p className="text-xs text-muted-foreground">
                  خلاصه مالی مدرسه در «پرداخت‌ها ← مدارس»؛ تراکنش‌ها روی همین دانش‌آموز ثبت می‌شوند.
                </p>
              )}
              {detailsStudentData.enrollment_billing_mode === "SCHOOL_ENROLLMENT" && (
                <p>
                  <span className="text-muted-foreground">ماه‌های حقوق:</span>{" "}
                  {(() => {
                    const mask =
                      detailsStudentData.advisor_accrual_month_mask &&
                      detailsStudentData.advisor_accrual_month_mask > 0
                        ? detailsStudentData.advisor_accrual_month_mask
                        : defaultAccrualMonthMask(detailsStudentData.advisor_accrual_months ?? 10);
                    const names = monthsFromMask(mask).map((jm) => JALALI_MONTH_NAMES[jm - 1]);
                    return names.length > 0
                      ? `${names.join("، ")} (${names.length} ماه)`
                      : `${detailsStudentData.advisor_accrual_months ?? 10} ماه (پیش‌فرض)`;
                  })()}
                </p>
              )}
              <p><span className="text-muted-foreground">مشاور:</span> {detailsStudentData.advisor_name || "—"}</p>
              {detailsStudentData.advisor_id != null && (
                <p>
                  <span className="text-muted-foreground">
                    {detailsStudentData.enrollment_billing_mode === "SCHOOL_ENROLLMENT"
                      ? "سهم ماهانه مشاور:"
                      : detailsStudentData.enrollment_billing_mode === "SINGLE_SESSION"
                        ? "سهم مشاور (پرداخت تک‌جلسه‌ای):"
                        : "سهم مشاور (هر پرداخت):"}
                  </span>{" "}
                  {detailsStudentData.enrollment_billing_mode === "SCHOOL_ENROLLMENT" ? (
                    detailsStudentData.advisor_commission_kind === "PERCENT_OF_CONTRACT" &&
                    detailsStudentData.advisor_commission_percent != null
                      ? `${detailsStudentData.advisor_commission_percent}٪ از قرارداد → ${Math.round((detailsStudentData.advisor_monthly_accrual_cents ?? 0) / 10).toLocaleString("fa-IR")} تومان/ماه`
                      : detailsStudentData.advisor_commission_kind === "FIXED_MONTHLY" &&
                          detailsStudentData.advisor_commission_fixed_cents != null
                        ? `${formatBalance(detailsStudentData.advisor_commission_fixed_cents)} تومان در ماه`
                        : "بدون سهم"
                  ) : detailsStudentData.advisor_commission_kind === "PERCENT" &&
                    detailsStudentData.advisor_commission_percent != null ? (
                    `${detailsStudentData.advisor_commission_percent}٪ از مبلغ`
                  ) : detailsStudentData.advisor_commission_kind === "FIXED_PER_PAYMENT" &&
                    detailsStudentData.advisor_commission_fixed_cents != null ? (
                    `${formatBalance(detailsStudentData.advisor_commission_fixed_cents)} تومان ثابت`
                  ) : (
                    "بدون سهم"
                  )}
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
                          ? `${rp.percent ?? 0}٪ از مبلغ هر پرداخت`
                          : `${formatBalance(rp.fixed_cents)} تومان به ازای هر پرداخت پرداخت‌شده`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p><span className="text-muted-foreground">پلن:</span> {detailsStudentData.current_plan_name || "—"}</p>
              {(detailsStudentData.paid_total_cents ?? 0) > 0 &&
                (detailsStudentData.enrollment_amount_cents ?? 0) === 0 && (
                  <Alert
                    className="border-amber-500/40 bg-amber-50/90 text-amber-950 dark:border-amber-600/40 dark:bg-amber-950/25 dark:text-amber-50"
                    dir="rtl"
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <AlertTitle className="text-sm">مبلغ ثبت‌نامی ثبت نشده است</AlertTitle>
                    <AlertDescription className="text-xs text-amber-900/90 dark:text-amber-100/90">
                      پرداخت ثبت‌شده وجود دارد اما مبلغ ثبت‌نامی خالی است؛ از ویرایش دانش‌آموز مبلغ را وارد کنید.
                    </AlertDescription>
                  </Alert>
                )}
              {detailsStudentData.enrollment_amount_cents != null && detailsStudentData.enrollment_amount_cents > 0 && (
                <p>
                  <span className="text-muted-foreground">مبلغ ثبت‌نامی:</span>{" "}
                  {Math.round(detailsStudentData.enrollment_amount_cents / 10).toLocaleString("fa-IR")} تومان
                </p>
              )}
              {(detailsStudentData.enrollment_amount_cents ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground">
                  {detailsStudentData.enrollment_billing_mode === "SCHOOL_ENROLLMENT"
                    ? `قرارداد سالانه در ${(detailsStudentData.schedule_months ?? 0).toLocaleString("fa-IR")} قسط`
                    : detailsStudentData.enrollment_billing_mode === "SINGLE_SESSION"
                      ? "تک‌جلسه‌ای"
                      : `شهریه ماهانه · ${(detailsStudentData.months_elapsed ?? 0).toLocaleString("fa-IR")} ماه از تاریخ ثبت‌نام`}
                  {" · "}تا پایان این ماه باید{" "}
                  {Math.round((detailsStudentData.due_to_date_cents ?? 0) / 10).toLocaleString("fa-IR")} تومان پرداخت شده باشد
                  {" · "}پرداخت‌شده {Math.round((detailsStudentData.paid_total_cents ?? 0) / 10).toLocaleString("fa-IR")} تومان
                </p>
              )}
              <div className="flex flex-wrap items-start gap-2">
                <span className="text-muted-foreground shrink-0">مانده ماه:</span>
                <StudentBalanceCell
                  remainingCents={
                    detailsStudentData.month_remaining_cents ??
                    detailsStudentData.remaining_balance_cents ??
                    detailsStudentData.balance_cents ??
                    0
                  }
                  enrollmentCents={detailsStudentData.enrollment_amount_cents ?? 0}
                  align="start"
                />
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <span className="text-muted-foreground shrink-0">مانده کل:</span>
                <StudentBalanceCell
                  remainingCents={
                    detailsStudentData.total_remaining_cents ??
                    detailsStudentData.remaining_balance_cents ??
                    detailsStudentData.balance_cents ??
                    0
                  }
                  enrollmentCents={detailsStudentData.enrollment_amount_cents ?? 0}
                  align="start"
                />
              </div>
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
              advisors={advisors}
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

      {/* Soft delete confirm — keeps payment history */}
      <AlertDialog open={deleteStudent != null} onOpenChange={(open) => !open && setDeleteStudent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>خروج از چرخه (حذف‌شده)</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                دانش‌آموز «{deleteStudent?.name}» به وضعیت «حذف‌شده» منتقل می‌شود و دیگر در چرخه فعال نیست.
              </span>
              <span className="block font-medium">
                پرداخت‌ها و سوابق مالی در لیست پرداخت‌ها و گزارش‌ها باقی می‌مانند — برای کسی که پول داده و دیگر نمی‌آید.
              </span>
              <span className="block text-muted-foreground text-sm">
                اگر رکورد تست است و باید از همه‌جا پاک شود، بعد از این مرحله «حذف کامل» را بزنید.
              </span>
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

      {/* Hard delete confirm */}
      <AlertDialog open={purgeStudent != null} onOpenChange={(open) => !open && setPurgeStudent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف کامل از سیستم</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                دانش‌آموز «{purgeStudent?.name}» و تمام پرداخت‌هایش (از جمله در لیست پرداخت‌ها) برای همیشه پاک می‌شوند.
              </span>
              <span className="block text-destructive font-medium">
                این عمل غیرقابل بازگشت است — فقط برای ثبت اشتباه، تست، یا رکوردی که اصلاً نباید در نرم‌افزار بماند.
              </span>
              {purgeStudent && purgeStudent.paidTotalCents > 0 && (
                <span className="block text-sm">
                  این دانش‌آموز{" "}
                  {Math.round(purgeStudent.paidTotalCents / 10).toLocaleString("fa-IR")} تومان پرداخت ثبت‌شده دارد که
                  همراه با رکورد دانش‌آموز حذف می‌شود.
                </span>
              )}
              {purgeMutation.isError && (
                <span className="block text-destructive text-sm">
                  {(purgeMutation.error as Error)?.message || "خطا در حذف کامل"}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purgeMutation.isPending}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={purgeMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (purgeStudent) purgeMutation.mutate(purgeStudent.id);
              }}
            >
              {purgeMutation.isPending ? "در حال حذف..." : "حذف کامل و غیرقابل بازگشت"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create student dialog */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) {
            setCreateSchoolContractId("");
            setRegistrationChannel("PRIVATE");
          }
        }}
      >
        <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>افزودن دانش‌آموز</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">نوع ثبت‌نام</label>
              <Select
                value={registrationChannel}
                onValueChange={(v) => {
                  const ch = v as RegistrationChannel;
                  setRegistrationChannel(ch);
                  if (ch === "PRIVATE") setCreateSchoolContractId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIVATE">خصوصی</SelectItem>
                  <SelectItem value="SCHOOL">مدرسه‌ای</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
                <JalaliDatePicker
                  value={createAdvisoryStartDate}
                  onChange={setCreateAdvisoryStartDate}
                  placeholder="انتخاب تاریخ شروع مشاوره"
                  clearable={false}
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

              {registrationChannel === "SCHOOL" ? (
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">مدرسه</label>
                  <Select value={createSchoolContractId} onValueChange={setCreateSchoolContractId}>
                    <SelectTrigger>
                      <SelectValue placeholder="انتخاب مدرسه ثبت‌شده" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {activeSchoolContracts.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.school_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {activeSchoolContracts.length === 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      ابتدا از تب مدارس، یک مدرسه اضافه کنید.
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    مبلغ ثبت‌نام را پایین وارد کنید؛ پرداخت‌ها برای همین دانش‌آموز ثبت می‌شود.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">اسم مدرسه</label>
                    <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="نام مدرسه" />
                  </div>
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">آدرس مدرسه</label>
                    <Input value={schoolAddress} onChange={(e) => setSchoolAddress(e.target.value)} placeholder="آدرس مدرسه" />
                  </div>
                </>
              )}

              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">آدرس خانه</label>
                <Input value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} placeholder="آدرس منزل" />
              </div>

              {registrationChannel === "PRIVATE" && (
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">نحوه برگزاری</label>
                  <Select value={deliveryMode} onValueChange={(v) => setDeliveryMode(v as DeliveryMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IN_PERSON">حضوری</SelectItem>
                      <SelectItem value="ONLINE">آنلاین</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">اطلاعات ثبت‌نام</h3>
              <Separator className="mb-3" />
              {schoolEnrollmentMismatch && (
                <Alert
                  className="mb-3 border-amber-500/40 bg-amber-50/90 text-amber-950 dark:border-amber-600/40 dark:bg-amber-950/25 dark:text-amber-50"
                  dir="rtl"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertTitle className="text-sm">عدم تطابق با مبلغ قرارداد</AlertTitle>
                  <AlertDescription className="text-xs text-amber-900/90 dark:text-amber-100/90">
                    جمع مبالغ ثبت‌نامی دانش‌آموزان این مدرسه با مبلغ کل قرارداد برابر نیست. می‌توانید ذخیره کنید؛
                    فقط یک هشدار است.
                  </AlertDescription>
                </Alert>
              )}
              <EnrollmentRegistrationFields
                billingMode={billingMode}
                onBillingModeChange={setBillingMode}
                planId={planId}
                onPlanIdChange={setPlanId}
                plans={plans || []}
                enrollmentAmount={enrollmentAmount}
                onEnrollmentAmountChange={setEnrollmentAmount}
                accrualMonthMask={accrualMonthMask}
                onAccrualMonthMaskChange={setAccrualMonthMask}
                rolePayoutRows={rolePayoutRows}
                onRolePayoutRowsChange={setRolePayoutRows}
                roles={roles}
                users={users}
                advisorId={advisorId}
                onAdvisorIdChange={setAdvisorId}
                advisorOptions={users}
                advisorCommKind={advisorCommKind}
                onAdvisorCommKindChange={setAdvisorCommKind}
                commPercent={commPercent}
                onCommPercentChange={setCommPercent}
                commFixed={commFixed}
                onCommFixedChange={setCommFixed}
              />
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
                setCreateError("");
                const createRolePayoutInvalid = rolePayoutRows.some((r) =>
                  !r.roleId ||
                  !r.userId ||
                  (r.amountKind === "PERCENT" &&
                    (!r.percent.trim() || parseLocalizedFloat(r.percent) <= 0 || parseLocalizedFloat(r.percent) > 100)) ||
                  (r.amountKind === "FIXED_PER_PAYMENT" &&
                    (!r.fixedCents.trim() || parseLocalizedInt(r.fixedCents) < 0))
                );
                if (createCommissionInvalid || createRolePayoutInvalid) return;
                if (registrationChannel === "SCHOOL" && !createSchoolContractId) {
                  setCreateError("مدرسه را انتخاب کنید");
                  return;
                }
                const enrollAmountTomans = parseLocalizedInt(enrollmentAmount);
                const base: CreateStudentPayload = {
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
                  home_address: homeAddress.trim() || undefined,
                  registration_channel: registrationChannel,
                  advisory_start_date: (() => {
                    const g = jalaliToGregorianIso(createAdvisoryStartDate.trim());
                    return g || undefined;
                  })(),
                  advisor_id: advisorId ? Number(advisorId) : undefined,
                  role_payouts: buildRolePayoutPayload(rolePayoutRows),
                  current_plan_id: planId ? Number(planId) : undefined,
                  enrollment_amount_cents: enrollAmountTomans > 0 ? enrollAmountTomans * 10 : undefined,
                };
                if (registrationChannel === "SCHOOL") {
                  base.school_contract_id = Number(createSchoolContractId);
                } else {
                  base.school_name = schoolName.trim() || undefined;
                  base.school_address = schoolAddress.trim() || undefined;
                  base.delivery_mode = deliveryMode;
                }
                appendAdvisorCommissionFields(base, {
                  advisorSelected: !!advisorId,
                  billingMode,
                  kind: advisorCommKind,
                  commPercent,
                  commFixed,
                  accrualMonthMask,
                });
                createMutation.mutate(base);
              }}
              disabled={
                createMutation.isPending ||
                !firstName.trim() ||
                !lastName.trim() ||
                createCommissionInvalid ||
                (registrationChannel === "SCHOOL" && !createSchoolContractId) ||
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
          {(createMutation.isError || createError) && (
            <p className="pt-2 text-xs text-destructive">
              {createError ||
                (createMutation.error as Error)?.message ||
                "ثبت با خطا مواجه شد"}
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Create school dialog */}
      <Dialog open={isCreateSchoolOpen} onOpenChange={setIsCreateSchoolOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>افزودن مدرسه</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">نام مدرسه</label>
              <Input
                value={contractSchoolName}
                onChange={(e) => setContractSchoolName(e.target.value)}
                placeholder="مثلاً شهید بهشتی"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">تعداد دانش‌آموز</label>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  value={contractStudentCount}
                  onChange={(e) => setContractStudentCount(formatGroupedFaIntInput(e.target.value))}
                  placeholder="مثلاً ۱۰"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  مبلغ کل قرارداد (تومان)
                </label>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  value={contractTotalAmount}
                  onChange={(e) => setContractTotalAmount(formatGroupedFaIntInput(e.target.value))}
                  placeholder="مثلاً ۱۰۰,۰۰۰,۰۰۰"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">توضیحات</label>
              <Input
                value={contractNotes}
                onChange={(e) => setContractNotes(e.target.value)}
                placeholder="اختیاری"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateSchoolOpen(false)}
              disabled={createSchoolMutation.isPending}
            >
              انصراف
            </Button>
            <Button
              disabled={
                createSchoolMutation.isPending ||
                !contractSchoolName.trim() ||
                contractCountNum <= 0 ||
                contractTotalTomans <= 0
              }
              onClick={() => {
                setCreateSchoolError("");
                createSchoolMutation.mutate({
                  school_name: contractSchoolName.trim(),
                  student_count: contractCountNum,
                  total_amount_cents: contractTotalTomans * 10,
                  notes: contractNotes.trim() || undefined,
                });
              }}
            >
              {createSchoolMutation.isPending ? "در حال ثبت..." : "ثبت مدرسه"}
            </Button>
          </DialogFooter>
          {(createSchoolMutation.isError || createSchoolError) && (
            <p className="pt-2 text-xs text-destructive">
              {createSchoolError ||
                (createSchoolMutation.error as Error)?.message ||
                "ثبت مدرسه با خطا مواجه شد"}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Students;

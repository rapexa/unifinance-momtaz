import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCompensationRule,
  deleteCompensationRule,
  listCompensationRules,
  replaceCompensationRuleStudents,
  updateCompensationRule,
  type CompensationRuleApi,
  type UpsertCompensationRulePayload,
} from "@/api/compensationRulesApi";
import { listRoles } from "@/api/rolesApi";
import { listUsers } from "@/api/usersApi";
import { listStudents } from "@/api/studentsApi";
import { parseLocalizedFloat, parseLocalizedInt } from "@/lib/numberInput";

const defaultPayload: UpsertCompensationRulePayload = {
  name: "",
  is_active: true,
  priority: 100,
  target_kind: "ROLE",
  amount_kind: "FIXED",
  scope_kind: "ALL_STUDENTS",
  payment_type: "ALL",
};

export default function CompensationRules() {
  const queryClient = useQueryClient();
  const [payload, setPayload] = useState<UpsertCompensationRulePayload>(defaultPayload);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["compensation-rules"],
    queryFn: listCompensationRules,
  });
  const { data: roles } = useQuery({ queryKey: ["roles-lite"], queryFn: listRoles });
  const { data: usersData } = useQuery({
    queryKey: ["users-lite"],
    queryFn: () => listUsers({ page: 1, page_size: 200, status: "active" }),
  });
  const { data: studentsData } = useQuery({
    queryKey: ["students-lite", studentSearch],
    queryFn: () => listStudents({ page: 1, page_size: 100, search: studentSearch || undefined }),
  });
  const users = usersData?.data ?? [];
  const students = studentsData?.data ?? [];

  const isSelectedScope = payload.scope_kind === "SELECTED_STUDENTS";
  const isCapacityScope = payload.scope_kind === "CAPACITY";
  const isRoleTarget = payload.target_kind === "ROLE";
  const isUserTarget = payload.target_kind === "USER";
  const isFixedAmount = payload.amount_kind === "FIXED";

  const createMutation = useMutation({
    mutationFn: createCompensationRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compensation-rules"] });
      setPayload(defaultPayload);
      setSelectedStudentIds([]);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpsertCompensationRulePayload }) =>
      updateCompensationRule(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compensation-rules"] });
      setPayload(defaultPayload);
      setEditingId(null);
      setSelectedStudentIds([]);
    },
  });
  const updateStudentsMutation = useMutation({
    mutationFn: ({ id, studentIds }: { id: number; studentIds: number[] }) =>
      replaceCompensationRuleStudents(id, studentIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["compensation-rules"] }),
  });

  const removeMutation = useMutation({
    mutationFn: deleteCompensationRule,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["compensation-rules"] }),
  });

  const canSubmit = useMemo(() => {
    if (!payload.name.trim()) return false;
    if (isRoleTarget && !payload.role_id) return false;
    if (isUserTarget && !payload.user_id) return false;
    if (isFixedAmount && (!payload.fixed_cents || payload.fixed_cents <= 0)) return false;
    if (!isFixedAmount && (!payload.percent || payload.percent <= 0)) return false;
    if (isSelectedScope && selectedStudentIds.length === 0) return false;
    if (isCapacityScope && (!payload.capacity_limit || payload.capacity_limit <= 0)) return false;
    return true;
  }, [payload, isRoleTarget, isUserTarget, isFixedAmount, isSelectedScope, selectedStudentIds, isCapacityScope]);

  const resetForm = () => {
    setPayload(defaultPayload);
    setEditingId(null);
    setSelectedStudentIds([]);
    setStudentSearch("");
  };

  const handleEdit = (row: CompensationRuleApi) => {
    setEditingId(row.id);
    setPayload({
      name: row.name,
      is_active: row.is_active,
      priority: row.priority,
      target_kind: row.target_kind,
      amount_kind: row.amount_kind,
      scope_kind: row.scope_kind,
      payment_type: row.payment_type,
      role_id: row.role_id,
      user_id: row.user_id,
      fixed_cents: row.fixed_cents,
      percent: row.percent,
      capacity_limit: row.capacity_limit,
    });
    setSelectedStudentIds((row.students ?? []).map((s) => s.student_id));
  };

  const submit = async () => {
    if (!canSubmit) return;
    const body: UpsertCompensationRulePayload = {
      ...payload,
      role_id: isRoleTarget ? payload.role_id : undefined,
      user_id: isUserTarget ? payload.user_id : undefined,
      fixed_cents: isFixedAmount ? payload.fixed_cents : undefined,
      percent: isFixedAmount ? undefined : payload.percent,
      capacity_limit: isCapacityScope ? payload.capacity_limit : undefined,
    };
    if (editingId != null) {
      await updateMutation.mutateAsync({ id: editingId, body });
      if (body.scope_kind === "SELECTED_STUDENTS") {
        await updateStudentsMutation.mutateAsync({ id: editingId, studentIds: selectedStudentIds });
      }
      return;
    }
    const created = await createMutation.mutateAsync(body);
    if (body.scope_kind === "SELECTED_STUDENTS") {
      await updateStudentsMutation.mutateAsync({ id: created.id, studentIds: selectedStudentIds });
    }
  };

  const toggleStudent = (id: number) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <MainLayout title="قوانین تسهیم درآمد" subtitle="تعریف سهم نقش‌ها و کاربران برای پرداخت‌ها">
      <div className="mb-6 card-elevated p-4 grid gap-3 md:grid-cols-4">
        <Input
          placeholder="نام قانون"
          value={payload.name}
          onChange={(e) => setPayload((p) => ({ ...p, name: e.target.value }))}
        />
        <Input
          placeholder="اولویت"
          type="number"
          value={payload.priority}
          onChange={(e) => setPayload((p) => ({ ...p, priority: parseLocalizedInt(e.target.value || "100") || 100 }))}
        />
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={payload.target_kind}
          onChange={(e) => setPayload((p) => ({ ...p, target_kind: e.target.value as UpsertCompensationRulePayload["target_kind"] }))}
        >
          <option value="ADVISOR_CONTRACT">قرارداد مشاور دانش‌آموز</option>
          <option value="ROLE">نقش</option>
          <option value="USER">کاربر</option>
        </select>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={payload.amount_kind}
          onChange={(e) => setPayload((p) => ({ ...p, amount_kind: e.target.value as UpsertCompensationRulePayload["amount_kind"] }))}
        >
          <option value="FIXED">مبلغ ثابت</option>
          <option value="PERCENT">درصد</option>
        </select>
        <Input
          placeholder={isFixedAmount ? "مبلغ ثابت (ریال)" : "درصد"}
          type="number"
          value={isFixedAmount ? payload.fixed_cents ?? "" : payload.percent ?? ""}
          onChange={(e) =>
            setPayload((p) =>
              isFixedAmount
                ? { ...p, fixed_cents: parseLocalizedInt(e.target.value || "0") }
                : { ...p, percent: parseLocalizedFloat(e.target.value || "0") }
            )
          }
        />
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={payload.payment_type}
          onChange={(e) => setPayload((p) => ({ ...p, payment_type: e.target.value as UpsertCompensationRulePayload["payment_type"] }))}
        >
          <option value="ALL">همه پرداخت‌ها</option>
          <option value="SINGLE_SESSION">تک‌جلسه</option>
          <option value="MONTHLY">ماهانه</option>
          <option value="COURSE">دوره‌ای</option>
        </select>
        <select
          className="h-10 rounded-md border bg-background px-3 text-sm"
          value={payload.scope_kind}
          onChange={(e) => setPayload((p) => ({ ...p, scope_kind: e.target.value as UpsertCompensationRulePayload["scope_kind"] }))}
        >
          <option value="ALL_STUDENTS">همه دانش‌آموزها</option>
          <option value="SELECTED_STUDENTS">دانش‌آموزهای انتخابی</option>
          <option value="CAPACITY">سقف تعداد دانش‌آموز</option>
        </select>
        {isRoleTarget && (
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={payload.role_id ?? ""}
            onChange={(e) => setPayload((p) => ({ ...p, role_id: Number(e.target.value) || undefined }))}
          >
            <option value="">انتخاب نقش</option>
            {(roles ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code})
              </option>
            ))}
          </select>
        )}
        {isUserTarget && (
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={payload.user_id ?? ""}
            onChange={(e) => setPayload((p) => ({ ...p, user_id: Number(e.target.value) || undefined }))}
          >
            <option value="">انتخاب کاربر</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.first_name} {u.last_name} - {u.role_name}
              </option>
            ))}
          </select>
        )}
        {isCapacityScope && (
          <Input
            type="number"
            placeholder="سقف تعداد دانش‌آموز"
            value={payload.capacity_limit ?? ""}
            onChange={(e) => setPayload((p) => ({ ...p, capacity_limit: parseLocalizedInt(e.target.value || "0") }))}
          />
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={payload.is_active}
            onChange={(e) => setPayload((p) => ({ ...p, is_active: e.target.checked }))}
          />
          فعال
        </label>
        {isSelectedScope && (
          <div className="md:col-span-4 border rounded-md p-3 space-y-2">
            <Input
              placeholder="جستجوی دانش‌آموز..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
            <div className="max-h-44 overflow-y-auto grid gap-1">
              {students.map((s) => {
                const title = [s.first_name, s.last_name].filter(Boolean).join(" ") || `دانش‌آموز ${s.id}`;
                const checked = selectedStudentIds.includes(s.id);
                return (
                  <label key={s.id} className="flex items-center gap-2 text-sm py-1">
                    <input type="checkbox" checked={checked} onChange={() => toggleStudent(s.id)} />
                    <span>{title}</span>
                    {s.phone ? <span className="text-muted-foreground">({s.phone})</span> : null}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              تعداد انتخاب‌شده: {selectedStudentIds.length}
            </p>
          </div>
        )}
        <Button
          className="md:col-span-2"
          onClick={submit}
          disabled={!canSubmit || createMutation.isPending || updateMutation.isPending || updateStudentsMutation.isPending}
        >
          {editingId != null
            ? updateMutation.isPending || updateStudentsMutation.isPending
              ? "در حال ذخیره..."
              : "ذخیره تغییرات"
            : createMutation.isPending || updateStudentsMutation.isPending
              ? "در حال ثبت..."
              : "ثبت قانون"}
        </Button>
        <Button className="md:col-span-2" variant="outline" onClick={resetForm}>
          {editingId != null ? "لغو ویرایش" : "پاک‌کردن فرم"}
        </Button>
      </div>

      <div className="card-elevated p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>
        ) : (
          <div className="space-y-3">
            {(data ?? []).map((row) => (
              <div key={row.id} className="border rounded-lg p-3 flex items-center justify-between">
                <div className="text-sm">
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-muted-foreground">
                    {row.target_kind} | {row.scope_kind} | {row.payment_type} | {row.amount_kind === "FIXED" ? `${row.fixed_cents ?? 0} ریال` : `${row.percent ?? 0}%`}
                  </p>
                  {(row.students?.length ?? 0) > 0 ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      دانش‌آموز انتخابی: {row.students?.length}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(row)}>
                    ویرایش
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeMutation.mutate(row.id)}
                    disabled={removeMutation.isPending}
                  >
                    حذف
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}


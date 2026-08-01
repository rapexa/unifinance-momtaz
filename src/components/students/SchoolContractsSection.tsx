import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Plus } from "lucide-react";
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
import { formatGroupedFaIntInput, parseLocalizedInt } from "@/lib/numberInput";
import {
  deleteSchoolContract,
  listSchoolContracts,
  updateSchoolContract,
  type SchoolContractApi,
  type UpdateSchoolContractPayload,
} from "@/api/schoolContractsApi";
import { listStudents, type StudentApi } from "@/api/studentsApi";

function formatTomansFromCents(cents: number): string {
  return Math.round(cents / 10).toLocaleString("fa-IR");
}

function EditSchoolContractForm({
  contract,
  onClose,
}: {
  contract: SchoolContractApi;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [schoolName, setSchoolName] = useState(contract.school_name);
  const [studentCount, setStudentCount] = useState(String(contract.student_count));
  const [unitPrice, setUnitPrice] = useState(
    formatGroupedFaIntInput(String(Math.round(contract.unit_price_cents / 10))),
  );
  const [notes, setNotes] = useState(contract.notes || "");
  const [status, setStatus] = useState(contract.status || "ACTIVE");
  const [error, setError] = useState("");

  const count = parseLocalizedInt(studentCount);
  const unitTomans = parseLocalizedInt(unitPrice);
  const totalPreview = count > 0 && unitTomans > 0 ? count * unitTomans : 0;

  const mutation = useMutation({
    mutationFn: (payload: UpdateSchoolContractPayload) =>
      updateSchoolContract(contract.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-contracts"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">نام مدرسه</label>
        <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">تعداد دانش‌آموز</label>
          <Input
            inputMode="numeric"
            dir="ltr"
            value={studentCount}
            onChange={(e) => setStudentCount(formatGroupedFaIntInput(e.target.value))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            مبلغ هر دانش‌آموز (تومان)
          </label>
          <Input
            inputMode="numeric"
            dir="ltr"
            value={unitPrice}
            onChange={(e) => setUnitPrice(formatGroupedFaIntInput(e.target.value))}
          />
        </div>
      </div>
      <p className="text-sm text-primary">
        مبلغ کل قرارداد: {totalPreview > 0 ? totalPreview.toLocaleString("fa-IR") : "—"} تومان
      </p>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">وضعیت</label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">فعال</SelectItem>
            <SelectItem value="INACTIVE">غیرفعال</SelectItem>
            <SelectItem value="SETTLED">تسویه</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">توضیحات</label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
          انصراف
        </Button>
        <Button
          disabled={mutation.isPending || !schoolName.trim() || count <= 0 || unitTomans <= 0}
          onClick={() =>
            mutation.mutate({
              school_name: schoolName.trim(),
              student_count: count,
              unit_price_cents: unitTomans * 10,
              notes: notes.trim() || undefined,
              status,
            })
          }
        >
          {mutation.isPending ? "در حال ذخیره..." : "ذخیره"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function SchoolStudentsPanel({
  contract,
  onBack,
  onAddStudent,
  onOpenStudent,
}: {
  contract: SchoolContractApi;
  onBack: () => void;
  onAddStudent: (contract: SchoolContractApi) => void;
  onOpenStudent?: (student: StudentApi) => void;
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["students", { school_contract_id: contract.id, registration_channel: "SCHOOL" }],
    queryFn: () =>
      listStudents({
        school_contract_id: contract.id,
        registration_channel: "SCHOOL",
        page: 1,
        page_size: 200,
        sort: "name",
      }),
  });

  const students = data?.data ?? [];
  const registered = contract.registered_student_count ?? students.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <Button type="button" variant="ghost" size="sm" className="mt-0.5 gap-1" onClick={onBack}>
            <ArrowRight className="h-4 w-4" />
            بازگشت به مدارس
          </Button>
          <div>
            <h3 className="text-base font-semibold text-foreground">{contract.school_name}</h3>
            <p className="text-xs text-muted-foreground">
              ثبت‌شده {registered.toLocaleString("fa-IR")} از{" "}
              {contract.student_count.toLocaleString("fa-IR")} نفر
              <span className="mx-1">·</span>
              اطلاعات پرداخت در منوی «پرداخت‌ها ← مدارس»
            </p>
          </div>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => onAddStudent(contract)}>
          <Plus className="h-4 w-4" />
          افزودن دانش‌آموز این مدرسه
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right font-medium">نام</th>
              <th className="px-3 py-2 text-right font-medium">موبایل</th>
              <th className="px-3 py-2 text-right font-medium">مشاور</th>
              <th className="px-3 py-2 text-right font-medium">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  در حال بارگذاری...
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-destructive">
                  {(error as Error)?.message || "خطا در دریافت دانش‌آموزان"}
                </td>
              </tr>
            )}
            {!isLoading && !isError && students.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  هنوز دانش‌آموزی برای این مدرسه ثبت نشده است.
                </td>
              </tr>
            )}
            {students.map((st) => {
              const name = [st.first_name, st.last_name].filter(Boolean).join(" ") || "—";
              return (
                <tr
                  key={st.id}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer"
                  onClick={() => onOpenStudent?.(st)}
                >
                  <td className="px-3 py-2 font-medium">{name}</td>
                  <td className="px-3 py-2 number-display" dir="ltr">
                    {st.phone || "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{st.advisor_name || "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {st.status === "ACTIVE" ? "فعال" : st.status === "INACTIVE" ? "غیرفعال" : "حذف‌شده"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SchoolContractsSection({
  search,
  onAddStudentForSchool,
  onOpenStudent,
}: {
  search: string;
  onAddStudentForSchool?: (contract: SchoolContractApi) => void;
  onOpenStudent?: (student: StudentApi) => void;
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [editContract, setEditContract] = useState<SchoolContractApi | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selected, setSelected] = useState<SchoolContractApi | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["school-contracts", { search, page }],
    queryFn: () =>
      listSchoolContracts({
        search: search || undefined,
        page,
        page_size: 20,
        sort: "newest",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSchoolContract,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-contracts"] });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["students"] });
      setDeleteId(null);
      setSelected(null);
    },
  });

  const rows = data?.data ?? [];
  const totalPages = data?.meta.total_pages ?? 1;

  const emptyHint = useMemo(
    () => (search ? "مدرسه‌ای با این جستجو یافت نشد." : "هنوز مدرسه‌ای ثبت نشده است."),
    [search],
  );

  if (selected) {
    return (
      <SchoolStudentsPanel
        contract={selected}
        onBack={() => setSelected(null)}
        onAddStudent={(c) => onAddStudentForSchool?.(c)}
        onOpenStudent={onOpenStudent}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[780px] text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right font-medium">مدرسه</th>
              <th className="px-3 py-2 text-right font-medium">ثبت‌شده / توافق</th>
              <th className="px-3 py-2 text-right font-medium">وضعیت</th>
              <th className="px-3 py-2 text-right font-medium">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  در حال بارگذاری...
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-destructive">
                  {(error as Error)?.message || "خطا در دریافت مدارس"}
                </td>
              </tr>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  {emptyHint}
                </td>
              </tr>
            )}
            {rows.map((c) => {
              const registered = c.registered_student_count ?? 0;
              return (
                <tr
                  key={c.id}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer"
                  onClick={() => setSelected(c)}
                >
                  <td className="px-3 py-2 font-medium">{c.school_name}</td>
                  <td className="px-3 py-2 number-display">
                    {registered.toLocaleString("fa-IR")} / {c.student_count.toLocaleString("fa-IR")}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {c.status === "ACTIVE" ? "فعال" : c.status === "SETTLED" ? "تسویه" : "غیرفعال"}
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditContract(c)}>
                        ویرایش
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteId(c.id)}>
                        حذف
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            قبلی
          </Button>
          <span className="text-xs text-muted-foreground">
            صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            بعدی
          </Button>
        </div>
      )}

      <Dialog open={!!editContract} onOpenChange={(o) => !o && setEditContract(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>ویرایش مدرسه</DialogTitle>
          </DialogHeader>
          {editContract && (
            <EditSchoolContractForm
              key={editContract.id}
              contract={editContract}
              onClose={() => setEditContract(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteId != null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف مدرسه؟</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            با حذف مدرسه، تمام تراکنش‌های پرداخت متصل به آن نیز حذف می‌شوند و از منوی پرداخت‌ها پاک
            می‌گردند. ارتباط دانش‌آموزان با این مدرسه قطع می‌شود.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              انصراف
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteId != null && deleteMutation.mutate(deleteId)}
            >
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

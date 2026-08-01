import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function SchoolContractsSection({ search }: { search: string }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [editContract, setEditContract] = useState<SchoolContractApi | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

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
      setDeleteId(null);
    },
  });

  const rows = data?.data ?? [];
  const totalPages = data?.meta.total_pages ?? 1;

  const emptyHint = useMemo(
    () => (search ? "قراردادی با این جستجو یافت نشد." : "هنوز قرارداد مدرسه‌ای ثبت نشده است."),
    [search],
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-right font-medium">مدرسه</th>
              <th className="px-3 py-2 text-right font-medium">تعداد دانش‌آموز</th>
              <th className="px-3 py-2 text-right font-medium">مبلغ واحد</th>
              <th className="px-3 py-2 text-right font-medium">مبلغ کل</th>
              <th className="px-3 py-2 text-right font-medium">پرداخت‌شده</th>
              <th className="px-3 py-2 text-right font-medium">مانده</th>
              <th className="px-3 py-2 text-right font-medium">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  در حال بارگذاری...
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-destructive">
                  {(error as Error)?.message || "خطا در دریافت قراردادها"}
                </td>
              </tr>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  {emptyHint}
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{c.school_name}</td>
                <td className="px-3 py-2 number-display">{c.student_count.toLocaleString("fa-IR")}</td>
                <td className="px-3 py-2 number-display">{formatTomansFromCents(c.unit_price_cents)}</td>
                <td className="px-3 py-2 number-display">{formatTomansFromCents(c.total_amount_cents)}</td>
                <td className="px-3 py-2 number-display">{formatTomansFromCents(c.paid_total_cents)}</td>
                <td className="px-3 py-2 number-display">
                  {formatTomansFromCents(c.remaining_balance_cents)}
                </td>
                <td className="px-3 py-2">
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
            ))}
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
            <DialogTitle>ویرایش قرارداد مدرسه</DialogTitle>
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
            <DialogTitle>حذف قرارداد مدرسه؟</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            با حذف قرارداد، پرداخت‌های متصل نیز حذف می‌شوند.
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

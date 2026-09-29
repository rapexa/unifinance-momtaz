import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatGroupedFaIntInput, parseLocalizedInt } from "@/lib/numberInput";
import {
  formatJalaliParts,
  isoToJalaliString,
  jalaliToGregorianIso,
  parseJalaliParts,
  todayJalaliPeriod,
} from "@/lib/jalaliDate";
import {
  SCHOOL_PAYMENT_TYPE_LABELS,
  SCHOOL_TERM_LABELS,
  type CreateSchoolContractPayload,
  type SchoolContractApi,
  type SchoolPaymentType,
  type SchoolTerm,
} from "@/api/schoolContractsApi";

const groupTomans = (cents?: number) =>
  cents ? formatGroupedFaIntInput(String(Math.round(cents / 10))) : "";

/** Dates of the upcoming (or current) term in Jalali. */
function termDates(term: SchoolTerm): { start: string; end: string } {
  const { year, month } = todayJalaliPeriod();
  if (term === "SUMMER") {
    const y = month > 6 ? year + 1 : year;
    return {
      start: formatJalaliParts({ jy: y, jm: 4, jd: 1 }),
      end: formatJalaliParts({ jy: y, jm: 6, jd: 31 }),
    };
  }
  // Mehr .. Khordad: in Farvardin..Khordad we are inside the year that began last Mehr;
  // in summer or from Mehr on, the academic year starts this Mehr.
  const y = month <= 3 ? year - 1 : year;
  return {
    start: formatJalaliParts({ jy: y, jm: 7, jd: 1 }),
    end: formatJalaliParts({ jy: y + 1, jm: 3, jd: 31 }),
  };
}

function monthsBetween(startJ: string, endJ: string): number {
  const a = parseJalaliParts(startJ);
  const b = parseJalaliParts(endJ);
  if (!a || !b) return 0;
  const n = (b.jy - a.jy) * 12 + (b.jm - a.jm) + 1;
  return n > 0 ? n : 0;
}

/**
 * School contract fields (قرارداد مدرسه): school, number of students, contract period,
 * price per student, payment type (monthly / term / annual), total and notes.
 */
export function SchoolContractForm({
  initial,
  showStatus,
  submitLabel,
  isPending,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: SchoolContractApi;
  showStatus?: boolean;
  submitLabel: string;
  isPending: boolean;
  error?: string;
  onSubmit: (payload: CreateSchoolContractPayload) => void;
  onCancel: () => void;
}) {
  const [schoolName, setSchoolName] = useState(initial?.school_name ?? "");
  const [studentCount, setStudentCount] = useState(initial ? String(initial.student_count) : "");
  const [unitPrice, setUnitPrice] = useState(groupTomans(initial?.unit_price_cents));
  const [totalAmount, setTotalAmount] = useState(groupTomans(initial?.total_amount_cents));
  const [totalEdited, setTotalEdited] = useState(
    !!initial && !!initial.total_amount_cents &&
      initial.total_amount_cents !== (initial.unit_price_cents ?? 0) * initial.student_count,
  );
  const [paymentType, setPaymentType] = useState<SchoolPaymentType>(initial?.payment_type ?? "ANNUAL");
  const [term, setTerm] = useState<SchoolTerm>((initial?.term as SchoolTerm) || "ACADEMIC");
  const [startDate, setStartDate] = useState(isoToJalaliString(initial?.start_date ?? undefined));
  const [endDate, setEndDate] = useState(isoToJalaliString(initial?.end_date ?? undefined));
  const [status, setStatus] = useState(initial?.status ?? "ACTIVE");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [localError, setLocalError] = useState("");

  const count = parseLocalizedInt(studentCount);
  const unitTomans = parseLocalizedInt(unitPrice);
  const computedTotal = count > 0 && unitTomans > 0 ? count * unitTomans : 0;
  const totalTomans = totalEdited ? parseLocalizedInt(totalAmount) : computedTotal || parseLocalizedInt(totalAmount);
  const months = monthsBetween(startDate, endDate);
  const installment =
    paymentType === "MONTHLY" && months > 0 ? Math.floor(totalTomans / months) : totalTomans;

  const applyTerm = (t: SchoolTerm) => {
    setTerm(t);
    const d = termDates(t);
    setStartDate(d.start);
    setEndDate(d.end);
  };

  const submit = () => {
    setLocalError("");
    if (!schoolName.trim()) return setLocalError("نام مدرسه را وارد کنید");
    if (count <= 0) return setLocalError("تعداد دانش‌آموز را وارد کنید");
    if (totalTomans <= 0) return setLocalError("مبلغ هر دانش‌آموز یا مبلغ کل را وارد کنید");
    const startIso = startDate.trim() ? jalaliToGregorianIso(startDate.trim()) : "";
    const endIso = endDate.trim() ? jalaliToGregorianIso(endDate.trim()) : "";
    if (startDate.trim() && !startIso) return setLocalError("تاریخ شروع نامعتبر است");
    if (endDate.trim() && !endIso) return setLocalError("تاریخ پایان نامعتبر است");
    if (startIso && endIso && endIso < startIso) return setLocalError("تاریخ پایان باید بعد از شروع باشد");
    onSubmit({
      school_name: schoolName.trim(),
      student_count: count,
      unit_price_cents: unitTomans * 10,
      total_amount_cents: totalTomans * 10,
      payment_type: paymentType,
      term: paymentType === "TERM" ? term : undefined,
      start_date: startIso || undefined,
      end_date: endIso || undefined,
      notes: notes.trim() || undefined,
      ...(showStatus ? { status } : {}),
    });
  };

  const label = "mb-1 block text-xs font-medium text-muted-foreground";
  return (
    <div className="space-y-3 py-2 text-right" dir="rtl">
      <div>
        <label className={label}>نام مدرسه</label>
        <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="مثلاً شهید بهشتی" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>تعداد دانش‌آموز</label>
          <Input
            inputMode="numeric"
            dir="ltr"
            value={studentCount}
            onChange={(e) => setStudentCount(formatGroupedFaIntInput(e.target.value))}
            placeholder="مثلاً ۴۰"
          />
        </div>
        <div>
          <label className={label}>مبلغ هر دانش‌آموز (تومان)</label>
          <Input
            inputMode="numeric"
            dir="ltr"
            value={unitPrice}
            onChange={(e) => setUnitPrice(formatGroupedFaIntInput(e.target.value))}
            placeholder="مثلاً ۱۰,۰۰۰,۰۰۰"
          />
        </div>
      </div>

      <div>
        <label className={label}>نوع پرداخت</label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(SCHOOL_PAYMENT_TYPE_LABELS) as SchoolPaymentType[]).map((pt) => (
            <button
              key={pt}
              type="button"
              onClick={() => {
                setPaymentType(pt);
                if (pt === "TERM") applyTerm(term);
              }}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm transition-colors",
                paymentType === pt ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted",
              )}
            >
              {SCHOOL_PAYMENT_TYPE_LABELS[pt]}
            </button>
          ))}
        </div>
        {paymentType === "TERM" && (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.keys(SCHOOL_TERM_LABELS) as SchoolTerm[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => applyTerm(t)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs transition-colors",
                  term === t ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted",
                )}
              >
                {SCHOOL_TERM_LABELS[t]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>شروع قرارداد</label>
          <JalaliDatePicker value={startDate} onChange={setStartDate} placeholder="تاریخ شروع" />
        </div>
        <div>
          <label className={label}>پایان قرارداد</label>
          <JalaliDatePicker value={endDate} onChange={setEndDate} placeholder="تاریخ پایان" />
        </div>
      </div>
      {months > 0 && (
        <p className="text-[11px] text-muted-foreground">مدت قرارداد: {months.toLocaleString("fa-IR")} ماه</p>
      )}

      <div>
        <label className={label}>مبلغ کل قرارداد (تومان)</label>
        <Input
          inputMode="numeric"
          dir="ltr"
          value={totalEdited ? totalAmount : computedTotal ? formatGroupedFaIntInput(String(computedTotal)) : totalAmount}
          onChange={(e) => {
            setTotalEdited(true);
            setTotalAmount(formatGroupedFaIntInput(e.target.value));
          }}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {totalEdited && computedTotal > 0 && computedTotal !== totalTomans ? (
            <>
              مبلغ کل دستی وارد شده (تعداد × مبلغ هر نفر = {computedTotal.toLocaleString("fa-IR")}).{" "}
              <button type="button" className="text-primary underline" onClick={() => setTotalEdited(false)}>
                محاسبه خودکار
              </button>
            </>
          ) : (
            "به‌صورت خودکار = تعداد دانش‌آموز × مبلغ هر دانش‌آموز"
          )}
          {totalTomans > 0 && (
            <>
              {" · "}
              {paymentType === "MONTHLY"
                ? months > 0
                  ? `قسط ماهانه: ${installment.toLocaleString("fa-IR")} تومان`
                  : "برای محاسبه قسط ماهانه، تاریخ شروع و پایان را وارد کنید"
                : paymentType === "TERM"
                  ? `مبلغ دوره: ${totalTomans.toLocaleString("fa-IR")} تومان`
                  : `مبلغ سالانه: ${totalTomans.toLocaleString("fa-IR")} تومان`}
            </>
          )}
        </p>
      </div>

      {showStatus && (
        <div>
          <label className={label}>وضعیت</label>
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
      )}
      <div>
        <label className={label}>توضیحات</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="اختیاری" />
      </div>
      {(localError || error) && <p className="text-xs text-destructive">{localError || error}</p>}
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isPending}>
          انصراف
        </Button>
        <Button onClick={submit} disabled={isPending}>
          {isPending ? "در حال ذخیره..." : submitLabel}
        </Button>
      </DialogFooter>
    </div>
  );
}

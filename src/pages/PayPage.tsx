import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, User, Phone, FileText, Calendar, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { getPublicPayment, initiatePayment } from "@/api/publicPaymentApi";
import { formatIsoDateShamsi } from "@/lib/jalaliDate";

function formatToman(rials: number): string {
  const tomans = Math.round(rials / 10);
  return tomans.toLocaleString("fa-IR") + " تومان";
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "در انتظار پرداخت", color: "text-amber-600 bg-amber-50 border-amber-200" },
  OVERDUE: { label: "معوق", color: "text-red-600 bg-red-50 border-red-200" },
  PAID: { label: "پرداخت‌شده", color: "text-green-600 bg-green-50 border-green-200" },
  CANCELLED: { label: "لغو‌شده", color: "text-gray-500 bg-gray-50 border-gray-200" },
};

const PayPage = () => {
  const { id } = useParams<{ id: string }>();
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const { data: payment, isLoading, isError, error } = useQuery({
    queryKey: ["public-payment", id],
    queryFn: () => getPublicPayment(id!),
    enabled: !!id,
    retry: 1,
  });

  const handlePay = async () => {
    if (!id) return;
    setPayError(null);
    setIsPaying(true);
    try {
      const { payment_url } = await initiatePayment(id);
      window.location.href = payment_url;
    } catch (err: any) {
      setPayError(err.message ?? "خطایی رخ داد. لطفاً دوباره تلاش کنید.");
      setIsPaying(false);
    }
  };

  const canPay = payment && (payment.status === "PENDING" || payment.status === "OVERDUE");

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col items-center justify-center p-4"
    >
      {/* Logo / Brand */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white shadow-lg mb-3">
          <CreditCard size={32} />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">پرداخت آنلاین</h1>
        <p className="text-slate-500 text-sm mt-1">مجموعه مشاوره ممتاز</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="animate-spin text-blue-600" size={36} />
            <p className="text-slate-500">در حال بارگذاری اطلاعات پرداخت…</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 px-6 text-center">
            <AlertCircle className="text-red-500" size={40} />
            <p className="text-red-600 font-semibold">لینک پرداخت نامعتبر است</p>
            <p className="text-slate-500 text-sm">
              {(error as Error)?.message ?? "این لینک یافت نشد یا منقضی شده است."}
            </p>
          </div>
        )}

        {payment && (
          <>
            {/* Amount Banner */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-8 text-white text-center">
              <p className="text-blue-100 text-sm mb-1">مبلغ قابل پرداخت</p>
              <p className="text-4xl font-bold tracking-tight">
                {formatToman(payment.amount_cents)}
              </p>
            </div>

            {/* Details */}
            <div className="px-6 py-5 space-y-4">
              {/* Status Badge */}
              {(() => {
                const s = STATUS_LABELS[payment.status] ?? STATUS_LABELS.PENDING;
                return (
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${s.color}`}>
                    {payment.status === "PAID" && <CheckCircle2 size={14} />}
                    {s.label}
                  </div>
                );
              })()}

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3 text-slate-700">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <User size={15} className="text-slate-500" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">نام دانش‌آموز</p>
                    <p className="font-medium">{payment.student_name}</p>
                  </div>
                </div>

                {payment.student_phone && (
                  <div className="flex items-center gap-3 text-slate-700">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Phone size={15} className="text-slate-500" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">شماره تماس</p>
                      <p className="font-medium" dir="ltr">{payment.student_phone}</p>
                    </div>
                  </div>
                )}

                {payment.description && (
                  <div className="flex items-start gap-3 text-slate-700">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileText size={15} className="text-slate-500" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">شرح</p>
                      <p className="font-medium">{payment.description}</p>
                    </div>
                  </div>
                )}

                {payment.due_date && (
                  <div className="flex items-center gap-3 text-slate-700">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Calendar size={15} className="text-slate-500" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">سررسید</p>
                      <p className="font-medium">{formatIsoDateShamsi(payment.due_date)}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Error */}
              {payError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  {payError}
                </div>
              )}

              {/* Already paid */}
              {payment.status === "PAID" && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
                  <CheckCircle2 size={16} className="flex-shrink-0" />
                  این پرداخت قبلاً با موفقیت انجام شده است.
                </div>
              )}

              {/* Pay button */}
              {canPay && (
                <button
                  onClick={handlePay}
                  disabled={isPaying}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-4 rounded-xl transition-colors text-base shadow-md shadow-blue-200"
                >
                  {isPaying ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      در حال انتقال به درگاه…
                    </>
                  ) : (
                    <>
                      <CreditCard size={20} />
                      پرداخت آنلاین
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 text-center">
              <p className="text-xs text-slate-400">
                پرداخت از طریق درگاه امن زرین‌پال انجام می‌شود
              </p>
              <img
                src="https://www.zarinpal.com/assets/images/logo.svg"
                alt="ZarinPal"
                className="h-5 mx-auto mt-1 opacity-50"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PayPage;

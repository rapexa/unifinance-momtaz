import { Link, useParams, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Home, RefreshCw } from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "پرداخت مرتبط با این تراکنش پیدا نشد.",
  cancelled: "پرداخت توسط کاربر لغو شد یا درگاه آن را ناموفق اعلام کرد.",
  verify_failed: "تایید پرداخت با درگاه ناموفق بود.",
  db_error: "پرداخت انجام شد اما ثبت نهایی آن با خطا مواجه شد.",
};

function getErrorMessage(errorCode: string | null): string {
  if (!errorCode) return "پرداخت ناموفق بود. لطفا دوباره تلاش کنید.";
  if (ERROR_MESSAGES[errorCode]) return ERROR_MESSAGES[errorCode];
  if (errorCode.startsWith("gateway_code_")) {
    const code = errorCode.replace("gateway_code_", "");
    return `پرداخت توسط درگاه تایید نشد (کد: ${code}).`;
  }
  return "خطای نامشخصی رخ داد. لطفا مجددا تلاش کنید.";
}

const PaymentResult = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const isSuccess = searchParams.get("success") === "true";
  const refId = searchParams.get("ref_id");
  const errorCode = searchParams.get("error");
  const paymentId = id ?? "-";

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-7 text-center">
        {isSuccess ? (
          <>
            <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="text-green-600" size={30} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">پرداخت موفق بود</h1>
            <p className="text-slate-600 text-sm leading-6 mb-5">
              تراکنش شما با موفقیت ثبت شد.
            </p>

            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm space-y-2 mb-6">
              <p className="text-slate-700">
                <span className="text-slate-500">شناسه پرداخت:</span>{" "}
                <span className="font-semibold">{paymentId}</span>
              </p>
              {refId && (
                <p className="text-slate-700">
                  <span className="text-slate-500">کد رهگیری:</span>{" "}
                  <span className="font-semibold">{refId}</span>
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
              <AlertCircle className="text-red-600" size={30} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">پرداخت ناموفق بود</h1>
            <p className="text-slate-600 text-sm leading-6 mb-5">
              {getErrorMessage(errorCode)}
            </p>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm mb-6">
              <p className="text-slate-700">
                <span className="text-slate-500">شناسه پرداخت:</span>{" "}
                <span className="font-semibold">{paymentId}</span>
              </p>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            to={id ? `/pay/${id}` : "/"}
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-semibold transition-colors"
          >
            <RefreshCw size={16} />
            تلاش مجدد
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PaymentResult;

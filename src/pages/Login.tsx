import { FormEvent, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail } from "lucide-react";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (token) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("ایمیل و رمز عبور الزامی هستند.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          data?.error ||
          (res.status === 401
            ? "ایمیل یا رمز عبور نامعتبر است."
            : "خطا در ورود. دوباره تلاش کنید.");
        setError(msg);
        return;
      }

      if (!data?.tokens?.access_token) {
        setError("پاسخ نامعتبر از سرور دریافت شد.");
        return;
      }

      localStorage.setItem("accessToken", data.tokens.access_token);
      if (data.tokens.refresh_token) {
        localStorage.setItem("refreshToken", data.tokens.refresh_token);
      }

      navigate("/", { replace: true });
    } catch (err) {
      console.error("Login error", err);
      setError("خطای اتصال به سرور. لطفاً بعداً دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="card-elevated p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Lock className="h-6 w-6" />
            </div>
            <h1 className="mb-1 text-2xl font-bold text-gradient">
              ورود به پنل مدیریت
            </h1>
            <p className="text-sm text-muted-foreground">
              فقط کاربران ادمین می‌توانند وارد این بخش شوند.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                ایمیل سازمانی
              </label>
              <div className="flex items-center rounded-lg border bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
                <Mail className="mr-2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  className="w-full bg-transparent text-sm outline-none"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">رمز عبور</label>
              <div className="flex items-center rounded-lg border bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
                <Lock className="mr-2 h-4 w-4 text-muted-foreground" />
                <input
                  type="password"
                  className="w-full bg-transparent text-sm outline-none"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "در حال ورود..." : "ورود به سیستم"}
            </button>

            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <button
                type="button"
                className="underline-offset-2 hover:underline"
                onClick={() => {
                  // Placeholder – can navigate to /forgot-password when implemented
                  setError("بازیابی رمز عبور هنوز پیاده‌سازی نشده است.");
                }}
              >
                فراموشی رمز عبور؟
              </button>
            </div>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} یونی‌فاینانس ممتاز – داشبورد مدیریتی
        </p>
      </div>
    </div>
  );
};

export default Login;


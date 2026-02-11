## API Integration – Login & CORS

This document explains how the frontend login flow talks to the Gin backend, including:

- CORS configuration on the backend.
- The `login` API helper on the frontend.
- Where tokens are stored and how to use them in future requests.
- Notes about development vs. production environments.

---

## Backend – CORS Configuration (Gin)

**File**: `backend/cmd/main.go`

The API server runs on **port 8081**. The React dev server (Vite) runs on **port 8080**, so we must allow cross-origin requests from `http://localhost:8080`.

We use `github.com/gin-contrib/cors`:

```go
import (
  "log"
  "net/http"
  "time"

  "github.com/gin-contrib/cors"
  "github.com/gin-gonic/gin"
  // ...
)

func main() {
  cfg := config.MustLoadConfig()
  db := database.MustGetDB()

  // ...

  // Gin engine
  r := gin.Default()

  // CORS - allow frontend dev server on port 8080
  corsConfig := cors.Config{
    AllowOrigins: []string{
      "http://localhost:8080",
      "http://127.0.0.1:8080",
    },
    AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
    AllowHeaders: []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Requested-With"},
    AllowCredentials: true,
    MaxAge:           12 * time.Hour,
  }
  r.Use(cors.New(corsConfig))

  // routes...
}
```

> To add the dependency, run (once, in `backend/`):
>
> ```bash
> go get github.com/gin-contrib/cors
> ```

The middleware:

- Automatically handles **OPTIONS** preflight requests.
- Allows the React dev server to call API endpoints like `/api/v1/auth/login`.
- Is permissive in development; for production, you should replace `AllowOrigins` with your real domain(s).

---

## Frontend – Login API Helper

**File**: `src/api/authApi.ts`

We centralize the login call in a small helper that uses `fetch` and stores tokens in `localStorage`.

```ts
export interface LoginSuccess {
  success: true;
  data: any;
}

export interface LoginFailure {
  success: false;
  error: string;
}

export type LoginResult = LoginSuccess | LoginFailure;

const DEFAULT_API_BASE = "http://localhost:8081/api/v1";

const API_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE_URL) ||
  DEFAULT_API_BASE;

export async function login(
  email: string,
  password: string
): Promise<LoginResult> {
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const status = res.status;
      let message =
        (data && data.error) ||
        (status === 401
          ? "Invalid credentials"
          : status === 403
          ? "Access denied"
          : "Login failed");

      return { success: false, error: message };
    }

    // Expect tokens.access_token / tokens.refresh_token from backend
    const access = data?.tokens?.access_token;
    if (!access) {
      return {
        success: false,
        error: "Invalid response from server",
      };
    }

    // Store tokens for later use
    localStorage.setItem("accessToken", access);
    const refresh = data.tokens?.refresh_token;
    if (refresh) {
      localStorage.setItem("refreshToken", refresh);
    }

    return { success: true, data };
  } catch (err) {
    console.error("login API error", err);
    return {
      success: false,
      error: "Server unreachable. Please try again later.",
    };
  }
}
```

### How it works

- **Input**: `email`, `password`.
- **Request**:
  - Method: `POST`
  - URL: `${API_BASE}/auth/login` → in dev: `http://localhost:8081/api/v1/auth/login`
  - Headers: `Content-Type: application/json`
  - Body: `{"email":"...", "password":"..."}`
- **Success**:
  - Expects backend to return an object with `tokens.access_token` and `tokens.refresh_token`.
  - Stores:
    - `accessToken` in `localStorage`.
    - `refreshToken` (if present) in `localStorage`.
  - Returns `{ success: true, data }`.
- **Error**:
  - Maps 401 to `"Invalid credentials"`, 403 to `"Access denied"`, everything else to `"Login failed"` (unless backend sends its own `error` field).
  - For network errors, returns `"Server unreachable. Please try again later."`.
  - Returns `{ success: false, error }`.

---

## Frontend – Using the Login Helper in the Login Page

**File**: `src/pages/Login.tsx`

The Login page uses the helper instead of calling `fetch` directly:

```tsx
import { FormEvent, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail } from "lucide-react";
import { login as loginApi } from "@/api/authApi";

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
      const result = await loginApi(email, password);
      if (!result.success) {
        // Map generic English messages to localized ones
        if (result.error === "Invalid credentials") {
          setError("ایمیل یا رمز عبور نامعتبر است.");
        } else if (result.error === "Access denied") {
          setError("دسترسی فقط برای ادمین مجاز است.");
        } else if (
          result.error ===
          "Server unreachable. Please try again later."
        ) {
          setError("خطای اتصال به سرور. لطفاً بعداً دوباره تلاش کنید.");
        } else {
          setError(result.error || "خطا در ورود. دوباره تلاش کنید.");
        }
        return;
      }

      navigate("/", { replace: true });
    } finally {
      setLoading(false);
    }
  };

  // ... JSX form omitted for brevity ...
};
```

**Key points:**

- The page **does not** perform token storage itself; that is delegated to `authApi.login`.
- The page only:
  - Validates inputs.
  - Calls `loginApi`.
  - Maps generic error messages to localized Farsi strings.
  - Redirects to `/` on success.

---

## Where the Token Is Stored

- **Storage location**: `localStorage` keys:
  - `accessToken`
  - `refreshToken` (optional)

This is sufficient for a first version; for higher security you may later:

- Move to **HTTP-only cookies**.
- Add server-side token revocation, rotation, etc.

---

## Using the Token in Future Requests

When you add more API helpers (for students, payments, etc.), you can read the token from `localStorage` and send it as a Bearer token:

```ts
function getAuthHeaders() {
  const token = localStorage.getItem("accessToken");
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

export async function fetchStudents() {
  const res = await fetch(`${API_BASE}/students`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });

  // handle response...
}
```

On the backend, `AuthMiddleware` reads the `Authorization` header, validates the JWT, and populates context (user ID, role), which can be used by handlers and `RoleMiddleware` / `AdminOnly`.

---

## Dev vs. Prod

### Development

- Backend runs at `http://localhost:8081`.
- Frontend (Vite) runs at `http://localhost:8080`.
- CORS is configured to allow those origins.
- `API_BASE` default is `http://localhost:8081/api/v1`.

Optional improvement:

- You can set a Vite env variable instead of hardcoding:

```bash
VITE_API_BASE_URL=http://localhost:8081/api/v1
```

Then `authApi.ts` will automatically use it.

### Production

- Deploy backend under your real domain, for example:
  - `https://api.unifinance.example.com/api/v1`
- Deploy frontend under:
  - `https://app.unifinance.example.com`

Update:

1. **Backend CORS**:

```go
corsConfig := cors.Config{
  AllowOrigins: []string{
    "https://app.unifinance.example.com",
  },
  // other fields unchanged...
}
```

2. **Frontend env**:

```bash
VITE_API_BASE_URL=https://api.unifinance.example.com/api/v1
```

Now the same `login` helper will work without code changes; only configuration changes between environments.


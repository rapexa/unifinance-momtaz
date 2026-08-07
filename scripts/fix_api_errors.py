#!/usr/bin/env python3
"""Normalize remaining API throw patterns to apiFail()."""
import re
from pathlib import Path

API = Path("src/api")

MULTI = re.compile(
    r"const (message|msg)\s*=\s*\(data && data\.error\)\s*\|\|\s*"
    r"((?:\([^;]*\)|[^;])+);\s*\n\s*throw new Error\(\1\);",
    re.S,
)

SIMPLE_THROW = re.compile(
    r"throw new Error\(\(data && data\.error\) \|\| (\"[^\"]+\")\);",
)


def fallback_from_expr(expr: str) -> str:
    strs = re.findall(r'"([^"]+)"', expr)
    return strs[-1] if strs else "خطایی رخ داد. لطفاً دوباره تلاش کنید."


def ensure_import(c: str) -> str:
    m = re.search(r'import \{([^}]+)\} from "\./apiClient"', c)
    if not m:
        return c
    imps = m.group(1)
    if "apiFail" in imps:
        return c
    new_imps = imps.rstrip(" ,") + ", apiFail"
    return c.replace(m.group(0), f'import {{{new_imps}}} from "./apiClient"', 1)


def main() -> None:
    for p in API.glob("*.ts"):
        if p.name in ("apiClient.ts", "authApi.ts"):
            continue
        c = p.read_text(encoding="utf-8")
        orig = c

        def repl_multi(m: re.Match) -> str:
            fb = fallback_from_expr(m.group(2))
            return f'apiFail(data, "{fb}", res);'

        c = MULTI.sub(repl_multi, c)
        c = SIMPLE_THROW.sub(r"apiFail(data, \1, res);", c)

        # payments: throw new Error(msg) after msg = data?.error || fallback
        c = re.sub(
            r'const msg = \(data && data\.error\) \|\| ([^;]+);\s*\n\s*throw new Error\(msg\);',
            lambda m: f'apiFail(data, "{fallback_from_expr(m.group(1))}", res);',
            c,
        )

        if c != orig:
            c = ensure_import(c)
            p.write_text(c, encoding="utf-8")
            print("updated", p.name)
        else:
            print("unchanged", p.name)


if __name__ == "__main__":
    main()

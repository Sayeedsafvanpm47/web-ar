#!/usr/bin/env bash
# Hard rule 4 gate: no server-only secret may be reachable from the browser.
# Run before every deploy. Exits non-zero on a finding.
set -uo pipefail

fail=0
say() { printf '%s\n' "$*"; }

# 1. Server-only names must never be prefixed NEXT_PUBLIC_.
if grep -rInE 'NEXT_PUBLIC_[A-Z_]*(SERVICE_ROLE|SECRET|R2_)' \
     --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
     --include='*.env*' . 2>/dev/null | grep -v node_modules; then
  say "FAIL: a server-only secret is exposed under a NEXT_PUBLIC_ name."
  fail=1
fi

# 2. Server-only env reads must not appear in files marked 'use client'.
while IFS= read -r f; do
  head -5 "$f" | grep -q "'use client'\|\"use client\"" || continue
  if grep -qE 'SUPABASE_SERVICE_ROLE_KEY|R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|SENTRY_AUTH_TOKEN' "$f"; then
    say "FAIL: client component reads a server-only secret: $f"
    fail=1
  fi
done < <(find src -type f \( -name '*.ts' -o -name '*.tsx' \) 2>/dev/null)

# 3. A real key must never be committed. .env.example holds placeholders only.
if git ls-files -z 2>/dev/null | xargs -0 grep -lIE 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' 2>/dev/null; then
  say "FAIL: what looks like a JWT is committed in the files above."
  fail=1
fi

# 4. The built client bundle must not contain the key's value.
if [ -d .next ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  if grep -rqF "$SUPABASE_SERVICE_ROLE_KEY" .next/static 2>/dev/null; then
    say "FAIL: the service role key's value is present in .next/static."
    fail=1
  fi
fi

[ "$fail" -eq 0 ] && say "OK: no server-only secret is reachable from the client."
exit "$fail"

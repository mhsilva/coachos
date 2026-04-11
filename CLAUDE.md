# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload        # dev server on :8000
```

### Frontend
```bash
cd frontend
npm run dev                          # dev server on :5173
npm run build                        # tsc + vite build
```

## Architecture

Monorepo with no tooling — `backend/` and `frontend/` are fully independent.

### Backend

FastAPI app in `backend/app/`. Entry point is `main.py` which registers four routers. All business logic lives in the routers; models are Pydantic schemas only (no ORM).

**Auth flow:** Every protected route uses `Depends(get_current_user)` or `Depends(require_role("coach"))` from `dependencies.py`. These decode the Supabase JWT (HS256, audience `authenticated`) and read the role from `payload["app_metadata"]["role"]`. The role must be set in Supabase via `raw_app_meta_data` — it is not derived from the `profiles` table at request time.

**Supabase client:** `supabase_client.py` exposes a singleton using the **service role key**, which bypasses RLS. All DB writes go through this client. RLS policies in `supabase/schema.sql` are enforced for direct client-side queries only.

**Trigger chain on signup:** `auth.users` INSERT → `handle_new_user()` creates `profiles` row → `handle_new_profile()` creates `coaches` or `students` row based on role. Both functions use `security definer set search_path = public`.

### Frontend

React 18 + Vite + TypeScript (strict). No UI library — all components follow the design system defined in `tailwind.config.ts`.

**Auth:** `AuthContext.tsx` wraps the app, reads role from `session.user.app_metadata.role`, and exposes `{ user, session, role, loading, signOut }`. `useAuth()` is the hook; it re-exports from `contexts/AuthContext.tsx`. `ProtectedRoute` redirects unauthenticated users to `/login` and wrong-role users back to `/login`.

**Layout:** All authenticated pages use `AppLayout` which renders `Sidebar` (desktop, `md:flex`) + `BottomNav` (mobile, `md:hidden`). Page content needs `pb-20 md:pb-0` — already handled inside `AppLayout`.

**API calls:** `createApi(token)` in `lib/api.ts` returns `{ get, post, patch }` with the Bearer token pre-attached. Always call it with `session.access_token`.

**Routing:** Role-based redirect at `/` via `RoleRedirect` in `App.tsx`. Routes are grouped under `ProtectedRoute` by role.

## Design system

Custom Tailwind tokens (defined in `tailwind.config.ts`):
- `bg-teal` / `text-teal` → `#16323F` (primary, sidebar)
- `bg-copper` / `text-copper` → `#B76E4D` (CTAs, active state)
- `bg-gray` → `#ECECEC` (overrides Tailwind's gray palette entirely)
- `bg-surface` → `#F4F4F2`
- `shadow-btn` → copper glow; `shadow-card` → subtle teal shadow
- `rounded-card` = 12px, `rounded-btn` = 9px
- Fonts: `font-syne` (headings), `font-inter` (body), `font-jetbrains` (numbers/weights)
- Muted text: `text-teal/50` or `text-teal/40`; light borders: `border-teal/[0.09]`

## Key constraints

- TypeScript strict — no `any`
- UI text in Brazilian Portuguese; code comments in English
- No UI libraries (no shadcn, MUI, Chakra)
- No Redux; only `AuthContext` for global state

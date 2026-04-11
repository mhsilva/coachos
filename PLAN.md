# CoachOS — Plano de Implementação v0

## Checklist de Progresso

### Infraestrutura
- [x] Estrutura de diretórios do monorepo
- [x] CONTEXT.md e PLAN.md no repo

### Backend
- [x] `requirements.txt`
- [x] `.env.example`
- [x] `Procfile` (Railway)
- [x] `app/config.py` — settings via pydantic-settings
- [x] `app/supabase_client.py` — singleton do client
- [x] `app/dependencies.py` — get_current_user, require_role
- [x] `app/main.py` — FastAPI, CORS, routers
- [x] `app/models/user.py`
- [x] `app/models/workout.py`
- [x] `app/models/session.py`
- [x] `app/routers/auth.py` — approve-coach, link-student
- [x] `app/routers/workouts.py` — CRUD fichas e exercícios, today
- [x] `app/routers/sessions.py` — start, log, finish
- [x] `app/routers/dashboard.py` — coach e student
- [x] `supabase/schema.sql` — tabelas + RLS + triggers

### Frontend
- [x] Scaffolding Vite + React + TS + Tailwind
- [x] `lib/supabase.ts`
- [x] `lib/api.ts`
- [x] `contexts/AuthContext.tsx`
- [x] `hooks/useAuth.ts`
- [x] `hooks/useSession.ts`
- [x] `router/ProtectedRoute.tsx`
- [x] `components/AppLayout.tsx`
- [x] `components/Sidebar.tsx` (desktop)
- [x] `components/BottomNav.tsx` (mobile)
- [x] `components/KpiCard.tsx`
- [x] `components/ExerciseCard.tsx`
- [x] `components/SetBubble.tsx`
- [x] `components/LogInput.tsx`
- [x] `pages/Login.tsx`
- [x] `pages/student/Today.tsx`
- [x] `pages/student/History.tsx`
- [x] `pages/coach/Dashboard.tsx`
- [x] `pages/coach/Students.tsx`
- [x] `pages/coach/StudentDetail.tsx`
- [x] `pages/admin/Coaches.tsx`

### Próximos passos (pós-v0)
- [ ] Configurar Supabase (criar projeto, rodar schema.sql)
- [ ] Setar env vars (ver tabela abaixo)
- [ ] Testar fluxo completo: login → aluno executa treino → coach vê no dashboard
- [ ] Deploy backend no Railway
- [ ] Deploy frontend no Cloudflare Pages

---

## Variáveis de Ambiente

### `backend/.env`

| Variável | Onde encontrar no Supabase | Exemplo |
|----------|---------------------------|---------|
| `SUPABASE_URL` | Settings → API → **Project URL** | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → **service_role** (secret, não expor no FE) | `eyJhbGci...` |
| `SUPABASE_JWT_SECRET` | Settings → API → JWT Settings → **JWT Secret** | `super-secret-jwt...` |
| `ALLOWED_ORIGINS` | URLs permitidas (separar por vírgula) | `http://localhost:5173,https://xxx.pages.dev` |

### `frontend/.env`

| Variável | Onde encontrar no Supabase | Exemplo |
|----------|---------------------------|---------|
| `VITE_SUPABASE_URL` | Settings → API → **Project URL** | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Settings → API → **anon / public** key | `eyJhbGci...` |
| `VITE_API_BASE_URL` | URL do backend rodando | `http://localhost:8000` |

---

## Setup do Supabase (após criar o projeto)

1. Abrir o **SQL Editor** no dashboard do Supabase
2. Executar o conteúdo de `backend/supabase/schema.sql`
3. Em **Authentication → Providers**, habilitar **Google**
4. Em **Authentication → URL Configuration**, adicionar:
   - `http://localhost:5173/**`
   - `https://seu-dominio.pages.dev/**`

### Atribuir role a um usuário (via SQL Editor)

```sql
-- Após o usuário criar conta, definir role:
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "coach"}'
where email = 'coach@exemplo.com';

-- Para admin:
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'
where email = 'admin@exemplo.com';
```

> O trigger `handle_new_user` cria automaticamente o registro em `profiles`, `coaches` ou `students` com base na role.

---

## Rodando Localmente

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env       # preencher as vars
uvicorn app.main:app --reload
# API disponível em http://localhost:8000
# Docs em http://localhost:8000/docs
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env       # preencher as vars
npm run dev
# App disponível em http://localhost:5173
```

---

## Deploy

### Backend → Railway

1. Conectar o repositório no Railway
2. Configurar env vars no painel (as mesmas do `backend/.env`)
3. O `Procfile` já define o comando de start

### Frontend → Cloudflare Pages

1. Conectar repositório no Cloudflare Pages
2. **Root directory**: `frontend`
3. **Build command**: `npm run build`
4. **Build output directory**: `dist`
5. Configurar env vars (`VITE_*`) no painel do Cloudflare Pages

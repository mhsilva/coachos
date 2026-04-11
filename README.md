# CoachOS

Plataforma de gestão entre treinadores e alunos. Coaches criam fichas de treino, alunos executam e registram cargas — coaches acompanham a evolução em tempo real.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | FastAPI + Python 3.12+ |
| Banco | Supabase (Postgres) |
| Auth | Supabase Auth (Google + email/senha) |
| Frontend | React 18 + Vite + TypeScript |
| Estilo | Tailwind CSS v3 |
| Deploy BE | Railway |
| Deploy FE | Cloudflare Pages |

---

## Estrutura do Repositório

```
coachos/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── dependencies.py
│   │   ├── supabase_client.py
│   │   ├── routers/        # auth, workouts, sessions, dashboard
│   │   └── models/         # schemas Pydantic
│   ├── supabase/
│   │   └── schema.sql      # tabelas + RLS + triggers
│   ├── requirements.txt
│   ├── Procfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/     # AppLayout, Sidebar, BottomNav, ExerciseCard…
│   │   ├── pages/          # Login, coach/, student/, admin/
│   │   ├── hooks/          # useAuth, useSession
│   │   ├── contexts/       # AuthContext
│   │   ├── lib/            # supabase.ts, api.ts
│   │   └── router/         # ProtectedRoute
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   └── .env.example
├── CONTEXT.md              # spec completa do projeto
├── PLAN.md                 # checklist + guia de setup e deploy
└── README.md
```

---

## Rodando Localmente

### Pré-requisitos

- Python 3.12+
- Node 18+
- Projeto Supabase criado ([supabase.com](https://supabase.com))

### 1. Banco de dados

No **SQL Editor** do Supabase, execute o conteúdo de `backend/supabase/schema.sql`.

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # preencha as variáveis
uvicorn app.main:app --reload
```

API disponível em `http://localhost:8000` · Docs em `http://localhost:8000/docs`

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env        # preencha as variáveis
npm run dev
```

App disponível em `http://localhost:5173`

---

## Variáveis de Ambiente

### `backend/.env`

| Variável | Onde encontrar |
|----------|---------------|
| `SUPABASE_URL` | Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role (nunca expor no frontend) |
| `SUPABASE_JWT_SECRET` | Settings → API → JWT Settings → JWT Secret |
| `ALLOWED_ORIGINS` | URLs permitidas separadas por vírgula |

### `frontend/.env`

| Variável | Onde encontrar |
|----------|---------------|
| `VITE_SUPABASE_URL` | Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Settings → API → anon / public key |
| `VITE_API_BASE_URL` | URL do backend |

---

## Roles

| Role | Acesso |
|------|--------|
| `admin` | Aprova e gerencia coaches |
| `coach` | Cria fichas, vincula alunos, acompanha progresso |
| `student` | Executa treinos, registra cargas |

Para atribuir uma role após o usuário criar conta, execute no SQL Editor do Supabase:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "coach"}'
where email = 'coach@exemplo.com';
```

---

## Deploy

### Backend → Railway

1. Novo projeto → Deploy from GitHub → seleciona este repo
2. **Root Directory:** `backend`
3. Configura as env vars em **Variables**
4. O `Procfile` define o comando de start automaticamente

### Frontend → Cloudflare Pages

1. Novo projeto → Connect to Git → seleciona este repo
2. **Root directory:** `frontend` · **Build command:** `npm run build` · **Output:** `dist`
3. Configura as env vars (`VITE_*`) no painel
4. Em **Authentication → URL Configuration** no Supabase, adiciona a URL gerada pelo Cloudflare

---

## Rotas da API

```
GET  /health
POST /auth/approve-coach
POST /auth/link-student
GET  /workouts/today
POST /workouts/plans
POST /workouts/plans/{plan_id}/workouts
POST /workouts/{workout_id}/exercises
POST /sessions/start
POST /sessions/{session_id}/log
PATCH /sessions/{session_id}/finish
GET  /dashboard/coach
GET  /dashboard/student/{student_id}
```

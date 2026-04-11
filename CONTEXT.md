# CoachOS — Contexto do Projeto

## O que é

Plataforma de gestão entre treinadores e alunos. Coaches criam fichas de treino, alunos executam e registram cargas; coaches acompanham a evolução em tempo real.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | FastAPI (Python 3.12+) |
| Auth | Supabase JWT (middleware manual, sem libs extras) |
| Banco | Supabase / Postgres (queries via `supabase-py`, sem ORM) |
| Frontend | React 18 + Vite + TypeScript estrito |
| Estilo | Tailwind CSS v3 (design system próprio, sem UI libraries) |
| Roteamento | React Router v6 |
| Auth client | `@supabase/supabase-js` |
| Deploy BE | Railway |
| Deploy FE | Cloudflare Pages |

## Estrutura do Monorepo

```
coachos/
├── backend/
├── frontend/
├── CONTEXT.md   ← este arquivo
└── PLAN.md      ← plano de implementação e checklist
```

## Roles

| Role | Pode fazer |
|------|-----------|
| `admin` | Cadastra e ativa coaches |
| `coach` | Cria fichas, vincula alunos, vê dashboard de progresso |
| `student` | Vê e executa treinos, registra cargas e reps |

- Coach precisa ser ativado pelo admin antes de operar
- Aluno é vinculado ao coach pelo email (após criar conta)
- Login: Google SSO ou email/senha (ambos via Supabase Auth)

## Design System

```
--teal:       #16323F   (sidebar, headers, texto primário)
--copper:     #B76E4D   (CTAs, acento, estado ativo)
--gray:       #ECECEC   (backgrounds, bordas suaves)
--surface:    #F4F4F2   (fundo geral)
--white:      #FFFFFF   (cards)
```

**Regras:**
- Sidebar: fundo `teal`, texto branco
- Botões primários: `copper` com `shadow-[0_2px_8px_rgba(183,110,77,0.28)]`
- Cards: branco, `border-teal/9`, shadow sutil, `rounded-[12px]`
- Inputs: `border-teal/15`, `rounded-[9px]`, focus `border-copper`
- Fontes: Syne 800 (títulos), Inter (corpo), JetBrains Mono (números/cargas)
- `letter-spacing: -0.02em` em títulos de página

## Layout — Responsivo (P0)

- **Mobile**: sem sidebar; bottom nav fixo com 2–3 ítens (curtos)
- **Desktop** (md+): sidebar fixa à esquerda (256px); sem bottom nav
- Todas as páginas usam o componente `AppLayout`

## Banco de Dados (schema completo em `backend/supabase/schema.sql`)

Tabelas principais:
- `profiles` — espelha `auth.users`, guarda role
- `coaches` — record de coach com `approved_at`
- `students` — vincula aluno ao coach
- `workout_plans` — ficha (fixed_days ou sequence)
- `workouts` — sessões dentro da ficha
- `exercises` — exercícios de um workout
- `workout_sessions` — aluno inicia treino
- `set_logs` — cada série registrada

## Rotas Backend

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

## Páginas Frontend

| Path | Role | Descrição |
|------|------|-----------|
| `/login` | — | Login Google + email/senha |
| `/coach` | coach | Dashboard com KPIs e atualizações recentes |
| `/coach/students` | coach | Lista de alunos + modal para vincular |
| `/coach/students/:id` | coach | Histórico e progressão de carga |
| `/student` | student | Treino do dia + execução de séries |
| `/student/history` | student | Histórico de sessões |
| `/admin` | admin | Lista de coaches com approve/deactivate |

## Observações

- TypeScript estrito no frontend (sem `any` explícito)
- Apenas function components com hooks
- Sem Redux, sem UI libraries externas
- Erros HTTP semânticos no backend: 401, 403, 404, 422
- Comentários de código em inglês
- Texto de UI em português brasileiro

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import auth, workouts, sessions, dashboard, notifications, chats, students, catalog, assessments, coach_assistant

app = FastAPI(title="CoachOS API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(workouts.router, prefix="/workouts", tags=["workouts"])
app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
app.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
app.include_router(chats.router, prefix="/chats", tags=["chats"])
app.include_router(students.router, prefix="/students", tags=["students"])
app.include_router(catalog.router, prefix="/catalog", tags=["catalog"])
app.include_router(assessments.router, prefix="/assessments", tags=["assessments"])
app.include_router(coach_assistant.router, prefix="/coach-assistant", tags=["coach-assistant"])


@app.get("/health", tags=["health"])
async def health() -> dict:
    return {"status": "ok"}

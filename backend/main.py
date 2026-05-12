from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Initialize Firebase as early as possible
from config import firebase_config  # noqa: F401

from config.settings import ALLOWED_ORIGINS
from routers import auth as auth_router
from routers import courses as courses_router
from routers import attendance as attendance_router
from routers import students as students_router


app = FastAPI(title="Smart Attendance API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/api/auth", tags=["auth"])
app.include_router(courses_router.router, prefix="/api/courses", tags=["courses"])
app.include_router(attendance_router.router, prefix="/api/attendance", tags=["attendance"])
app.include_router(students_router.router, prefix="/api/students", tags=["students"])


@app.get("/")
async def root():
    return {"message": "Smart Attendance API is running"}


@app.get("/health")
async def health():
    return {"status": "ok"}

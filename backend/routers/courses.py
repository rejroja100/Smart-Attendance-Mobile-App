from fastapi import APIRouter, Depends, Request, HTTPException

from middleware.auth_middleware import verify_firebase_token, require_role
from models.course import CourseRequest, EnrollRequest
from services import course_service, attendance_service

router = APIRouter()


def _attach_class_count(course: dict) -> dict:
    """Compute total unique class dates for a course and attach as `totalClasses`."""
    records = attendance_service.list_course_attendance(course.get("id"))
    course["totalClasses"] = len({r.get("date") for r in records if r.get("date")})
    return course


@router.get("/teacher")
async def get_teacher_courses(
    request: Request,
    _user: dict = Depends(require_role("teacher")),
):
    courses = course_service.list_teacher_courses(request.state.uid)
    return [_attach_class_count(c) for c in courses]


@router.get("/student")
async def get_student_courses(
    request: Request,
    _user: dict = Depends(require_role("student")),
):
    courses = course_service.list_student_courses(request.state.uid)
    return [_attach_class_count(c) for c in courses]


@router.post("")
async def create_course(
    payload: CourseRequest,
    request: Request,
    user: dict = Depends(require_role("teacher")),
):
    return course_service.create_course(
        name=payload.name,
        code=payload.code,
        teacher_uid=request.state.uid,
        teacher_name=user.get("name") or request.state.name or "",
    )


@router.delete("/{course_id}")
async def delete_course(
    course_id: str,
    request: Request,
    _user: dict = Depends(require_role("teacher")),
):
    return course_service.delete_course(course_id, request.state.uid)


@router.post("/{course_id}/enroll")
async def enroll_in_course(
    course_id: str,
    payload: EnrollRequest,
    request: Request,
    user: dict = Depends(require_role("student")),
):
    return course_service.enroll_student(
        course_id=course_id,
        student_uid=request.state.uid,
        student_email=user.get("email") or request.state.email or "",
        student_name=payload.studentName,
        student_roll=payload.studentRoll,
    )


@router.delete("/{course_id}/students/{student_id}")
async def remove_student(
    course_id: str,
    student_id: str,
    request: Request,
    _user: dict = Depends(require_role("teacher")),
):
    return course_service.remove_student(course_id, request.state.uid, student_id)


@router.get("/{course_id}")
async def get_course_details(
    course_id: str,
    request: Request,
    _token: dict = Depends(verify_firebase_token),
):
    course = course_service.get_course(course_id)
    uid = request.state.uid
    is_teacher = course.get("teacherId") == uid
    is_student = uid in (course.get("studentIds") or [])
    if not (is_teacher or is_student):
        raise HTTPException(status_code=403, detail="You do not have access to this course")
    return course

from fastapi import APIRouter, Depends, Request

from middleware.auth_middleware import require_role
from services import course_service, attendance_service

router = APIRouter()


def _status_for(percentage: float) -> str:
    if percentage >= 75:
        return "good"
    if percentage >= 50:
        return "warning"
    return "danger"


@router.get("/dashboard")
async def student_dashboard(
    request: Request,
    _user: dict = Depends(require_role("student")),
):
    uid = request.state.uid
    courses = course_service.list_student_courses(uid)

    summary = []
    for course in courses:
        course_id = course.get("id")
        records = attendance_service.list_course_attendance(course_id)

        # Group records for THIS student by date — present if ANY record True
        per_date: dict[str, bool] = {}
        for rec in records:
            if rec.get("studentId") != uid:
                continue
            date = rec.get("date")
            if not date:
                continue
            per_date[date] = per_date.get(date, False) or bool(rec.get("present"))

        total_classes = len(per_date)
        present_count = sum(1 for v in per_date.values() if v)
        percentage = round((present_count / total_classes * 100), 1) if total_classes > 0 else 0.0

        summary.append(
            {
                "id": course_id,
                "name": course.get("name"),
                "code": course.get("code"),
                "totalClasses": total_classes,
                "presentCount": present_count,
                "percentage": percentage,
                "status": _status_for(percentage),
            }
        )

    return {"courses": summary}

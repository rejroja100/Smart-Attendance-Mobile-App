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

        # `all_class_dates` counts every unique day the class actually met
        # (any record from any student on that date counts as "class held").
        # `per_date` is just THIS student's per-day attendance.
        # Without `all_class_dates`, a student who joined late would see
        # 100% even though they missed earlier classes.
        all_class_dates: set[str] = set()
        per_date: dict[str, bool] = {}
        for rec in records:
            date = rec.get("date")
            if not date:
                continue
            all_class_dates.add(date)
            if rec.get("studentId") != uid:
                continue
            per_date[date] = per_date.get(date, False) or bool(rec.get("present"))

        total_classes = len(all_class_dates)
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

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

        # Multiple committed sessions can happen on the same day, so we count
        # by `sessionId` (one per teacher's Accept), not by date. Records
        # without a sessionId are uncommitted auto bluetooth/code marks and
        # are ignored.
        all_sessions: set[str] = set()
        per_session: dict[str, bool] = {}
        for rec in records:
            sid = rec.get("sessionId")
            if not sid:
                continue
            all_sessions.add(sid)
            if rec.get("studentId") != uid:
                continue
            per_session[sid] = per_session.get(sid, False) or bool(rec.get("present"))

        total_classes = len(all_sessions)
        present_count = sum(1 for v in per_session.values() if v)
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

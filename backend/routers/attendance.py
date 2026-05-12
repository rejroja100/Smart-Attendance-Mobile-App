from datetime import datetime
from fastapi import APIRouter, Depends, Request, HTTPException, Query
from fastapi.responses import StreamingResponse

from middleware.auth_middleware import verify_firebase_token, require_role
from models.attendance import (
    CodeSubmitRequest,
    CodeVerifyRequest,
    ManualAttendanceRequest,
    BluetoothAttendanceRequest,
    BluetoothStartRequest,
)
from services import attendance_service, course_service
from services.export_service import ExportService, build_attendance_export_payload
from config.firebase_config import db

router = APIRouter()


# ---------------------------------------------------------------------------
# Code-based attendance
# ---------------------------------------------------------------------------

@router.post("/code/submit")
async def teacher_submit_code(
    payload: CodeSubmitRequest,
    request: Request,
    _user: dict = Depends(require_role("teacher")),
):
    return attendance_service.submit_teacher_code(
        course_id=payload.courseId,
        code=payload.code,
        teacher_uid=request.state.uid,
    )


@router.post("/code/verify")
async def student_verify_code(
    payload: CodeVerifyRequest,
    request: Request,
    _user: dict = Depends(require_role("student")),
):
    return attendance_service.verify_student_code(
        course_id=payload.courseId,
        code=payload.code,
        student_uid=request.state.uid,
    )


# ---------------------------------------------------------------------------
# Manual attendance
# ---------------------------------------------------------------------------

@router.post("/manual")
async def teacher_submit_manual(
    payload: ManualAttendanceRequest,
    request: Request,
    _user: dict = Depends(require_role("teacher")),
):
    return attendance_service.submit_manual(
        course_id=payload.courseId,
        teacher_uid=request.state.uid,
        records=payload.records,
    )


# ---------------------------------------------------------------------------
# Bluetooth attendance
# ---------------------------------------------------------------------------

@router.post("/bluetooth")
async def student_bluetooth(
    payload: BluetoothAttendanceRequest,
    request: Request,
    _user: dict = Depends(require_role("student")),
):
    return attendance_service.submit_bluetooth(
        course_id=payload.courseId,
        student_uid=request.state.uid,
    )


@router.post("/bluetooth/start")
async def bluetooth_start(
    payload: BluetoothStartRequest,
    request: Request,
    _user: dict = Depends(require_role("teacher")),
):
    return attendance_service.start_bluetooth(
        course_id=payload.courseId,
        teacher_uid=request.state.uid,
        teacher_device_id=payload.teacherDeviceId,
    )


@router.post("/bluetooth/stop")
async def bluetooth_stop(
    payload: BluetoothStartRequest,
    request: Request,
    _user: dict = Depends(require_role("teacher")),
):
    return attendance_service.stop_bluetooth(
        course_id=payload.courseId,
        teacher_uid=request.state.uid,
    )


# ---------------------------------------------------------------------------
# Listing & export
# ---------------------------------------------------------------------------

@router.get("/{course_id}")
async def get_attendance(
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
    return attendance_service.list_course_attendance(course_id)


@router.get("/{course_id}/export")
async def export_attendance(
    course_id: str,
    request: Request,
    format: str = Query("xlsx", pattern="^(xlsx|csv)$"),
    _user: dict = Depends(require_role("teacher")),
):
    course = course_service.get_course(course_id)
    course_service.assert_teacher_owns(course, request.state.uid)

    if db is None:
        raise HTTPException(status_code=500, detail="Firestore is not configured")

    course, students, attendance_map, dates = build_attendance_export_payload(course, db)

    today = datetime.now().strftime("%Y-%m-%d")
    safe_code = (course.get("code") or "course").replace("/", "_").replace(" ", "_")

    if format == "csv":
        buf = ExportService.generate_csv(course, students, attendance_map, dates)
        filename = f"attendance_{safe_code}_{today}.csv"
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # default: xlsx
    buf = ExportService.generate_excel(course, students, attendance_map, dates)
    filename = f"attendance_{safe_code}_{today}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

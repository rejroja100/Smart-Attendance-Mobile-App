from datetime import datetime, timedelta, timezone
from typing import List, Iterable
from fastapi import HTTPException
from google.cloud.firestore_v1.base_query import FieldFilter

from config.firebase_config import db
from utils.helpers import today_str, now_iso, serialize_doc, new_session_id
from services.course_service import get_course, assert_teacher_owns


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_db():
    if db is None:
        raise HTTPException(status_code=500, detail="Firestore is not configured")
    return db


def _attendance_doc_id(course_id: str, student_id: str) -> str:
    return f"{course_id}_{student_id}"


def _record_attendance(
    course_id: str,
    student_id: str,
    method: str,
    present: bool = True,
    session_id: str | None = None,
    replace_pending_today: bool = False,
) -> dict:
    """Append an attendance record to attendance/{courseId}_{studentId}.

    Each committed attendance session gets its own `session_id`. Auto-records
    from Bluetooth or Code submissions are written with `session_id=None`
    ("pending") and only become committed when the teacher's manual Accept
    runs, which calls this with `replace_pending_today=True` — that wipes
    today's pending records for the student and writes the manual record with
    a fresh `session_id`.
    """
    database = _require_db()
    doc_id = _attendance_doc_id(course_id, student_id)
    ref = database.collection("attendance").document(doc_id)

    ref.set(
        {
            "studentId": student_id,
            "courseId": course_id,
        },
        merge=True,
    )

    snap = ref.get()
    data = snap.to_dict() or {}
    records: list = list(data.get("records", []) or [])

    today = today_str()
    if replace_pending_today:
        # Drop any of today's records that aren't tied to a committed session
        # — those are the auto bluetooth/code records the manual submit
        # supersedes.
        records = [
            r for r in records
            if not (r.get("date") == today and not r.get("sessionId"))
        ]

    new_record = {
        "date": today,
        "sessionId": session_id,
        "present": bool(present),
        "method": method,
        "timestamp": now_iso(),
    }
    records.append(new_record)

    ref.update({"records": records})
    return new_record


# ---------------------------------------------------------------------------
# Code-based attendance
# ---------------------------------------------------------------------------

def submit_teacher_code(course_id: str, code: str, teacher_uid: str) -> dict:
    if not code or len(code) != 6 or not code.isalnum():
        raise HTTPException(
            status_code=400,
            detail="Code must be exactly 6 alphanumeric characters",
        )

    # Ensure teacher owns the course
    course = get_course(course_id)
    assert_teacher_owns(course, teacher_uid)

    started_at = datetime.now(timezone.utc)
    expires_at = started_at + timedelta(seconds=40)
    code_upper = code.upper()

    payload = {
        "code": code_upper,
        "expiresAt": expires_at,
        "createdBy": teacher_uid,
        "courseId": course_id,
        "startedAt": started_at,
    }
    _require_db().collection("codes").document(course_id).set(payload)

    return {
        "code": code_upper,
        "expiresAt": expires_at.isoformat(),
        "expiresInSeconds": 40,
    }


def verify_student_code(course_id: str, code: str, student_uid: str) -> dict:
    database = _require_db()
    snap = database.collection("codes").document(course_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="No active session for this course")

    data = snap.to_dict() or {}
    stored_code = (data.get("code") or "").upper()
    submitted = (code or "").upper()

    if stored_code != submitted:
        raise HTTPException(status_code=400, detail="Incorrect code. Try again.")

    expires_at = data.get("expiresAt")
    # Firestore returns datetime; normalize to aware UTC
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
    else:
        # If it's stored as ISO string for any reason
        try:
            expires_at = datetime.fromisoformat(str(expires_at))
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
        except Exception:
            raise HTTPException(status_code=500, detail="Invalid code expiry on server")

    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400,
            detail="Code has expired. Ask your teacher for a new one.",
        )

    record = _record_attendance(course_id, student_uid, "code", present=True)
    return {"success": True, "record": record}


# ---------------------------------------------------------------------------
# Manual attendance
# ---------------------------------------------------------------------------

def submit_manual(course_id: str, teacher_uid: str, records: Iterable) -> dict:
    course = get_course(course_id)
    assert_teacher_owns(course, teacher_uid)

    # Single sessionId for every student in this Accept submission — that's
    # what makes it one "class" in the dashboard / class count.
    session_id = new_session_id()

    count = 0
    for rec in records:
        # rec may be a Pydantic model or a dict
        student_id = getattr(rec, "studentId", None) or rec.get("studentId")
        present = getattr(rec, "present", None)
        if present is None:
            present = rec.get("present")
        _record_attendance(
            course_id,
            student_id,
            "manual",
            present=bool(present),
            session_id=session_id,
            replace_pending_today=True,
        )
        count += 1

    return {"success": True, "count": count, "sessionId": session_id}


# ---------------------------------------------------------------------------
# Bluetooth attendance
# ---------------------------------------------------------------------------

def start_bluetooth(course_id: str, teacher_uid: str, teacher_device_id: str) -> dict:
    course = get_course(course_id)
    assert_teacher_owns(course, teacher_uid)

    started_at = datetime.now(timezone.utc)
    payload = {
        "teacherId": teacher_uid,
        "teacherDeviceId": teacher_device_id,
        "courseId": course_id,
        "startedAt": started_at,
        "stoppedAt": None,
        "active": True,
    }
    _require_db().collection("bluetooth_sessions").document(course_id).set(payload)
    return {"success": True, "startedAt": started_at.isoformat(), "active": True}


def stop_bluetooth(course_id: str, teacher_uid: str) -> dict:
    course = get_course(course_id)
    assert_teacher_owns(course, teacher_uid)

    stopped_at = datetime.now(timezone.utc)
    _require_db().collection("bluetooth_sessions").document(course_id).update(
        {"active": False, "stoppedAt": stopped_at}
    )
    return {"success": True, "stoppedAt": stopped_at.isoformat(), "active": False}


def submit_bluetooth(course_id: str, student_uid: str) -> dict:
    database = _require_db()
    snap = database.collection("bluetooth_sessions").document(course_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="No bluetooth session for this course")

    data = snap.to_dict() or {}
    if not data.get("active"):
        raise HTTPException(status_code=400, detail="Bluetooth session is not active")

    started_at = data.get("startedAt")
    if isinstance(started_at, datetime):
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
    else:
        try:
            started_at = datetime.fromisoformat(str(started_at))
            if started_at.tzinfo is None:
                started_at = started_at.replace(tzinfo=timezone.utc)
        except Exception:
            raise HTTPException(status_code=500, detail="Invalid session start time on server")

    if datetime.now(timezone.utc) - started_at > timedelta(hours=2):
        raise HTTPException(status_code=400, detail="Bluetooth session has expired")

    record = _record_attendance(course_id, student_uid, "bluetooth", present=True)
    return {"success": True, "record": record}


# ---------------------------------------------------------------------------
# Listing
# ---------------------------------------------------------------------------

def list_course_attendance(course_id: str) -> List[dict]:
    """Flatten records for a course into a list of {studentId, date, present, method, timestamp}."""
    database = _require_db()
    try:
        query = database.collection("attendance").where(
            filter=FieldFilter("courseId", "==", course_id)
        )
    except Exception:
        query = database.collection("attendance").where("courseId", "==", course_id)

    flattened: List[dict] = []
    for doc in query.stream():
        data = doc.to_dict() or {}
        student_id = data.get("studentId")
        for rec in data.get("records", []) or []:
            flattened.append(
                {
                    "studentId": student_id,
                    "date": rec.get("date"),
                    "present": rec.get("present"),
                    "method": rec.get("method"),
                    "timestamp": rec.get("timestamp"),
                }
            )
    return flattened

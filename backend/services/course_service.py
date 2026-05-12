from typing import List
from fastapi import HTTPException
from google.cloud.firestore_v1.base_query import FieldFilter

from config.firebase_config import db
from utils.helpers import now_iso, serialize_doc


def _collection():
    if db is None:
        raise HTTPException(status_code=500, detail="Firestore is not configured")
    return db.collection("courses")


def list_teacher_courses(uid: str) -> List[dict]:
    try:
        query = _collection().where(filter=FieldFilter("teacherId", "==", uid))
    except Exception:
        # Older client compatibility
        query = _collection().where("teacherId", "==", uid)
    return [serialize_doc(doc) for doc in query.stream()]


def list_student_courses(uid: str) -> List[dict]:
    try:
        query = _collection().where(filter=FieldFilter("studentIds", "array_contains", uid))
    except Exception:
        query = _collection().where("studentIds", "array_contains", uid)
    return [serialize_doc(doc) for doc in query.stream()]


def create_course(name: str, code: str, teacher_uid: str, teacher_name: str) -> dict:
    coll = _collection()
    ref = coll.document()
    payload = {
        "id": ref.id,
        "name": name,
        "code": code,
        "teacherId": teacher_uid,
        "teacherName": teacher_name or "",
        "studentIds": [],
        "enrolledStudents": [],
        "createdAt": now_iso(),
    }
    ref.set(payload)
    return payload


def get_course(course_id: str) -> dict:
    snap = _collection().document(course_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Course not found")
    return serialize_doc(snap)


def assert_teacher_owns(course: dict, teacher_uid: str) -> None:
    if course.get("teacherId") != teacher_uid:
        raise HTTPException(status_code=403, detail="You do not own this course")


def delete_course(course_id: str, teacher_uid: str) -> dict:
    course = get_course(course_id)
    assert_teacher_owns(course, teacher_uid)
    _collection().document(course_id).delete()
    return {"success": True, "id": course_id}


def enroll_student(
    course_id: str,
    student_uid: str,
    student_email: str,
    student_name: str,
    student_roll: str,
) -> dict:
    ref = _collection().document(course_id)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Course not found")

    course = snap.to_dict() or {}
    student_ids: list = list(course.get("studentIds", []) or [])
    enrolled: list = list(course.get("enrolledStudents", []) or [])

    if student_uid not in student_ids:
        student_ids.append(student_uid)

    if not any((s or {}).get("id") == student_uid for s in enrolled):
        enrolled.append(
            {
                "id": student_uid,
                "name": student_name or "",
                "email": student_email or "",
                "roll": student_roll or "",
            }
        )

    ref.update({"studentIds": student_ids, "enrolledStudents": enrolled})

    course["studentIds"] = student_ids
    course["enrolledStudents"] = enrolled
    course["id"] = course_id
    return course


def remove_student(course_id: str, teacher_uid: str, student_id: str) -> dict:
    course = get_course(course_id)
    assert_teacher_owns(course, teacher_uid)

    student_ids = [sid for sid in (course.get("studentIds") or []) if sid != student_id]
    enrolled = [s for s in (course.get("enrolledStudents") or []) if (s or {}).get("id") != student_id]

    _collection().document(course_id).update(
        {"studentIds": student_ids, "enrolledStudents": enrolled}
    )

    course["studentIds"] = student_ids
    course["enrolledStudents"] = enrolled
    return course

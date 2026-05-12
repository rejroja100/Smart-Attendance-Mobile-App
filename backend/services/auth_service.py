from typing import Optional
from fastapi import HTTPException

from config.firebase_config import db
from utils.helpers import now_iso


def get_or_create_user(
    uid: str,
    email: Optional[str],
    name: Optional[str],
    photoURL: Optional[str],
    role: str,
) -> dict:
    """Fetch users/{uid} or create it if missing. Updates name/photoURL if present."""
    if db is None:
        raise HTTPException(status_code=500, detail="Firestore is not configured")

    if role not in ("teacher", "student"):
        raise HTTPException(status_code=400, detail="role must be 'teacher' or 'student'")

    ref = db.collection("users").document(uid)
    snap = ref.get()

    if not snap.exists:
        user = {
            "uid": uid,
            "name": name or "",
            "email": email or "",
            "role": role,
            "photoURL": photoURL or "",
            "createdAt": now_iso(),
        }
        ref.set(user)
        return user

    user = snap.to_dict() or {}
    user["uid"] = uid

    updates = {}
    if name and user.get("name") != name:
        updates["name"] = name
    if photoURL and user.get("photoURL") != photoURL:
        updates["photoURL"] = photoURL
    if updates:
        ref.update(updates)
        user.update(updates)

    return user


def get_user(uid: str) -> dict:
    if db is None:
        raise HTTPException(status_code=500, detail="Firestore is not configured")

    snap = db.collection("users").document(uid).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="User not found")

    user = snap.to_dict() or {}
    user["uid"] = uid
    return user

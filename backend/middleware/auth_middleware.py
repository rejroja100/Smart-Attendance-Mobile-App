from fastapi import Request, HTTPException, status, Depends
from typing import Optional

from config.firebase_config import db, auth


async def verify_firebase_token(request: Request) -> dict:
    """Verify the Firebase ID token from the Authorization header.

    Sets request.state.uid/email/name/picture and returns the decoded token.
    Raises HTTPException(401) on missing or invalid token.
    """
    auth_header: Optional[str] = request.headers.get("Authorization") or request.headers.get(
        "authorization"
    )
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
        )

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Empty bearer token",
        )

    try:
        decoded = auth.verify_id_token(token)
    except Exception as exc:  # noqa: BLE001 - firebase raises various subclasses
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
        )

    request.state.uid = decoded.get("uid")
    request.state.email = decoded.get("email")
    request.state.name = decoded.get("name") or decoded.get("displayName")
    request.state.picture = decoded.get("picture")
    request.state.token = decoded
    return decoded


def require_role(role: str):
    """Dependency factory that requires the authenticated user to have a given role."""

    async def _checker(request: Request, _: dict = Depends(verify_firebase_token)) -> dict:
        if db is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Firestore is not configured on the server",
            )

        uid = getattr(request.state, "uid", None)
        if not uid:
            raise HTTPException(status_code=401, detail="Unable to determine current user")

        snap = db.collection("users").document(uid).get()
        if not snap.exists:
            raise HTTPException(status_code=403, detail="User profile not found")

        user = snap.to_dict() or {}
        user["uid"] = uid
        if user.get("role") != role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires the '{role}' role",
            )

        request.state.user = user
        return user

    return _checker

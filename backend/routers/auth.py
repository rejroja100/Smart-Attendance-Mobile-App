from fastapi import APIRouter, Depends, Request, HTTPException

from middleware.auth_middleware import verify_firebase_token
from models.user import LoginRequest, UserResponse
from services.auth_service import get_or_create_user, get_user
from config.firebase_config import auth as fb_auth

router = APIRouter()


@router.post("/login", response_model=UserResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    _token: dict = Depends(verify_firebase_token),
):
    uid = request.state.uid
    user = get_or_create_user(
        uid=uid,
        email=request.state.email,
        name=request.state.name,
        photoURL=request.state.picture,
        role=payload.role,
    )
    return UserResponse(
        uid=user["uid"],
        name=user.get("name"),
        email=user.get("email"),
        role=user.get("role"),
        photoURL=user.get("photoURL"),
    )


@router.get("/me", response_model=UserResponse)
async def me(request: Request, _token: dict = Depends(verify_firebase_token)):
    uid = request.state.uid
    user = get_user(uid)
    return UserResponse(
        uid=user["uid"],
        name=user.get("name"),
        email=user.get("email"),
        role=user.get("role"),
        photoURL=user.get("photoURL"),
    )


@router.post("/logout")
async def logout(request: Request, _token: dict = Depends(verify_firebase_token)):
    uid = request.state.uid
    try:
        fb_auth.revoke_refresh_tokens(uid)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to revoke tokens: {exc}")
    return {"message": "Logged out successfully"}

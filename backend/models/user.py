from typing import Optional
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    role: str = Field(..., description="Either 'teacher' or 'student'")


class UserResponse(BaseModel):
    uid: str
    name: Optional[str] = None
    email: Optional[str] = None
    role: str
    photoURL: Optional[str] = None

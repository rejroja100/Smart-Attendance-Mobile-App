import os
from dotenv import load_dotenv

load_dotenv()


def _parse_origins(raw: str) -> list[str]:
    if not raw:
        return ["*"]
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    return parts or ["*"]


ALLOWED_ORIGINS: list[str] = _parse_origins(os.getenv("ALLOWED_ORIGINS", "*"))
FIREBASE_PROJECT_ID: str = os.getenv("FIREBASE_PROJECT_ID", "")
SECRET_KEY: str = os.getenv("SECRET_KEY", "change-me")

from datetime import datetime, timezone


def today_str() -> str:
    """Return today's date in YYYY-MM-DD format (UTC)."""
    return datetime.utcnow().strftime("%Y-%m-%d")


def now_iso() -> str:
    """Return current UTC time as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


def serialize_doc(snapshot) -> dict:
    """Serialize a Firestore DocumentSnapshot into a plain dict including its id."""
    data = snapshot.to_dict() or {}
    return {**data, "id": snapshot.id}

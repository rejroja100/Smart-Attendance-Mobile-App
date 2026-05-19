import uuid
from datetime import datetime, timezone


def today_str() -> str:
    """Return today's date in YYYY-MM-DD format (UTC)."""
    return datetime.utcnow().strftime("%Y-%m-%d")


def now_iso() -> str:
    """Return current UTC time as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


def new_session_id() -> str:
    """Generate a unique identifier for an attendance session.

    Each committed attendance session (one teacher Accept) gets its own ID so
    multiple sessions on the same day are counted as separate classes by the
    student dashboard and the per-course class count.
    """
    return uuid.uuid4().hex[:16]


def serialize_doc(snapshot) -> dict:
    """Serialize a Firestore DocumentSnapshot into a plain dict including its id."""
    data = snapshot.to_dict() or {}
    return {**data, "id": snapshot.id}

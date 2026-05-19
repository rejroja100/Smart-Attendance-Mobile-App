"""One-time migration: backfill sessionId on legacy attendance records.

The multi-session schema introduced a `sessionId` field on every attendance
record. Records written before the schema change don't have one, and the new
dashboard / class-count logic ignores records without a sessionId — which
is why old courses show 0 classes and 0% after deploying the new backend.

This script walks every `attendance/{courseId}_{studentId}` document, groups
each student's records by date, and assigns a deterministic 16-char session
id derived from (courseId, date) to every record that doesn't already have
one. Because the id is deterministic, all of today's-old students share the
same sessionId for a given date — so a date that previously counted as 1
class still counts as 1 class. Re-running the script is safe (idempotent).

Usage (from your PC):

    cd backend
    .venv\\Scripts\\activate
    python scripts/migrate_session_ids.py

Requires the same serviceAccountKey.json the backend uses.
"""
from __future__ import annotations

import hashlib
import os
import sys

# Make `config` and `services` importable when running this file directly.
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))  # backend/

from config.firebase_config import db  # noqa: E402


def deterministic_session_id(course_id: str, date: str) -> str:
    """Stable 16-hex-char id from (course_id, date)."""
    h = hashlib.sha1(f"{course_id}|{date}".encode("utf-8")).hexdigest()
    return h[:16]


def migrate() -> None:
    if db is None:
        print("ERROR: Firestore is not configured. Make sure serviceAccountKey.json")
        print("is present in the backend/ folder and GOOGLE_APPLICATION_CREDENTIALS")
        print("points to it (see backend/.env).")
        return

    print("Scanning attendance/ collection...")
    docs = list(db.collection("attendance").stream())
    print(f"Found {len(docs)} attendance documents.\n")

    updated_docs = 0
    backfilled_records = 0
    skipped_records = 0

    for doc in docs:
        data = doc.to_dict() or {}
        course_id = data.get("courseId")
        records = list(data.get("records", []) or [])

        if not course_id or not records:
            continue

        modified = False
        new_records = []
        for r in records:
            if r.get("sessionId"):
                # Already migrated or written by new code — skip.
                skipped_records += 1
                new_records.append(r)
                continue

            date = r.get("date")
            if not date:
                # Can't migrate without a date. Leave as-is.
                new_records.append(r)
                continue

            # Backfill with a deterministic id keyed on (course, date) so
            # records from the same legacy day end up in the same session
            # — which preserves the old behaviour of "one date = one class".
            r["sessionId"] = deterministic_session_id(course_id, date)
            backfilled_records += 1
            modified = True
            new_records.append(r)

        if modified:
            doc.reference.update({"records": new_records})
            updated_docs += 1
            print(f"  Updated attendance/{doc.id}: {len(new_records)} records")

    print()
    print("=" * 60)
    print("Migration complete.")
    print(f"  Documents touched : {updated_docs}")
    print(f"  Records backfilled: {backfilled_records}")
    print(f"  Records skipped   : {skipped_records} (already had sessionId)")
    print("=" * 60)


if __name__ == "__main__":
    migrate()

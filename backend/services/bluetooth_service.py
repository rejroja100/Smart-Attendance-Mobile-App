"""Thin wrappers around the bluetooth functions in attendance_service.

Kept as a separate module so routers can import a clear, dedicated namespace
for bluetooth operations.
"""

from services.attendance_service import (
    start_bluetooth,
    stop_bluetooth,
    submit_bluetooth,
)

__all__ = ["start_bluetooth", "stop_bluetooth", "submit_bluetooth"]

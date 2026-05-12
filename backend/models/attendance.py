from typing import List
from pydantic import BaseModel, Field


class CodeSubmitRequest(BaseModel):
    courseId: str
    code: str = Field(..., min_length=6, max_length=6)


class CodeVerifyRequest(BaseModel):
    courseId: str
    code: str = Field(..., min_length=6, max_length=6)


class ManualAttendanceRecord(BaseModel):
    studentId: str
    present: bool


class ManualAttendanceRequest(BaseModel):
    courseId: str
    records: List[ManualAttendanceRecord]


class BluetoothAttendanceRequest(BaseModel):
    courseId: str
    teacherDeviceId: str


class BluetoothStartRequest(BaseModel):
    courseId: str
    teacherDeviceId: str

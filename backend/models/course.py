from pydantic import BaseModel, Field


class CourseRequest(BaseModel):
    name: str = Field(..., min_length=1)
    code: str = Field(..., min_length=1)


class EnrollRequest(BaseModel):
    studentName: str = Field(..., min_length=1)
    studentRoll: str = Field(..., min_length=1)

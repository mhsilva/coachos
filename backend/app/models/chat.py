from pydantic import BaseModel, Field
from uuid import UUID


class CreateChatRequest(BaseModel):
    type: str = Field(..., description="Chat type (e.g. 'anamnese')")
    student_id: UUID


class SendMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)

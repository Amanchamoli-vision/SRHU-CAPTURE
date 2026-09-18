from pydantic import BaseModel, EmailStr, Field, field_validator


class CreateDeanRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("Name must not be empty")
        return normalized

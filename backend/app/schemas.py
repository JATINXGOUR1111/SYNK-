from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, EmailStr, Field, field_validator, HttpUrl
from .security import HANDLE_RE


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    name: str = Field(min_length=1, max_length=120)
    handle: str
    role: Literal["creator", "brand"]
    company: str | None = Field(default=None, max_length=160)

    @field_validator("handle")
    @classmethod
    def _h(cls, v: str) -> str:
        v = v.lower().lstrip("@")
        if not HANDLE_RE.match(v):
            raise ValueError("Handle must be 3-30 characters: letters, numbers, underscore.")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str


def _http_only(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    if not (v.startswith("http://") or v.startswith("https://") or v.startswith(("/uploads/", "/static/"))):
        raise ValueError("URL must use http or https.")
    return v


class UpdateMeIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    handle: str | None = None
    avatar_url: str | None = None
    banner_url: str | None = None
    company: str | None = None
    clear_avatar: bool = False
    clear_banner: bool = False

    @field_validator("handle")
    @classmethod
    def _h(cls, v):
        if v is None:
            return v
        v = v.lower().lstrip("@")
        if not HANDLE_RE.match(v):
            raise ValueError("Handle must be 3-30 characters: letters, numbers, underscore.")
        return v

    @field_validator("avatar_url", "banner_url")
    @classmethod
    def _u(cls, v):
        return _http_only(v)


class ProfileIn(BaseModel):
    headline: str | None = Field(default=None, max_length=200)
    bio: str | None = Field(default=None, max_length=2000)
    ideal_client: str | None = Field(default=None, max_length=1000)
    location: str | None = Field(default=None, max_length=120)
    links: list[str] | None = None
    specialties: list[str] | None = None
    tools: list[str] | None = None
    categories: list[str] | None = None
    mediums: list[str] | None = None
    price_min: int | None = Field(default=None, ge=0)
    price_max: int | None = Field(default=None, ge=0)
    turnaround_days: int | None = Field(default=None, ge=1, le=365)

    @field_validator("links")
    @classmethod
    def _l(cls, v):
        if v is None:
            return v
        for x in v:
            _http_only(x)
        return v[:6]


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=1000)
    parent_id: int | None = None


class CaptionIn(BaseModel):
    title: str = ""
    description: str = ""
    tools: list[str] = []
    tags: list[str] = []


class ClarifyIn(BaseModel):
    rough_idea: str = Field(min_length=3, max_length=2000)


class StructureIn(BaseModel):
    rough_idea: str = Field(min_length=3, max_length=2000)
    answers: dict[str, str] | list[Any] = {}


class BriefIn(BaseModel):
    rough_idea: str = Field(min_length=3, max_length=2000)
    structured: dict[str, Any]


class ProposalDraftIn(BaseModel):
    brief_id: int


class ProposalIn(BaseModel):
    brief_id: int
    text: str = Field(min_length=5, max_length=3000)
    price_inr: int = Field(ge=0)
    timeline_days: int = Field(ge=1, le=365)


class StatusIn(BaseModel):
    status: Literal["accepted", "rejected"]


class MilestoneIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    amount_inr: int = Field(ge=0)
    due_in_days: int = Field(ge=0, le=365)


class MilestonePatch(BaseModel):
    status: Literal["todo", "in_progress", "delivered", "approved"]


class ReviewIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)


class DirectConvIn(BaseModel):
    user_id: int


class MessageIn(BaseModel):
    body: str = Field(default="", max_length=3000)
    attachment_url: str | None = None

    @field_validator("attachment_url")
    @classmethod
    def _a(cls, v):
        return _http_only(v)

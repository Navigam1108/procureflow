from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Spec(BaseModel):
    model_config = ConfigDict(extra='forbid')
    category: Literal['laptop', 'monitor', 'chair'] | None = None
    quantity: int | None = Field(default=None, ge=1, le=1000)
    budget_limit: int | None = Field(default=None, ge=1, le=100000000)
    location: str | None = Field(default=None, max_length=100)
    deadline: str | None = None
    min_ram_gb: int = Field(default=16, ge=0, le=256)
    unsupported: bool = False


class NewRequest(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    description: str = Field(min_length=10, max_length=5000)
    department: Literal['Engineering', 'Design', 'Operations'] = 'Engineering'
    spec: Spec | None = None


class Clarification(BaseModel):
    message: str = Field(default='', max_length=3000)
    spec: Spec | None = None


class Review(BaseModel):
    revision: int = Field(ge=1)
    decision: Literal['approve', 'reject']
    note: str = Field(default='', max_length=1000)


class SupplierSelection(BaseModel):
    revision: int = Field(ge=1)
    offer_id: str = Field(min_length=1, max_length=40)
    reason: str = Field(min_length=5, max_length=1000)


class VendorSimulation(BaseModel):
    available: bool


class Login(BaseModel):
    persona: Literal['requester', 'approver'] = 'requester'
    token: str = Field(default='', max_length=1000)

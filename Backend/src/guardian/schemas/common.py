"""Shared schema bases: camelCase aliases, Money {raw, display}, error body."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Money(CamelModel):
    """Amounts are always base-unit integers as strings + a display string ("30.000")."""

    raw: str
    display: str


class ErrorDetail(CamelModel):
    code: str
    message: str


class ErrorBody(CamelModel):
    error: ErrorDetail


class Highlights(CamelModel):
    node_ids: list[str] = Field(default_factory=list)
    edge_ids: list[str] = Field(default_factory=list)


JsonDict = dict[str, Any]

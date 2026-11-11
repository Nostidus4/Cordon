"""AssistantAnswer (spec §9.3) + numbersVerified (spec §9.4)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from guardian.schemas.common import CamelModel, Highlights


class AskContext(CamelModel):
    screen: str | None = None
    principal_ids: list[str] | None = None
    proposal_id: int | None = None


class AskRequest(CamelModel):
    question: str  # question id ("simulate.huy_too") or its exact VI text
    context: AskContext | None = None


class NumberRef(CamelModel):
    label: str
    value: str
    source: Literal["simulate", "district", "proposal", "graph"]
    path: str


class AssistantWarning(CamelModel):
    code: Literal["CONFLICT_OF_INTEREST", "CONCENTRATION", "DATA_DECLARED"]
    text: str


class Suggestion(CamelModel):
    title: str
    change: dict[str, Any]


class AssistantAnswer(CamelModel):
    question_id: str
    answer: str
    numbers: list[NumberRef]
    highlight: Highlights
    suggestions: list[Suggestion] = Field(default_factory=list)
    warnings: list[AssistantWarning] = Field(default_factory=list)
    numbers_verified: bool

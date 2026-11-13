"""Table assistant_logs (numbers_verified flag)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from guardian.db.base import Base


class AssistantLog(Base):
    __tablename__ = "assistant_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    question: Mapped[str] = mapped_column(Text)
    tool_calls: Mapped[list[Any]] = mapped_column(JSONB)
    answer: Mapped[dict[str, Any]] = mapped_column(JSONB)
    numbers_verified: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

"""Table agent_runs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from guardian.db.base import Base


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    decision: Mapped[dict[str, Any]] = mapped_column(JSONB)
    reason_text: Mapped[str] = mapped_column(Text)
    reason_source: Mapped[str] = mapped_column(String)
    tx_hash: Mapped[str | None] = mapped_column(String)
    outcome: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

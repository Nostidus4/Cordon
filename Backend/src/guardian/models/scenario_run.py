"""Table scenario_runs (used for Replay)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from guardian.db.base import Base


class ScenarioRun(Base):
    __tablename__ = "scenario_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String)
    # seconds between steps, not money
    delay: Mapped[float] = mapped_column(Float, server_default="0")
    policy_version: Mapped[int] = mapped_column(server_default="0")
    error: Mapped[str | None] = mapped_column(Text)

"""Table attempts (ok | reverted | blocked_at_protocol)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from guardian.db.base import Base


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    scenario_run_id: Mapped[str] = mapped_column(
        ForeignKey("scenario_runs.id", ondelete="CASCADE"), index=True
    )
    step: Mapped[int]
    signer: Mapped[str] = mapped_column(String)
    action: Mapped[dict[str, Any]] = mapped_column(JSONB)
    outcome: Mapped[str] = mapped_column(
        Enum("ok", "reverted", "blocked_at_protocol", name="attempt_outcome")
    )
    reason_code: Mapped[str | None] = mapped_column(String)
    tx_hash: Mapped[str | None] = mapped_column(String)
    error_raw: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

"""Table events, unique (tx_hash, log_index) for idempotent indexing."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, Enum, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from guardian.db.base import Base


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        UniqueConstraint("tx_hash", "log_index"),
        Index("ix_events_chain_block", "chain", "block"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    chain: Mapped[str] = mapped_column(Enum("l1", "c", "sim", name="event_chain"))
    block: Mapped[int] = mapped_column(BigInteger)
    tx_hash: Mapped[str] = mapped_column(String)
    log_index: Mapped[int]
    name: Mapped[str] = mapped_column(String)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))

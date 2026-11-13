"""Table proposals."""

from __future__ import annotations

from typing import Any

from sqlalchemy import Enum, Index, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from guardian.db.base import Base


class Proposal(Base):
    __tablename__ = "proposals"
    __table_args__ = (Index("ix_proposals_status", "status"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    onchain_id: Mapped[int | None]
    title: Mapped[str] = mapped_column(String)
    subject_principal: Mapped[str] = mapped_column(String)
    calls: Mapped[list[Any]] = mapped_column(JSONB)
    risk_report: Mapped[dict[str, Any]] = mapped_column(JSONB)
    risk_report_hash: Mapped[str] = mapped_column(String)
    approvals: Mapped[list[Any]] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(
        Enum("open", "executed", "cancelled", name="proposal_status")
    )

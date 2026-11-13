"""Table spend_daily (cache built from events)."""

from __future__ import annotations

from sqlalchemy import Enum, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from guardian.db.base import Base


class SpendDaily(Base):
    __tablename__ = "spend_daily"

    scope: Mapped[str] = mapped_column(
        Enum("key", "principal", name="spend_scope"), primary_key=True
    )
    subject: Mapped[str] = mapped_column(String, primary_key=True)
    day_index: Mapped[int] = mapped_column(primary_key=True)
    spent: Mapped[int] = mapped_column(Numeric(78, 0), default=0, server_default="0")

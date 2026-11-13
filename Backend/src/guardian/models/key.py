"""Table keys."""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from guardian.db.base import Base


class Key(Base):
    __tablename__ = "keys"

    address: Mapped[str] = mapped_column(String, primary_key=True)
    principal_id: Mapped[str] = mapped_column(ForeignKey("principals.id"), index=True)
    kind: Mapped[str] = mapped_column(String)
    label: Mapped[str] = mapped_column(String)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    key_daily_cap: Mapped[int] = mapped_column(Numeric(78, 0))

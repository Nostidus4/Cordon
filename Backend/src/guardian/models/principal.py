"""Tables principals, principal_caps."""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from guardian.db.base import Base


class Principal(Base):
    __tablename__ = "principals"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    label: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String)
    created_block: Mapped[int] = mapped_column(default=0)


class PrincipalCap(Base):
    __tablename__ = "principal_caps"

    principal_id: Mapped[str] = mapped_column(ForeignKey("principals.id"), primary_key=True)
    daily_cap: Mapped[int] = mapped_column(Numeric(78, 0))
    locked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    updated_block: Mapped[int] = mapped_column(default=0)

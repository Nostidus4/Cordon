"""Table allow_lists (token | protocol | recipient)."""

from __future__ import annotations

from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from guardian.db.base import Base


class AllowList(Base):
    __tablename__ = "allow_lists"

    kind: Mapped[str] = mapped_column(
        Enum("token", "protocol", "recipient", name="allow_list_kind"), primary_key=True
    )
    subject: Mapped[str] = mapped_column(String, primary_key=True)
    # '' = whole subject (no function selector)
    selector: Mapped[str] = mapped_column(String, primary_key=True, default="", server_default="")
    allowed: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    updated_block: Mapped[int] = mapped_column(default=0)

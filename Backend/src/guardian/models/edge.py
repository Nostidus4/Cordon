"""Tables declared_edges, inferred_edges (P1)."""

from __future__ import annotations

from sqlalchemy import Enum, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from guardian.db.base import Base

_RELATION = ("controls", "admins")


class DeclaredEdge(Base):
    __tablename__ = "declared_edges"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    from_principal: Mapped[str] = mapped_column(String)
    to_principal_or_key: Mapped[str] = mapped_column(String)
    relation: Mapped[str] = mapped_column(Enum(*_RELATION, name="edge_relation"))
    note: Mapped[str | None] = mapped_column(String)
    source: Mapped[str] = mapped_column(String, default="declared", server_default="declared")


class InferredEdge(Base):
    __tablename__ = "inferred_edges"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # spec columns `from`/`to`; renamed because FROM/TO are SQL keywords
    from_node: Mapped[str] = mapped_column(String)
    to_node: Mapped[str] = mapped_column(String)
    relation: Mapped[str] = mapped_column(Enum(*_RELATION, name="edge_relation", create_type=False))
    rule_id: Mapped[str] = mapped_column(String)
    confidence: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String, default="inferred", server_default="inferred")

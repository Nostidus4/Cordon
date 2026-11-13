"""sim events share the events table (DB-003)

The sim chain (`CHAIN_MODE=sim`) is in memory, so after a restart nothing of it exists. Its events are
stored in `events` and replayed into a fresh SimChain at startup; they need their own `event_chain` value
('sim') so the L1 indexer never reads them. The other DB-003 tables (proposals, findings, sim_runs,
agent_runs, assistant_logs, meta) fit the 0001 schema as is: fields without a column travel in an existing
jsonb column (see `repositories/records.py`).

Revision ID: 0003
Revises: 0002
"""

from collections.abc import Sequence

from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE event_chain ADD VALUE IF NOT EXISTS 'sim'")


def downgrade() -> None:
    op.execute("DELETE FROM events WHERE chain = 'sim'")  # the 0002 enum cannot hold them
    op.execute("ALTER TYPE event_chain RENAME TO event_chain_old")
    postgresql.ENUM("l1", "c", name="event_chain").create(op.get_bind())
    op.execute(
        "ALTER TABLE events ALTER COLUMN chain TYPE event_chain USING chain::text::event_chain"
    )
    op.execute("DROP TYPE event_chain_old")

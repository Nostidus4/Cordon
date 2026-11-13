"""attempts and scenario_runs hold what the services already produce (DB-002)

The 0001 schema could not store every row the services create:
* attempts outside a scene-4 run (manual pay, agent swap before adoption, external CLI) have no run and
  no step, and an external CLI may report a run id that does not exist -> `scenario_run_id`/`step`
  nullable and the foreign key dropped (the index stays);
* a swap/pay that `simulate` refuses is recorded without being sent, outcome `blocked` -> new enum value;
* a run also carries `delay`, `policy_version` and `error` -> new columns (`name` is always 'scene4').

Revision ID: 0002
Revises: 0001
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FK = "fk_attempts_scenario_run_id_scenario_runs"


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE attempt_outcome ADD VALUE IF NOT EXISTS 'blocked'")
    op.drop_constraint(FK, "attempts", type_="foreignkey")
    op.alter_column("attempts", "scenario_run_id", nullable=True)
    op.alter_column("attempts", "step", nullable=True)
    op.add_column(
        "scenario_runs", sa.Column("delay", sa.Float(), server_default="0", nullable=False)
    )
    op.add_column(
        "scenario_runs",
        sa.Column("policy_version", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column("scenario_runs", sa.Column("error", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("scenario_runs", "error")
    op.drop_column("scenario_runs", "policy_version")
    op.drop_column("scenario_runs", "delay")
    # rows the 0001 schema cannot hold are removed
    op.execute(
        "DELETE FROM attempts WHERE scenario_run_id IS NULL OR step IS NULL OR outcome = 'blocked'"
    )
    op.execute("DELETE FROM attempts WHERE scenario_run_id NOT IN (SELECT id FROM scenario_runs)")
    op.alter_column("attempts", "step", nullable=False)
    op.alter_column("attempts", "scenario_run_id", nullable=False)
    op.create_foreign_key(
        FK, "attempts", "scenario_runs", ["scenario_run_id"], ["id"], ondelete="CASCADE"
    )
    op.execute("ALTER TYPE attempt_outcome RENAME TO attempt_outcome_old")
    postgresql.ENUM("ok", "reverted", "blocked_at_protocol", name="attempt_outcome").create(
        op.get_bind()
    )
    op.execute(
        "ALTER TABLE attempts ALTER COLUMN outcome TYPE attempt_outcome "
        "USING outcome::text::attempt_outcome"
    )
    op.execute("DROP TYPE attempt_outcome_old")

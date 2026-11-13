"""baseline

Revision ID: 0001
Revises:
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


ENUMS = {
    "allow_list_kind": ("token", "protocol", "recipient"),
    "edge_relation": ("controls", "admins"),
    "event_chain": ("l1", "c"),
    "attempt_outcome": ("ok", "reverted", "blocked_at_protocol"),
    "proposal_status": ("open", "executed", "cancelled"),
    "spend_scope": ("key", "principal"),
}


def upgrade() -> None:
    # tables reference the types with create_type=False, so each type is created exactly once here
    for name, values in ENUMS.items():
        postgresql.ENUM(*values, name=name).create(op.get_bind())
    op.create_table(
        "agent_runs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("decision", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("reason_text", sa.Text(), nullable=False),
        sa.Column("reason_source", sa.String(), nullable=False),
        sa.Column("tx_hash", sa.String(), nullable=True),
        sa.Column("outcome", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_agent_runs")),
    )
    op.create_table(
        "allow_lists",
        sa.Column(
            "kind",
            postgresql.ENUM(
                "token", "protocol", "recipient", name="allow_list_kind", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("subject", sa.String(), nullable=False),
        sa.Column("selector", sa.String(), server_default="", nullable=False),
        sa.Column("allowed", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("updated_block", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("kind", "subject", "selector", name=op.f("pk_allow_lists")),
    )
    op.create_table(
        "assistant_logs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("tool_calls", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("answer", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("numbers_verified", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_assistant_logs")),
    )
    op.create_table(
        "declared_edges",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("from_principal", sa.String(), nullable=False),
        sa.Column("to_principal_or_key", sa.String(), nullable=False),
        sa.Column(
            "relation",
            postgresql.ENUM("controls", "admins", name="edge_relation", create_type=False),
            nullable=False,
        ),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("source", sa.String(), server_default="declared", nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_declared_edges")),
    )
    op.create_table(
        "events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(
            "chain",
            postgresql.ENUM("l1", "c", name="event_chain", create_type=False),
            nullable=False,
        ),
        sa.Column("block", sa.BigInteger(), nullable=False),
        sa.Column("tx_hash", sa.String(), nullable=False),
        sa.Column("log_index", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_events")),
        sa.UniqueConstraint("tx_hash", "log_index", name=op.f("uq_events_tx_hash")),
    )
    op.create_index("ix_events_chain_block", "events", ["chain", "block"], unique=False)
    op.create_table(
        "findings",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("rule_id", sa.String(), nullable=False),
        sa.Column("principal_id", sa.String(), nullable=False),
        sa.Column("severity", sa.String(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("resolved_by_proposal", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_findings")),
    )
    op.create_index(op.f("ix_findings_principal_id"), "findings", ["principal_id"], unique=False)
    op.create_table(
        "inferred_edges",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("from_node", sa.String(), nullable=False),
        sa.Column("to_node", sa.String(), nullable=False),
        sa.Column(
            "relation",
            postgresql.ENUM("controls", "admins", name="edge_relation", create_type=False),
            nullable=False,
        ),
        sa.Column("rule_id", sa.String(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("source", sa.String(), server_default="inferred", nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inferred_edges")),
    )
    op.create_table(
        "meta",
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("value", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_meta")),
    )
    op.create_table(
        "principals",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("created_block", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_principals")),
    )
    op.create_table(
        "proposals",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("onchain_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("subject_principal", sa.String(), nullable=False),
        sa.Column("calls", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("risk_report", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("risk_report_hash", sa.String(), nullable=False),
        sa.Column("approvals", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "open", "executed", "cancelled", name="proposal_status", create_type=False
            ),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_proposals")),
    )
    op.create_index("ix_proposals_status", "proposals", ["status"], unique=False)
    op.create_table(
        "scenario_runs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_scenario_runs")),
    )
    op.create_table(
        "sim_runs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("input", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("output", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("graph_version", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sim_runs")),
    )
    op.create_table(
        "spend_daily",
        sa.Column(
            "scope",
            postgresql.ENUM("key", "principal", name="spend_scope", create_type=False),
            nullable=False,
        ),
        sa.Column("subject", sa.String(), nullable=False),
        sa.Column("day_index", sa.Integer(), nullable=False),
        sa.Column("spent", sa.Numeric(precision=78, scale=0), server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("scope", "subject", "day_index", name=op.f("pk_spend_daily")),
    )
    op.create_table(
        "attempts",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("scenario_run_id", sa.String(), nullable=False),
        sa.Column("step", sa.Integer(), nullable=False),
        sa.Column("signer", sa.String(), nullable=False),
        sa.Column("action", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "outcome",
            postgresql.ENUM(
                "ok", "reverted", "blocked_at_protocol", name="attempt_outcome", create_type=False
            ),
            nullable=False,
        ),
        sa.Column("reason_code", sa.String(), nullable=True),
        sa.Column("tx_hash", sa.String(), nullable=True),
        sa.Column("error_raw", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["scenario_run_id"],
            ["scenario_runs.id"],
            name=op.f("fk_attempts_scenario_run_id_scenario_runs"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_attempts")),
    )
    op.create_index(
        op.f("ix_attempts_scenario_run_id"), "attempts", ["scenario_run_id"], unique=False
    )
    op.create_table(
        "keys",
        sa.Column("address", sa.String(), nullable=False),
        sa.Column("principal_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("key_daily_cap", sa.Numeric(precision=78, scale=0), nullable=False),
        sa.ForeignKeyConstraint(
            ["principal_id"], ["principals.id"], name=op.f("fk_keys_principal_id_principals")
        ),
        sa.PrimaryKeyConstraint("address", name=op.f("pk_keys")),
    )
    op.create_index(op.f("ix_keys_principal_id"), "keys", ["principal_id"], unique=False)
    op.create_table(
        "principal_caps",
        sa.Column("principal_id", sa.String(), nullable=False),
        sa.Column("daily_cap", sa.Numeric(precision=78, scale=0), nullable=False),
        sa.Column("locked", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("updated_block", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["principal_id"],
            ["principals.id"],
            name=op.f("fk_principal_caps_principal_id_principals"),
        ),
        sa.PrimaryKeyConstraint("principal_id", name=op.f("pk_principal_caps")),
    )


def downgrade() -> None:
    op.drop_table("principal_caps")
    op.drop_index(op.f("ix_keys_principal_id"), table_name="keys")
    op.drop_table("keys")
    op.drop_index(op.f("ix_attempts_scenario_run_id"), table_name="attempts")
    op.drop_table("attempts")
    op.drop_table("spend_daily")
    op.drop_table("sim_runs")
    op.drop_table("scenario_runs")
    op.drop_index("ix_proposals_status", table_name="proposals")
    op.drop_table("proposals")
    op.drop_table("principals")
    op.drop_table("meta")
    op.drop_table("inferred_edges")
    op.drop_index(op.f("ix_findings_principal_id"), table_name="findings")
    op.drop_table("findings")
    op.drop_index("ix_events_chain_block", table_name="events")
    op.drop_table("events")
    op.drop_table("declared_edges")
    op.drop_table("assistant_logs")
    op.drop_table("allow_lists")
    op.drop_table("agent_runs")
    for name, values in ENUMS.items():
        postgresql.ENUM(*values, name=name).drop(op.get_bind())

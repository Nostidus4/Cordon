"""Schema checks. The round-trip DROPS every table: it runs only on TEST_DATABASE_URL (a throwaway DB)."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

import guardian.models  # noqa: F401
from guardian.db.base import Base

BACKEND = Path(__file__).resolve().parent.parent
# separate from DATABASE_URL so a dev's exported app DB is never wiped by pytest
TEST_DB = os.environ.get("TEST_DATABASE_URL", "")
EXPECTED = {
    "principals", "keys", "principal_caps", "allow_lists", "declared_edges", "inferred_edges",
    "spend_daily", "events", "attempts", "proposals", "findings", "sim_runs", "assistant_logs",
    "agent_runs", "scenario_runs", "meta",
}  # fmt: skip


def test_metadata_has_all_tables() -> None:
    assert set(Base.metadata.tables) == EXPECTED


def test_importing_app_creates_no_engine() -> None:
    import guardian.main  # noqa: F401
    from guardian.db.session import get_engine

    assert get_engine.cache_info().currsize == 0


def _alembic(*args: str) -> None:
    subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND,
        check=True,
        env={**os.environ, "DATABASE_URL": TEST_DB},
    )


@pytest.mark.skipif(not TEST_DB, reason="TEST_DATABASE_URL not set")
async def test_migration_roundtrip() -> None:
    engine = create_async_engine(TEST_DB)

    async def tables() -> set[str]:
        async with engine.connect() as c:
            return set(await c.run_sync(lambda s: inspect(s).get_table_names()))

    async def enums() -> int:
        async with engine.connect() as c:
            r = await c.execute(text("select count(*) from pg_type where typtype = 'e'"))
            return r.scalar_one()

    try:
        _alembic("downgrade", "base")
        _alembic("upgrade", "head")
        assert EXPECTED <= await tables()

        ins = text(
            "insert into events (chain, block, tx_hash, log_index, name, payload, ts) "
            "values ('l1', 1, '0xabc', 0, 'X', '{}', now())"
        )
        with pytest.raises(IntegrityError):
            async with engine.begin() as c:
                await c.execute(ins)
                await c.execute(ins)

        _alembic("downgrade", "base")
        assert await tables() - {"alembic_version"} == set()
        assert await enums() == 0
        _alembic("upgrade", "head")  # later tests (postgres-parametrised API suite) need the schema
    finally:
        await engine.dispose()

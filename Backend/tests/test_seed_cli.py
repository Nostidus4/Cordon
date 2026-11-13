"""DB-003: `guardian-seed` writes the May Labs seed into Postgres and is idempotent."""

import asyncio
import os
import subprocess

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from guardian.chain.sim.engine import load_seed
from guardian.repositories.seed import write_seed
from tests.conftest import TEST_DB

needs_pg = pytest.mark.skipif(not TEST_DB, reason="TEST_DATABASE_URL not set")


@needs_pg
async def test_seed_twice_same_counts(pg_schema: None) -> None:
    engine = create_async_engine(TEST_DB)
    async with engine.begin() as c:
        await c.execute(
            text("TRUNCATE principals, keys, allow_lists, declared_edges, spend_daily CASCADE")
        )
    seed = load_seed()
    first = await write_seed(engine, seed)
    second = await write_seed(engine, seed)
    proc = await asyncio.to_thread(
        subprocess.run, ["uv", "run", "guardian-seed"],
        check=False, capture_output=True, text=True, env={**os.environ, "DATABASE_URL": TEST_DB},
    )  # fmt: skip
    assert proc.returncode == 0, proc.stderr
    async with engine.connect() as c:
        third = {
            t: (await c.execute(text(f"SELECT count(*) FROM {t}"))).scalar_one() for t in first
        }
        cap = (
            await c.execute(text("SELECT daily_cap FROM principal_caps WHERE principal_id='lan'"))
        ).scalar_one()
        key_cap = (
            await c.execute(text("SELECT key_daily_cap FROM keys WHERE label='Khoá chị Lan'"))
        ).scalar_one()
    await engine.dispose()
    assert first == second == third
    assert all(n > 0 for n in first.values())
    assert first["allow_lists"] == len(seed["tokens"]) + len(seed["recipients"]) + len(
        seed["protocols"]
    )
    assert first["declared_edges"] == len(seed["declared_edges"])
    assert cap == 0 and key_cap == 10_000_000_000


def test_seed_cli_requires_database_url() -> None:
    env = {**os.environ, "DATABASE_URL": ""}  # empty env var also beats a dev's Backend/.env
    proc = subprocess.run(
        ["uv", "run", "guardian-seed"], check=False, capture_output=True, text=True, env=env
    )
    assert proc.returncode != 0 and "DATABASE_URL" in proc.stderr

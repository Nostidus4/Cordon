"""`uv run guardian-seed`: write seed/may_labs.json into Postgres (idempotent)."""

import asyncio
import sys

from sqlalchemy.ext.asyncio import create_async_engine

from guardian.chain.sim.engine import load_seed
from guardian.core.config import get_settings
from guardian.repositories.seed import write_seed


async def _run(url: str) -> dict[str, int]:
    engine = create_async_engine(url)
    try:
        return await write_seed(engine, load_seed())
    finally:
        await engine.dispose()


def main() -> None:
    url = get_settings().database_url
    if not url:
        sys.exit("guardian-seed: DATABASE_URL is empty; set it to a postgresql+asyncpg:// URL")
    for table, n in asyncio.run(_run(url)).items():
        print(f"{table}: {n}")

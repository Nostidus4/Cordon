"""Write the May Labs seed into Postgres. Idempotent: upserts on primary keys; declared edges
(serial id, no natural key) are replaced in the same transaction."""

from __future__ import annotations

from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncEngine

from guardian.models.allow_list import AllowList
from guardian.models.edge import DeclaredEdge
from guardian.models.key import Key
from guardian.models.principal import Principal, PrincipalCap

TABLES = (Principal, PrincipalCap, Key, AllowList, DeclaredEdge)


async def _upsert(c: Any, model: Any, rows: list[dict[str, Any]], pk: list[str]) -> None:
    stmt = insert(model).values(rows)
    set_ = {k: stmt.excluded[k] for k in rows[0] if k not in pk}
    await c.execute(stmt.on_conflict_do_update(index_elements=pk, set_=set_))


async def write_seed(engine: AsyncEngine, seed: dict[str, Any]) -> dict[str, int]:
    """Returns row counts per table after the write. spend_daily is not seeded (seed holds no spend)."""
    allow = (
        [{"kind": "token", "subject": t["address"], "selector": "", "allowed": t["allowed"]} for t in seed["tokens"]]
        + [{"kind": "recipient", "subject": r["address"], "selector": "", "allowed": r["allowed"]} for r in seed["recipients"]]
        + [{"kind": "protocol", "subject": p["address"], "selector": p["selector"], "allowed": p["allowed"]} for p in seed["protocols"]]
    )  # fmt: skip
    async with engine.begin() as c:
        await _upsert(
            c,
            Principal,
            [{"id": p["id"], "label": p["label"], "kind": p["kind"]} for p in seed["principals"]],
            ["id"],
        )
        await _upsert(
            c,
            PrincipalCap,
            [
                {"principal_id": p["id"], "daily_cap": p["daily_cap"], "locked": p["locked"]}
                for p in seed["principals"]
            ],
            ["principal_id"],
        )
        await _upsert(
            c,
            Key,
            [
                {
                    "address": k["address"], "principal_id": k["principal_id"], "kind": k["kind"],
                    "label": k["label"], "active": k["active"], "key_daily_cap": k["daily_cap"],
                }
                for k in seed["keys"]
            ],
            ["address"],
        )  # fmt: skip
        await _upsert(c, AllowList, allow, ["kind", "subject", "selector"])
        await c.execute(delete(DeclaredEdge).where(DeclaredEdge.source == "declared"))
        await c.execute(
            insert(DeclaredEdge).values(
                [
                    {
                        "from_principal": e["from_principal"], "to_principal_or_key": e["to"],
                        "relation": e["relation"], "note": e["note"], "source": e["source"],
                    }
                    for e in seed["declared_edges"]
                ]
            )
        )  # fmt: skip
        return {
            m.__tablename__: (await c.execute(select(func.count()).select_from(m))).scalar_one()
            for m in TABLES
        }

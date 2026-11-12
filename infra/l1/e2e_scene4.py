#!/usr/bin/env python3
"""Scene 4 end to end through the backend API on the REAL local Guardian L1 (L1-002).

Start the API first, on a freshly bootstrapped chain (policy v1, handover done):
    make l1-local-bootstrap
    cd Backend && uv run --env-file .env.l1-local uvicorn guardian.main:app --port 8100
    cd Backend && uv run python ../infra/l1/e2e_scene4.py [http://127.0.0.1:8100]

Flow (spec 4.3): policy v2 by Council proposal (Lan proposes, Lan + Trang approve) -> agent swap 5.000 ->
attacker steps 1-5 -> Lan locks `minh` -> step 7 raw call from key_minh, which the node must reject with no hash.
Exits 0 only if every outcome, reason code and spent figure matches the 4.3 table. Test keys only.
"""

from __future__ import annotations

import sys

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8100"
R1_MINH = "R1_MULTI_KEY_NO_SHARED_CAP:minh"
EXPECT = {  # step -> (outcome, reason, district spent after, in tUSDC display)
    1: ("reverted", "RECIPIENT_NOT_ALLOWED", "5.000"),
    2: ("reverted", "PROTOCOL_NOT_ALLOWED", "5.000"),
    3: ("ok", None, "15.000"),
    4: ("ok", None, "25.000"),
    5: ("reverted", "DISTRICT_DAILY_CAP", "25.000"),
}
failures: list[str] = []


def check(label: str, got: object, want: object) -> None:
    ok = got == want
    print(f"{'PASS' if ok else 'FAIL'}: {label} = {got!r}" + ("" if ok else f" (expected {want!r})"))
    if not ok:
        failures.append(label)


def main() -> int:
    c = httpx.Client(base_url=BASE, timeout=120)

    def post(url: str, body: dict | None = None) -> dict:
        r = c.post(url, json=body)
        r.raise_for_status()
        return r.json()

    h = c.get("/api/health").json()
    print(f"health: chainMode={h['chainMode']} simulated={h['simulated']} policyVersion={h['policyVersion']} l1Block={h['l1Block']}")
    check("simulated", h["simulated"], False)
    v1 = h["policyVersion"]
    g = c.get("/api/graph").json()
    check("districts before", len(g["districts"]), 7)

    p = post("/api/proposals", {"member": "lan", "findingId": R1_MINH})
    p = post(f"/api/proposals/{p['id']}/approve", {"member": "lan"})
    p = post(f"/api/proposals/{p['id']}/approve", {"member": "trang"})
    check("policy v2 proposal status", p["status"], "executed")
    print(f"  executed tx {p['executedTxHash']}")
    g = c.get("/api/graph").json()
    minh = next(x for x in g["districts"] if x["principalId"] == "minh")
    check("policyVersion after v2", g["policyVersion"], v1 + 1)
    check("keys in minh", len(minh["keys"]), 5)
    check("minh daily cap", minh["dailyCap"]["display"], "30.000")

    a = post("/api/agent/run-once")
    check("agent outcome", a["outcome"], "swapped")
    check("agent amountIn", a["decision"]["amountIn"]["display"], "5.000")
    print(f"  agent tx {a['txHash']}")
    check("minh spent after agent", c.get("/api/districts/minh").json()["spentToday"]["display"], "5.000")

    run = post("/api/scenario/scene4/run?delay=0&wait=true")
    steps = {x["step"]: x for x in run["attempts"]}
    moved = 0
    for n, (outcome, reason, spent) in EXPECT.items():
        s = steps[n]
        print(f"  step {n}: {s['signer']} {s['action']} -> {s['outcome']} {s['reasonCode'] or ''} tx={s['txHash']}")
        check(f"step {n} outcome", s["outcome"], outcome)
        check(f"step {n} reason", s["reasonCode"], reason)
        check(f"step {n} district spent after", s["principalSpentAfter"]["display"], spent)
        check(f"step {n} has a real tx hash", bool(s["txHash"]) and s["simulated"] is False, True)
        if s["outcome"] == "ok":
            moved += int(s["amount"]["raw"])
    check("attacker moved (base units)", moved, 20_000_000_000)

    lock = post("/api/actions/lock", {"member": "lan", "principalId": "minh"})
    check("lock status", lock["status"], "ok")
    print(f"  lock tx {lock['txHash']}")
    d = c.get("/api/districts/minh").json()
    check("minh locked", d["locked"], True)
    check("allow-listed keys left in minh", [k["allowListed"] for k in d["keys"]], [False] * 5)

    s7run = post("/api/scenario/scene4/run", {"step": 7})
    s7 = next(x for x in s7run["attempts"] if x["step"] == 7)
    print(f"  step 7: outcome={s7['outcome']} reason={s7['reasonCode']} tx={s7['txHash']} badge={s7['badge']}")
    print(f"  step 7 raw node error: {s7.get('errorRaw')}")
    check("step 7 outcome", s7["outcome"], "blocked_at_protocol")
    check("step 7 reason", s7["reasonCode"], "BLOCKED_AT_PROTOCOL")
    check("step 7 tx hash", s7["txHash"], None)

    print("\nRESULT:", "ALL MATCH" if not failures else f"{len(failures)} MISMATCH: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

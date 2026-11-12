"""Scenes 1-5 end to end through the HTTP API, one body for the sim (CI) and the real Guardian L1 (OPS-004).

`run_scenes(client, real=...)` does not reset: the caller starts from a freshly reset demo (sim: POST /api/demo/reset,
L1: `make demo-reset`). Every assertion is a row of a pass/fail table; the numbers are the spec tables
(§8.4 simulate, §4.3 scene 4, scene 3 merge 100.000 -> 30.000, scene 5 requests #12 and #13).

CLI (used by infra/l1/e2e_scene_all.py): `python -m tests.e2e.scene_all <api url> [--real] [--rpc URL --council 0x.. --huy 0x..]`.
"""

from __future__ import annotations

import subprocess
import sys
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

R1_MINH = "R1_MULTI_KEY_NO_SHARED_CAP:minh"
TX_ALLOWLIST = "0x0200000000000000000000000000000000000002"
# step -> (outcome, reason, district spent after)
SCENE4 = {
    1: ("reverted", "RECIPIENT_NOT_ALLOWED", "5.000"),
    2: ("reverted", "PROTOCOL_NOT_ALLOWED", "5.000"),
    3: ("ok", None, "15.000"),
    4: ("ok", None, "25.000"),
    5: ("reverted", "DISTRICT_DAILY_CAP", "25.000"),
}


def disp(m: dict[str, Any]) -> str:
    return str(m["display"])


@dataclass
class Row:
    scene: str
    label: str
    got: object
    want: object
    ok: bool


@dataclass
class Report:
    rows: list[Row] = field(default_factory=list)
    timings: dict[str, float] = field(default_factory=dict)
    hashes: dict[str, str | None] = field(default_factory=dict)

    @property
    def failed(self) -> list[Row]:
        return [r for r in self.rows if not r.ok]

    def table(self) -> str:
        w = max((len(r.label) for r in self.rows), default=10)
        out = [f"{'scene':<6} {'check':<{w}}  {'result':<6} value"]
        for r in self.rows:
            tail = "" if r.ok else f"  (expected {r.want!r})"
            out.append(
                f"{r.scene:<6} {r.label:<{w}}  {'PASS' if r.ok else 'FAIL':<6} {r.got!r}{tail}"
            )
        out.append("")
        out += [f"duration {k:<14} {v:6.1f}s" for k, v in self.timings.items()]
        out.append(f"duration {'total':<14} {sum(self.timings.values()):6.1f}s")
        out.append(f"RESULT: {len(self.rows) - len(self.failed)}/{len(self.rows)} checks passed")
        return "\n".join(out)


def _cast(*args: str) -> str:
    r = subprocess.run(["cast", *args], check=False, capture_output=True, text=True)
    return (r.stdout + r.stderr).strip()


def run_scenes(
    c: httpx.Client,
    *,
    real: bool,
    rpc: str | None = None,
    council: str | None = None,
    huy_address: str | None = None,
    log: Any = print,
) -> Report:
    rep = Report()
    scene = ""
    kw: dict[str, Any] = {"timeout": 180} if real else {}  # TestClient takes no timeout

    def check(label: str, got: object, want: object) -> None:
        ok = got == want
        rep.rows.append(Row(scene, label, got, want, ok))
        if not ok:
            log(f"FAIL {scene} {label}: got {got!r}, expected {want!r}")

    def call(method: str, url: str, body: dict[str, Any] | None = None, ok: int = 200) -> Any:
        r = c.request(method, url, json=body, **kw)
        if r.status_code != ok:
            check(f"{method} {url} status", r.status_code, ok)
            raise RuntimeError(f"{method} {url} -> {r.status_code} {r.text[:300]}")
        return r.json()

    def timed(name: str) -> None:
        nonlocal scene, t0
        if scene:
            rep.timings[scene_names[scene]] = time.monotonic() - t0
        scene, t0 = name, time.monotonic()

    scene_names = {f"S{i}": f"scene {i}" for i in range(1, 6)}
    t0 = time.monotonic()

    def label_of(g: dict[str, Any]) -> int:
        return int(g.get("policyLabel", g["policyVersion"]))

    # --- scene 1: map
    timed("S1")
    h = call("GET", "/api/health")
    check("simulated flag", h["simulated"], not real)
    g = call("GET", "/api/graph")
    check("districts", len(g["districts"]), 7)
    check("policy label before merge", label_of(g), 1)
    check(
        "R1 finding on minh (HIGH)",
        any(f["id"] == R1_MINH and f["severity"] == "HIGH" for f in call("GET", "/api/findings")),
        True,
    )
    check(
        "minh keys before",
        len(next(d for d in g["districts"] if d["principalId"] == "minh")["keys"]),
        1,
    )

    # --- scene 2: simulate
    timed("S2")
    t = call("POST", "/api/simulate", {"compromised": ["minh"]})["totals"]
    check(
        "simulate minh youThink/enforced/estimated",
        [disp(t[k]) for k in ("youThink", "enforced", "estimated")],
        ["20.000", "20.000", "100.000"],
    )
    check("simulate minh % of treasury", t["percentOfMainTreasury"], 5.0)
    t = call("POST", "/api/simulate", {"compromised": ["minh", "huy"]})["totals"]
    check(
        "simulate minh+huy youThink/enforced/estimated",
        [disp(t[k]) for k in ("youThink", "enforced", "estimated")],
        ["60.000", "60.000", "140.000"],
    )
    check("simulate minh+huy % of treasury", t["percentOfMainTreasury"], 7.0)

    # --- scene 3: merge, propose, 2/3 approvals
    timed("S3")
    d = call("POST", "/api/proposals/draft", {"findingId": R1_MINH})
    rr = d["riskReport"]
    check(
        "draft estimated before -> after",
        (disp(rr["before"]["estimated"]), disp(rr["after"]["estimated"])),
        ("100.000", "30.000"),
    )
    check("draft is not sent yet", d["sent"], False)
    p = call("POST", "/api/proposals", {"member": "lan", "findingId": R1_MINH}, 201)
    check("proposal open after Lan proposes", p["status"], "open")
    check("proposal hash equals draft hash", p["riskReportHash"], d["riskReportHash"])
    p = call("POST", f"/api/proposals/{p['id']}/approve", {"member": "lan"})
    check("1 approval: still open", (p["status"], p["approvals"]), ("open", ["lan"]))
    p = call("POST", f"/api/proposals/{p['id']}/approve", {"member": "trang"})
    check("Lan + Trang: executed", p["status"], "executed")
    rep.hashes["merge executed"] = p["executedTxHash"]
    check("merge has a tx hash", bool(p["executedTxHash"]), True)
    g = call("GET", "/api/graph")
    minh = next(x for x in g["districts"] if x["principalId"] == "minh")
    check("policy label after merge", label_of(g), 2)
    check("minh keys after merge", len(minh["keys"]), 5)
    check("minh daily cap after merge", disp(minh["dailyCap"]), "30.000")
    t = call("POST", "/api/simulate", {"compromised": ["minh"]})["totals"]
    check(
        "simulate minh after v2 youThink/enforced/estimated",
        [disp(t[k]) for k in ("youThink", "enforced", "estimated")],
        ["30.000", "30.000", "30.000"],
    )
    check("simulate minh after v2 % of treasury", t["percentOfMainTreasury"], 1.5)

    # --- scene 4: agent, attacker 1-5, lock, step 7
    timed("S4")
    a = call("POST", "/api/agent/run-once")
    check("agent outcome", a["outcome"], "swapped")
    check("agent amountIn", disp(a["decision"]["amountIn"]), "5.000")
    rep.hashes["step 0 agent swap"] = a["txHash"]
    check("agent swap has a tx hash", bool(a["txHash"]), True)
    check("minh spent after agent", disp(call("GET", "/api/districts/minh")["spentToday"]), "5.000")
    run = call("POST", "/api/scenario/scene4/run?delay=0&wait=true")
    steps = {x["step"]: x for x in run["attempts"]}
    moved = 0
    for n, (outcome, reason, spent) in SCENE4.items():
        s = steps[n]
        rep.hashes[f"step {n}"] = s["txHash"]
        check(f"step {n} outcome", s["outcome"], outcome)
        check(f"step {n} reason", s["reasonCode"], reason)
        check(f"step {n} district spent after", disp(s["principalSpentAfter"]), spent)
        if n in (3, 4):
            check(f"step {n} has a tx hash", bool(s["txHash"]), True)
        if s["outcome"] == "ok":
            moved += int(s["amount"]["raw"])
    check("attacker moved (steps 1-5, base units)", moved, 20_000_000_000)
    dist = call("GET", "/api/districts/minh")
    check("principalSpent(minh) incl. agent", disp(dist["spentToday"]), "25.000")
    lock = call("POST", "/api/actions/lock", {"member": "lan", "principalId": "minh"})
    check("lock status", lock["status"], "ok")
    rep.hashes["step 6 lock"] = lock["txHash"]
    check("lock has a tx hash", bool(lock["txHash"]), True)
    dist = call("GET", "/api/districts/minh")
    check("minh locked", dist["locked"], True)
    check("API allowListed for the 5 keys", [k["allowListed"] for k in dist["keys"]], [False] * 5)
    if rpc:
        roles = [
            _cast(
                "call",
                "--rpc-url",
                rpc,
                TX_ALLOWLIST,
                "readAllowList(address)(uint256)",
                k["address"],
            ).split()[0]
            for k in dist["keys"]
        ]
        check("readAllowList on chain for the 5 keys", roles, ["0"] * 5)
    check("spent unchanged by the lock", disp(dist["spentToday"]), "25.000")
    s7run = call("POST", "/api/scenario/scene4/run", {"step": 7})
    s7 = next(x for x in s7run["attempts"] if x["step"] == 7)
    rep.hashes["step 7"] = s7["txHash"]
    check("step 7 outcome", s7["outcome"], "blocked_at_protocol")
    check("step 7 reason", s7["reasonCode"], "BLOCKED_AT_PROTOCOL")
    check("step 7 has NO tx hash", s7["txHash"], None)

    # --- scene 5: request #12 and #13
    timed("S5")
    props = {x["id"]: x for x in call("GET", "/api/proposals")}
    r12 = props.get(12)
    check("request #12 present and open", r12 and r12["status"], "open")
    if r12:
        rr = r12["riskReport"]
        check(
            "#12 enforced 30.000 -> 130.000",
            (disp(rr["before"]["enforced"]), disp(rr["after"]["enforced"])),
            ("30.000", "130.000"),
        )
        check(
            "#12 % of treasury 1,5 -> 6,5",
            (rr["before"]["percentOfMainTreasury"], rr["after"]["percentOfMainTreasury"]),
            (1.5, 6.5),
        )
    r13 = props.get(13)
    if r13 is None and not real:  # the sim does not seed #13 at reset: create the same request
        key = next(k["address"] for k in dist["keys"] if k["seedId"] == "key_agent_rebalance")
        r13 = call(
            "POST",
            "/api/proposals",
            {"member": "trang", "change": {"kind": "move_key", "key": key, "to": "huy"}},
            201,
        )
    check("request #13 present (id 13)", r13 and r13["id"], 13)
    if r13:
        check("#13 subject district = huy", r13["subjectPrincipal"], "huy")
        check("#13 conflicted members", r13["conflictedMembers"], ["huy"])
        huy = next(m for m in r13["members"] if m["id"] == "huy")
        check("#13 Huy cannot approve", (huy["conflicted"], huy["canApprove"]), (True, False))
        rr = r13["riskReport"]
        check(
            "#13 Huy estimated 40.000 -> 60.000",
            (disp(rr["before"]["estimated"]), disp(rr["after"]["estimated"])),
            ("40.000", "60.000"),
        )
        r = c.post(f"/api/proposals/{r13['id']}/approve", json={"member": "huy"}, **kw)
        check("#13 Huy approve -> HTTP 409", r.status_code, 409)
        check(
            "#13 Huy approve -> CONFLICT_OF_INTEREST",
            r.json().get("error", {}).get("code"),
            "CONFLICT_OF_INTEREST",
        )
        again = next(x for x in call("GET", "/api/proposals") if x["id"] == r13["id"])
        check(
            "#13 still open with no approvals", (again["status"], again["approvals"]), ("open", [])
        )
        if rpc and council and huy_address:
            out = _cast(
                "call",
                "--rpc-url",
                rpc,
                "--from",
                huy_address,
                council,
                "approve(uint256)",
                str(r13["id"]),
            )
            sel = _cast("sig", "ConflictOfInterest()")
            check("on-chain approve by Huy reverts ConflictOfInterest", sel in out, True)
    timed("")
    return rep


def main(argv: list[str]) -> int:
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--real", action="store_true")
    ap.add_argument("--rpc")
    ap.add_argument("--council")
    ap.add_argument("--huy")
    a = ap.parse_args(argv)
    with httpx.Client(base_url=a.url) as c:
        rep = run_scenes(c, real=a.real, rpc=a.rpc, council=a.council, huy_address=a.huy)
    print(rep.table())
    print("tx hashes:")
    for k, v in rep.hashes.items():
        print(f"  {k:<20} {v or '(none)'}")
    return 1 if rep.failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

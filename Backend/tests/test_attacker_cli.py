"""Attacker CLI on the sim chain: reproduces the §4.3 table end to end (OPS-001)."""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from guardian.attacker import cli
from guardian.attacker.steps import ATTACK_STEPS, STEP7, execute_step
from guardian.chain.sim import SimChain
from guardian.main import create_app
from guardian.services.runtime import Runtime
from guardian.shared.money import to_base
from tests.conftest import T0, make_settings


def _sim() -> SimChain:
    return SimChain(clock=lambda: T0)


def _ready() -> SimChain:
    """Policy v2 + the agent swap (step 0): the state scene 4 starts from."""
    chain = _sim()
    chain.apply_policy_v2()
    execute_step(chain, cli.SCENARIO4_STEPS[0])
    return chain


def _run(chain: SimChain, *args: str) -> tuple[int, str]:
    out = io.StringIO()
    code = cli.main(["scene4", "--delay", "0", *args], chain=chain, out=out, sleep=lambda _s: None)
    return code, out.getvalue()


def _state(chain: SimChain) -> tuple[int, int, int]:
    snap = chain.snapshot()
    return snap.block, len(chain.events_since(0)), snap.principals["minh"].spent_today


def _scene(chain: SimChain, steps, reporter=None, lock=False) -> list:  # type: ignore[no-untyped-def]
    reports, _ = cli.run_scene4(
        chain,
        steps,
        dry_run=False,
        delay=0,
        reporter=reporter,
        wait_lock=False,
        lock_timeout=0,
        simulate_lock=lock,
        out=io.StringIO(),
    )
    return reports


def test_step_all_reproduces_table_4_3() -> None:
    chain = _ready()
    reports = _scene(chain, ATTACK_STEPS)
    got = [(r.step, r.outcome, r.reason_code) for r in reports]
    assert got == [
        (1, "reverted", "RECIPIENT_NOT_ALLOWED"),
        (2, "reverted", "PROTOCOL_NOT_ALLOWED"),
        (3, "ok", None),
        (4, "ok", None),
        (5, "reverted", "DISTRICT_DAILY_CAP"),
    ]
    assert [r.amount for r in reports if r.outcome == "ok"] == [to_base(10_000)] * 2
    assert cli.attacker_total(reports) == to_base(20_000)
    # shared district spend (§4.3 "Đã dùng chung"): 5.000 agent + 20.000 attacker = 25.000
    assert chain.snapshot().principals["minh"].spent_today == to_base(25_000)
    assert all(r.tx_hash for r in reports)  # reverted txs are still mined: they have a hash


def test_main_prints_table_and_total_exit_0() -> None:
    code, out = _run(_ready(), "--step", "all", "--simulate-lock")
    assert code == cli.EXIT_OK
    for needle in ("RECIPIENT_NOT_ALLOWED", "PROTOCOL_NOT_ALLOWED", "DISTRICT_DAILY_CAP"):
        assert needle in out
    assert "attacker total moved: 20.000 tUSDC" in out


def test_step7_after_lock_blocked_at_protocol_without_tx_hash() -> None:
    chain = _ready()
    code, _ = _run(chain, "--step", "all", "--simulate-lock")
    assert code == cli.EXIT_OK
    assert chain.snapshot().principals["minh"].locked
    r = execute_step(chain, STEP7)
    assert (r.outcome, r.reason_code, r.tx_hash, r.block) == (
        "blocked_at_protocol",
        "BLOCKED_AT_PROTOCOL",
        None,
        None,
    )
    code, out = _run(chain, "--step", "7")
    assert code == cli.EXIT_OK
    assert "BLOCKED_AT_PROTOCOL" in out


def test_step7_without_lock_is_a_mismatch() -> None:
    code, _ = _run(_ready(), "--step", "7")
    assert code == cli.EXIT_MISMATCH  # key_minh is not blocked yet: the table is not reproduced


def test_dry_run_sends_nothing() -> None:
    chain = _ready()
    before = _state(chain)
    code, out = _run(chain, "--step", "all", "--dry-run")
    assert code == cli.EXIT_OK
    assert _state(chain) == before
    assert "dry-run: RECIPIENT_NOT_ALLOWED" in out and "dry-run: PROTOCOL_NOT_ALLOWED" in out
    code, _ = _run(chain, "--step", "7", "--dry-run")
    assert _state(chain) == before and code == cli.EXIT_OK


def test_bad_step_is_usage_error(capsys: pytest.CaptureFixture[str]) -> None:
    for bad in ("6", "0", "x"):
        assert _run(_sim(), "--step", bad)[0] == cli.EXIT_USAGE
    assert "step" in capsys.readouterr().err


def test_standalone_sim_prepares_state() -> None:
    out = io.StringIO()
    code = cli.main(["scene4", "--delay", "0", "--simulate-lock"], out=out)
    assert code == cli.EXIT_OK and "20.000" in out.getvalue()


def test_wait_for_lock_times_out_then_sees_lock() -> None:
    chain = _ready()
    ticks: list[float] = []

    def sleep(s: float) -> None:
        ticks.append(s)
        if len(ticks) == 2:
            chain.emergency_lock("council_lan", "minh")

    assert cli.wait_for_lock(chain, "minh", timeout=5, sleep=sleep)
    assert len(ticks) == 2
    assert not cli.wait_for_lock(_ready(), "minh", timeout=2, sleep=lambda _s: None)


def test_keys_loaded_from_env_file_never_printed(tmp_path: Path) -> None:
    secret = "0x" + "ab" * 32
    f = tmp_path / ".env.attacker"
    f.write_text(f"KEY_MINH_PK={secret}\n# c\nKEY_AGENT_DATA_PK=\n")
    keys = cli.load_keys(f)
    assert keys == {"key_minh": secret}
    assert "KEY_AGENT_DATA_PK" in cli.missing_keys(keys)
    assert secret not in "".join(cli.missing_keys(keys))
    code, out = _run(_ready(), "--step", "3", "--env-file", str(f))
    assert secret not in out and code == cli.EXIT_OK


def test_each_executed_step_creates_one_attempt_in_the_api() -> None:
    settings = make_settings()
    rt = Runtime(settings, chain=_sim())
    app = create_app(settings, rt)
    with TestClient(app) as client:
        chain = rt.chain
        chain.apply_policy_v2()
        execute_step(chain, cli.SCENARIO4_STEPS[0])
        reporter = cli.Reporter("http://test", None, "run-9", client=client)
        _scene(chain, ATTACK_STEPS, reporter, lock=True)
        _scene(chain, [STEP7], reporter)
        got = client.get("/api/attempts", params={"run": "run-9"}).json()
    assert reporter.failures == 0
    assert [(a["step"], a["scenarioRunId"]) for a in got] == [
        (s, "run-9") for s in (1, 2, 3, 4, 5, 7)
    ]
    assert [(a["outcome"], a["reasonCode"]) for a in got] == [
        ("reverted", "RECIPIENT_NOT_ALLOWED"),
        ("reverted", "PROTOCOL_NOT_ALLOWED"),
        ("ok", None),
        ("ok", None),
        ("reverted", "DISTRICT_DAILY_CAP"),
        ("blocked_at_protocol", "BLOCKED_AT_PROTOCOL"),
    ]
    assert got[-1]["txHash"] is None and all(a["txHash"] for a in got[:-1])
    assert [a["amount"]["display"] for a in got[:5]] == [
        "20.000",
        "5.000",
        "10.000",
        "10.000",
        "10.000",
    ]


def test_dry_run_reports_nothing(tmp_path: Path) -> None:
    rec = tmp_path / "a.jsonl"
    _run(_ready(), "--step", "all", "--dry-run", "--record", str(rec))
    assert not rec.exists()


def test_local_record_when_no_api(tmp_path: Path) -> None:
    rec = tmp_path / "a.jsonl"
    code, _ = _run(_ready(), "--step", "all", "--simulate-lock", "--record", str(rec))
    assert code == cli.EXIT_OK and len(rec.read_text().splitlines()) == 5


def test_api_failure_exits_3(capsys: pytest.CaptureFixture[str]) -> None:
    code, _ = _run(_ready(), "--step", "3", "--api-url", "http://127.0.0.1:1")
    assert code == cli.EXIT_REPORT
    assert "could not report" in capsys.readouterr().err

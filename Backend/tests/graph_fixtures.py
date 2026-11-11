"""Hand-built PolicySnapshots from spec §4.2 (policy v1 / v2). Amounts in base units."""

from __future__ import annotations

import copy

from guardian.domain.snapshot import (
    CouncilMember,
    DeclaredEdge,
    KeyState,
    PolicySnapshot,
    PrincipalState,
    Protocol,
    Recipient,
    Token,
)

U = 1_000_000


def usdc(n: int) -> int:
    return n * U


def addr(n: int) -> str:
    return "0x" + f"{n:040x}"


K_MINH, K_DATA, K_INTL, K_REB, K_SVC, K_HUY1, K_HUY2, K_LAN = (addr(i) for i in range(1, 9))

_KEYS = [
    (K_MINH, "key_minh", "Thẻ Minh", "HUMAN", "minh", 20),
    (K_DATA, "key_agent_data", "Agent Data", "AGENT", "agent_data", 20),
    (K_INTL, "key_agent_intl_pay", "Agent Intl Pay", "AGENT", "agent_intl_pay", 20),
    (K_REB, "key_agent_rebalance", "Agent Cân đối", "AGENT", "agent_rebalance", 20),
    (K_SVC, "key_svc_payment", "Svc Payment", "SERVICE", "svc_payment", 20),
    (K_HUY1, "key_huy_1", "Thẻ Huy 1", "HUMAN", "huy", 20),
    (K_HUY2, "key_huy_2", "Thẻ Huy 2", "HUMAN", "huy", 20),
    (K_LAN, "key_lan", "Thẻ Lan", "HUMAN", "lan", 10),
]
_PRINCIPALS = [
    ("minh", "Anh Minh", "HUMAN"),
    ("agent_data", "Agent Data", "AGENT"),
    ("agent_intl_pay", "Agent Intl Pay", "AGENT"),
    ("agent_rebalance", "Agent Cân đối", "AGENT"),
    ("svc_payment", "Svc Payment", "SERVICE"),
    ("huy", "Anh Huy", "HUMAN"),
    ("lan", "Chị Lan", "HUMAN"),
]


def snapshot_v1() -> PolicySnapshot:
    principals = {
        pid: PrincipalState(pid, label, kind, 0, 0, False, []) for pid, label, kind in _PRINCIPALS
    }
    keys = {}
    for a, sid, label, kind, pid, cap in _KEYS:
        keys[a] = KeyState(a, sid, label, kind, pid, True, usdc(cap * 1000), 0, True)
        principals[pid].keys.append(a)
    edges = [
        DeclaredEdge(f"e:minh-controls-{t}", "minh", t, "controls", "tự khai")
        for t in ("agent_data", "agent_intl_pay", "agent_rebalance")
    ] + [DeclaredEdge("e:minh-admins-svc_payment", "minh", "svc_payment", "admins", "tự khai")]
    return PolicySnapshot(
        policy_version=1,
        block=100,
        day_index=20000,
        paused=False,
        vault_balance=usdc(200_000),
        main_treasury=usdc(2_000_000),
        principals=principals,
        keys=keys,
        declared_edges=edges,
        council=[
            CouncilMember("trang", "Trang", addr(101), None),
            CouncilMember("lan", "Lan", addr(102), "lan"),
            CouncilMember("huy", "Huy", addr(103), "huy"),
        ],
        recipients=[
            Recipient(addr(201), "vendor_cloud", "Vendor Cloud", True),
            Recipient(addr(202), "stranger_wallet", "Stranger", False),
        ],
        protocols=[
            Protocol(addr(301), "mock_dex", "MockDEX", "0x11111111", True),
            Protocol(addr(302), "evil_dex", "EvilDEX", "0x11111111", False),
        ],
        tokens=[Token(addr(401), "tUSDC", 6, True), Token(addr(402), "tSCAM", 18, False)],
    )


def snapshot_v2() -> PolicySnapshot:
    """5 keys in district minh, cap 30.000; emptied districts removed; declared edges kept."""
    s = copy.deepcopy(snapshot_v1())
    five = [K_MINH, K_DATA, K_INTL, K_REB, K_SVC]
    for a in five:
        s.keys[a].principal_id = "minh"
    s.principals["minh"].keys = list(five)
    s.principals["minh"].daily_cap = usdc(30_000)
    for pid in ("agent_data", "agent_intl_pay", "agent_rebalance", "svc_payment"):
        del s.principals[pid]
    s.declared_edges = [
        DeclaredEdge("e:minh-controls-agent_data", "minh", "agent_data", "controls", "tự khai")
    ]
    s.policy_version = 2
    return s

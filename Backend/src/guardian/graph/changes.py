"""Apply ProposedChange to a snapshot copy; translate change -> Council calls (spec §6.2, §6.3, §6.5).

A ProposedChange is a plain JSON-friendly dict (TypedDicts below, discriminated by ``kind``).
Amounts in changes are ``int`` base units; amounts in the symbolic calls are decimal *strings*
(JSON/TS-safe bigint).

Symbolic calls target ``registry`` (PrincipalRegistry), ``vault`` (PolicyVault) or
``tx_allowlist`` (precompile). Currently no change kind needs ``tx_allowlist`` (key allow-listing
is unchanged by moving keys between districts), but the target is part of the vocabulary.
"""

from __future__ import annotations

import copy
from typing import Any, Literal, NotRequired, TypedDict

from guardian.domain.snapshot import PolicySnapshot, PrincipalState

Call = dict[str, Any]


class MergeDistrict(TypedDict):
    kind: Literal["merge_district"]
    into: str
    keys: list[str]
    district_cap: int


class SetDistrictCap(TypedDict):
    kind: Literal["set_district_cap"]
    principal_id: str
    cap: int


class SetKeyCap(TypedDict):
    kind: Literal["set_key_cap"]
    key: str
    cap: int


class MoveKey(TypedDict):
    kind: Literal["move_key"]
    key: str
    to: str


class CreateDistrict(TypedDict):
    kind: Literal["create_district"]
    principal_id: str
    label: str
    owner: Literal["council"]
    keys: list[str]
    district_cap: int
    protocol_only: NotRequired[bool]


ProposedChange = MergeDistrict | SetDistrictCap | SetKeyCap | MoveKey | CreateDistrict


def _move(snap: PolicySnapshot, key: str, to: str) -> None:
    ks = snap.keys.get(key)
    if ks is None:
        raise ValueError(f"unknown key {key}")
    if to not in snap.principals:
        raise ValueError(f"unknown district {to}")
    old = snap.principals.get(ks.principal_id)
    if old is not None and key in old.keys:
        old.keys.remove(key)
    ks.principal_id = to
    if key not in snap.principals[to].keys:
        snap.principals[to].keys.append(key)


def apply_change(snapshot: PolicySnapshot, change: ProposedChange) -> PolicySnapshot:
    """Return a NEW snapshot with the change applied (input is never mutated).

    ``policy_version`` is bumped by 1 (every executed proposal ends with bumpPolicyVersion).
    ``protocol_only`` of create_district is not representable in PolicySnapshot (allow-lists are
    global there), so it only shows up in describe_vi.
    """
    snap = copy.deepcopy(snapshot)
    kind = change["kind"]
    if kind == "merge_district":
        if change["into"] not in snap.principals:
            raise ValueError(f"unknown district {change['into']}")
        for key in change["keys"]:
            _move(snap, key, change["into"])
        snap.principals[change["into"]].daily_cap = change["district_cap"]
    elif kind == "set_district_cap":
        if change["principal_id"] not in snap.principals:
            raise ValueError(f"unknown district {change['principal_id']}")
        snap.principals[change["principal_id"]].daily_cap = change["cap"]
    elif kind == "set_key_cap":
        if change["key"] not in snap.keys:
            raise ValueError(f"unknown key {change['key']}")
        snap.keys[change["key"]].daily_cap = change["cap"]
    elif kind == "move_key":
        _move(snap, change["key"], change["to"])
    elif kind == "create_district":
        pid = change["principal_id"]
        if pid in snap.principals:
            raise ValueError(f"district {pid} already exists")
        snap.principals[pid] = PrincipalState(
            id=pid,
            label=change["label"],
            kind="SERVICE",
            daily_cap=0,
            spent_today=0,
            locked=False,
            keys=[],
        )
        for key in change["keys"]:
            _move(snap, key, pid)
        snap.principals[pid].daily_cap = change["district_cap"]
    else:  # pragma: no cover
        raise ValueError(f"unknown change kind {kind}")
    snap.policy_version += 1
    return snap


def to_calls(snapshot: PolicySnapshot, change: ProposedChange) -> list[Call]:
    """Symbolic Council calls (§6.2/6.3); always ends with vault.bumpPolicyVersion."""
    calls: list[Call] = []
    kind = change["kind"]
    if kind == "merge_district":
        for key in change["keys"]:
            ks = snapshot.keys.get(key)
            if ks is None or ks.principal_id != change["into"]:
                calls.append(
                    {
                        "target": "registry",
                        "fn": "moveKey",
                        "args": {"key": key, "toId": change["into"]},
                    }
                )
        calls.append(_cap_call(change["into"], change["district_cap"]))
    elif kind == "set_district_cap":
        calls.append(_cap_call(change["principal_id"], change["cap"]))
    elif kind == "set_key_cap":
        calls.append(
            {
                "target": "vault",
                "fn": "setKeyDailyCap",
                "args": {"key": change["key"], "cap": str(change["cap"])},
            }
        )
    elif kind == "move_key":
        calls.append(
            {
                "target": "registry",
                "fn": "moveKey",
                "args": {"key": change["key"], "toId": change["to"]},
            }
        )
    elif kind == "create_district":
        calls.append(
            {
                "target": "registry",
                "fn": "createPrincipal",
                "args": {"id": change["principal_id"], "label": change["label"]},
            }
        )
        for key in change["keys"]:
            calls.append(
                {
                    "target": "registry",
                    "fn": "moveKey",
                    "args": {"key": key, "toId": change["principal_id"]},
                }
            )
        calls.append(_cap_call(change["principal_id"], change["district_cap"]))
    else:  # pragma: no cover
        raise ValueError(f"unknown change kind {kind}")
    calls.append({"target": "vault", "fn": "bumpPolicyVersion", "args": {}})
    return calls


def _cap_call(principal_id: str, cap: int) -> Call:
    return {
        "target": "vault",
        "fn": "setPrincipalDailyCap",
        "args": {"principalId": principal_id, "cap": str(cap)},
    }


def subject_principal(change: ProposedChange, snapshot: PolicySnapshot | None = None) -> str | None:
    """The district that RECEIVES keys/caps (§6.5 subjectPrincipal).

    set_key_cap has no explicit district: pass ``snapshot`` to resolve the key's district,
    otherwise None (= "chung").
    """
    kind = change["kind"]
    if kind == "merge_district":
        return change["into"]
    if kind == "set_district_cap":
        return change["principal_id"]
    if kind == "move_key":
        return change["to"]
    if kind == "create_district":
        return change["principal_id"]
    if kind == "set_key_cap" and snapshot is not None:
        ks = snapshot.keys.get(change["key"])
        return ks.principal_id if ks else None
    return None


def classify(
    change: ProposedChange, snapshot: PolicySnapshot | None = None
) -> Literal["tighten", "loosen"]:
    """tighten = 1 Council member suffices; loosen = 2/3 (§6.3, §6.5).

    moveKey / createPrincipal / merge / create are always "loosen" on-chain. Cap changes are
    tighten only when the new cap is lower than the current one (needs ``snapshot``); a district
    cap of 0 means "no cap" and counts as loosening. Without a snapshot caps are "loosen"
    (conservative).
    """
    kind = change["kind"]
    if snapshot is None:
        return "loosen"
    if kind == "set_district_cap":
        ps = snapshot.principals.get(change["principal_id"])
        cur = ps.daily_cap if ps else 0
        new = change["cap"]
        return "tighten" if (new > 0 and (cur == 0 or new < cur)) else "loosen"
    if kind == "set_key_cap":
        ks = snapshot.keys.get(change["key"])
        return "tighten" if ks is not None and change["cap"] < ks.daily_cap else "loosen"
    return "loosen"


def fmt_usdc(base: int | str) -> str:
    """Base units (6 decimals) -> '30.000' (dot thousands, integer part; fractional kept if any)."""
    n = int(base)
    whole, frac = divmod(n, 1_000_000)
    s = f"{whole:,}".replace(",", ".")
    return s if frac == 0 else f"{s},{frac:06d}".rstrip("0")


def _short(addr: str) -> str:
    return f"{addr[:6]}…{addr[-4:]}" if len(addr) > 12 else addr


def describe_vi(calls: list[Call], snapshot: PolicySnapshot | None = None) -> list[str]:
    """Plain Vietnamese lines for the UI, one per call (labels from ``snapshot`` if given)."""

    def key_name(addr: str) -> str:
        ks = snapshot.keys.get(addr) if snapshot else None
        return f"thẻ {ks.label}" if ks else f"thẻ {_short(addr)}"

    def dist_name(pid: str) -> str:
        ps = snapshot.principals.get(pid) if snapshot else None
        return f"khu {ps.label}" if ps else f"khu {pid}"

    out: list[str] = []
    for c in calls:
        fn, a = c["fn"], c["args"]
        if fn == "moveKey":
            out.append(f"Chuyển {key_name(a['key'])} sang {dist_name(a['toId'])}.")
        elif fn == "setPrincipalDailyCap":
            out.append(
                f"Đặt hạn mức chung mỗi ngày của {dist_name(a['principalId'])} "
                f"là {fmt_usdc(a['cap'])} USDC."
            )
        elif fn == "setKeyDailyCap":
            out.append(
                f"Đặt hạn mức riêng mỗi ngày của {key_name(a['key'])} là {fmt_usdc(a['cap'])} USDC."
            )
        elif fn == "createPrincipal":
            out.append(f'Tạo khu mới "{a["label"]}" ({a["id"]}) do Hội đồng sở hữu.')
        elif fn == "addKey":
            out.append(f"Gắn {key_name(a['key'])} vào {dist_name(a['id'])}.")
        elif fn == "deactivateKey":
            out.append(f"Tắt {key_name(a['key'])}.")
        elif fn == "unlockPrincipal":
            pid = a.get("principalId") or a.get("principal_id") or a["id"]
            out.append(f"Mở khoá {dist_name(pid)}.")
        elif fn == "unpauseAll":
            out.append("Mở lại cả kho (bỏ dừng khẩn cấp).")
        elif fn == "bumpPolicyVersion":
            out.append("Tăng phiên bản chính sách (policy version).")
        else:
            out.append(f"Gọi {c['target']}.{fn}.")
    return out

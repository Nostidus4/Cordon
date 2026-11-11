"""KeyKind, NodeType, EdgeType, EdgeSource, AttemptOutcome, ProposalStatus, Severity (spec §2, §8.3)."""

from __future__ import annotations

from enum import StrEnum


class KeyKind(StrEnum):
    HUMAN = "HUMAN"
    AGENT = "AGENT"
    SERVICE = "SERVICE"


class NodeType(StrEnum):
    TREASURY = "Treasury"
    VAULT = "Vault"
    COUNCIL = "Council"
    MEMBER = "Member"
    PRINCIPAL = "Principal"
    KEY = "Key"
    RECIPIENT = "Recipient"
    PROTOCOL = "Protocol"
    TOKEN = "Token"


class EdgeType(StrEnum):
    HOLDS_KEY = "HOLDS_KEY"
    CONTROLS = "CONTROLS"
    ADMINS = "ADMINS"
    MAY_PAY = "MAY_PAY"
    MAY_CALL = "MAY_CALL"
    FUNDS = "FUNDS"
    APPROVES = "APPROVES"


class EdgeSource(StrEnum):
    ONCHAIN = "onchain"
    DECLARED = "declared"
    INFERRED = "inferred"


class AttemptOutcome(StrEnum):
    OK = "ok"
    REVERTED = "reverted"
    BLOCKED_AT_PROTOCOL = "blocked_at_protocol"


class ProposalStatus(StrEnum):
    OPEN = "open"
    EXECUTED = "executed"
    CANCELLED = "cancelled"


class Severity(StrEnum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"

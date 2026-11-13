"""id -> checksum address, built from a PolicySnapshot (CHN-004).

Apps keep seed ids in stores and the API; `ChainPort` takes hex only, so ids are converted at the call
site. Built from the snapshot (not derived from the seed) because on L1 the token and DEX addresses are
the deployed ones.
"""

from __future__ import annotations

from eth_utils import to_checksum_address

from guardian.domain.snapshot import PolicySnapshot

# Council-call args that carry an address (everything else, e.g. `to`/`principal_id`, is a principal id).
ADDR_ARGS = frozenset({"key", "token", "recipient", "target", "address", "subject"})


def build_address_book(snap: PolicySnapshot, vault_addr: str) -> dict[str, str]:
    book = {"vault": vault_addr}
    for k in snap.keys.values():
        book[k.seed_id] = k.address
    for m in snap.council:
        book[m.id] = book["council_" + m.id] = m.address
    for x in (*snap.recipients, *snap.protocols):
        book[x.seed_id] = x.address
    for t in snap.tokens:
        book[t.symbol] = t.address
    return {k: to_checksum_address(v) for k, v in book.items()}

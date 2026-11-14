from __future__ import annotations

from guardian.schemas.common import CamelModel, Money


class TopUpOut(CamelModel):
    """One simulated top-up: the C-Chain transfer (treasury -> escrow) and the L1 `TopUpRecorded`, joined by the
    C-Chain tx hash. UI label: "nạp tiền giả lập"."""

    c_chain_tx_hash: str
    amount: Money
    c_chain_block: int | None = None
    l1_tx_hash: str | None = None
    l1_block: int | None = None
    linked: bool
    simulated: bool = True

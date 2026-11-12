from guardian.chain.base import ChainEvent
from guardian.services.event_store import InMemoryEventStore


def ev(tx: str, i: int, block: int, name: str = "Paid") -> ChainEvent:
    return ChainEvent(name, block, tx, i, {}, 0)


def test_write_is_idempotent():
    s = InMemoryEventStore()
    assert s.write(ev("0xa", 0, 1)) is True
    assert s.write(ev("0xa", 0, 1)) is False
    assert s.write(ev("0xa", 1, 1)) is True
    assert len(s.list()) == 2


def test_list_filters():
    s = InMemoryEventStore()
    for i, (n, b) in enumerate([("Paid", 1), ("Paused", 2), ("Paid", 3)]):
        s.write(ev(f"0x{i}", 0, b, n))
    assert [e.block for e in s.list(since_block=1)] == [2, 3]
    assert [e.block for e in s.list(name="Paid")] == [1, 3]
    assert [e.block for e in s.list(limit=1)] == [1]


def test_last_block_per_source():
    s = InMemoryEventStore()
    assert s.last_block("l1") == 0
    s.set_last_block("l1", 5)
    s.set_last_block("c", 9)
    assert (s.last_block("l1"), s.last_block("c")) == (5, 9)


def test_list_is_ordered_by_block_then_log_index() -> None:
    from guardian.chain.base import ChainEvent
    from guardian.services.event_store import InMemoryEventStore

    s = InMemoryEventStore()
    for blk, li in [(3, 0), (1, 1), (1, 0)]:
        s.write(ChainEvent("X", blk, f"0x{blk}", li, {}, 0))
    assert [(e.block, e.log_index) for e in s.list()] == [(1, 0), (1, 1), (3, 0)]

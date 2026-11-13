"""Frontend/src/shared/backendTables.json must match the Python shared tables (run `make shared-tables`)."""

from guardian.tools.export_shared_tables import DEFAULT_PATH, render


def test_backend_tables_json_is_fresh() -> None:
    assert DEFAULT_PATH.read_text() == render(), "stale: run `make shared-tables`"

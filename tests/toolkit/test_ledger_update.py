"""Ledger update CLI: serial setter, history and explicit target root (FR-013 runner support)."""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import ledger  # noqa: E402


@pytest.fixture
def target(tmp_path):
    root = tmp_path / "integration"
    path = root / "tests/system/ledger.json"
    path.parent.mkdir(parents=True)
    data = {"version": 1, "ac_digests": {}, "cases": [{
        "id": "E2E-001", "command": "python -V", "title": "case", "canary": True,
        "status": "pass", "ac_ids": [], "requirement_ids": [], "history": [],
    }]}
    path.write_text(json.dumps(data), encoding="utf-8")
    return root, path


def case(path):
    return json.loads(path.read_text(encoding="utf-8"))["cases"][0]


def update(root, *args):
    return ledger.main(["--root", str(root), "--by", "test-designer", "update", "E2E-001", *args])


@pytest.mark.parametrize("value,expected", [("true", True), ("false", False)])
def test_serial_sets_boolean_and_records_update_history(target, value, expected):
    root, path = target
    assert update(root, "--serial", value, "--reason", "shared preview isolation") == 0
    c = case(path)
    assert c["serial"] is expected
    assert c["status"] == "not_run"
    assert c["canary"] is True
    assert c["command"] == "python -V"
    assert len(c["history"]) == 1
    entry = c["history"][0]
    assert entry["change"] == f"serial: None -> {expected}"
    assert entry["reason"] == "shared preview isolation"
    assert entry["by"] == "test-designer"
    assert entry["at"]


def test_serial_can_be_cleared_and_same_value_is_noop(target):
    root, path = target
    for value in ("true", "false"):
        assert update(root, "--serial", value, "--reason", "change scheduling") == 0
    c = case(path)
    assert c["serial"] is False
    assert len(c["history"]) == 2
    before = path.read_bytes()
    assert update(root, "--serial", "false", "--reason", "no change") == 0
    assert path.read_bytes() == before


def test_omitted_serial_preserves_existing_value_and_legacy_update(target):
    root, path = target
    assert update(root, "--serial", "true", "--reason", "isolation") == 0
    assert update(root, "--title", "renamed", "--canary", "false", "--reason", "rename") == 0
    c = case(path)
    assert c["serial"] is True
    assert c["title"] == "renamed"
    assert c["canary"] is False
    assert len(c["history"]) == 2
    assert "serial" not in c["history"][-1]["change"]


def test_legacy_update_does_not_add_serial_when_omitted(target):
    root, path = target
    assert update(root, "--title", "renamed", "--reason", "rename") == 0
    assert "serial" not in case(path)


@pytest.mark.parametrize("args", [("--serial", "true"), ("--serial", "true", "--reason", "")])
def test_serial_requires_reason_without_writing(target, args):
    root, path = target
    before = path.read_bytes()
    with pytest.raises(SystemExit, match="--reason"):
        update(root, *args)
    assert path.read_bytes() == before


@pytest.mark.parametrize("value", ["yes", "1", "TRUE", "invalid"])
def test_serial_rejects_values_other_than_true_false(target, value):
    root, path = target
    before = path.read_bytes()
    with pytest.raises(SystemExit) as error:
        update(root, "--serial", value, "--reason", "invalid")
    assert error.value.code == 2
    assert path.read_bytes() == before


def test_explicit_root_uses_target_config_not_cwd(target, monkeypatch, tmp_path):
    root, old_path = target
    target_path = root / "custom/cases.json"
    target_path.parent.mkdir()
    old_path.rename(target_path)
    config = root / "scripts/ebak.config.json"
    config.parent.mkdir()
    config.write_text(json.dumps({"management_files": {"ledger": "custom/cases.json"}}), encoding="utf-8")
    source = tmp_path / "source"
    source.mkdir()
    sentinel = source / "ledger.json"
    sentinel.write_text("unchanged", encoding="utf-8")
    monkeypatch.chdir(source)
    assert update(root, "--serial", "true", "--reason", "target integration") == 0
    assert case(target_path)["serial"] is True
    assert not old_path.exists()
    assert sentinel.read_text(encoding="utf-8") == "unchanged"

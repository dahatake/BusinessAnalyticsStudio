"""Recovery of existing FR-282 / AC-761..764 cases, without allocating IDs."""
import copy
import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import ledger


def git(root, *args):
    return subprocess.check_output(["git", *args], cwd=root).decode("utf-8").strip()


def make_case(cid, ac):
    return {
        "id": cid, "requirement_ids": ["FR-282"], "ac_ids": [ac],
        "title": "復元 " + cid, "command": "python -V", "layer": "e2e" if cid.startswith("E2E") else "api",
        "status": "pass", "canary": False, "serial": True,
        "last_commit": "abcdef0", "last_run_at": "2026-10-24T01:00:00+09:00",
        "evidence": "work/evidence/" + cid + ".log",
        "history": [{"at": "2026-10-23", "by": "test-designer", "change": "追加", "reason": "既存証跡"}],
        "extension": {"preserved": True},
    }


@pytest.fixture
def recovery(tmp_path, monkeypatch):
    root = tmp_path / "repo"
    root.mkdir()
    git(root, "init", "-b", "main")
    path = root / "tests/system/ledger.json"
    path.parent.mkdir(parents=True)
    cases = [make_case(cid, ac) for cid, ac in zip(
        ["IT-082", "IT-083", "IT-084", "E2E-440"], ["AC-761", "AC-762", "AC-763", "AC-764"])]
    source = {"version": 1, "ac_digests": {"AC-761": "old"}, "cases": cases}
    path.write_text(json.dumps(source, ensure_ascii=False), encoding="utf-8")
    git(root, "add", ".")
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "source")
    current = {"version": 1, "ac_digests": {"AC-001": "untouched"}, "cases": [make_case("IT-001", "AC-001")]}
    path.write_text(json.dumps(current), encoding="utf-8")
    doc = SimpleNamespace(requirements={"FR-282": object()}, params={"PARAM-001": {"value": "5", "unit": "秒"}},
                          acs={ac: ledger.h.AC(ac, "requirements.md", 1, text="timeout PARAM-001", requirement="FR-282")
                               for ac in ["AC-761", "AC-762", "AC-763", "AC-764"]})
    monkeypatch.setattr(ledger.h, "parse_requirements", lambda *args: doc)
    return root, path, source, current, doc


def restore(recovery, ids="IT-082,IT-083,IT-084,E2E-440", ref="main"):
    return ledger.main(["--root", str(recovery[0]), "restore", "--from-ref=" + ref, "--cases", ids])


def source_ref(recovery, text):
    root, path, *_ = recovery
    before = path.read_bytes()
    path.write_text(text, encoding="utf-8")
    git(root, "add", str(path.relative_to(root)))
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "bad source")
    ref = git(root, "rev-parse", "HEAD")
    path.write_bytes(before)
    return ref


# FR-282 AC-761 AC-762 AC-763 AC-764: preserve original ID, results, history and evidence.
def test_restore_keeps_cases_verbatim_and_syncs_only_selected_digests(recovery):
    root, path, source, current, doc = recovery
    assert restore(recovery) == 0
    result = json.loads(path.read_text(encoding="utf-8"))
    assert result["cases"] == current["cases"] + source["cases"]
    assert result["ac_digests"] == {"AC-001": "untouched", **{
        ac: ledger.h.ac_digest(value, doc.params) for ac, value in doc.acs.items()}}
    assert not (root / "docs/id-registry.md").exists()
    before = path.read_bytes()
    assert restore(recovery) == 0
    assert path.read_bytes() == before


# FR-282 AC-761 AC-762 AC-763 AC-764: existing-case recovery safety.
def test_restore_subset_from_commit_and_configured_path(recovery, monkeypatch, tmp_path):
    root, path, source, _, _ = recovery
    custom = root / "custom/cases.json"
    custom.parent.mkdir()
    custom.write_bytes(path.read_bytes())
    # A historical path is read from the same configured location, not the default.
    custom.write_text(json.dumps(source), encoding="utf-8")
    git(root, "add", "custom/cases.json")
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "custom")
    ref = git(root, "rev-parse", "HEAD")
    custom.write_text(json.dumps(recovery[3]), encoding="utf-8")
    config = root / "scripts/ebak.config.json"
    config.parent.mkdir()
    config.write_text(json.dumps({"management_files": {"ledger": "custom/cases.json"}}), encoding="utf-8")
    before = path.read_bytes()
    monkeypatch.chdir(tmp_path)
    assert restore(recovery, "IT-083", ref) == 0
    assert json.loads(custom.read_text(encoding="utf-8"))["cases"][-1] == source["cases"][1]
    assert path.read_bytes() == before


@pytest.mark.parametrize("ids", ["", "IT-082,IT-082", "BAD-001", "IT-82", "IT-082,IT-999"])
# FR-282 AC-761 AC-762 AC-763 AC-764: existing-case recovery safety.
def test_invalid_or_missing_case_selection_is_atomic(recovery, ids):
    before = recovery[1].read_bytes()
    with pytest.raises(SystemExit, match="ERROR ledger restore"):
        restore(recovery, ids)
    assert recovery[1].read_bytes() == before


@pytest.mark.parametrize("ref", ["", "--help", "main\n", "does-not-exist", "main:tests/system/ledger.json"])
# FR-282 AC-761 AC-762 AC-763 AC-764: existing-case recovery safety.
def test_invalid_ref_is_rejected_without_writes(recovery, ref):
    before = recovery[1].read_bytes()
    with pytest.raises(SystemExit, match="ERROR ledger restore"):
        restore(recovery, ref=ref)
    assert recovery[1].read_bytes() == before


@pytest.mark.parametrize("same_id", [True, False])
# FR-282 AC-761 AC-762 AC-763 AC-764: existing-case recovery safety.
def test_conflicting_id_or_title_cannot_overwrite_existing_case(recovery, same_id):
    _, path, source, current, _ = recovery
    conflict = copy.deepcopy(source["cases"][1])
    if same_id:
        conflict["command"] = "different command"
    else:
        conflict["id"] = "IT-099"
    current["cases"].append(conflict)
    path.write_text(json.dumps(current), encoding="utf-8")
    before = path.read_bytes()
    with pytest.raises(SystemExit, match="conflicting"):
        restore(recovery)
    assert path.read_bytes() == before  # even the first, non-conflicting case is not written


@pytest.mark.parametrize("text", ['{', '{"version":1,"version":1}', '[]',
    '{"version":true,"cases":[],"ac_digests":{}}',
    '{"version":1,"cases":{},"ac_digests":{}}',
    '{"version":1,"cases":[],"ac_digests":NaN}'])
# FR-282 AC-761 AC-762 AC-763 AC-764: existing-case recovery safety.
def test_invalid_source_json_or_top_level_schema_is_atomic(recovery, text):
    ref = source_ref(recovery, text)
    before = recovery[1].read_bytes()
    with pytest.raises(SystemExit, match="ERROR ledger restore"):
        restore(recovery, ref=ref)
    assert recovery[1].read_bytes() == before


@pytest.mark.parametrize("field,value", [
    ("id", "wrong"), ("ac_ids", "AC-761"), ("ac_ids", []), ("requirement_ids", [1]),
    ("status", "success"), ("layer", "wrong"), ("command", ""), ("canary", 1),
    ("serial", "false"), ("history", [{}]), ("evidence", []), ("last_commit", 123),
])
# FR-282 AC-761 AC-762 AC-763 AC-764: existing-case recovery safety.
def test_invalid_source_case_schema_is_atomic(recovery, field, value):
    source = copy.deepcopy(recovery[2])
    source["cases"][-1][field] = value
    ref = source_ref(recovery, json.dumps(source))
    before = recovery[1].read_bytes()
    with pytest.raises(SystemExit, match="ERROR ledger restore"):
        restore(recovery, ref=ref)
    assert recovery[1].read_bytes() == before


@pytest.mark.parametrize("where", ["source", "current"])
# FR-282 AC-761 AC-762 AC-763 AC-764: existing-case recovery safety.
def test_duplicate_case_ids_are_rejected(recovery, where):
    root, path, source, current, _ = recovery
    data = copy.deepcopy(source if where == "source" else current)
    data["cases"].append(copy.deepcopy(data["cases"][0]))
    if where == "source":
        ref = source_ref(recovery, json.dumps(data))
    else:
        path.write_text(json.dumps(data), encoding="utf-8")
        ref = "main"
    before = path.read_bytes()
    with pytest.raises(SystemExit, match="duplicate case id"):
        restore(recovery, ref=ref)
    assert path.read_bytes() == before


@pytest.mark.parametrize("kind", ["req", "ac", "owner"])
# FR-282 AC-761 AC-762 AC-763 AC-764: existing-case recovery safety.
def test_unknown_requirements_or_mismatched_ac_are_atomic(recovery, kind):
    doc = recovery[4]
    if kind == "req":
        doc.requirements.clear()
    elif kind == "ac":
        del doc.acs["AC-764"]
    else:
        doc.acs["AC-764"].requirement = "FR-999"
    before = recovery[1].read_bytes()
    with pytest.raises(SystemExit, match="unknown|mismatched"):
        restore(recovery)
    assert recovery[1].read_bytes() == before


# FR-282 AC-761 AC-762 AC-763 AC-764: existing-case recovery safety.
def test_missing_source_ledger_and_invalid_destination_do_not_write(recovery):
    root, path, *_ = recovery
    before = path.read_bytes()
    git(root, "rm", "--cached", "tests/system/ledger.json")
    git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "no ledger")
    with pytest.raises(SystemExit, match="Git show failed"):
        restore(recovery, ref="HEAD")
    assert path.read_bytes() == before
    path.write_text("not JSON", encoding="utf-8")
    with pytest.raises(SystemExit, match="ERROR ledger restore"):
        restore(recovery, ref="main~1")
    assert path.read_text() == "not JSON"


# FR-282 AC-761 AC-762 AC-763 AC-764: existing-case recovery safety.
def test_restore_dispatch_uses_writer_lock(recovery, monkeypatch):
    entered = []
    original = ledger.ledger_lock
    class TrackingLock(original):
        def __enter__(self):
            entered.append(True)
            return super().__enter__()
    monkeypatch.setattr(ledger, "ledger_lock", TrackingLock)
    assert restore(recovery, "IT-082") == 0
    assert entered == [True]
    assert not (recovery[0] / "work/.ebak/ledger.lock").exists()


@pytest.mark.parametrize("configured", ["../ledger.json", "C:/outside.json"])
# FR-282 AC-761 AC-762 AC-763 AC-764: existing-case recovery safety.
def test_repository_external_ledger_path_is_rejected(recovery, configured):
    root, path, *_ = recovery
    config = root / "scripts/ebak.config.json"
    config.parent.mkdir()
    config.write_text(json.dumps({"management_files": {"ledger": configured}}), encoding="utf-8")
    before = path.read_bytes()
    with pytest.raises(SystemExit, match="repository-relative"):
        restore(recovery)
    assert path.read_bytes() == before


# FR-282 AC-761 AC-762 AC-763 AC-764: existing-case recovery safety.
def test_identical_existing_case_refreshes_digest_without_changing_history(recovery):
    _, path, source, current, doc = recovery
    current["cases"].append(copy.deepcopy(source["cases"][0]))
    current["ac_digests"]["AC-761"] = "stale"
    path.write_text(json.dumps(current), encoding="utf-8")
    assert restore(recovery, "IT-082") == 0
    result = json.loads(path.read_text(encoding="utf-8"))
    assert result["cases"] == current["cases"]
    assert result["ac_digests"]["AC-761"] == ledger.h.ac_digest(doc.acs["AC-761"], doc.params)

"""Q-114 / Q-111: PARAM の廃止と ID 台帳の同期・採番の回帰テスト。"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import ebaklib as h  # noqa: E402

NEXT_ID = ROOT / "scripts" / "next-id.py"

# 実際の画面 AC を検証するものではない。Q-114（FR-151 AC-259 に関連）と
# Q-111（FR-228 AC-529 に関連）の、ID 台帳に関する前提だけを検証する。
REQUIREMENTS = """\
# Requirements

## Parameters
| ID | 旧決定状態 | 名前 | 値 | 単位 | 根拠 | **決定状態** |
|---|---|---|---|---|---|---|
| PARAM-034 | 承認済み | 旧値 | 240 | px | 承認済みだった | **廃止**（Q-114） |
| PARAM-085 | 承認済み | 旧寸法 | 240×120（廃止前） | px | 廃止前に承認済み | 廃止（Q-111） |
| PARAM-136 | 廃止 | 現行値 | 360 | px | 旧案は廃止 | 承認済み（旧案は廃止） |
| PARAM-137 | 廃止 | 稼働中 | 1 | 件 | 過去に廃止した値 | 使用中（過去に廃止） |
| PARAM-138 | 廃止 | 廃止予定の案 | 2 | 件 | 廃止の検討 | 廃止予定 |
| PARAM-139 | 廃止 | 保留中 | 3 | 件 | 根拠に廃止と記載 | 保留（廃止案を検討） |
| PARAM-140 | 廃止 | 現行値 | 4 | 件 | 廃止の歴史 | 使用中 - 旧値は廃止 |
| PARAM-142 | 承認済み | 廃止理由の表記 | 7 | 件 | 根拠 | 廃止：理由 |
| PARAM-143 | 承認済み | 廃止理由の表記 | 8 | 件 | 根拠 | 廃止 (reason) |
| PARAM-144 | 承認済み | 廃止理由の表記 | 9 | 件 | 根拠 | 廃止: reason |
| PARAM-145 | 廃止 | 継続中 | 10 | 件 | 根拠 | 未廃止 |
| PARAM-999 | 承認済み | 最も新しい廃止済み | 5 | 件 | 過去の記録 | 廃止 |

## Legacy table without a decision-state column
| ID | 名前 | 値 | 単位 | 根拠 |
|---|---|---|---|---|
| PARAM-141 | 廃止された旧案 | 6 | 件 | 旧値は廃止 |

## Question
| ID | 回答 |
|---|---|
| Q-901 | 回答済み |

#### FR-901 Active fixture requirement
- 決定状態: 承認済み（依頼）
- 受入基準 AC-901: The fixture AC remains defined.

#### FR-902 Retired fixture requirement
- 決定状態: 廃止（依頼）
- 受入基準 AC-902: The fixture AC remains defined.

#### NFR-UX-901 Retired fixture requirement
- 決定状態: 廃止（依頼）
- 受入基準 AC-903: The fixture AC remains defined.
"""

REGISTRY_HEADER = (
    "# ID 台帳\n\n"
    "| ID | 種別 | 状態 | 採番日時 | 採番元 | メモ |\n"
    "|---|---|---|---|---|---|\n"
)

INITIAL_STATES = {
    "PARAM-034": "使用中",
    "PARAM-085": "採番済み",
    "PARAM-136": "廃止",
    "PARAM-137": "採番済み",
    "PARAM-138": "使用中",
    "PARAM-139": "使用中",
    "PARAM-140": "使用中",
    "PARAM-141": "採番済み",
    "PARAM-142": "使用中",
    "PARAM-143": "使用中",
    "PARAM-144": "使用中",
    "PARAM-145": "使用中",
    "PARAM-997": "欠番",
    "PARAM-998": "削除済み",
    "PARAM-999": "廃止",
    "FR-901": "採番済み",
    "FR-902": "使用中",
    "NFR-UX-901": "使用中",
    "AC-901": "採番済み",
    "AC-902": "使用中",
    "AC-903": "採番済み",
    "Q-901": "採番済み",
    "E2E-901": "採番済み",
    "INT-901": "使用中",
    "INT-902": "採番済み",
}


def write_registry(root, states):
    rows = [
        f"| {id_} | {h.id_kind(id_) or 'INT'} | {state} | original-time | original-source | keep |\n"
        for id_, state in states.items()
    ]
    (root / "docs" / "id-registry.md").write_text(REGISTRY_HEADER + "".join(rows), encoding="utf-8")


@pytest.fixture
def fixture_repo(tmp_path):
    root = tmp_path / "isolated"
    root.mkdir()
    subprocess.run(["git", "init", "-q", str(root)], check=True, capture_output=True)
    (root / "docs").mkdir()
    (root / "scripts").mkdir()
    (root / "fixtures").mkdir()
    (root / "docs" / "requirements-definition.md").write_text(REQUIREMENTS, encoding="utf-8")
    (root / "docs" / "integrations.md").write_text(
        "#### INT-901 Retired\n- 状態: 廃止\n\n#### INT-902 Active\n- 状態: 運用中\n", encoding="utf-8"
    )
    (root / "fixtures" / "cases.json").write_text(
        json.dumps({"cases": [{"id": "E2E-901"}]}), encoding="utf-8"
    )
    (root / "scripts" / "ebak.config.json").write_text(
        json.dumps({"management_files": {"ledger": "fixtures/cases.json"}}), encoding="utf-8"
    )
    write_registry(root, INITIAL_STATES)
    return root


def cli(root, *args):
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    result = subprocess.run(
        [sys.executable, str(NEXT_ID), "--root", str(root), *args],
        cwd=root, env=env, encoding="utf-8", capture_output=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    return result.stdout


def states(root):
    registry = h.parse_registry_text((root / "docs" / "id-registry.md").read_text(encoding="utf-8"))
    return {id_: row["state"] for id_, row in registry.items()}


# Q-114 / PARAM-034（FR-151 AC-259 関連）: 名前が完全一致する現行の決定状態列を読む。
def test_parameter_parser_uses_the_current_named_decision_column(fixture_repo):
    doc = h.parse_requirements(fixture_repo, h.load_config(fixture_repo))
    assert doc.params["PARAM-034"]["state"] == "**廃止**（Q-114）"
    assert doc.params["PARAM-085"]["state"] == "廃止（Q-111）"
    assert doc.params["PARAM-136"]["state"] == "承認済み（旧案は廃止）"
    assert doc.params["PARAM-140"]["state"] == "使用中 - 旧値は廃止"
    assert doc.params["PARAM-141"]["state"] == ""
    assert doc.params["PARAM-085"]["value"] == "240×120（廃止前）"
    assert doc.params["PARAM-034"]["unit"] == "px"


# Q-114 / PARAM-034・Q-111 / PARAM-085（AC-259・AC-529 関連）: 同期と再同期。
def test_sync_marks_retired_params_and_ignores_historical_mentions(fixture_repo):
    registry = fixture_repo / "docs" / "id-registry.md"
    original = registry.read_text(encoding="utf-8")
    output = cli(fixture_repo, "--sync")
    result = states(fixture_repo)
    assert "PARAM-034: 使用中 -> 廃止" in output
    assert "PARAM-085: 採番済み -> 廃止" in output
    for id_ in ("PARAM-034", "PARAM-085", "PARAM-142", "PARAM-143", "PARAM-144", "PARAM-999"):
        assert result[id_] == "廃止", id_
    for id_ in ("PARAM-136", "PARAM-137", "PARAM-138", "PARAM-139", "PARAM-140", "PARAM-141", "PARAM-145"):
        assert result[id_] == "使用中", id_
    assert result["PARAM-997"] == "欠番"
    assert result["PARAM-998"] == "削除済み"
    updated = registry.read_text(encoding="utf-8")
    assert "| PARAM-034 | PARAM | 廃止 | original-time | original-source | keep |" in updated
    assert original != updated
    assert "changed=0 adopted=0" in cli(fixture_repo, "--sync")
    assert "changed=0 adopted=0" in cli(fixture_repo, "--sync", "--adopt")
    assert registry.read_text(encoding="utf-8") == updated


# Q-114 / PARAM-034・Q-111 / PARAM-085（AC-259・AC-529 関連）: 既存 ID の取り込み。
@pytest.mark.parametrize("registry_exists", [True, False])
def test_adopt_records_retired_and_active_parameters_and_is_idempotent(fixture_repo, registry_exists):
    registry = fixture_repo / "docs" / "id-registry.md"
    if registry_exists:
        write_registry(fixture_repo, {})
    else:
        registry.unlink()
    output = cli(fixture_repo, "--sync", "--adopt")
    assert "adopted=0" not in output
    result = states(fixture_repo)
    for id_ in ("PARAM-034", "PARAM-085", "PARAM-142", "PARAM-143", "PARAM-144", "PARAM-999"):
        assert result[id_] == "廃止", id_
    for id_ in ("PARAM-136", "PARAM-137", "PARAM-138", "PARAM-139", "PARAM-140", "PARAM-141", "PARAM-145"):
        assert result[id_] == "使用中", id_
    before = registry.read_bytes()
    assert "changed=0 adopted=0" in cli(fixture_repo, "--sync", "--adopt")
    assert "changed=0 adopted=0" in cli(fixture_repo, "--sync")
    assert registry.read_bytes() == before


# Q-114 / PARAM-034（AC-259 関連）: 他種別の既存同期・取り込みに影響させない。
def test_existing_id_kinds_keep_their_sync_and_adopt_behavior(fixture_repo):
    cli(fixture_repo, "--sync")
    result = states(fixture_repo)
    ids = ("FR-901", "FR-902", "NFR-UX-901", "AC-901", "AC-902", "AC-903", "Q-901",
           "E2E-901", "INT-901", "INT-902")
    assert {k: result[k] for k in ids} == {
        "FR-901": "使用中", "FR-902": "廃止", "NFR-UX-901": "廃止",
        "AC-901": "使用中", "AC-902": "使用中", "AC-903": "使用中",
        "Q-901": "使用中", "E2E-901": "使用中",
        "INT-901": "廃止", "INT-902": "使用中",
    }
    write_registry(fixture_repo, {})
    cli(fixture_repo, "--sync", "--adopt")
    adopted = states(fixture_repo)
    assert {k: adopted[k] for k in ids} == {k: result[k] for k in ids}


# Q-114 / PARAM-034（AC-259 関連）: 予約済み・削除・欠番と finalize の既存動作。
def test_absent_reserved_and_removed_ids_keep_existing_finalize_behavior(fixture_repo):
    write_registry(fixture_repo, {
        "PARAM-034": "使用中", "PARAM-992": "削除済み", "PARAM-993": "欠番",
        "PARAM-994": "廃止", "PARAM-995": "使用中", "PARAM-996": "採番済み",
    })
    cli(fixture_repo, "--sync")
    assert states(fixture_repo) == {
        "PARAM-034": "廃止", "PARAM-992": "削除済み", "PARAM-993": "欠番",
        "PARAM-994": "削除済み", "PARAM-995": "削除済み", "PARAM-996": "採番済み",
    }
    cli(fixture_repo, "--sync", "--finalize")
    assert states(fixture_repo)["PARAM-996"] == "欠番"
    assert states(fixture_repo)["PARAM-034"] == "廃止"
    assert "changed=0 adopted=0" in cli(fixture_repo, "--sync", "--finalize")


# Q-114 / PARAM-034（AC-259 関連）: 廃止・削除・欠番と予約済み ID を再採番しない。
def test_allocation_advances_past_retired_and_deleted_ids(fixture_repo):
    cli(fixture_repo, "--sync")
    assert cli(fixture_repo, "--peek", "PARAM").strip() == "PARAM-1000"
    assert cli(fixture_repo, "PARAM", "--count", "2").splitlines() == ["PARAM-1000", "PARAM-1001"]
    cli(fixture_repo, "--sync", "--adopt")
    result = states(fixture_repo)
    assert result["PARAM-999"] == "廃止"
    assert result["PARAM-997"] == "欠番"
    assert result["PARAM-998"] == "削除済み"
    assert result["PARAM-1000"] == result["PARAM-1001"] == "採番済み"
    assert cli(fixture_repo, "--peek", "PARAM").strip() == "PARAM-1002"


# Q-114 / PARAM-034（AC-259 関連）: rdfix 用の同期計画では削除・欠番の再使用を報告する。
@pytest.mark.parametrize("old_state", ["削除済み", "欠番"])
def test_protected_deleted_or_abandoned_ids_are_not_revived_by_rdfix_plan(fixture_repo, old_state):
    write_registry(fixture_repo, {"PARAM-034": old_state, "FR-901": old_state})
    next_id = h.load_script("next-id")
    plan = next_id.plan_sync(fixture_repo, h.load_config(fixture_repo), adopt=False, finalize=False, revive=False)
    assert set(plan["reused"]) == {"PARAM-034", "FR-901"}
    assert states(fixture_repo) == {"PARAM-034": old_state, "FR-901": old_state}
    assert h.parse_registry_text(plan["text"])["PARAM-034"]["state"] == old_state
    assert h.parse_registry_text(plan["text"])["FR-901"]["state"] == old_state

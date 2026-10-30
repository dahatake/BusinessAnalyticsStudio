"""FR-212 管理データのエンティティの分類（§3.7 の分類表）の検査（rdcheck CHK-29・scripts/entity_classes.py）の結合テスト。"""
from __future__ import annotations

import copy
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import ebaklib as h  # noqa: E402
import entity_classes as ec  # noqa: E402
import rdcheck  # noqa: E402

HEADER = "| エンティティ | 世界区分 | 種別 | 上位 | 整理の軸 | ツイン | カタログの対応 |\n|---|---|---|---|---|---|---|\n"
ROWS = [
    "| 企業 | 現実世界 | 組織 | なし | 名前 | データ一覧（記録する） | 共通部品「企業ストア」 |",
    "| 拠点 | 現実世界 | 拠点 | 企業 | 位置 | 3D モデル（表す）、データ一覧（表示する） | なし |",
    "| データ一覧 | デジタル世界 | データ | なし | 名前・時間 | なし | テーブル「records」 |",
    "| 3D モデル | デジタル世界 | モデル | データ一覧 | 階層 | なし | INT-001 |",
    "| 連携 | デジタル世界 | システム | なし | 分類 | なし | 外部連携「受注 API」 |",
]
REQ = """
#### FR-001 拠点を見る
- 要求: 拠点を見る。
- 決定状態: 承認済み（依頼 2026-10-17）
- 優先度: SHOULD
- 上位: G-001
- 対象エンティティ: 拠点、企業（本社）
- 関係する状態: なし
- 参照パラメータ: なし
"""
CATALOG = {"part": ["企業ストア"], "api": [], "table": ["records"]}
INT_IDS = ["INT-001"]
INT_NAMES = ["受注 API"]


def doc_of(rows=None, req: str = REQ):
    text = "# 要求定義書\n\n### 3.7 情報の構造\n\n" + HEADER + "\n".join(rows if rows is not None else ROWS) + "\n\n## 5. 要求\n" + req
    return h.parse_requirements_texts({"docs/requirements-definition.md": text})


def run(rows=None, req: str = REQ, defn=None):
    return ec.check(doc_of(rows, req), defn if defn is not None else ec.load_definition(), CATALOG, INT_IDS, INT_NAMES)


def replace(row_index: int, new: str):
    rows = list(ROWS)
    rows[row_index] = new
    return rows


# FR-212 AC-487
def test_fr212_ac487_valid_table_passes():
    assert run() == []


# FR-212 AC-487
def test_fr212_ac487_requirement_entity_missing_from_table():
    req = REQ.replace("対象エンティティ: 拠点、企業（本社）", "対象エンティティ: 拠点、倉庫")
    probs = run(req=req)
    assert len(probs) == 1
    f, ln, msg = probs[0]
    assert ln > 0 and "FR-001" in msg and "倉庫" in msg and "分類表にありません" in msg


# FR-212 AC-487
def test_fr212_ac487_unknown_parent_and_twin():
    probs = run(replace(1, "| 拠点 | 現実世界 | 拠点 | 本社 | 位置 | 地図（表す） | なし |"))
    msgs = [m for _, _, m in probs]
    assert any("上位「本社」が分類表にありません" in m for m in msgs)
    assert any("ツイン「地図」が分類表にありません" in m for m in msgs)
    assert all(ln > 0 for _, ln, _ in probs)


# FR-212 AC-487
def test_fr212_ac487_twin_in_same_world():
    probs = run(replace(1, "| 拠点 | 現実世界 | 拠点 | 企業 | 位置 | 企業（表す） | なし |"))
    assert any("同じ世界区分" in m for _, _, m in probs)


# FR-212 AC-487
def test_fr212_ac487_parent_cycle():
    rows = replace(0, "| 企業 | 現実世界 | 組織 | 拠点 | 名前 | なし | なし |")
    probs = run(rows)
    cyc = [p for p in probs if "循環" in p[2]]
    assert len(cyc) == 1
    assert cyc[0][1] > 0


# FR-212 AC-487
def test_fr212_ac487_catalog_names_must_exist():
    rows = list(ROWS)
    rows[0] = "| 企業 | 現実世界 | 組織 | なし | 名前 | なし | 共通部品「存在しない部品」 |"
    rows[2] = "| データ一覧 | デジタル世界 | データ | なし | 名前 | なし | テーブル「no_table」 |"
    rows[3] = "| 3D モデル | デジタル世界 | モデル | データ一覧 | 階層 | なし | INT-999 |"
    rows[4] = "| 連携 | デジタル世界 | システム | なし | 分類 | なし | 外部連携「ない連携」 |"
    msgs = [m for _, _, m in run(rows)]
    assert any("存在しない部品" in m for m in msgs)
    assert any("no_table" in m for m in msgs)
    assert any("INT-999" in m for m in msgs)
    assert any("ない連携" in m for m in msgs)


# FR-212 AC-487
def test_fr212_ac487_this_repository_requirements_pass():
    """この run の要求定義書（§3.7 の分類表と全要求の対象エンティティ）は合格する。"""
    cfg = h.load_config(ROOT)
    ck = rdcheck.Checker(ROOT, cfg, None, None, False, False)
    ck.chk29()
    assert [f.line() for f in ck.findings if f.chk == "CHK-29"] == []
    assert ec.find_tables(ck.doc, ec.load_definition()), "要求定義書に §3.7 の分類表がない"


# FR-212 AC-487
def test_fr212_ac487_no_table_means_no_findings():
    doc = h.parse_requirements_texts({"docs/requirements-definition.md": "# 要求定義書\n" + REQ})
    assert ec.check(doc, ec.load_definition(), CATALOG) == []


# FR-212 AC-488
def test_fr212_ac488_definition_lists_fields():
    defn = ec.load_definition()
    names = {f["name"]: f for f in defn["fields"]}
    for n in ("世界区分", "種別", "上位", "整理の軸", "ツイン", "カタログの対応"):
        assert n in names and "required" in names[n]
    assert names["世界区分"]["allowed"] == ["現実世界", "デジタル世界"]
    assert "センサー/指標" in names["種別"]["allowed_by_world"]["デジタル世界"]
    assert names["ツイン"]["relation_allowed"] == ["表す", "計測する", "記録する", "表示する"]


# FR-212 AC-488
@pytest.mark.parametrize("role,key,value,expect", [
    ("world", "allowed", "デジタル世界", "世界区分「デジタル世界」は許容値"),
    ("axis", "allowed", "位置", "整理の軸「位置」は許容値"),
    ("twins", "relation_allowed", "表す", "関係の種類「表す」は許容値"),
])
def test_fr212_ac488_removing_allowed_value_makes_rows_fail(role, key, value, expect):
    defn = copy.deepcopy(ec.load_definition())
    f = next(x for x in defn["fields"] if x["role"] == role)
    f[key] = [v for v in f[key] if v != value]
    assert any(expect in m for _, _, m in run(defn=defn))


# FR-212 AC-488
def test_fr212_ac488_removing_kind_from_definition_fails_rows():
    defn = copy.deepcopy(ec.load_definition())
    f = next(x for x in defn["fields"] if x["role"] == "kind")
    f["allowed_by_world"]["現実世界"].remove("拠点")
    probs = run(defn=defn)
    assert any("種別「拠点」は現実世界の許容値" in m for _, _, m in probs)


# FR-212 AC-488
def test_fr212_ac488_wrong_kind_for_world():
    probs = run(replace(2, "| データ一覧 | デジタル世界 | 設備 | なし | 名前 | なし | なし |"))
    assert any("種別「設備」はデジタル世界の許容値" in m for _, _, m in probs)


# FR-212 AC-488
def test_fr212_ac488_missing_required_column_is_reported():
    text = ("# 要求定義書\n\n| エンティティ | 世界区分 | 種別 | 上位 | 整理の軸 | カタログの対応 |\n|---|---|---|---|---|---|\n"
            "| 企業 | 現実世界 | 組織 | なし | 名前 | なし |\n")
    doc = h.parse_requirements_texts({"docs/requirements-definition.md": text})
    probs = ec.check(doc, ec.load_definition(), CATALOG)
    assert any("必須の欄「ツイン」" in m for _, _, m in probs)


# FR-212 AC-487/488: rdcheck から分類表検査と既存の欄定義検査の双方に接続する。
def test_fr212_ac487_ac488_rdcheck_reports_classification_and_field_errors(tmp_path):
    p = tmp_path / "docs" / "requirements-definition.md"
    p.parent.mkdir()
    doc = doc_of(
        replace(1, "| 拠点 | 現実世界 | 拠点 | 未知の親 | 位置 | なし | なし |"),
        req=REQ + "- 未定義の欄: 値\n",
    )
    p.write_text(next(iter(doc.text.values())), encoding="utf-8")
    ck = rdcheck.Checker(tmp_path, h.DEFAULT_CONFIG, None, None, False, False)
    ck.run_all()
    findings = [f for f in ck.findings if f.chk == "CHK-29"]
    assert any("上位「未知の親」が分類表にありません" in f.msg for f in findings)
    assert any("未定義の欄" in f.msg and "メタデータ定義" in f.msg for f in findings)
    assert all(f.loc.startswith("docs/requirements-definition.md:") for f in findings)

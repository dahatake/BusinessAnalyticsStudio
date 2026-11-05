"""project_checks.py - BusinessAnalyticsStudio 固有の検査（FR-1082 の拡張点。scripts/ext/ は自動で読み込まれる）。

toolkit 本体（rdcheck.py・rdfix.py・metadata.json）は更新で上書きされるため、利用側の検査はここに置く。
  - 外部連携カタログ（FR-188〜FR-199・NFR-SEC-006・NFR-OPS-001）: scripts/integration_catalog.py の check
  - エンティティ分類表（FR-212 AC-487/488）: scripts/entity_classes.py の check（定義は scripts/entity_classification.json）
rdfix --apply のときは、外部連携カタログがなければ雛形を作る（FR-199 AC-427。意味に関わる欄は値を入れない）。
"""
from __future__ import annotations

import sys
from pathlib import Path

_HERE = str(Path(__file__).resolve().parent.parent)
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import ebaklib as h  # noqa: E402
import entity_classes as ec  # noqa: E402
import integration_catalog as ic  # noqa: E402


def _is_rdfix_apply() -> bool:
    return Path(sys.argv[0]).name == "rdfix.py" and "--apply" in sys.argv[1:]


def check_integration_catalog(root, cfg):
    """CHK-28: 外部連携カタログの欄・資格情報形式の検査。rdfix --apply では、カタログがなければ雛形を作る。"""
    root = Path(root)
    if _is_rdfix_apply():
        path = root / ic.path_of(cfg)
        if not path.exists():
            h.write_text_atomic(path, ic.TEMPLATE)
    doc = h.parse_requirements(root, cfg)
    return [(level, "CHK-28", loc, msg) for level, loc, msg in ic.check(root, cfg, doc)]


def check_entity_classes(root, cfg):
    """CHK-29: 要求定義書 §3.7 の分類表の検査。"""
    root = Path(root)
    doc = h.parse_requirements(root, cfg)
    cat_tables = h.parse_catalog_tables(root, cfg)
    col = {"part": "部品名", "api": "名前", "table": "テーブル名"}
    names = {"part": {}, "api": {}, "table": {}}
    for kind, t in cat_tables:
        c = t.col(col[kind]) if kind in col else None
        if c is None:
            continue
        for ln, cells in t.rows:
            n = h.strip_md(cells[c]) if c < len(cells) else ""
            if n and n not in h.NONE_VALUES:
                names[kind].setdefault(n, ln)
    integ = h.parse_integrations(root, cfg)
    int_ids = set(integ.by_id()) if integ.exists else set()
    _, _, irows = ic.parse(root, cfg)
    problems = ec.check(doc, ec.load_definition(), names, int_ids, [r.name for r in irows if r.name])
    return [("ERROR", "CHK-29", f"{f}:{ln}" if ln else str(f), msg) for f, ln, msg in problems]


check_integration_catalog.target = "both"
check_entity_classes.target = "rdcheck"

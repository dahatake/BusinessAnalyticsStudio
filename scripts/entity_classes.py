#!/usr/bin/env python3
"""entity_classes.py - 要求定義書 §3.7 のエンティティの分類表の検査（FR-212。rdcheck の CHK-29）。

分類表の欄の名前・必須/任意・許容値は scripts/metadata.json の entity_classification に定義し、この検査はその定義だけを読む
（AC-488: 許容値を定義から外すと、その値を使う行がエラーになる）。検査の項目（AC-487）:
  * 要求（有効なもの）の対象エンティティが分類表にある
  * 上位とツインの参照先が分類表にある
  * ツインが異なる世界区分どうし
  * 上位の連鎖が循環しない
  * カタログの対応の名前が、カタログ（共通部品・API・イベント・テーブル）か外部連携カタログに実在する
分類表がない要求定義書（この検査を導入する前のもの）は何も報告しない（後方互換）。
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

import ebaklib as h

META_FILE = Path(__file__).resolve().parent / "metadata.json"
ASSET_CELL_RE = re.compile(r"^(共通部品|API|イベント|テーブル|外部連携)\s*[「『]([^」』]+)[」』]$")
INT_RE = re.compile(r"^INT-\d{3,}$")
TWIN_RE = re.compile(r"^(.+?)\s*[（(]([^）)]*)[）)]$")

Problem = Tuple[str, int, str]  # (file, line, message)


def load_definition(meta_path: Optional[Path] = None) -> dict:
    """metadata.json の entity_classification（なければ空の dict）。"""
    p = meta_path or META_FILE
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data.get("entity_classification") or {}


@dataclass
class Row:
    file: str
    line: int
    cells: Dict[str, str]  # role -> raw cell


@dataclass
class ClassTable:
    file: str
    line: int
    rows: List[Row] = field(default_factory=list)
    missing_columns: List[str] = field(default_factory=list)


def _norm(s: str) -> str:
    return h.strip_md(s).replace(" ", "").replace("\u3000", "")


def _fields(defn: dict) -> List[dict]:
    return list(defn.get("fields") or [])


def _field(defn: dict, role: str) -> dict:
    return next((f for f in _fields(defn) if f.get("role") == role), {})


def find_tables(doc: "h.RequirementsDoc", defn: dict) -> List[ClassTable]:
    """名前・世界区分・種別の欄（定義の名前と完全一致）を見出しに持つ表を分類表とする。"""
    fields = _fields(defn)
    key_roles = ("name", "world", "kind")
    key_names = [_norm(_field(defn, r).get("name", "")) for r in key_roles]
    if not all(key_names):
        return []
    out: List[ClassTable] = []
    for rel, text in doc.text.items():
        for t in h.parse_tables(text.splitlines()):
            header = [_norm(x) for x in t.header]
            if not all(k in header for k in key_names):
                continue
            ct = ClassTable(rel, t.header_line)
            col: Dict[str, int] = {}
            for f in fields:
                n = _norm(f.get("name", ""))
                if n in header:
                    col[f["role"]] = header.index(n)
                elif f.get("required"):
                    ct.missing_columns.append(f.get("name", ""))
            for ln, cells in t.rows:
                ct.rows.append(Row(rel, ln, {role: (cells[i] if i < len(cells) else "") for role, i in col.items()}))
            out.append(ct)
    return out


def _is_none(cell: str, f: dict) -> bool:
    v = h.strip_md(cell)
    return v in h.NONE_VALUES or (f.get("none") is not None and v == f.get("none"))


def _base_name(name: str) -> str:
    """括弧つきの名前は括弧の前の名前の行に従う（§3.7 の規則）。"""
    return re.sub(r"\s*[（(][^）)]*[）)]\s*$", "", name).strip()


def check(doc: "h.RequirementsDoc", defn: dict, catalog_names: Dict[str, Iterable[str]],
          integration_ids: Iterable[str] = (), integration_names: Iterable[str] = ()) -> List[Problem]:
    """分類表を検査し、(ファイル, 行, 理由) の一覧を返す。catalog_names は {"part"|"api"|"table": 名前}。"""
    if not defn:
        return []
    tables = find_tables(doc, defn)
    if not tables:
        return []
    problems: List[Problem] = []
    for t in tables:
        for c in t.missing_columns:
            problems.append((t.file, t.line, f"分類表に必須の欄「{c}」がありません（scripts/metadata.json の entity_classification）"))

    f_name, f_world, f_kind = _field(defn, "name"), _field(defn, "world"), _field(defn, "kind")
    f_parent, f_axis, f_twins, f_cat = _field(defn, "parent"), _field(defn, "axis"), _field(defn, "twins"), _field(defn, "catalog")
    worlds_allowed: List[str] = list(f_world.get("allowed") or [])
    kinds_by_world: Dict[str, List[str]] = dict(f_kind.get("allowed_by_world") or {})
    axes_allowed: List[str] = list(f_axis.get("allowed") or [])
    relations_allowed: List[str] = list(f_twins.get("relation_allowed") or [])
    asset_kinds: List[str] = list(f_cat.get("asset_kinds") or [])
    axis_sep = f_axis.get("separator") or "・"

    rows: Dict[str, Row] = {}
    for t in tables:
        for r in t.rows:
            name = h.strip_md(r.cells.get("name", ""))
            if not name:
                problems.append((r.file, r.line, f"分類表の行に{f_name.get('name', 'エンティティ')}の名前がありません"))
                continue
            if name in rows:
                problems.append((r.file, r.line, f"分類表に「{name}」が重複しています（{rows[name].line} 行目）"))
                continue
            rows[name] = r

    # 必須の欄・許容値
    for name, r in rows.items():
        for f in _fields(defn):
            role = f.get("role")
            if role and f.get("required") and role in r.cells and not h.strip_md(r.cells[role]):
                problems.append((r.file, r.line, f"「{name}」の欄「{f.get('name')}」が空です（値か「なし」を書きます）"))
        world = h.strip_md(r.cells.get("world", ""))
        if world and world not in worlds_allowed:
            problems.append((r.file, r.line, f"「{name}」の世界区分「{world}」は許容値（{'／'.join(worlds_allowed)}）にありません"))
        kind = h.strip_md(r.cells.get("kind", ""))
        if kind and world in worlds_allowed:
            allowed = kinds_by_world.get(world) or []
            if kind not in allowed:
                problems.append((r.file, r.line, f"「{name}」の種別「{kind}」は{world}の許容値（{'／'.join(allowed)}）にありません"))
        axis = h.strip_md(r.cells.get("axis", ""))
        for a in [x.strip() for x in axis.split(axis_sep) if x.strip()] if axis else []:
            if a not in axes_allowed:
                problems.append((r.file, r.line, f"「{name}」の整理の軸「{a}」は許容値（{'／'.join(axes_allowed)}）にありません"))

    # 上位: 実在・同じ世界区分・循環
    parent_of: Dict[str, str] = {}
    for name, r in rows.items():
        cell = r.cells.get("parent", "")
        if not h.strip_md(cell) or _is_none(cell, f_parent):
            continue
        p = _base_name(h.strip_md(cell).strip("「」『』"))
        if p not in rows:
            problems.append((r.file, r.line, f"「{name}」の上位「{p}」が分類表にありません"))
            continue
        parent_of[name] = p
        w, pw = h.strip_md(r.cells.get("world", "")), h.strip_md(rows[p].cells.get("world", ""))
        if w and pw and w != pw:
            problems.append((r.file, r.line, f"「{name}」（{w}）の上位「{p}」が{pw}です。上位は同じ世界区分の中だけで指します"))
    reported: Set[str] = set()
    for start in parent_of:
        seen: List[str] = []
        cur: Optional[str] = start
        while cur is not None and cur not in seen:
            seen.append(cur)
            cur = parent_of.get(cur)
        if cur == start and start not in reported:
            reported.update(seen)
            r = rows[start]
            problems.append((r.file, r.line, f"「{start}」の上位が循環しています（{' → '.join(seen + [start])}）"))

    # ツイン: 実在・関係の種類・異なる世界区分
    for name, r in rows.items():
        cell = r.cells.get("twins", "")
        if not h.strip_md(cell) or _is_none(cell, f_twins):
            continue
        for part in re.split(r"[、,，]", h.strip_md(cell)):
            part = part.strip()
            if not part:
                continue
            m = TWIN_RE.match(part)
            target, rel = (m.group(1).strip(), m.group(2).strip()) if m else (part, "")
            target = target.strip("「」『』")
            if not rel:
                problems.append((r.file, r.line, f"「{name}」のツイン「{target}」に関係の種類（{'・'.join(relations_allowed)}）がありません"))
            elif rel not in relations_allowed:
                problems.append((r.file, r.line, f"「{name}」のツイン「{target}」の関係の種類「{rel}」は許容値（{'／'.join(relations_allowed)}）にありません"))
            if target not in rows:
                problems.append((r.file, r.line, f"「{name}」のツイン「{target}」が分類表にありません"))
                continue
            w, tw = h.strip_md(r.cells.get("world", "")), h.strip_md(rows[target].cells.get("world", ""))
            if w and tw and w == tw:
                problems.append((r.file, r.line, f"「{name}」とツイン「{target}」が同じ世界区分（{w}）です。ツインは現実世界とデジタル世界の組にします"))

    # カタログの対応: カタログか外部連携カタログに実在する
    names = {k: set(v) for k, v in catalog_names.items()}
    kind_key = {"共通部品": "part", "API": "api", "イベント": "api", "テーブル": "table"}
    int_ids, int_names = set(integration_ids), set(integration_names)
    for name, r in rows.items():
        cell = r.cells.get("catalog", "")
        if not h.strip_md(cell) or _is_none(cell, f_cat):
            continue
        for part in re.split(r"[、,，]", h.strip_md(cell)):
            part = part.strip()
            if not part:
                continue
            if INT_RE.match(part):
                if part not in int_ids:
                    problems.append((r.file, r.line, f"「{name}」のカタログの対応 {part} が外部連携カタログにありません"))
                continue
            m = ASSET_CELL_RE.match(part)
            if not m or m.group(1) not in asset_kinds:
                problems.append((r.file, r.line, f"「{name}」のカタログの対応「{part}」は {'／'.join(k + '「名前」' for k in asset_kinds)}・INT-ID のどれの形でもありません"))
                continue
            k, n = m.group(1), m.group(2).strip()
            ok = n in int_names if k == "外部連携" else n in names.get(kind_key[k], set())
            if not ok:
                where = "外部連携カタログ" if k == "外部連携" else f"カタログの{k}の表"
                problems.append((r.file, r.line, f"「{name}」のカタログの対応 {k}「{n}」が{where}にありません"))

    # 要求の対象エンティティが分類表にある
    for rid, req in doc.requirements.items():
        if not req.active:
            continue
        for e in h.split_values(req.fields.get("対象エンティティ", "")):
            if _base_name(e) not in rows:
                problems.append((req.file, req.line, f"{rid} の対象エンティティ「{e}」が §3.7 の分類表にありません"))
    return problems

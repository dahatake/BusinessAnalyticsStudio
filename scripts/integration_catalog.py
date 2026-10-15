#!/usr/bin/env python3
"""integration_catalog.py - 外部連携カタログ（docs/integration-catalog.md）の検査・雛形（FR-188〜FR-199、NFR-OPS-001）。

rdcheck.py（CHK-28）・rdfix.py（雛形の作成）から使う。要求定義書は変更しない。
指摘は「ERROR|WARN CHK-28 <file>:<行> <連携名・欄・内容>」の形で、違反の行と欄を示す。
"""
from __future__ import annotations

import datetime as _dt
import re
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

import ebaklib as h

CHK = "CHK-28"
DEFAULT_PATH = "docs/integration-catalog.md"
DEFAULT_FRESH_DAYS = 180

# FR-188 の列（見出しの文字列）
COLUMNS = (
    "連携名", "連携先", "方向", "種別", "状態", "関連する要求 ID", "正本・識別子", "認証・認可", "資格情報の管理",
    "送受信するデータ・個人情報・機密区分", "送信の条件", "頻度・量・SLA", "タイムアウト", "失敗時・再試行・冪等性",
    "バージョン・互換・変更の通知", "監視・監査ログ", "規約・ライセンス・コスト", "テスト用スタブ・実接続の確認", "最終確認日",
)
DIRECTIONS = ("送信", "受信", "双方向")
KINDS = ("API", "ファイル", "DB", "イベント", "SDK・CLI")
STATES = ("計画", "稼働", "廃止予定", "廃止")
# 状態「稼働」「廃止予定」で欄が空だと失敗する確認項目の欄（FR-190〜FR-197）
ITEM_COLUMNS = (
    "認証・認可", "資格情報の管理", "送受信するデータ・個人情報・機密区分", "送信の条件", "頻度・量・SLA", "タイムアウト",
    "失敗時・再試行・冪等性", "バージョン・互換・変更の通知", "監視・監査ログ", "規約・ライセンス・コスト",
    "テスト用スタブ・実接続の確認",
)
BASIC_COLUMNS = ("連携先", "方向", "種別", "状態", "正本・識別子", "送受信するデータ・個人情報・機密区分")
TBD_RE = re.compile(r"TBD\s*[（(]\s*Q-\d+\s*[）)]")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
REASONLESS = (
    ("認証・認可", r"認証[^。]*?[:：]\s*なし(?!\s*[（(])", "認証が「なし」で理由がありません（FR-190 AC-408）"),
    ("失敗時・再試行・冪等性", r"再試行\s*[:：]\s*なし(?!\s*[（(])", "再試行が「なし」で理由がありません（FR-193 AC-414）"),
    ("失敗時・再試行・冪等性", r"冪等性\s*[:：]\s*不要(?!\s*[（(])", "冪等性が「不要」で理由がありません（FR-193 AC-414）"),
    ("テスト用スタブ・実接続の確認", r"テスト用の手段\s*[:：]\s*なし(?!\s*[（(])", "テスト用の手段が「なし」で理由がありません（FR-197 AC-422）"),
)

# 状態「稼働」「廃止予定」で、欄の中に書く小項目（欄全体が TBD のときは検査しない）
SUBITEMS = (
    ("送受信するデータ・個人情報・機密区分",
     (("送信するデータ項目", r"送信"), ("受信するデータ項目", r"受信"), ("個人情報の有無", r"個人情報"), ("機密区分", r"機密区分|internal|shareable"),
      ("保持と削除", r"保持|削除|保存"), ("国外移転の有無", r"国外|移転|リージョン")), "FR-191 AC-409"),
    ("失敗時・再試行・冪等性",
     (("利用者への見え方", r"利用者|表示|切り替|代替|エラー|サンプル"), ("再試行", r"再試行"), ("冪等性", r"冪等"), ("部分失敗の扱い", r"部分失敗|一部")), "FR-193 AC-413"),
)

TEMPLATE = (
    "# 外部連携カタログ\n\n"
    "このアプリが外部のアプリ・サービス・データとやり取りする連携の、要求定義レベルの確認項目の対応表です（FR-188〜FR-199）。"
    "1 連携 1 行で、連携名は一意です。\n"
    "各欄は、(a) 具体的な値、(b)「なし（理由）」、(c)「TBD（Q-xxx）」のどれかで埋めます。空欄は認めません。"
    "資格情報の値・個人情報の実データ・社外秘の内部情報は書きません（NFR-SEC-006）。\n"
    "状態は 計画／稼働／廃止予定／廃止。方向は 送信／受信／双方向。種別は API／ファイル／DB／イベント／SDK・CLI／その他（内容）。"
    "最終確認日は YYYY-MM-DD か「TBD（Q-xxx）」です。\n"
    "意味に関わる欄は rd-author が、実装に関わる欄の確認は implementer が書きます（rdfix は値を入れません）。\n\n"
    "## 外部連携\n\n"
    f"| {' | '.join(COLUMNS)} |\n"
    f"|{'---|' * len(COLUMNS)}\n"
)


def path_of(cfg: dict) -> str:
    return cfg.get("management_files", {}).get("integration_catalog", DEFAULT_PATH)


def _clean(cell: str) -> str:
    return h.strip_md(cell).strip()


def is_empty(cell: str) -> bool:
    return _clean(cell) in ("", "-", "—")


def _norm(s: str) -> str:
    return s.replace(" ", "").replace("\u3000", "")


class Row:
    def __init__(self, line: int, cells: List[str], header: List[str]):
        self.line = line
        cells = list(cells) + [""] * (len(header) - len(cells))
        self.cells: Dict[str, str] = {hd: cells[i] for i, hd in enumerate(header)}

    def get(self, col: str) -> str:
        return self.cells.get(col, "")

    @property
    def name(self) -> str:
        return _clean(self.get("連携名"))


def parse(root: Path, cfg: dict) -> Tuple[bool, List[str], List[Row]]:
    """(存在するか, 見出し, 行)。見出しは表の見出しの正規化前の文字列を COLUMNS に揃えて返す。"""
    p = root / path_of(cfg)
    if not p.exists():
        return False, [], []
    text = h.strip_comments(h.read_text(p))
    for t in h.parse_tables(text.splitlines()):
        norm = [_norm(x) for x in t.header]
        if _norm("連携名") not in norm:
            continue
        header = [next((c for c in COLUMNS if _norm(c) == n), x) for n, x in zip(norm, t.header)]
        return True, header, [Row(ln, cells, header) for ln, cells in t.rows]
    return True, [], []


def section8_names(doc) -> Dict[str, Tuple[str, int]]:
    """要求定義書 §8 の連携先の表: 連携先 -> (ファイル, 行)。"""
    out: Dict[str, Tuple[str, int]] = {}
    for rel, text in doc.text.items():
        for t in h.parse_tables(h.strip_comments(text).splitlines()):
            if t.header and _norm(t.header[0]) == "連携先" and any("方式" in x for x in t.header) and "外部連携" in t.heading:
                for ln, cells in t.rows:
                    n = _clean(cells[0]) if cells else ""
                    if n:
                        out.setdefault(n, (rel, ln))
    return out


def fresh_days(doc) -> int:
    try:
        return int(re.search(r"\d+", h.strip_md(doc.params["PARAM-066"]["value"])).group(0))
    except Exception:  # noqa: BLE001
        return DEFAULT_FRESH_DAYS


def check(root: Path, cfg: dict, doc, today: Optional[_dt.date] = None) -> List[Tuple[str, str, str]]:
    """[(level, loc, msg)]。FR-188〜FR-198 の欄ごとの検査・§8 との突合・NFR-OPS-001 の鮮度。"""
    rel = path_of(cfg)
    exists, header, rows = parse(root, cfg)
    out: List[Tuple[str, str, str]] = []
    if not exists:
        return [("WARN", rel, "外部連携カタログがありません（rdfix.py で雛形を作成できます。FR-188）")]
    if not header:
        return [("ERROR", rel, "外部連携カタログに「連携名」の列を持つ表がありません（FR-188）")]
    today = today or _dt.date.today()

    def err(row: Row, col: str, msg: str) -> None:
        out.append(("ERROR", f"{rel}:{row.line}", f"連携「{row.name or '(連携名なし)'}」の欄「{col}」: {msg}"))

    def warn(row: Row, col: str, msg: str) -> None:
        out.append(("WARN", f"{rel}:{row.line}", f"連携「{row.name or '(連携名なし)'}」の欄「{col}」: {msg}"))

    for col in COLUMNS:
        if col not in header:
            out.append(("ERROR", rel, f"表の見出しに欄「{col}」がありません（FR-188）"))
    seen: Dict[str, int] = {}
    cat_names: Dict[str, Row] = {}
    for r in rows:
        if not r.name:
            err(r, "連携名", "連携名が空です（FR-188 AC-404）")
        elif r.name in seen:
            err(r, "連携名", f"連携名が重複しています（{seen[r.name]} 行目と同じ。FR-188 AC-404）")
        else:
            seen[r.name] = r.line
            cat_names[r.name] = r
        state = _clean(r.get("状態"))
        for col in BASIC_COLUMNS:
            if is_empty(r.get(col)):
                err(r, col, "空です（「なし（理由）」か「TBD（Q-xxx）」で書きます。FR-189 AC-405）")
        if not is_empty(r.get("方向")) and _clean(r.get("方向")) not in DIRECTIONS:
            err(r, "方向", f"「{_clean(r.get('方向'))}」は定義外です（送信／受信／双方向。FR-189 AC-406）")
        kind = _clean(r.get("種別"))
        if kind and not is_empty(kind):
            m = re.match(r"^その他\s*[（(](.+)[）)]$", kind)
            if kind not in KINDS and not m:
                err(r, "種別", f"「{kind}」は定義外です（API／ファイル／DB／イベント／SDK・CLI／その他（内容）。FR-189 AC-406）")
        if state and state not in STATES and not is_empty(state):
            err(r, "状態", f"「{state}」は定義外です（計画／稼働／廃止予定／廃止。FR-189 AC-406）")
        # 関連する要求 ID（FR-198）
        reqs_cell = r.get("関連する要求 ID")
        if is_empty(reqs_cell):
            err(r, "関連する要求 ID", "空です（FR-198 AC-425）")
        for rid in dict.fromkeys(h.REQ_ID_RE.findall(reqs_cell)):
            if rid not in doc.requirements:
                err(r, "関連する要求 ID", f"{rid} が要求定義書にありません（FR-198 AC-423）")
        # 確認項目の欄ごとの検査（FR-190〜FR-197）
        if state in ("稼働", "廃止予定"):
            for col in ITEM_COLUMNS:
                if is_empty(r.get(col)):
                    err(r, col, f"状態「{state}」の連携で空です（FR-190〜FR-197）")
        elif state in ("計画",) and is_empty(r.get("規約・ライセンス・コスト")):
            err(r, "規約・ライセンス・コスト", "空です（FR-196 AC-419）")
        # 欄の中の小項目の検査（FR-191 AC-409・FR-193 AC-413）。TBD（Q-xxx）が欄にあれば、その欄は未決として通す
        if state in ("稼働", "廃止予定"):
            for col, terms_, ac in SUBITEMS:
                cell = _clean(r.get(col))
                if is_empty(cell) or TBD_RE.search(cell):
                    continue
                missing = [label for label, rx in terms_ if not re.search(rx, cell)]
                if missing:
                    err(r, col, f"小項目「{'・'.join(missing)}」の記載がありません（{ac}）")
        for col, rx, msg in REASONLESS:
            if re.search(rx, _clean(r.get(col))) or (col == "認証・認可" and _clean(r.get(col)) == "なし"):
                err(r, col, msg)
        data = _clean(r.get("送受信するデータ・個人情報・機密区分"))
        if re.search(r"個人情報の有無\s*[:：]\s*あり", data) and not ("目的" in data and "根拠" in data):
            err(r, "送受信するデータ・個人情報・機密区分", "個人情報の有無が「あり」で、目的と根拠の記載がありません（FR-191 AC-410）")
        for col in ("頻度・量・SLA", "タイムアウト"):
            cell = TBD_RE.sub("", _clean(r.get(col)))
            if re.search(cfg["checks"]["unit_pattern"], cell) and "PARAM-" not in cell:
                warn(r, col, "数値が PARAM を参照せず直接書かれています（FR-192 AC-412）")
        if state == "廃止予定":
            ver = _clean(r.get("バージョン・互換・変更の通知"))
            if "移行先" not in ver or not re.search(r"廃止の?期日", ver):
                err(r, "バージョン・互換・変更の通知", "状態「廃止予定」では移行先と廃止の期日（なければ TBD（Q-xxx））が必要です（FR-194 AC-416）")
        audit = _clean(r.get("監視・監査ログ"))
        m = re.search(r"監査で記録する事項\s*[:：]\s*([^。]*)", audit)
        if m and re.search(r"資格情報|個人情報の本文", m.group(1)):
            err(r, "監視・監査ログ", "監査で記録する事項に「資格情報」または「個人情報の本文」を含めています（FR-195 AC-418）")
        terms = _clean(r.get("規約・ライセンス・コスト"))
        if re.search(r"費用\s*[:：]\s*発生する", terms) and not (re.search(r"上限|見込み", terms) and re.search(r"表示|示す", terms)):
            err(r, "規約・ライセンス・コスト", "費用が「発生する」のに、見込みの上限と費用の表示の要否の記載がありません（FR-196 AC-420）")
        if state in ("稼働", "廃止予定") and TBD_RE.search(terms):
            warn(r, "規約・ライセンス・コスト", "TBD が残っています（FR-196 AC-419）")
        # 最終確認日の形式と鮮度（NFR-OPS-001）
        date = _clean(r.get("最終確認日"))
        parsed = None
        if DATE_RE.match(date):
            try:
                parsed = _dt.date.fromisoformat(date)
            except ValueError:
                parsed = None
        if parsed is None and not TBD_RE.search(date):
            err(r, "最終確認日", f"「{date or '空'}」は日付（YYYY-MM-DD）でも TBD（Q-xxx）でもありません（NFR-OPS-001 AC-431）")
        elif state == "稼働":
            if parsed is None:
                warn(r, "最終確認日", "日付がなく鮮度を判定できません。最終確認日の確認が必要です（NFR-OPS-001 AC-431）")
            elif (today - parsed).days > fresh_days(doc):
                warn(r, "最終確認日", f"最終確認日 {date} から {(today - parsed).days} 日経っています"
                     f"（{fresh_days(doc)} 日超。規約・版・料金・SLA の変化を確認します。NFR-OPS-001 AC-431）")
    # §8 との突合（FR-198 AC-424）
    sec8 = section8_names(doc)
    for n, (f, ln) in sec8.items():
        if n not in cat_names:
            out.append(("ERROR", f"{f}:{ln}", f"§8 の連携先「{n}」が外部連携カタログ（{rel}）にありません（不足はカタログ側。FR-198 AC-424）"))
    if sec8:
        for n, r in cat_names.items():
            if n not in sec8 and _clean(r.get("状態")) != "廃止":
                err(r, "連携名", f"外部連携カタログにあって、要求定義書 §8 の連携先の表にありません（不足は §8 側。FR-198 AC-424）")
    # 要求の「関連する既存資産」の 外部連携「連携名」（FR-198 AC-425）
    for rq in doc.requirements.values():
        if not rq.active:
            continue
        for m in re.finditer(r"外部連携\s*[「『]([^」』]+)[」』]", rq.fields.get("関連する既存資産", "")):
            if m.group(1).strip() not in cat_names:
                out.append(("ERROR", f"{rq.file}:{rq.line}",
                            f"{rq.id} の関連する既存資産 外部連携「{m.group(1)}」が外部連携カタログの連携名にありません（FR-198 AC-425）"))
    return out


def trace(root: Path, cfg: dict, doc, name: str) -> Optional[dict]:
    """連携名から、関連する要求・受入基準・カタログの行を引く（FR-199 AC-428）。"""
    exists, header, rows = parse(root, cfg)
    row = next((r for r in rows if r.name == name), None)
    if row is None:
        return None
    reqs = list(dict.fromkeys(h.REQ_ID_RE.findall(row.get("関連する要求 ID"))))
    return {
        "name": name, "at": f"{path_of(cfg)}:{row.line}",
        "state": _clean(row.get("状態")), "date": _clean(row.get("最終確認日")),
        "requirements": [{"id": i, "title": doc.requirements[i].title if i in doc.requirements else "(未定義)",
                          "acs": list(doc.requirements[i].acs) if i in doc.requirements else []} for i in reqs],
    }

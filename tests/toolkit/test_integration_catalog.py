"""外部連携カタログの検査（scripts/integration_catalog.py）の単体テスト。
FR-188 AC-404 / NFR-OPS-001 AC-431・AC-432 / FR-199 AC-427。実行: python -m pytest tests/toolkit/test_integration_catalog.py
"""
import datetime as dt
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import ebaklib as h  # noqa: E402
import integration_catalog as ic  # noqa: E402

TODAY = dt.date(2026, 10, 16)
CFG = h.DEFAULT_CONFIG
DOC = SimpleNamespace(
    requirements={"FR-001": SimpleNamespace(title="t", acs=["AC-001"], active=True, fields={}, id="FR-001", file="x", line=1)},
    params={"PARAM-066": {"value": "180", "unit": "日"}}, text={},
)
OK = {
    "連携名": "X", "連携先": "Y（社外）", "方向": "双方向", "種別": "API", "状態": "稼働", "関連する要求 ID": "FR-001",
    "正本・識別子": "なし（理由: 持たない）", "認証・認可": "API キー", "資格情報の管理": "Key Vault",
    "送受信するデータ・個人情報・機密区分": "個人情報の有無: なし", "送信の条件": "操作のたび", "頻度・量・SLA": "TBD（Q-001）",
    "タイムアウト": "PARAM-001", "失敗時・再試行・冪等性": "再試行: 利用者の操作。冪等性: 必要", "バージョン・互換・変更の通知": "v1",
    "監視・監査ログ": "監査で記録する事項: 時刻", "規約・ライセンス・コスト": "費用: なし", "テスト用スタブ・実接続の確認": "モック",
    "最終確認日": "2026-10-01",
}


def run(tmp_path, rows):
    p = tmp_path / ic.DEFAULT_PATH
    p.parent.mkdir(parents=True, exist_ok=True)
    lines = [ic.TEMPLATE.rstrip("\n")]
    for r in rows:
        lines.append("| " + " | ".join(r.get(c, "") for c in ic.COLUMNS) + " |")
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return ic.check(tmp_path, CFG, DOC, TODAY)


def errors(f):
    return [x for x in f if x[0] == "ERROR"]


def test_ok_catalog_has_no_error(tmp_path):
    assert errors(run(tmp_path, [OK])) == []


# FR-188 AC-404
def test_duplicate_and_empty_name(tmp_path):
    f = errors(run(tmp_path, [OK, dict(OK), dict(OK, 連携名="")]))
    assert any("重複" in m and ":" in loc for _, loc, m in f)
    assert any("連携名が空" in m for _, loc, m in f)


# NFR-OPS-001 AC-431
def test_freshness_warn_not_error(tmp_path):
    f = run(tmp_path, [dict(OK, 最終確認日="2026-04-01")])
    assert errors(f) == [] and any(l == "WARN" and "最終確認日" in m for l, _, m in f)


# NFR-OPS-001 AC-431
def test_tbd_date_warns_and_bad_date_errors(tmp_path):
    f = run(tmp_path, [dict(OK, 最終確認日="TBD（Q-027）")])
    assert errors(f) == [] and any("確認が必要" in m for l, _, m in f if l == "WARN")
    for bad in ("昨日", "2026/10/01", "2026-13-45", ""):
        assert any("最終確認日" in m for _, _, m in errors(run(tmp_path, [dict(OK, 最終確認日=bad)]))), bad


# NFR-OPS-001 AC-432
def test_no_freshness_warn_within_limit_or_not_active(tmp_path):
    border = (TODAY - dt.timedelta(days=180)).isoformat()
    assert not [x for x in run(tmp_path, [dict(OK, 最終確認日=border)]) if "経っています" in x[2]]
    for st in ("計画", "廃止"):
        assert not [x for x in run(tmp_path, [dict(OK, 状態=st, 最終確認日="2020-01-01")]) if "最終確認日" in x[2]]


# FR-199 AC-427
def test_template_has_header_and_no_values(tmp_path):
    for c in ic.COLUMNS:
        assert c in ic.TEMPLATE
    assert "TBD" in ic.TEMPLATE and "なし（" in ic.TEMPLATE
    p = tmp_path / "t.md"
    p.write_text(ic.TEMPLATE, encoding="utf-8")
    assert ic.parse(tmp_path, {"management_files": {"integration_catalog": "t.md"}})[2] == []

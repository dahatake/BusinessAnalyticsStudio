"""外部連携カタログの欄ごとの検査（FR-189〜FR-193）の単体テスト。AC-405〜AC-414。
実行: python -m pytest tests/toolkit/test_integration_fields_a.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_integration_catalog import OK, errors, run  # noqa: E402


def msgs(tmp_path, row, level="ERROR"):
    return [m for l, _, m in run(tmp_path, [row]) if l == level]


# FR-189 AC-405
def test_basic_empty_columns_fail_and_name_the_column(tmp_path):
    for col in ("連携先", "方向", "種別", "状態", "正本・識別子", "送受信するデータ・個人情報・機密区分"):
        assert any(f"欄「{col}」" in m and "空" in m for m in msgs(tmp_path, dict(OK, **{col: ""}))), col
    for ok_val in ("なし（理由: 自システムで採番しない）", "TBD（Q-001）"):
        assert not [m for m in msgs(tmp_path, dict(OK, **{"正本・識別子": ok_val})) if "正本・識別子" in m]


# FR-189 AC-406
def test_out_of_definition_values_fail(tmp_path):
    assert any("方向" in m for m in msgs(tmp_path, dict(OK, 方向="北")))
    assert any("種別" in m for m in msgs(tmp_path, dict(OK, 種別="FAX")))
    assert any("種別" in m for m in msgs(tmp_path, dict(OK, 種別="その他")))
    assert any("状態" in m for m in msgs(tmp_path, dict(OK, 状態="保留")))
    assert errors(run(tmp_path, [dict(OK, 種別="その他（手渡し）")])) == []


# FR-190 AC-407
def test_active_row_requires_auth_columns(tmp_path):
    for col in ("認証・認可", "資格情報の管理"):
        assert any(f"欄「{col}」" in m for m in msgs(tmp_path, dict(OK, **{col: ""}))), col
    assert not [m for m in msgs(tmp_path, dict(OK, 状態="計画", **{"認証・認可": ""})) if "認証・認可" in m]


# FR-190 AC-408
def test_auth_none_requires_reason(tmp_path):
    assert any("AC-408" in m for m in msgs(tmp_path, dict(OK, **{"認証・認可": "認証: なし"})))
    assert not [m for m in msgs(tmp_path, dict(OK, **{"認証・認可": "認証: なし（公開情報のみ）"})) if "AC-408" in m]


# FR-191 AC-409
def test_active_row_requires_data_items(tmp_path):
    for col in ("送受信するデータ・個人情報・機密区分", "送信の条件"):
        assert any(f"欄「{col}」" in m for m in msgs(tmp_path, dict(OK, **{col: ""}))), col
    full = "送信: 顧客名。受信: 要旨。個人情報の有無: なし。機密区分: internal。保持と削除: 保存しない。国外移転: なし"
    assert errors(run(tmp_path, [dict(OK, **{"送受信するデータ・個人情報・機密区分": full})])) == []
    partial = "送信: 顧客名。受信: 要旨。個人情報の有無: なし"
    out = msgs(tmp_path, dict(OK, **{"送受信するデータ・個人情報・機密区分": partial}))
    assert any("機密区分" in m and "AC-409" in m for m in out) and any("国外移転" in m for m in out)


# FR-191 AC-410
def test_personal_data_requires_purpose_and_basis(tmp_path):
    base = "送信: 顧客名。受信: 要旨。機密区分: internal。保持と削除: なし。国外移転: なし。"
    col = "送受信するデータ・個人情報・機密区分"
    assert any("AC-410" in m for m in msgs(tmp_path, dict(OK, **{col: base + "個人情報の有無: あり"})))
    assert not [m for m in msgs(tmp_path, dict(OK, **{col: base + "個人情報の有無: あり。目的: 連絡。根拠: 同意"})) if "AC-410" in m]


# FR-192 AC-411
def test_active_row_requires_frequency_and_timeout(tmp_path):
    for col in ("頻度・量・SLA", "タイムアウト"):
        assert any(f"欄「{col}」" in m for m in msgs(tmp_path, dict(OK, **{col: ""}))), col


# FR-192 AC-412
def test_direct_numbers_warn_but_param_does_not(tmp_path):
    assert any("AC-412" in m for m in msgs(tmp_path, dict(OK, タイムアウト="30 秒"), "WARN"))
    assert any("AC-412" in m for m in msgs(tmp_path, dict(OK, **{"頻度・量・SLA": "1 日 100 件"}), "WARN"))
    assert not [m for m in msgs(tmp_path, dict(OK, タイムアウト="PARAM-001"), "WARN") if "AC-412" in m]


# FR-193 AC-413
def test_active_row_requires_failure_items(tmp_path):
    col = "失敗時・再試行・冪等性"
    assert any(f"欄「{col}」" in m for m in msgs(tmp_path, dict(OK, **{col: ""})))
    out = msgs(tmp_path, dict(OK, **{col: "失敗時は利用者に表示する。再試行: 利用者の操作"}))
    assert any("冪等性" in m and "AC-413" in m for m in out) and any("部分失敗" in m for m in out)
    assert errors(run(tmp_path, [dict(OK, **{col: "失敗時は利用者に表示。再試行: 手動。冪等性: 必要。部分失敗: 全体を取り消す"})])) == []


# FR-193 AC-414
def test_retry_none_and_idempotency_unneeded_require_reason(tmp_path):
    col = "失敗時・再試行・冪等性"
    full = "失敗時は利用者に表示。部分失敗: 取り消す。"
    assert any("AC-414" in m for m in msgs(tmp_path, dict(OK, **{col: full + "再試行: なし。冪等性: 必要"})))
    assert any("AC-414" in m for m in msgs(tmp_path, dict(OK, **{col: full + "再試行: 手動。冪等性: 不要"})))
    ok = full + "再試行: なし（読み取りのみ）。冪等性: 不要（参照のみ）"
    assert not [m for m in msgs(tmp_path, dict(OK, **{col: ok})) if "AC-414" in m]

"""外部連携カタログの欄ごとの検査（FR-194〜FR-198）の単体・結合テスト。AC-415〜AC-425。
実行: python -m pytest tests/toolkit/test_integration_fields_b.py
"""
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_integration_catalog import CFG, DOC, OK, TODAY, errors, run  # noqa: E402
import integration_catalog as ic  # noqa: E402

VER = "監視・監査ログ"


def msgs(tmp_path, row, level="ERROR", doc=None):
    if doc is None:
        return [m for l, _, m in run(tmp_path, [row]) if l == level]
    run(tmp_path, [row])
    return [m for l, _, m in ic.check(tmp_path, CFG, doc, TODAY) if l == level]


def col_msgs(tmp_path, row, col, ac):
    return [m for m in msgs(tmp_path, row) if f"欄「{col}」" in m and ac in m]


# FR-194 AC-415
def test_version_items_required_for_active(tmp_path):
    col = "バージョン・互換・変更の通知"
    assert any("空" in m for m in msgs(tmp_path, dict(OK, **{col: ""})))
    for part in ("相手側の版", "互換の方針", "変更の通知の窓口", "確認の頻度"):
        assert any(part in m for m in col_msgs(tmp_path, dict(OK, **{col: "メモ"}), col, "AC-415")), part
    assert not col_msgs(tmp_path, dict(OK, **{col: "TBD（Q-001）"}), col, "AC-415")


# FR-194 AC-416
def test_deprecating_requires_destination_and_date(tmp_path):
    col = "バージョン・互換・変更の通知"
    base = OK[col]
    assert any("AC-416" in m for m in msgs(tmp_path, dict(OK, 状態="廃止予定", **{col: base})))
    ok = base + "。移行先: Z。廃止の期日: TBD（Q-002）"
    assert not [m for m in msgs(tmp_path, dict(OK, 状態="廃止予定", **{col: ok})) if "AC-416" in m]


# FR-195 AC-417
def test_monitoring_items_required(tmp_path):
    assert any("空" in m for m in msgs(tmp_path, dict(OK, **{VER: ""})))
    out = col_msgs(tmp_path, dict(OK, **{VER: "メモ"}), VER, "AC-417")
    for part in ("状態を確かめる手段", "失敗の検知と通知", "監査で記録する事項", "記録に含めてはならないもの", "記録の保持期間"):
        assert any(part in m for m in out), part


# FR-195 AC-418
def test_audit_must_not_record_secrets_or_personal_body(tmp_path):
    for bad in ("資格情報", "個人情報の本文"):
        v = OK[VER].replace("監査で記録する事項: 時刻", f"監査で記録する事項: {bad}")
        assert any("AC-418" in m for m in msgs(tmp_path, dict(OK, **{VER: v}))), bad
    assert not [m for m in msgs(tmp_path, OK) if "AC-418" in m]


# FR-196 AC-419
def test_terms_items_required_and_tbd_warns(tmp_path):
    col = "規約・ライセンス・コスト"
    assert any("空" in m for m in msgs(tmp_path, dict(OK, **{col: ""})))
    assert any("空" in m for m in msgs(tmp_path, dict(OK, 状態="計画", **{col: ""})))
    out = col_msgs(tmp_path, dict(OK, **{col: "メモ"}), col, "AC-419")
    assert out and "確認結果" in out[0] and "確認日" in out[0] and "費用の有無" in out[0]
    tbd = dict(OK, **{col: "確認は TBD（Q-001）"})
    assert not col_msgs(tmp_path, tbd, col, "AC-419") or errors(run(tmp_path, [tbd])) == []
    assert any("AC-419" in m for m in msgs(tmp_path, tbd, "WARN"))


# FR-196 AC-420
def test_cost_incurred_requires_cap_and_display(tmp_path):
    col = "規約・ライセンス・コスト"
    base = "規約・ライセンス: 確認済み。確認日: 2026-10-01。"
    assert any("AC-420" in m for m in msgs(tmp_path, dict(OK, **{col: base + "費用: 発生する"})))
    assert not [m for m in msgs(tmp_path, dict(OK, **{col: base + "費用: 発生する。見込みの上限: PARAM-001。利用者に表示する"})) if "AC-420" in m]


# FR-197 AC-421
def test_stub_items_required(tmp_path):
    col = "テスト用スタブ・実接続の確認"
    assert any("空" in m for m in msgs(tmp_path, dict(OK, **{col: ""})))
    out = col_msgs(tmp_path, dict(OK, **{col: "メモ"}), col, "AC-421")
    assert out and all(p in out[0] for p in ("テスト用の手段", "本番との差", "実接続の確認の条件"))


# FR-197 AC-422
def test_stub_none_requires_reason(tmp_path):
    col = "テスト用スタブ・実接続の確認"
    tail = "。本番との差: なし。実接続の確認の条件: 管理者"
    assert any("AC-422" in m for m in msgs(tmp_path, dict(OK, **{col: "テスト用の手段: なし" + tail})))
    assert not [m for m in msgs(tmp_path, dict(OK, **{col: "テスト用の手段: なし（外部に接続しない）" + tail})) if "AC-422" in m]


def doc_with(requirements=None, sec8=("X",)):
    rows = "".join(f"| {n} | API |\n" for n in sec8)
    text = f"## 8. 外部連携\n\n| 連携先 | 方式 |\n|---|---|\n{rows}"
    reqs = {"FR-001": SimpleNamespace(title="t", acs=["AC-001"], active=True, fields={}, id="FR-001", file="x.md", line=1)}
    reqs.update(requirements or {})
    return SimpleNamespace(requirements=reqs, params=DOC.params, text={"docs/r.md": text})


# FR-198 AC-423
def test_unknown_requirement_id_fails(tmp_path):
    assert any("FR-999" in m and "AC-423" in m for m in msgs(tmp_path, dict(OK, **{"関連する要求 ID": "FR-001, FR-999"})))


# FR-198 AC-424
def test_section8_and_catalog_must_match_both_ways(tmp_path):
    out = msgs(tmp_path, OK, doc=doc_with(sec8=("X", "Q")))
    assert any("「Q」" in m and "カタログ" in m and "AC-424" in m for m in out)
    out = msgs(tmp_path, OK, doc=doc_with(sec8=("Z",)))
    assert any("「X」" in m and "§8" in m and "AC-424" in m for m in out)
    assert not [m for m in msgs(tmp_path, dict(OK, 状態="廃止"), doc=doc_with(sec8=("Z", "X"))) if "§8 の連携先の表にありません" in m]
    assert not [m for m in msgs(tmp_path, OK, doc=doc_with()) if "AC-424" in m]


# FR-198 AC-425
def test_empty_requirement_id_and_asset_reference(tmp_path):
    assert any("AC-425" in m for m in msgs(tmp_path, dict(OK, **{"関連する要求 ID": ""})))
    rq = SimpleNamespace(title="t", acs=[], active=True, id="FR-050", file="r.md", line=7, fields={"関連する既存資産": "外部連携「無い連携」"})
    out = msgs(tmp_path, OK, doc=doc_with({"FR-050": rq}))
    assert any("FR-050" in m and "無い連携" in m and "AC-425" in m for m in out)
    rq.fields["関連する既存資産"] = "外部連携「X」"
    assert not [m for m in msgs(tmp_path, OK, doc=doc_with({"FR-050": rq})) if "FR-050" in m]

"""ダミー判定の境界（NFR-SEC-006 AC-433）の単体テスト。値はすべて合成した偽物。PARAM-067 = 3 文字。
実行: python -m pytest tests/toolkit/test_integration_secrets_boundary.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import integration_catalog as ic  # noqa: E402


# NFR-SEC-006 AC-433: x の並びは 3 文字未満なら検出、3 文字以上（大小無視）は検出しない
def test_x_run_boundary():
    assert ic.secret_kinds("token=xx")
    assert not ic.secret_kinds("token=xxx")
    assert not ic.secret_kinds("token=XXXX")


# NFR-SEC-006 AC-433: 固定のダミー表記は検出しない
def test_fixed_dummies_not_detected():
    assert not ic.secret_kinds("token=REDACTED")
    assert not ic.secret_kinds("token=<ここに値>")
    assert not ic.secret_kinds("token=****")


# NFR-SEC-006 AC-433: = の後は 1 文字の実値でも検出する
def test_one_char_value_detected():
    assert ic.secret_kinds("token=a")


# NFR-SEC-006 AC-433: Bearer の後は 7 文字以下は検出せず、8 文字以上は検出する
def test_bearer_length_boundary():
    assert not ic.secret_kinds("Bearer abcdefg")
    assert ic.secret_kinds("Bearer abcdefgh")

"""外部連携カタログの資格情報形式の検出（NFR-SEC-006 AC-430）の単体テスト。値はすべて合成した偽物。
実行: python -m pytest tests/toolkit/test_integration_secrets.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_integration_catalog import OK, run  # noqa: E402
import integration_catalog as ic  # noqa: E402

SHA1 = "9fceb02d0ae598e95dc970b74767f19372d61af8"
SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def secret_errs(tmp_path, text, col="資格情報の管理"):
    return [m for l, _, m in run(tmp_path, [dict(OK, **{col: text})]) if l == "ERROR" and "AC-430" in m]


# NFR-SEC-006 AC-430
def test_real_formats_detected(tmp_path):
    for v in ("Bearer eyJhbGciOi12345", "api_key=k7Hq2ZpL9dVx4TnB", "token=t6Yw3MsR8cEj5UaQ",
              "password=Pw9xKq2LmZ", "Ab3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY",
              "-----BEGIN PRIVATE KEY----- MIIEvQIBADANBgkqhkiG9w0BAQEFAASC"):
        assert secret_errs(tmp_path, f"Key Vault。値: {v}"), v
    assert secret_errs(tmp_path, "API キー（Bearer eyJhbGciOi12345）", col="認証・認可")


# NFR-SEC-006 AC-430
def test_hash_not_detected(tmp_path):
    assert not secret_errs(tmp_path, f"commit {SHA1}")
    assert not secret_errs(tmp_path, f"SHA-256: {SHA256}")


# NFR-SEC-006 AC-430
def test_example_line_still_detected_but_dummy_allowed(tmp_path):
    assert secret_errs(tmp_path, "例: api_key=k7Hq2ZpL9dVx4TnB")
    for v in ("api_key=<ここに値>", "token=xxxx", "password=********", "api_key=REDACTED", "Bearer ********"):
        assert not secret_errs(tmp_path, f"例: {v}"), v
    assert secret_errs(tmp_path, "例: token=xxxx / token=t6Yw3MsR8cEj5UaQ")


# NFR-SEC-006 AC-430（抜け道: 山括弧・引用符・BEGIN 単独行・数字なしの Bearer）
def test_loopholes_closed(tmp_path):
    for v in ("api_key=<k7Hq2ZpL9dVx4TnB>", 'api_key="k7Hq2ZpL9dVx4TnB"', "token='abcdefghijkl'",
              "-----BEGIN PRIVATE KEY-----", "Bearer abcdefghijklmnop"):
        assert secret_errs(tmp_path, f"値: {v}"), v
    for v in ("api_key=<ここに値>", 'token="xxxx"', "password=REDACTED"):
        assert not secret_errs(tmp_path, f"例: {v}"), v


# NFR-SEC-006 AC-430
def test_words_only_not_detected(tmp_path):
    assert not secret_errs(tmp_path, "API キーは Key Vault に保管。トークンは短命、パスワードは使わない。証明書は別途管理")
    assert ic.secret_kinds("Bearer authentication を使う") == []

"""NFR-SEC-006 AC-430/433: rdcheck の公開 CLI を通した検査接続の退行テスト。"""
import json
import subprocess
import sys
from pathlib import Path

import pytest

from test_integration_catalog import OK, run

ROOT = Path(__file__).resolve().parents[2]


# NFR-SEC-006 AC-430/433: 形式検出と明示ダミー除外を CLI の CHK-28 まで確認する。
@pytest.mark.parametrize("value,detected", [
    ("Bearer " + "abcdefgh", True),
    ("api_key=a", True),
    ("token=xx", True),
    ("password=" + "a", True),
    ("abc" * 11, True),
    ("-----BEGIN PRIVATE KEY-----", True),
    ("例: token=a", True),
    ("Bearer " + "abcdefg", False),
    ("Bearer authentication", False),
    ("token=xxx", False),
    ("token=XXXX", False),
    ("token=REDACTED", False),
    ("token=<ここに値>", False),
    ("token=****", False),
])
def test_rdcheck_cli_catalog_secret_detection(tmp_path, value, detected):
    run(tmp_path, [dict(OK, **{"資格情報の管理": value})])
    (tmp_path / "docs" / "requirements-definition.md").write_text(
        "# 要求定義書\n", encoding="utf-8",
    )
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "rdcheck.py"),
         "--root", str(tmp_path), "check", "--json"],
        capture_output=True, encoding="utf-8", check=False,
    )
    findings = json.loads(result.stdout)["findings"]
    secrets = [f for f in findings if f["chk"] == "CHK-28" and "AC-430" in f["msg"]]
    assert bool(secrets) is detected
    if detected:
        assert result.returncode != 0
        assert all(f["loc"].startswith("docs/integration-catalog.md:") for f in secrets)

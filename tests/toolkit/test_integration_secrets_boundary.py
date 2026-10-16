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


def _doc_with_param067(tmp_path, value):
    """docs の一時的な複製で PARAM-067 の値を変えて読み込む。"""
    import shutil
    import ebaklib as h
    root = Path(__file__).resolve().parents[2]
    (tmp_path / "docs").mkdir()
    for p in (root / "docs").glob("requirements*"):
        if p.is_dir():
            shutil.copytree(p, tmp_path / "docs" / p.name)
        else:
            shutil.copy(p, tmp_path / "docs" / p.name)
    f = tmp_path / "docs" / "requirements-definition.md"
    lines = f.read_text(encoding="utf-8").splitlines(keepends=True)
    for i, ln in enumerate(lines):
        if ln.startswith("| PARAM-067 |"):
            cells = ln.split("|")
            cells[3] = f" {value} "
            lines[i] = "|".join(cells)
    f.write_text("".join(lines), encoding="utf-8")
    return h.parse_requirements(tmp_path, h.load_config(root))


# NFR-SEC-006 AC-433 PARAM-067: 値を変えると x の並びの境界が追従する
def test_x_run_boundary_follows_param067(tmp_path):
    doc = _doc_with_param067(tmp_path, 5)
    assert ic.dummy_x_min(doc) == 5
    assert ic.secret_kinds("token=xxxx", doc)
    assert not ic.secret_kinds("token=xxxxx", doc)
    assert not ic.secret_kinds("token=XXXXXX", doc)


# NFR-SEC-006 AC-433: PARAM-067 を読めないときは 3 に退避する
def test_x_run_fallback_without_param():
    class D:
        params = {}
    assert ic.dummy_x_min(D()) == 3
    assert ic.dummy_x_min(None) == 3
    assert ic.secret_kinds("token=xx", D())
    assert not ic.secret_kinds("token=xxx", D())


# NFR-SEC-006 AC-433: Bearer の後は 7 文字以下は検出せず、8 文字以上は検出する
def test_bearer_length_boundary():
    assert not ic.secret_kinds("Bearer abcdefg")
    assert ic.secret_kinds("Bearer abcdefgh")


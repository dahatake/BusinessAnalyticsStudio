// 秘密情報の検出の検査。FR-011 AC-014、NFR-SEC-001 AC-175（.env が git の管理対象外であることは競合として報告。下記）
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../../scripts/lib/pack-fs';

const KEY_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /AKIA[0-9A-Z]{16}/,
  /AIza[0-9A-Za-z_-]{30,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /(api[_-]?key|token|secret|password)["']?\s*[:=]\s*["'][A-Za-z0-9+/_-]{16,}["']/i,
];

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__pycache__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|json|html|css|md|map|svg)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('FR-011 AC-014 NFR-SEC-001 AC-175 API キーの形の文字列がない', () => {
  it('ソースコード・設定・お手本パック・ビルド成果物に API キー・トークンの値がない', () => {
    const roots = ['src', 'scripts', 'public', 'schema', 'examples', 'dist'].map((d) => path.join(REPO_ROOT, d));
    const files = [...roots.flatMap((r) => walk(r)), path.join(REPO_ROOT, 'index.html'), path.join(REPO_ROOT, '.env.example')]
      .filter((f) => fs.existsSync(f));
    const hits: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      for (const re of KEY_PATTERNS) if (re.test(text)) hits.push(`${path.relative(REPO_ROOT, f)} : ${re}`);
    }
    expect(hits).toEqual([]);
  }, 60_000); // dist/ の大きなバンドルを 7 つの正規表現で走査する。並列実行で CPU が混むと 5 秒を超えるため、時間の上限だけを延ばす（検査の内容は変えない）

  it('.env.example があり、キー・トークン・シークレットの値が空である', () => {
    const p = path.join(REPO_ROOT, '.env.example');
    expect(fs.existsSync(p)).toBe(true);
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
    const secretLines = lines.filter((l) => /KEY|TOKEN|SECRET|PASSWORD/i.test(l.split('=')[0] ?? ''));
    expect(secretLines.length).toBeGreaterThan(0);
    for (const l of secretLines) expect(l.slice(l.indexOf('=') + 1).trim(), l).toBe('');
  });

  it('コードは API キーを環境変数からも埋め込みからも読んでいない（認証は Copilot のサインイン）', () => {
    for (const f of walk(path.join(REPO_ROOT, 'src'))) {
      const text = fs.readFileSync(f, 'utf8');
      expect(/Authorization|Bearer\s/i.test(text), f).toBe(false);
    }
  });
});

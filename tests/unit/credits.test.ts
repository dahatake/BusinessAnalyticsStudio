// NFR-LEGAL-001 AC-179: 同梱したロゴ・フォント・音源・3D モデル・ライブラリが、すべて CREDITS.md に権利の種別とライセンス付きで載っている（雛形の静的検査）
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..');
const SKIP = new Set(['node_modules', 'dist', 'work', '.git', 'tests']);
/** ロゴ（画像）・フォント・音源・3D モデルのファイル */
const ASSET_FILE = /\.(svg|png|jpe?g|gif|webp|ico|avif|woff2?|ttf|otf|eot|mp3|wav|ogg|m4a|flac|glb|gltf|hdr|exr|obj|fbx)$/i;
const RIGHTS = /許諾済み|自作|手続き生成/;
const LICENSE = /MIT|Apache-2\.0|BSD-[23]-Clause|ISC|0BSD|CC0|CC-BY|OFL|ライセンス/;
const PERMISSIVE = new Set(['MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'ISC', '0BSD']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const credits = readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
const rows = credits.split(/\r?\n/).filter((l) => l.startsWith('|') && !/^\|[-| ]+\|$/.test(l));
const rel = (f: string): string => path.relative(ROOT, f).replace(/\\/g, '/');

describe('素材の権利と CREDITS（NFR-LEGAL-001）', () => {
  // NFR-LEGAL-001 AC-179
  it('AC-179 同梱したロゴ・フォント・音源・3D モデルのファイルがすべて CREDITS.md に権利の種別とライセンス付きで載っている', () => {
    const files = walk(ROOT).filter((f) => ASSET_FILE.test(f));
    expect(files.length, '雛形にロゴ（お手本パックの logo.svg）があるはず').toBeGreaterThan(0);
    for (const f of files) {
      const r = rel(f);
      const row = rows.find((x) => x.includes(`\`${r}\``));
      expect(row, `${r} が CREDITS.md にない`).toBeTruthy();
      expect(row, `${r} の権利の種別（許諾済み・自作・手続き生成）がない`).toMatch(RIGHTS);
      expect(row, `${r} のライセンスがない`).toMatch(LICENSE);
    }
  });

  // NFR-LEGAL-001 AC-179
  it('AC-179 CREDITS.md の表の行が指すファイル（`...` で囲んだ node_modules 以外のパス）が実在する', () => {
    const missing: string[] = [];
    for (const row of rows) {
      for (const m of row.matchAll(/`((?:src|examples|public|assets|scripts)\/[^`\s]+?\.[a-z0-9]+)`/gi)) {
        if (!existsSync(path.join(ROOT, m[1]!))) missing.push(m[1]!);
      }
    }
    expect(missing).toEqual([]);
  });

  // NFR-LEGAL-001 AC-179
  it('AC-179 package.json の dependencies（実行時に同梱するライブラリ）がすべて CREDITS.md に権利の種別とライセンス付きで載っていて、ライセンスが一致する', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    for (const name of Object.keys(pkg.dependencies)) {
      const row = rows.find((x) => x.startsWith(`| ${name} |`));
      expect(row, `${name} が CREDITS.md にない`).toBeTruthy();
      expect(row, `${name} の権利の種別がない`).toMatch(RIGHTS);
      expect(row, `${name} のライセンスがない`).toMatch(LICENSE);
      const installed = path.join(ROOT, 'node_modules', ...name.split('/'), 'package.json');
      if (existsSync(installed)) {
        const lic = (JSON.parse(readFileSync(installed, 'utf8')) as { license?: string }).license;
        expect(row, `${name} のライセンス（${lic}）が CREDITS.md と違う`).toContain(`| ${lic} |`);
      }
    }
  });

  // NFR-LEGAL-001 AC-179
  it('AC-179 推移的な依存のライセンスがすべて許容できるもの（MIT・Apache-2.0・BSD・ISC・0BSD）で、CREDITS.md に載っている種類と合う', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    if (!existsSync(path.join(ROOT, 'node_modules'))) return; // 依存を入れていない環境では、直接の依存の検査だけにする
    const seen = new Map<string, string>();
    const find = (name: string, from: string): string | null => {
      let d = from;
      for (;;) {
        const p = path.join(d, 'node_modules', ...name.split('/'), 'package.json');
        if (existsSync(p)) return p;
        const up = path.dirname(d);
        if (up === d || up.length < ROOT.length) return null;
        d = up;
      }
    };
    const visit = (name: string, from: string): void => {
      const p = find(name, from);
      if (!p) return;
      const j = JSON.parse(readFileSync(p, 'utf8')) as { name: string; version: string; license?: string; dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
      const key = `${j.name}@${j.version}`;
      if (seen.has(key)) return;
      let lic = j.license;
      if (!lic && /^MIT License/m.test(existsSync(path.join(path.dirname(p), 'LICENSE')) ? readFileSync(path.join(path.dirname(p), 'LICENSE'), 'utf8') : '')) lic = 'MIT';
      seen.set(key, lic ?? '不明');
      for (const d of Object.keys(j.dependencies ?? {})) visit(d, path.dirname(p));
      for (const d of Object.keys(j.peerDependencies ?? {})) visit(d, path.dirname(p));
    };
    for (const d of Object.keys(pkg.dependencies)) visit(d, ROOT);
    const bad = [...seen].filter(([, lic]) => !PERMISSIVE.has(lic)).map(([k, lic]) => `${k}: ${lic}`);
    expect(bad, '許容するライセンス以外の依存').toEqual([]);
    for (const lic of new Set(seen.values())) expect(credits, `${lic} が CREDITS.md の説明にない`).toContain(lic);
  }, 60_000);

  // NFR-LEGAL-001 AC-179
  it('AC-179 フォントのファイルを同梱していない（書体は名前で指定するだけ）か、同梱するなら CREDITS.md に載っている', () => {
    const fonts = walk(ROOT).filter((f) => /\.(woff2?|ttf|otf|eot)$/i.test(f));
    for (const f of fonts) expect(rows.some((x) => x.includes(`\`${rel(f)}\``)), `${rel(f)} が CREDITS.md にない`).toBe(true);
    if (fonts.length === 0) expect(credits).toMatch(/フォントのファイルは同梱しません/);
  });
});

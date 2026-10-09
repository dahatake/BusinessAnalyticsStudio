import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'work' || name === '.git') continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe('3D アセットの権利（FR-068）', () => {
  // FR-068 AC-083
  it('AC-083 3D のモデルの読み込み先がすべてローカルのファイルである', () => {
    const files = walk(path.join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f));
    const loaderCall = /(useGLTF|useLoader|GLTFLoader|OBJLoader|FBXLoader|useTexture|TextureLoader|useFBX|\.load)(\.preload)?\s*\(\s*(?:[A-Za-z_.]+\s*,\s*)?(['"`])([^'"`]*)\3/g;
    const remote: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(loaderCall)) {
        const url = m[4] ?? '';
        if (/^(https?:)?\/\//i.test(url)) remote.push(`${path.relative(ROOT, f)}: ${url}`);
      }
      // drei の Environment preset や Text の既定フォントは CDN から取得するので使わない
      if (/@react-three\/drei/.test(src)) {
        expect(src, `${path.relative(ROOT, f)} が CDN 取得の drei 機能を使っている`).not.toMatch(/<Environment\b|<Text\b|<Text3D\b/);
      }
      expect(src, `${path.relative(ROOT, f)} が three/examples のローダーを直接使っている`).not.toMatch(/three\/examples\/jsm\/loaders/);
    }
    expect(remote).toEqual([]);
  });

  // FR-068 AC-083
  it('AC-083 同梱した glTF のすべてが CREDITS.md に権利の種別付きで載っている', () => {
    const credits = readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
    const rows = credits.split(/\r?\n/).filter((l) => l.startsWith('|'));
    const gltfs = walk(ROOT).filter((f) => /\.(gltf|glb)$/i.test(f));
    for (const f of gltfs) {
      const rel = path.relative(ROOT, f).replace(/\\/g, '/');
      const row = rows.find((r) => r.includes(rel));
      expect(row, `${rel} が CREDITS.md にない`).toBeTruthy();
      expect(row, `${rel} の権利の種別がない`).toMatch(/許諾済み|自作|手続き生成/);
    }
    // 手続き生成のアセットの行にも種別がある
    const proc = rows.filter((r) => r.includes('src/three/presets.ts'));
    expect(proc.length).toBeGreaterThan(0);
    for (const r of proc) expect(r).toMatch(/手続き生成/);
  });
});

// 雛形の配布・起動・業種に関する検査（FR-103 / FR-104 / FR-105 / FR-106 / NFR-ENV-002）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { collectPackageFiles, createPackage } from '../../scripts/lib/package';
import { loadPack, EXAMPLE_PACK_PREFIX, type FetchLike } from '../../src/data/loader';
import { INDUSTRY_PRESETS, heroObjects, resolvePreset } from '../../src/three/presets';
import { TEMPLATE_VERSION, checkTemplateVersion, versionWarning } from '../../src/version';
import { REPO_ROOT } from '../../scripts/lib/pack-fs';

const readJson = (f: string): any => JSON.parse(fs.readFileSync(f, 'utf8'));
const pkg = readJson(path.join(REPO_ROOT, 'package.json'));

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p) : [p];
  });
}

/** examples/<kind> のパックを、指定の URL の接頭辞で配信する fetch の代わり */
function packFetch(kind: string, served: { data: string; brand: string }): FetchLike {
  const root = path.join(REPO_ROOT, 'examples', kind, 'public');
  return async (url) => {
    let file: string | null = null;
    if (url.startsWith(`${served.data}/data/`)) file = path.join(root, 'data', url.slice(`${served.data}/data/`.length));
    else if (url === `${served.brand}/brand/brand-profile.json`) file = path.join(root, 'brand', 'brand-profile.json');
    if (!file || !fs.existsSync(file)) return { ok: false, status: 404, json: async () => { throw new Error('not json'); } };
    return { ok: true, status: 200, json: async () => readJson(file as string) };
  };
}

describe('FR-103 業種プリセット', () => {
  // FR-103 AC-125
  it('FR-103 AC-125 5 業種それぞれに 3D シーン・カメラパス・アイコン・中核オブジェクトの表現の定義がある', () => {
    expect(INDUSTRY_PRESETS.map((p) => p.label)).toEqual(['金融', '製造', '小売', '物流', '公共']);
    for (const p of INDUSTRY_PRESETS) {
      expect(p.scene.background, `${p.id} のシーンの背景`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.scene.ground).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.scene.description.length).toBeGreaterThan(0);
      expect(p.cameraPath.length, `${p.id} のカメラパス`).toBeGreaterThanOrEqual(2);
      expect(p.icon, `${p.id} のアイコン`).toBeTruthy();
      expect(['box', 'cylinder', 'sphere', 'cone']).toContain(p.core.shape);
      expect(heroObjects(p).some((o) => o.id === 'hero-core' && o.shape === p.core.shape), `${p.id} の中核オブジェクトがヒーローに出ない`).toBe(true);
    }
    // 業種ごとに表現が異なる（同じ定義の使い回しではない）
    for (const key of ['icon'] as const) expect(new Set(INDUSTRY_PRESETS.map((p) => p[key])).size).toBe(5);
    expect(new Set(INDUSTRY_PRESETS.map((p) => p.scene.background)).size).toBe(5);
    expect(new Set(INDUSTRY_PRESETS.map((p) => JSON.stringify(p.cameraPath))).size).toBe(5);
    expect(new Set(INDUSTRY_PRESETS.map((p) => JSON.stringify(heroObjects(p).map((o) => [o.shape, o.position])))).size).toBe(5);
  });

  // FR-103 AC-125（customer.json の業種を変えると選ばれるプリセットが変わる）
  it('FR-103 AC-125 customer.json の industryPreset を変えると、選ばれるプリセットが変わる', () => {
    const chosen = INDUSTRY_PRESETS.map((p) => resolvePreset(p.id).id);
    expect(chosen).toEqual(INDUSTRY_PRESETS.map((p) => p.id));
    expect(resolvePreset('金融').id).toBe('finance');
    expect(resolvePreset(undefined).id).toBe('manufacturing');
    expect(resolvePreset('未定義の業種').id).toBe('manufacturing');
  });
});

describe('FR-104 お手本パックでの起動', () => {
  // FR-104 AC-126
  it('FR-104 AC-126 /data/ が空なら、同梱のお手本パック（架空企業）で起動し、そのことが isExample で分かる', async () => {
    const mono = readJson(path.join(REPO_ROOT, 'examples', 'mono', 'public', 'data', 'customer.json'));
    const loaded = await loadPack(packFetch('mono', { data: EXAMPLE_PACK_PREFIX, brand: EXAMPLE_PACK_PREFIX }));
    expect(loaded.isExample).toBe(true);
    expect(loaded.data.customer.name).toBe(mono.name);
  });

  // FR-104 AC-126（顧客パックがあればお手本パックを使わない）
  it('FR-104 AC-126 /data/ に顧客パックがあれば、お手本パックでは起動しない', async () => {
    const loaded = await loadPack(packFetch('koto', { data: '', brand: '' }));
    expect(loaded.isExample).toBe(false);
    expect(loaded.data.customer.name).toBe(readJson(path.join(REPO_ROOT, 'examples', 'koto', 'public', 'data', 'customer.json')).name);
  });

  // FR-104 AC-126（ビルド成果物への同梱。ビルドの後に実行される）
  it('FR-104 AC-126 ビルドが examples/mono を dist/example-pack/ に同梱する', () => {
    const dist = path.join(REPO_ROOT, 'dist', 'example-pack');
    if (!fs.existsSync(path.join(REPO_ROOT, 'dist', 'index.html'))) return; // dist は verify のビルドで作られる。無い環境では System Test が確かめる
    const src = path.join(REPO_ROOT, 'examples', 'mono');
    for (const [from, to] of [['public/data', 'data'], ['public/brand', 'brand'], ['assets/brand', 'assets/brand']] as const) {
      for (const f of listFiles(path.join(src, from))) {
        const rel = path.relative(path.join(src, from), f);
        const copy = path.join(dist, to, rel);
        expect(fs.existsSync(copy), `${to}/${rel} が dist/example-pack/ にない`).toBe(true);
        expect(fs.readFileSync(copy).equals(fs.readFileSync(f))).toBe(true);
      }
    }
  });
});

describe('FR-105 オフラインで動く配布パッケージ', () => {
  const VERSION_PIN = /^\d+\.\d+\.\d+$/;
  // FR-105 AC-127
  it('FR-105 AC-127 依存パッケージのバージョンが範囲指定でなく固定され、ロックファイルがある', () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
    expect(Object.keys(all).length).toBeGreaterThan(0);
    for (const [name, v] of Object.entries(all)) expect(v, `${name} のバージョン ${v} が固定されていない`).toMatch(VERSION_PIN);
    const lockFile = path.join(REPO_ROOT, 'package-lock.json');
    expect(fs.existsSync(lockFile), 'package-lock.json がない').toBe(true);
    const lock = readJson(lockFile);
    const root = lock.packages[''];
    expect({ ...root.dependencies, ...root.devDependencies }).toEqual(all);
    for (const name of Object.keys(all)) expect(lock.packages[`node_modules/${name}`]?.version, `${name} がロックされていない`).toBe(all[name]);
  });

  // FR-105 AC-127（配布パッケージの中身）
  it('FR-105 AC-127 配布パッケージは、.env・顧客パックを含まず、実行に必要なものを含む（実際に tar を作って一覧を検査）', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edb-pkg-'));
    try {
      const put = (rel: string, body = 'x') => {
        fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
        fs.writeFileSync(path.join(tmp, rel), body);
      };
      // 含めるもの
      for (const f of ['package.json', 'package-lock.json', 'vite.config.ts', 'index.html', '.env.example', 'docs/distribution.md', 'public/data/README.txt',
        'dist/index.html', 'dist/assets/index-abc.js', 'dist/example-pack/data/customer.json', 'dist/example-pack/brand/brand-profile.json',
        'node_modules/zod/package.json', 'src/main.tsx', 'schema/customer.json', 'examples/mono/public/data/customer.json',
        'scripts/relay/start.ts', 'scripts/lib/pack-fs.ts', 'scripts/make-package.ts', 'dist/data/README.txt']) put(f);
      // 含めないもの
      const secret = ['.env', '.env.local', '.env.production', 'examples/mono/.env', 'node_modules/foo/.env'];
      const customer = ['public/data/customer.json', 'public/brand/brand-profile.json', 'assets/brand/logo.svg',
        'dist/data/customer.json', 'dist/brand/brand-profile.json', 'dist/assets/brand/logo.svg', 'dist/assets/audio/bgm.mp3'];
      const others = ['work/package/old.tgz', '.git/config', 'tests/system/ledger.json', 'scripts/verify.py', 'docs/catalog.md', 'unlisted.txt'];
      for (const f of [...secret, ...customer, ...others]) put(f, 'SECRET-OR-CUSTOMER');

      const listed = collectPackageFiles(tmp);
      for (const f of [...secret, ...customer, ...others]) expect(listed, `${f} が同梱の一覧に入っている`).not.toContain(f);
      for (const f of ['package.json', '.env.example', 'dist/index.html', 'dist/example-pack/data/customer.json', 'public/data/README.txt', 'node_modules/zod/package.json', 'scripts/relay/start.ts']) {
        expect(listed, `${f} が同梱されない`).toContain(f);
      }

      // 実際に .tgz を作り、中身の一覧で確かめる
      const out = path.join(tmp, 'work', 'package', 'edb.tgz');
      createPackage(tmp, out);
      const names = execFileSync('tar', ['-tzf', out], { encoding: 'utf8' }).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      expect(names.sort()).toEqual([...listed].sort());
      expect(names.filter((n) => /(^|\/)\.env($|\.(?!example$))/.test(n))).toEqual([]);
      expect(names.some((n) => /^(\.\/)?(work|\.git|tests)\//.test(n))).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // FR-105 AC-127（配布の手順）
  it('FR-105 AC-127 配布パッケージを作る・オフラインで起動する npm スクリプトがある', () => {
    expect(pkg.scripts.package).toContain('make-package');
    expect(pkg.scripts.start).toContain('vite preview');
    expect(fs.existsSync(path.join(REPO_ROOT, 'scripts', 'make-package.ts'))).toBe(true);
    const doc = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'distribution.md'), 'utf8');
    expect(doc).toContain('npm run package');
    expect(doc).toContain('npm start');
  });
});

describe('FR-106 雛形のバージョン', () => {
  // FR-106 AC-129
  it('FR-106 AC-129 雛形のバージョンは package.json の version で、お手本パックは互換', () => {
    expect(TEMPLATE_VERSION).toBe(pkg.version);
    for (const kind of ['mono', 'koto']) {
      const v = readJson(path.join(REPO_ROOT, 'examples', kind, 'public', 'data', 'customer.json')).templateVersion;
      expect(checkTemplateVersion(v).compatible, `${kind} の templateVersion ${v}`).toBe(true);
    }
  });

  // FR-106 AC-129
  it('FR-106 AC-129 互換でないバージョンの組み合わせを判定し、警告にその組み合わせを書く', () => {
    expect(checkTemplateVersion('0.1.0', '0.1.0').compatible).toBe(true);
    expect(checkTemplateVersion('0.1.0', '0.1.3').compatible).toBe(true);
    expect(checkTemplateVersion('0.1.3', '0.1.0').compatible).toBe(false);
    expect(checkTemplateVersion('0.2.0', '0.1.0').compatible).toBe(false);
    expect(checkTemplateVersion('1.2.0', '1.3.0').compatible).toBe(true);
    expect(checkTemplateVersion('1.4.0', '1.3.0').compatible).toBe(false);
    expect(checkTemplateVersion('999.0.0', '0.1.0').compatible).toBe(false);
    expect(checkTemplateVersion('abc', '0.1.0').compatible).toBe(false);
    const w = versionWarning(checkTemplateVersion('999.0.0', '0.1.0'));
    expect(w).toContain('999.0.0');
    expect(w).toContain('0.1.0');
  });
});

describe('NFR-ENV-002 外部サーバーなし・オフラインでの動作', () => {
  // NFR-ENV-002 AC-167（静的な確認。通信の遮断での実行は System Test）
  it('NFR-ENV-002 AC-167 ソース・index.html・public に、外部の URL（CDN・Web フォント・外部 API）への参照がない', () => {
    const targets = [
      ...listFiles(path.join(REPO_ROOT, 'src')),
      ...listFiles(path.join(REPO_ROOT, 'public')),
      path.join(REPO_ROOT, 'index.html'),
    ].filter((f) => /\.(tsx?|css|html|json|svg)$/.test(f));
    const ALLOWED = [/^https?:\/\/(localhost|127\.0\.0\.1)/, /^https?:\/\/www\.w3\.org\//];
    const hits: string[] = [];
    for (const f of targets) {
      const text = fs.readFileSync(f, 'utf8');
      for (const m of text.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) {
        if (!ALLOWED.some((a) => a.test(m[0]))) hits.push(`${path.relative(REPO_ROOT, f)}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

// FR-268 AC-828: M365 Copilot に添付する「顧客パックの kit」を 1 つの Markdown にまとめる。
// schema/*.json（全件）と examples/mono の JSON・調査記録を、パス見出し＋コードブロックで省略せず出力する。
// schema が古い（gen:schema --check 相当で差分がある）ときは、kit を更新せず失敗する。
import fs from 'node:fs';
import path from 'node:path';
import { buildJsonSchemas } from './gen-schema';
import { REPO_ROOT } from './lib/pack-fs';

export const KIT_REL = 'tools/envisioning/_attach/customer-pack-kit.md';
const MONO_DATA = ['architecture', 'customer', 'entities', 'issues', 'mocks', 'plan', 'products', 'show', 'sources'].map((n) => `examples/mono/public/data/${n}.json`);
const MONO_FILES = [...MONO_DATA, 'examples/mono/public/brand/brand-profile.json', 'examples/mono/data/customer-research.md', 'examples/mono/brand/BRAND-RESEARCH.md'];

const lf = (s: string) => s.replaceAll('\r\n', '\n');

/** schema が生成物と一致しないファイル名の一覧。 */
export function staleSchemas(root: string = REPO_ROOT): string[] {
  const stale: string[] = [];
  for (const [file, text] of Object.entries(buildJsonSchemas())) {
    const target = path.join(root, 'schema', file);
    if (!fs.existsSync(target) || lf(fs.readFileSync(target, 'utf8')) !== text) stale.push(`schema/${file}`);
  }
  return stale;
}

function block(rel: string, root: string): string {
  const body = lf(fs.readFileSync(path.join(root, rel), 'utf8')).replace(/\s+$/, '');
  const lang = rel.endsWith('.json') ? 'json' : 'markdown';
  let n = 3;
  for (const m of body.matchAll(/`{3,}/g)) n = Math.max(n, m[0].length + 1);
  const fence = '`'.repeat(n);
  return `## ${rel}\n\n${fence}${lang}\n${body}\n${fence}\n`;
}

export function buildKit(root: string = REPO_ROOT): string {
  const schemas = fs.readdirSync(path.join(root, 'schema')).filter((f) => f.endsWith('.json')).sort().map((f) => `schema/${f}`);
  const files = [...schemas, ...MONO_FILES];
  for (const f of files) if (!fs.existsSync(path.join(root, f))) throw new Error(`kit の材料がない: ${f}`);
  const head = [
    '# 顧客パックの kit（schema とお手本）',
    '',
    'このファイル 1 つを M365 Copilot のチャットに添付するか、中身を貼り付けてください。`schema/*.json` は顧客パックの JSON が従う JSON Schema、`examples/mono/` はお手本（デモ）パックです。',
    '各ファイルは「パスの見出し＋コードブロック」で、省略せず全文を載せています。`npm run pack:kit` で再生成できます。',
    '',
  ].join('\n');
  return head + '\n' + files.map((f) => block(f, root)).join('\n');
}

if (process.argv[1] && /make-pack-kit\.ts$/.test(process.argv[1])) {
  const stale = staleSchemas();
  if (stale.length) {
    console.error(`schema が古い（コードの定義と一致しない）ため kit を作りません: ${stale.join(', ')}`);
    console.error('直し方: npm run gen:schema を実行して schema/*.json を更新してから、もう一度 npm run pack:kit を実行してください。');
    process.exit(1);
  }
  try {
    const text = buildKit();
    const out = path.join(REPO_ROOT, KIT_REL);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
    console.log(`kit を作りました: ${KIT_REL}（M365 Copilot のチャットには、このファイル 1 つだけを添付します）`);
  } catch (e) {
    console.error(String((e as Error).message ?? e));
    process.exit(1);
  }
}

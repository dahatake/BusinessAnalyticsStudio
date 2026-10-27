// アーキテクチャ図のモデル（FR-040）。画面・ストアを参照しない純粋なモジュール。
// AsIs／ToBe の差分、グループ分け、Mermaid・SVG の出力、JSON の検証を受け持つ。
import type { PackData, PackError, PackFiles } from '../schema';
import { tr } from '../i18n';
import { ArchElementSchema, ArchLinkSchema, DATA_FILE_NAMES, formatPackError, validatePack, type ArchKind } from '../schema';

export type ArchElement = {
  id: string;
  createdBy: 'ai' | 'human' | 'sample';
  name: string;
  kind?: ArchKind;
  layer?: string;
  productId?: string;
  solutionIds?: string[];
  [key: string]: unknown;
};
export type ArchLink = { from: string; to: string; label?: string; [key: string]: unknown };
export interface ArchModel { elements: ArchElement[]; links: ArchLink[] }
export type ArchView = 'asis' | 'tobe';

export type DiffKind = 'added' | 'removed' | 'changed' | 'same';
export const DIFF_LABEL: Record<Exclude<DiffKind, 'same'>, string> = {
  get added() { return tr('追加'); },
  get removed() { return tr('削除'); },
  get changed() { return tr('変更'); },
};

export interface DiffElement { element: ArchElement; diff: DiffKind }
export interface DiffModel { elements: DiffElement[]; links: Array<ArchLink & { diff: DiffKind }> }

/** パックから AsIs／ToBe を取る。asis・tobe がなければ nodes・edges を両方に使う（差分なし）。 */
export function archVariants(arch: PackData['architecture']): Record<ArchView, ArchModel> {
  const fallback: ArchModel = {
    elements: arch.nodes.map((n) => ({
      id: n.id, createdBy: n.createdBy, name: n.label, kind: 'system' as const,
      ...(n.layer ? { layer: n.layer } : {}), ...(n.productId ? { productId: n.productId } : {}),
    })),
    links: arch.edges.map((e) => ({ from: e.from, to: e.to, ...(e.label ? { label: e.label } : {}) })),
  };
  const pick = (v: PackData['architecture']['asis']): ArchModel =>
    v ? { elements: v.elements as ArchElement[], links: (v.links ?? []) as ArchLink[] } : fallback;
  return { asis: pick(arch.asis), tobe: pick(arch.tobe) };
}

/** 項目の並びに依存しない等価の比較 */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

const linkKey = (l: ArchLink): string => `${l.from}->${l.to}:${l.label ?? ''}`;

/** AsIs から ToBe への差分。ToBe にあって AsIs にない=追加、AsIs にあって ToBe にない=削除、両方にあって内容が違う=変更。 */
export function diffArchitecture(asis: ArchModel, tobe: ArchModel): DiffModel {
  const before = new Map(asis.elements.map((e) => [e.id, e]));
  const after = new Set(tobe.elements.map((e) => e.id));
  const elements: DiffElement[] = tobe.elements.map((e) => {
    const a = before.get(e.id);
    return { element: e, diff: !a ? 'added' : stableStringify(a) !== stableStringify(e) ? 'changed' : 'same' };
  });
  for (const e of asis.elements) if (!after.has(e.id)) elements.push({ element: e, diff: 'removed' });
  const aLinks = new Set(asis.links.map(linkKey));
  const bLinks = new Set(tobe.links.map(linkKey));
  const links: DiffModel['links'] = [
    ...tobe.links.map((l) => ({ ...l, diff: (aLinks.has(linkKey(l)) ? 'same' : 'added') as DiffKind })),
    ...asis.links.filter((l) => !bLinks.has(linkKey(l))).map((l) => ({ ...l, diff: 'removed' as DiffKind })),
  ];
  return { elements, links };
}

/** 表示するモデル。AsIs は差分なし、ToBe は AsIs との差分つき。 */
export function modelFor(view: ArchView, v: Record<ArchView, ArchModel>): DiffModel {
  if (view === 'asis') return { elements: v.asis.elements.map((element) => ({ element, diff: 'same' as const })), links: v.asis.links.map((l) => ({ ...l, diff: 'same' as const })) };
  return diffArchitecture(v.asis, v.tobe);
}

export type ArchSectionKind = 'capability' | 'stream' | 'layer';
export interface ArchSection { kind: ArchSectionKind; title: string; items: DiffElement[] }

export const SECTION_TITLE: Record<Exclude<ArchSectionKind, 'layer'>, string> = {
  get capability() { return tr('ビジネス: Capability Map'); },
  get stream() { return tr('ビジネス: バリューストリーム'); },
};

/** 図の区画。Capability Map・バリューストリーム・アプリ/システムの層（出現順）。 */
export function sectionsOf(model: DiffModel): ArchSection[] {
  const cap = model.elements.filter((e) => e.element.kind === 'capability');
  const stream = model.elements.filter((e) => e.element.kind === 'stream');
  const out: ArchSection[] = [];
  if (cap.length) out.push({ kind: 'capability', title: SECTION_TITLE.capability, items: cap });
  if (stream.length) out.push({ kind: 'stream', title: SECTION_TITLE.stream, items: stream });
  const layers = new Map<string, DiffElement[]>();
  for (const e of model.elements) {
    if (e.element.kind === 'capability' || e.element.kind === 'stream') continue;
    const name = e.element.layer ?? tr('その他');
    const l = layers.get(name);
    if (l) l.push(e); else layers.set(name, [e]);
  }
  for (const [title, items] of layers) out.push({ kind: 'layer', title: tr('アプリ/システム: {title}', { title }), items });
  return out;
}

// ---- JSON（編集・出力） ----

export interface ArchJson { asis: ArchModel; tobe: ArchModel }

export function archToJson(v: Record<ArchView, ArchModel>): string {
  return JSON.stringify({ asis: v.asis, tobe: v.tobe }, null, 2);
}

export type ArchJsonResult = { ok: true; value: ArchJson } | { ok: false; reason: string };

/** JSON の文字列を検証する。壊れた JSON・要素の誤り・存在しない要素への接続は、原因を返して適用しない。 */
export function parseArchitectureJson(text: string): ArchJsonResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: tr('JSON として読み取れません: {msg}', { msg: e instanceof Error ? e.message : String(e) }) };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, reason: tr('JSON の最上位はオブジェクト（asis と tobe を持つ）にしてください。') };
  const r = raw as Record<string, unknown>;
  const out = {} as ArchJson;
  for (const key of ['asis', 'tobe'] as const) {
    const v = r[key];
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return { ok: false, reason: tr('「{key}」（elements と links を持つオブジェクト）がありません。', { key }) };
    const { elements, links = [] } = v as { elements?: unknown; links?: unknown };
    if (!Array.isArray(elements)) return { ok: false, reason: tr('「{key}.elements」は配列にしてください。', { key }) };
    if (!Array.isArray(links)) return { ok: false, reason: tr('「{key}.links」は配列にしてください。', { key }) };
    const ids = new Set<string>();
    for (const [i, el] of elements.entries()) {
      const p = ArchElementSchema.safeParse(el);
      if (!p.success) return { ok: false, reason: `${key}.elements[${i}]: ${p.error.issues.map((x) => `${x.path.join('.') || tr('要素')} ${x.message}`).join('、')}` };
      if (ids.has(p.data.id)) return { ok: false, reason: `${key}.elements[${i}]: ${tr('ID が重複しています（{id}）', { id: p.data.id })}` };
      ids.add(p.data.id);
    }
    for (const [i, l] of links.entries()) {
      const p = ArchLinkSchema.safeParse(l);
      if (!p.success) return { ok: false, reason: `${key}.links[${i}]: ${p.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('、')}` };
      if (!ids.has(p.data.from) || !ids.has(p.data.to)) return { ok: false, reason: `${key}.links[${i}]: ${tr('存在しない要素への接続です（{from} → {to}）', { from: p.data.from, to: p.data.to })}` };
    }
    out[key] = { elements: elements as ArchElement[], links: links as ArchLink[] };
  }
  return { ok: true, value: out };
}

/** JSON 編集をパック全体に当てたときに、新しく出る検証の誤り（ID の重複・参照先がない・スキーマ違反）。適用前に呼び、空でなければ適用しない。 */
export function validateArchitectureChange(data: PackData, next: ArchJson): string[] {
  const filesOf = (arch: unknown): PackFiles => {
    const f: Record<string, unknown> = {};
    for (const name of DATA_FILE_NAMES) f[name] = name === 'architecture' ? arch : (data as unknown as Record<string, unknown>)[name];
    return f as PackFiles;
  };
  const key = (e: PackError): string => `${e.code}|${e.file}|${e.path}|${e.message}`;
  const before = new Set(validatePack(filesOf(data.architecture)).errors.map(key));
  const candidate = { ...data.architecture, asis: next.asis, tobe: next.tobe };
  // brandProfile は architecture に関係しないので渡さない（欠けの報告は除く）
  return validatePack(filesOf(candidate)).errors
    .filter((e) => e.code !== 'missing-file' && !before.has(key(e)))
    .map(formatPackError);
}

// ---- Mermaid ----

const q = (s: string): string => s.replace(/"/g, '#quot;').replace(/[\r\n]+/g, ' ');

/** Mermaid（flowchart）のテキスト。要素は層ごとの subgraph、差分は classDef で区別し、ラベルにも「追加」「削除」「変更」を付ける。 */
export function toMermaid(model: DiffModel, title: string): string {
  const lines: string[] = [`%% ${q(title)}`, 'flowchart LR'];
  const ids = new Map<string, string>();
  model.elements.forEach((e, i) => ids.set(e.element.id, `n${i + 1}`));
  sectionsOf(model).forEach((s, si) => {
    lines.push(`  subgraph s${si + 1}["${q(s.title)}"]`);
    for (const e of s.items) {
      const mark = e.diff === 'same' ? '' : `（${DIFF_LABEL[e.diff]}）`;
      lines.push(`    ${ids.get(e.element.id)}["${q(e.element.name)}${mark}"]`);
    }
    lines.push('  end');
  });
  for (const l of model.links) {
    const a = ids.get(l.from);
    const b = ids.get(l.to);
    if (!a || !b) continue;
    const arrow = l.diff === 'removed' ? '-.->' : '-->';
    lines.push(l.label ? `  ${a} ${arrow}|"${q(l.label)}"| ${b}` : `  ${a} ${arrow} ${b}`);
  }
  lines.push('  classDef added fill:#dff6dd,stroke:#107c10,color:#0b4d0b');
  lines.push('  classDef removed fill:#fde7e9,stroke:#c50f1f,color:#7a0710,stroke-dasharray: 4 3');
  lines.push('  classDef changed fill:#fff4ce,stroke:#bf8f00,color:#5b4400');
  for (const kind of ['added', 'removed', 'changed'] as const) {
    const members = model.elements.filter((e) => e.diff === kind).map((e) => ids.get(e.element.id));
    if (members.length) lines.push(`  class ${members.join(',')} ${kind}`);
  }
  return `${lines.join('\n')}\n`;
}

// ---- SVG ----

const DIFF_COLOR: Record<DiffKind, { fill: string; stroke: string; text: string }> = {
  same: { fill: '#f5f5f5', stroke: '#8a8a8a', text: '#242424' },
  added: { fill: '#dff6dd', stroke: '#107c10', text: '#0b4d0b' },
  removed: { fill: '#fde7e9', stroke: '#c50f1f', text: '#7a0710' },
  changed: { fill: '#fff4ce', stroke: '#bf8f00', text: '#5b4400' },
};

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface SvgResult { svg: string; width: number; height: number }

/** SVG の図（外部の資源を使わない自己完結の文字列）。 */
export function toSvg(model: DiffModel, title: string): SvgResult {
  const BOX_W = 150;
  const BOX_H = 44;
  const GAP = 16;
  const PAD = 24;
  const PER_ROW = 5;
  const secs = sectionsOf(model);
  const pos = new Map<string, { x: number; y: number }>();
  const parts: string[] = [];
  let y = PAD + 28;
  const width = PAD * 2 + PER_ROW * BOX_W + (PER_ROW - 1) * GAP;
  for (const s of secs) {
    parts.push(`<text x="${PAD}" y="${y + 14}" font-size="14" font-weight="600" fill="#242424">${esc(s.title)}</text>`);
    y += 24;
    s.items.forEach((e, i) => {
      const col = i % PER_ROW;
      const row = Math.floor(i / PER_ROW);
      const x = PAD + col * (BOX_W + GAP);
      const yy = y + row * (BOX_H + GAP);
      pos.set(e.element.id, { x: x + BOX_W / 2, y: yy + BOX_H / 2 });
      const c = DIFF_COLOR[e.diff];
      const dash = e.diff === 'removed' ? ' stroke-dasharray="5 3"' : '';
      const label = e.diff === 'same' ? '' : `【${DIFF_LABEL[e.diff]}】`;
      parts.push(
        `<g data-id="${esc(e.element.id)}"><rect x="${x}" y="${yy}" width="${BOX_W}" height="${BOX_H}" rx="6" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2"${dash}/>` +
        `<text x="${x + BOX_W / 2}" y="${yy + BOX_H / 2 + 5}" font-size="12" text-anchor="middle" fill="${c.text}">${esc(label + e.element.name)}</text></g>`,
      );
    });
    y += Math.ceil(s.items.length / PER_ROW) * (BOX_H + GAP) + 12;
  }
  const lineParts: string[] = [];
  for (const l of model.links) {
    const a = pos.get(l.from);
    const b = pos.get(l.to);
    if (!a || !b) continue;
    const dash = l.diff === 'removed' ? ' stroke-dasharray="5 3"' : '';
    lineParts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#605e5c" stroke-width="1.5"${dash} marker-end="url(#arrow)"/>`);
    if (l.label) lineParts.push(`<text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 4}" font-size="10" text-anchor="middle" fill="#424242">${esc(l.label)}</text>`);
  }
  const height = Math.max(y + PAD, 120);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="'Segoe UI Variable','Segoe UI','Noto Sans JP',sans-serif">` +
    `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#605e5c"/></marker></defs>` +
    `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
    `<text x="${PAD}" y="${PAD + 4}" font-size="16" font-weight="700" fill="#242424">${esc(title)}</text>` +
    `${lineParts.join('')}${parts.join('')}</svg>`;
  return { svg, width, height };
}

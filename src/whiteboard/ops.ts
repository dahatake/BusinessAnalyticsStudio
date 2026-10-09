// ホワイトボードの操作（FR-097・FR-098・FR-099）。ボードの項目の配列を受け取って新しい配列を返す、純粋な関数だけ。
// コネクター・フレーム・グループ・整列・データのカード・ドット投票・付箋のクラスタリングの並べ替え。
import { newId, translateItem, unionBounds, type BoardItem, type Bounds } from '../ink/model';

export const STICKY_W = 180;
export const STICKY_H = 140;
export const CARD_W = 220;
export const CARD_H = 76;
export const FRAME_PAD = 24;
export const FRAME_TITLE = 32;

type Pt = { x: number; y: number };

/** コネクターでつなげる項目（付箋・データのカード・文字・画像）。 */
export const isNode = (i: BoardItem): boolean => i.type === 'sticky' || i.type === 'card' || i.type === 'text' || i.type === 'image';

const center = (i: Bounds): Pt => ({ x: i.x + i.w / 2, y: i.y + i.h / 2 });

/** 中心 c・半幅 hw・半高 hh の矩形から、方向 (dx, dy) へ出たときの境界の点。 */
function edgePoint(c: Pt, hw: number, hh: number, dx: number, dy: number): Pt {
  if (dx === 0 && dy === 0) return c;
  const tx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const ty = dy === 0 ? Infinity : hh / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** コネクターの線分（つなぐ 2 つの項目の境界から境界まで）。どちらかの項目がなければ null。offset は移動中の項目のずれ。 */
export function connectorLine(
  c: Pick<BoardItem, 'from' | 'to'>,
  byId: ReadonlyMap<string, BoardItem>,
  offset?: { ids: ReadonlySet<string>; dx: number; dy: number } | null,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const a = c.from ? byId.get(c.from) : undefined;
  const b = c.to ? byId.get(c.to) : undefined;
  if (!a || !b) return null;
  const move = (i: BoardItem): Bounds => (offset?.ids.has(i.id) ? { x: i.x + offset.dx, y: i.y + offset.dy, w: i.w, h: i.h } : i);
  const ra = move(a), rb = move(b);
  const ca = center(ra), cb = center(rb);
  const dx = cb.x - ca.x, dy = cb.y - ca.y;
  const p1 = edgePoint(ca, ra.w / 2, ra.h / 2, dx, dy);
  const p2 = edgePoint(cb, rb.w / 2, rb.h / 2, -dx, -dy);
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

/** すべてのコネクターの線分と外接矩形を、つないだ項目の今の位置に合わせる。コネクターがなければ同じ配列を返す。 */
export function refreshConnectors(items: BoardItem[]): BoardItem[] {
  if (!items.some((i) => i.type === 'connector')) return items;
  const byId = new Map(items.map((i) => [i.id, i]));
  let changed = false;
  const next = items.map((i) => {
    if (i.type !== 'connector') return i;
    const l = connectorLine(i, byId);
    if (!l) return i;
    const x = Math.min(l.x1, l.x2), y = Math.min(l.y1, l.y2), w = Math.abs(l.x2 - l.x1), h = Math.abs(l.y2 - l.y1);
    if (i.x1 === l.x1 && i.y1 === l.y1 && i.x2 === l.x2 && i.y2 === l.y2 && i.x === x && i.y === y && i.w === w && i.h === h) return i;
    changed = true;
    return { ...i, ...l, x, y, w, h };
  });
  return changed ? next : items;
}

/** 2 つの項目をつなぐコネクター。同じ向きのものがすでにあればそのまま返す（重複して作らない）。 */
export function connect(items: BoardItem[], from: string, to: string, color = 'auto'): { items: BoardItem[]; id: string | null } {
  if (from === to) return { items, id: null };
  const byId = new Map(items.map((i) => [i.id, i]));
  const a = byId.get(from), b = byId.get(to);
  if (!a || !b || !isNode(a) || !isNode(b)) return { items, id: null };
  const dup = items.find((i) => i.type === 'connector' && i.from === from && i.to === to);
  if (dup) return { items, id: dup.id };
  const c: BoardItem = { id: newId('connector'), type: 'connector', x: 0, y: 0, w: 0, h: 0, from, to, color, size: 2 };
  return { items: refreshConnectors([...items, c]), id: c.id };
}

/** 選んだ項目（と、一緒に選んだストロークの範囲）を囲むフレーム。囲める項目がなければ null。 */
export function frameSelection(
  items: BoardItem[],
  ids: ReadonlySet<string>,
  strokeBounds: ReadonlyArray<Bounds> = [],
  label = 'フレーム',
): { items: BoardItem[]; frameId: string } | null {
  const members = items.filter((i) => ids.has(i.id) && i.type !== 'connector' && i.type !== 'frame');
  const box = unionBounds([...members, ...strokeBounds]);
  if (!box) return null;
  const frame: BoardItem = {
    id: newId('frame'), type: 'frame', label,
    x: box.x - FRAME_PAD, y: box.y - FRAME_PAD - FRAME_TITLE, w: box.w + FRAME_PAD * 2, h: box.h + FRAME_PAD * 2 + FRAME_TITLE,
  };
  const memberIds = new Set(members.map((m) => m.id));
  return { items: [frame, ...items.map((i) => (memberIds.has(i.id) ? { ...i, frameId: frame.id } : i))], frameId: frame.id };
}

/** 選んだ項目を 1 つのグループにする（古いグループは置き換える）。2 つ未満なら null。 */
export function groupSelection(items: BoardItem[], ids: ReadonlySet<string>): { items: BoardItem[]; groupId: string } | null {
  const members = items.filter((i) => ids.has(i.id) && i.type !== 'connector');
  if (members.length < 2) return null;
  const groupId = newId('group');
  const memberIds = new Set(members.map((m) => m.id));
  return { items: items.map((i) => (memberIds.has(i.id) ? { ...i, groupId } : i)), groupId };
}

export function ungroupSelection(items: BoardItem[], ids: ReadonlySet<string>): BoardItem[] {
  const groups = new Set(items.filter((i) => ids.has(i.id) && i.groupId).map((i) => i.groupId as string));
  if (groups.size === 0) return items;
  return items.map((i) => (i.groupId && groups.has(i.groupId) ? { ...i, groupId: null } : i));
}

/** ID の集合を、同じグループの仲間まで広げる（グループは一緒に選び、一緒に動かす）。 */
export function expandGroups(items: ReadonlyArray<BoardItem>, ids: ReadonlyArray<string>): string[] {
  const set = new Set(ids);
  const groups = new Set(items.filter((i) => set.has(i.id) && i.groupId).map((i) => i.groupId as string));
  if (groups.size === 0) return [...ids];
  for (const i of items) if (i.groupId && groups.has(i.groupId)) set.add(i.id);
  return [...set];
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hdistribute' | 'vdistribute';

export const ALIGN_MODES: ReadonlyArray<{ mode: AlignMode; label: string }> = [
  { mode: 'left', label: '左揃え' },
  { mode: 'hcenter', label: '左右中央揃え' },
  { mode: 'right', label: '右揃え' },
  { mode: 'top', label: '上揃え' },
  { mode: 'vcenter', label: '上下中央揃え' },
  { mode: 'bottom', label: '下揃え' },
  { mode: 'hdistribute', label: '横に等間隔' },
  { mode: 'vdistribute', label: '縦に等間隔' },
];

/** 整列の対象: 選んだ項目のうち、コネクターと、中の項目も選んでいるフレーム（中身と一緒に動かすので）を除いたもの。 */
export function alignTargets(items: ReadonlyArray<BoardItem>, ids: ReadonlySet<string>): BoardItem[] {
  const sel = items.filter((i) => ids.has(i.id) && i.type !== 'connector');
  const framesWithMembers = new Set(sel.filter((i) => i.frameId).map((i) => i.frameId as string));
  return sel.filter((i) => !(i.type === 'frame' && framesWithMembers.has(i.id)));
}

/** 整列・等間隔。2 つ未満（等間隔は 3 つ未満）なら変えない。 */
export function alignItems(items: BoardItem[], ids: ReadonlySet<string>, mode: AlignMode): BoardItem[] {
  const targets = alignTargets(items, ids);
  const distribute = mode === 'hdistribute' || mode === 'vdistribute';
  if (targets.length < (distribute ? 3 : 2)) return items;
  const box = unionBounds(targets)!;
  const delta = new Map<string, Pt>();
  const set = (i: BoardItem, dx: number, dy: number) => { if (dx !== 0 || dy !== 0) delta.set(i.id, { x: dx, y: dy }); };
  if (distribute) {
    const horizontal = mode === 'hdistribute';
    const sorted = [...targets].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
    const total = sorted.reduce((s, i) => s + (horizontal ? i.w : i.h), 0);
    const gap = ((horizontal ? box.w : box.h) - total) / (sorted.length - 1);
    let pos = horizontal ? box.x : box.y;
    for (const i of sorted) {
      if (horizontal) set(i, pos - i.x, 0); else set(i, 0, pos - i.y);
      pos += (horizontal ? i.w : i.h) + gap;
    }
  } else {
    for (const i of targets) {
      switch (mode) {
        case 'left': set(i, box.x - i.x, 0); break;
        case 'hcenter': set(i, box.x + box.w / 2 - (i.x + i.w / 2), 0); break;
        case 'right': set(i, box.x + box.w - (i.x + i.w), 0); break;
        case 'top': set(i, 0, box.y - i.y); break;
        case 'vcenter': set(i, 0, box.y + box.h / 2 - (i.y + i.h / 2)); break;
        case 'bottom': set(i, 0, box.y + box.h - (i.y + i.h)); break;
        default: break;
      }
    }
  }
  if (delta.size === 0) return items;
  return refreshConnectors(items.map((i) => {
    const d = delta.get(i.id);
    return d ? translateItem(i, d.x, d.y) : i;
  }));
}

export interface CardSource { entityId: string; label: string; sub?: string }

/** アプリのデータのカード。すでに同じ元データのカードがあれば、置かずにその ID を返す。at はカードの中心（ワールド座標）。 */
export function placeCard(items: BoardItem[], src: CardSource, at: Pt): { items: BoardItem[]; id: string; existing: boolean } {
  const dup = items.find((i) => i.type === 'card' && i.sourceEntityId === src.entityId);
  if (dup) return { items, id: dup.id, existing: true };
  const card: BoardItem = {
    id: newId('card'), type: 'card', x: at.x - CARD_W / 2, y: at.y - CARD_H / 2, w: CARD_W, h: CARD_H,
    sourceEntityId: src.entityId, label: src.label, ...(src.sub ? { sub: src.sub } : {}),
  };
  return { items: [...items, card], id: card.id, existing: false };
}

/** ドット投票（delta は +1 / -1）。付箋以外は変えない。票数は 0 以上。 */
export function voteItem(items: BoardItem[], id: string, delta: number): BoardItem[] {
  return items.map((i) => (i.id === id && i.type === 'sticky' ? { ...i, votes: Math.max(0, (i.votes ?? 0) + delta) } : i));
}

export const totalVotes = (items: ReadonlyArray<BoardItem>): number => items.reduce((s, i) => s + (i.type === 'sticky' ? (i.votes ?? 0) : 0), 0);

/** すべての付箋の票を 0 に戻す。 */
export function resetVotes(items: BoardItem[]): BoardItem[] {
  return items.some((i) => i.votes) ? items.map((i) => (i.votes ? { ...i, votes: 0 } : i)) : items;
}

// ---- 付箋のクラスタリング（FR-099） ----

export interface Cluster { name: string; members: number[] }

const SPLIT = /[のがをにはでとやもへ、。，．・\s/／()（）「」]+/u;

/** 2 つの文字列に共通する、いちばん長い部分文字列。 */
function longestCommon(a: string, b: string): string {
  let best = '';
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > best.length) best = a.slice(i, i + k);
    }
  }
  return best;
}

/** 助詞や区切りで分けた語どうしの、いちばん長い共通部分。 */
function sharedWord(a: string, b: string): string {
  let best = '';
  for (const sa of a.split(SPLIT)) {
    for (const sb of b.split(SPLIT)) {
      const c = longestCommon(sa, sb);
      if (c.length > best.length) best = c;
    }
  }
  return best;
}

export const OTHER_CLUSTER = 'その他';

/**
 * 文字の重なり（助詞で区切った語に 2 文字以上の共通部分がある）で付箋をまとめる、モック用の分類。
 * 同じ入力なら同じ結果になる。どこにもまとまらなかった付箋は「その他」に集める。
 */
export function clusterTexts(texts: ReadonlyArray<string>): Cluster[] {
  const n = texts.length;
  const parent = texts.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  const pairWord = new Map<string, string>();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const w = sharedWord(texts[i]!, texts[j]!);
      if (w.length < 2) continue;
      pairWord.set(`${i},${j}`, w);
      const ri = find(i), rj = find(j);
      if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj);
    }
  }
  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    byRoot.set(r, [...(byRoot.get(r) ?? []), i]);
  }
  const clusters: Cluster[] = [];
  const others: number[] = [];
  for (const members of byRoot.values()) {
    if (members.length < 2) { others.push(members[0]!); continue; }
    let name = '';
    for (const [k, w] of pairWord) {
      const [i, j] = k.split(',').map(Number) as [number, number];
      if (members.includes(i) && members.includes(j) && w.length > name.length) name = w;
    }
    clusters.push({ name: name || `グループ ${clusters.length + 1}`, members });
  }
  clusters.sort((a, b) => a.members[0]! - b.members[0]!);
  if (others.length > 0) clusters.push({ name: OTHER_CLUSTER, members: others });
  return clusters;
}

/** AI へ渡す依頼文（付箋の文字だけを送る）。 */
export function clusterPrompt(texts: ReadonlyArray<string>): string {
  const list = texts.map((t, i) => `${i}: ${t}`).join('\n');
  return `次の付箋を、意味の近いものどうしで 2〜6 個のグループに分けてください。JSON だけを返します: {"groups":[{"name":"グループ名","members":[付箋の番号]}]}\n${list}`;
}

/** AI の応答（JSON）を、すべての付箋がちょうど 1 回ずつ入った分類にする。壊れていたら null。 */
export function parseClusterJson(answer: string, n: number): Cluster[] | null {
  const m = /\{[\s\S]*\}/.exec(answer);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { groups?: Array<{ name?: unknown; members?: unknown }> };
    if (!Array.isArray(j.groups)) return null;
    const seen = new Set<number>();
    const out: Cluster[] = [];
    for (const g of j.groups) {
      if (!Array.isArray(g.members)) return null;
      const members: number[] = [];
      for (const x of g.members as unknown[]) {
        if (Number.isInteger(x) && (x as number) >= 0 && (x as number) < n && !seen.has(x as number)) { seen.add(x as number); members.push(x as number); }
      }
      if (members.length > 0) out.push({ name: typeof g.name === 'string' && g.name.trim() ? g.name.trim() : `グループ ${out.length + 1}`, members });
    }
    return seen.size === n ? out : null;
  } catch {
    return null;
  }
}

/**
 * 分類の結果で付箋を並べ直す。グループごとに縦に積み、AI が作ったフレーム（author: 'ai'・見出しはグループ名）で囲み、
 * 付箋に同じ groupId・frameId を付ける。前回の AI のフレームは取り除く。stickyIds の順が clusters の番号に対応する。
 */
export function applyClusters(items: BoardItem[], stickyIds: ReadonlyArray<string>, clusters: ReadonlyArray<Cluster>): BoardItem[] {
  const stickies = stickyIds.map((id) => items.find((i) => i.id === id)).filter((i): i is BoardItem => !!i);
  const box = unionBounds(stickies);
  if (!box || clusters.length === 0) return items;
  const ox = box.x, oy = box.y + FRAME_TITLE + FRAME_PAD;
  const colW = Math.max(...stickies.map((s) => s.w));
  const GAP_X = 48, GAP_Y = 16;
  const moved = new Map<string, BoardItem>();
  const frames: BoardItem[] = [];
  clusters.forEach((c, ci) => {
    const groupId = newId('group');
    const frameId = newId('frame');
    const x0 = ox + FRAME_PAD + ci * (colW + FRAME_PAD * 2 + GAP_X);
    let y = oy;
    for (const mi of c.members) {
      const s = stickies[mi];
      if (!s) continue;
      moved.set(s.id, { ...s, x: x0, y, groupId, frameId });
      y += s.h + GAP_Y;
    }
    frames.push({
      id: frameId, type: 'frame', label: c.name, author: 'ai', groupId,
      x: x0 - FRAME_PAD, y: box.y, w: colW + FRAME_PAD * 2, h: Math.max(FRAME_TITLE + FRAME_PAD * 2, y - GAP_Y + FRAME_PAD - box.y),
    });
  });
  const clustered = new Set(stickyIds);
  const oldAiFrames = new Set(items.filter((i) => i.type === 'frame' && i.author === 'ai' && stickies.some((s) => s.frameId === i.id)).map((i) => i.id));
  const rest = items.filter((i) => !oldAiFrames.has(i.id)).map((i) => (clustered.has(i.id) ? (moved.get(i.id) ?? i) : i));
  return refreshConnectors([...frames, ...rest]);
}

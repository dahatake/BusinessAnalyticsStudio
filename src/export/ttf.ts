// TrueType フォントの読み取りとサブセット化（FR-092: PDF に日本語フォントを埋め込む）。外部ライブラリなしの自前実装。
// 使う文字のグリフだけを残した TrueType を作る。グリフ ID は元のまま保つ（使わないグリフは空にする）ので、PDF 側は CID = グリフ ID（Identity）で参照できる。
// 対応するのは glyf 形式の TrueType（OpenType-CFF は対象外）。

export interface TtfFont {
  unitsPerEm: number;
  numGlyphs: number;
  /** [xMin, yMin, xMax, yMax]（フォント単位） */
  bbox: [number, number, number, number];
  ascent: number;
  descent: number;
  /** 文字（コードポイント）→ グリフ ID。なければ undefined（.notdef = 0 扱い） */
  glyphOf(cp: number): number | undefined;
  /** グリフの送り幅（フォント単位） */
  advanceOf(gid: number): number;
  /** 使うグリフだけを残した TrueType（グリフ ID は変えない） */
  subset(gids: Iterable<number>): Uint8Array;
}

const u16 = (v: DataView, o: number): number => v.getUint16(o);
const u32 = (v: DataView, o: number): number => v.getUint32(o);

interface TableRec { offset: number; length: number }

function readTables(v: DataView): Map<string, TableRec> {
  const n = u16(v, 4);
  const out = new Map<string, TableRec>();
  for (let i = 0; i < n; i++) {
    const p = 12 + i * 16;
    const tag = String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3));
    out.set(tag, { offset: u32(v, p + 8), length: u32(v, p + 12) });
  }
  return out;
}

function parseCmap(v: DataView, cmap: TableRec): Map<number, number> {
  const map = new Map<number, number>();
  const n = u16(v, cmap.offset + 2);
  const subs: Array<{ pid: number; eid: number; off: number }> = [];
  for (let i = 0; i < n; i++) {
    const p = cmap.offset + 4 + i * 8;
    subs.push({ pid: u16(v, p), eid: u16(v, p + 2), off: cmap.offset + u32(v, p + 4) });
  }
  // 優先: Unicode 全面（format 12）→ BMP（format 4）
  subs.sort((a, b) => Number(b.eid === 10 || (b.pid === 0 && b.eid >= 4)) - Number(a.eid === 10 || (a.pid === 0 && a.eid >= 4)));
  for (const s of subs) {
    const isUnicode = s.pid === 0 || (s.pid === 3 && (s.eid === 1 || s.eid === 10));
    if (!isUnicode) continue;
    const format = u16(v, s.off);
    if (format === 12) {
      const groups = u32(v, s.off + 12);
      for (let g = 0; g < groups; g++) {
        const q = s.off + 16 + g * 12;
        const start = u32(v, q), end = u32(v, q + 4), gid0 = u32(v, q + 8);
        for (let c = start; c <= end; c++) if (!map.has(c)) map.set(c, gid0 + (c - start));
      }
    } else if (format === 4) {
      const segX2 = u16(v, s.off + 6);
      const seg = segX2 / 2;
      const endO = s.off + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
      for (let i = 0; i < seg; i++) {
        const end = u16(v, endO + i * 2), start = u16(v, startO + i * 2);
        const delta = v.getInt16(deltaO + i * 2), ro = u16(v, rangeO + i * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          if (map.has(c)) continue;
          let g: number;
          if (ro === 0) g = (c + delta) & 0xffff;
          else {
            const gp = rangeO + i * 2 + ro + (c - start) * 2;
            const raw = u16(v, gp);
            g = raw === 0 ? 0 : (raw + delta) & 0xffff;
          }
          if (g !== 0) map.set(c, g);
        }
      }
    }
  }
  return map;
}

function checksum(b: Uint8Array): number {
  let sum = 0;
  const len = b.length;
  for (let i = 0; i < len; i += 4) {
    sum = (sum + (((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0))) >>> 0;
  }
  return sum >>> 0;
}

export function parseTtf(bytes: Uint8Array): TtfFont {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag0 = u32(v, 0);
  if (tag0 !== 0x00010000 && tag0 !== 0x74727565) throw new Error('TrueType（glyf 形式）のフォントではありません');
  const tables = readTables(v);
  const need = (t: string): TableRec => { const r = tables.get(t); if (!r) throw new Error(`フォントに ${t} 表がありません`); return r; };
  const head = need('head'), maxp = need('maxp'), hhea = need('hhea'), hmtx = need('hmtx'), loca = need('loca'), glyf = need('glyf');
  const unitsPerEm = u16(v, head.offset + 18);
  const bbox: [number, number, number, number] = [v.getInt16(head.offset + 36), v.getInt16(head.offset + 38), v.getInt16(head.offset + 40), v.getInt16(head.offset + 42)];
  const longLoca = v.getInt16(head.offset + 50) === 1;
  const numGlyphs = u16(v, maxp.offset + 4);
  const numHM = u16(v, hhea.offset + 34);
  const cmapRec = need('cmap');
  const cmap = parseCmap(v, cmapRec);

  const locaAt = (g: number): number => (longLoca ? u32(v, loca.offset + g * 4) : u16(v, loca.offset + g * 2) * 2);
  const glyphRange = (g: number): [number, number] => [glyf.offset + locaAt(g), glyf.offset + locaAt(g + 1)];

  const advanceOf = (gid: number): number => (gid < numHM ? u16(v, hmtx.offset + gid * 4) : u16(v, hmtx.offset + (numHM - 1) * 4));

  const closure = (gids: Iterable<number>): Set<number> => {
    const set = new Set<number>([0]);
    const queue = [...gids];
    while (queue.length) {
      const g = queue.pop()!;
      if (g < 0 || g >= numGlyphs) continue;
      set.add(g);
      const [s, e] = glyphRange(g);
      if (e - s < 10 || v.getInt16(s) >= 0) continue;
      let p = s + 10;
      for (;;) {
        const flags = u16(v, p), comp = u16(v, p + 2);
        if (!set.has(comp)) { set.add(comp); queue.push(comp); }
        p += 4 + (flags & 0x1 ? 4 : 2);
        if (flags & 0x8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8;
        if (!(flags & 0x20)) break;
      }
    }
    return set;
  };

  const copyTable = (t: string): Uint8Array | null => {
    const r = tables.get(t);
    return r ? bytes.slice(r.offset, r.offset + r.length) : null;
  };

  const subset = (gids: Iterable<number>): Uint8Array => {
    const keep = closure(gids);
    const pieces: Uint8Array[] = [];
    const locaOut = new DataView(new ArrayBuffer((numGlyphs + 1) * 4));
    let pos = 0;
    for (let g = 0; g < numGlyphs; g++) {
      locaOut.setUint32(g * 4, pos);
      if (!keep.has(g)) continue;
      const [s, e] = glyphRange(g);
      const len = e - s;
      if (len <= 0) continue;
      const padded = new Uint8Array((len + 3) & ~3);
      padded.set(bytes.subarray(s, e));
      pieces.push(padded);
      pos += padded.length;
    }
    locaOut.setUint32(numGlyphs * 4, pos);
    const glyfOut = new Uint8Array(pos);
    let at = 0;
    for (const p of pieces) { glyfOut.set(p, at); at += p.length; }

    const headOut = copyTable('head')!;
    new DataView(headOut.buffer).setUint32(8, 0); // checkSumAdjustment
    new DataView(headOut.buffer).setInt16(50, 1); // indexToLocFormat = long
    const out = new Map<string, Uint8Array>([
      ['head', headOut], ['hhea', copyTable('hhea')!], ['hmtx', copyTable('hmtx')!], ['loca', new Uint8Array(locaOut.buffer)],
      ['maxp', copyTable('maxp')!], ['glyf', glyfOut],
    ]);
    for (const t of ['cvt ', 'fpgm', 'prep']) { const c = copyTable(t); if (c) out.set(t, c); }
    const tags = [...out.keys()].sort();
    const headerLen = 12 + tags.length * 16;
    let total = headerLen;
    for (const t of tags) total += (out.get(t)!.length + 3) & ~3;
    const file = new Uint8Array(total);
    const fv = new DataView(file.buffer);
    fv.setUint32(0, 0x00010000);
    fv.setUint16(4, tags.length);
    let pow = 1, log = 0;
    while (pow * 2 <= tags.length) { pow *= 2; log += 1; }
    fv.setUint16(6, pow * 16);
    fv.setUint16(8, log);
    fv.setUint16(10, tags.length * 16 - pow * 16);
    let off = headerLen;
    let headOffset = 0;
    tags.forEach((t, i) => {
      const d = out.get(t)!;
      const p = 12 + i * 16;
      for (let k = 0; k < 4; k++) file[p + k] = t.charCodeAt(k);
      fv.setUint32(p + 4, checksum(d));
      fv.setUint32(p + 8, off);
      fv.setUint32(p + 12, d.length);
      file.set(d, off);
      if (t === 'head') headOffset = off;
      off += (d.length + 3) & ~3;
    });
    fv.setUint32(headOffset + 8, (0xb1b0afba - checksum(file)) >>> 0);
    return file;
  };

  return {
    unitsPerEm, numGlyphs, bbox,
    ascent: v.getInt16(hhea.offset + 4), descent: v.getInt16(hhea.offset + 6),
    glyphOf: (cp) => cmap.get(cp),
    advanceOf,
    subset,
  };
}

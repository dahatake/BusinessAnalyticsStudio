// ボードの Canvas 描画。NFR-PERF-004（1 フレーム 16ms 以内を目標）のため、画面外のストロークは描かず、
// 小さく見えるストロークは 1 本の直線に簡略化して、色ごとにまとめて描く。
import type { Board, BoardItem, Bounds, Stroke, ViewState } from './model';
import { tr } from '../i18n';
import { strokeOutline } from './outline';
import { FRAME_TITLE, connectorLine } from '../whiteboard/ops';

export const STICKY_COLOR = '#fff3a3';
export const STICKY_TEXT = '#1f1f1f';
export const TEXT_FONT_SIZE = 16;
const LINE_HEIGHT = 1.4;
const PAD = 8;
const GRID_STEP = 32;

export interface DrawOptions {
  view: ViewState;
  width: number;
  height: number;
  dpr: number;
  /** テーマの前景色（'auto' の線・文字・方眼の色） */
  fg: string;
  /** 編集中の項目（文字の編集欄が重なるので本体は描かない） */
  hideIds?: ReadonlySet<string>;
  /** 移動中の要素と、その移動量（ワールド座標） */
  offset?: { ids: ReadonlySet<string>; dx: number; dy: number } | null;
  /** 背景（方眼など）を描くか。注釈の重ね合わせでは描かない */
  background?: boolean;
}

const pathCache = new WeakMap<Stroke, Path2D>();
function strokePath(s: Stroke): Path2D {
  let p = pathCache.get(s);
  if (!p) {
    p = new Path2D();
    if (s.tool === 'highlighter') {
      const pts = s.points;
      if (pts.length > 0) {
        p.moveTo(pts[0]!.x, pts[0]!.y);
        if (pts.length === 1) p.lineTo(pts[0]!.x + 0.01, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) p.lineTo(pts[i]!.x, pts[i]!.y);
      }
    } else {
      const o = strokeOutline(s.points, s.size);
      o.forEach((q, i) => (i === 0 ? p!.moveTo(q.x, q.y) : p!.lineTo(q.x, q.y)));
      p.closePath();
    }
    pathCache.set(s, p);
  }
  return p;
}

const imageCache = new Map<string, HTMLImageElement>();
let onImageLoaded: (() => void) | null = null;
export function setImageLoadListener(fn: (() => void) | null): void { onImageLoaded = fn; }
function imageFor(src: string): HTMLImageElement | null {
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.onload = () => onImageLoaded?.();
    img.src = src;
    imageCache.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measure(): CanvasRenderingContext2D | null {
  if (!measureCtx && typeof document !== 'undefined') measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

export const fontFor = (size = TEXT_FONT_SIZE): string => `${size}px "Segoe UI", "Yu Gothic UI", "Hiragino Sans", Meiryo, sans-serif`;

/** 幅 maxWidth に収まるように折り返した行（日本語の文字単位の折り返しにも対応）。 */
export function wrapLines(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      if (line && ctx.measureText(line + ch).width > maxWidth) { lines.push(line); line = ch; } else line += ch;
    }
    lines.push(line);
  }
  return lines;
}

/** 文字を折り返したときに必要な高さ（ワールド座標）。 */
export function textHeight(text: string, width: number, fontSize = TEXT_FONT_SIZE): number {
  const ctx = measure();
  const lh = fontSize * LINE_HEIGHT;
  if (!ctx) return Math.max(1, text.split('\n').length) * lh + PAD * 2;
  ctx.font = fontFor(fontSize);
  return wrapLines(ctx, text, Math.max(10, width - PAD * 2)).length * lh + PAD * 2;
}

function drawBackground(ctx: CanvasRenderingContext2D, board: Pick<Board, 'background'>, o: DrawOptions): void {
  if (board.background === 'plain') return;
  const { view, width, height, fg } = o;
  let step = GRID_STEP;
  while (step * view.zoom < 12) step *= 2;
  ctx.save();
  ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = fg;
  ctx.fillStyle = fg;
  ctx.lineWidth = 1;
  const x0 = Math.floor(view.x / step) * step, y0 = Math.floor(view.y / step) * step;
  const x1 = view.x + width / view.zoom, y1 = view.y + height / view.zoom;
  if (board.background === 'dots') {
    for (let wx = x0; wx <= x1; wx += step) for (let wy = y0; wy <= y1; wy += step) {
      ctx.fillRect((wx - view.x) * view.zoom - 1, (wy - view.y) * view.zoom - 1, 2, 2);
    }
  } else {
    ctx.beginPath();
    if (board.background === 'grid') {
      for (let wx = x0; wx <= x1; wx += step) { const sx = Math.round((wx - view.x) * view.zoom) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, height); }
    }
    for (let wy = y0; wy <= y1; wy += step) { const sy = Math.round((wy - view.y) * view.zoom) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(width, sy); }
    ctx.stroke();
  }
  ctx.restore();
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, size: number): void {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.max(12, size * 4);
  ctx.beginPath();
  ctx.moveTo(x2 - Math.cos(a - Math.PI / 7) * len, y2 - Math.sin(a - Math.PI / 7) * len);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(a + Math.PI / 7) * len, y2 - Math.sin(a + Math.PI / 7) * len);
  ctx.stroke();
}

function wrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, color: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.font = fontFor();
  ctx.textBaseline = 'top';
  const lh = TEXT_FONT_SIZE * LINE_HEIGHT;
  wrapLines(ctx, text, Math.max(10, w - PAD * 2)).forEach((l, i) => ctx.fillText(l, x + PAD, y + PAD + i * lh));
  ctx.restore();
}

export function drawItem(ctx: CanvasRenderingContext2D, item: BoardItem, fg: string): void {
  const color = !item.color || item.color === 'auto' ? fg : item.color;
  const size = item.size ?? 2;
  switch (item.type) {
    case 'shape': {
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const { x1 = 0, y1 = 0, x2 = 0, y2 = 0 } = item;
      if (item.shape === 'line' || item.shape === 'arrow') {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (item.shape === 'arrow') drawArrowHead(ctx, x1, y1, x2, y2, size);
      } else if (item.shape === 'ellipse') {
        ctx.beginPath(); ctx.ellipse(item.x + item.w / 2, item.y + item.h / 2, Math.max(0.5, item.w / 2), Math.max(0.5, item.h / 2), 0, 0, Math.PI * 2); ctx.stroke();
      } else if (item.shape === 'callout') {
        // 吹き出し: 角丸の矩形と、左下のしっぽ
        const r = Math.min(12, item.w / 4, item.h / 4);
        const bodyH = item.h * 0.8;
        const { x, y, w } = item;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + bodyH, r);
        ctx.arcTo(x + w, y + bodyH, x, y + bodyH, r);
        ctx.lineTo(x + w * 0.3, y + bodyH);
        ctx.lineTo(x + w * 0.15, y + item.h);
        ctx.lineTo(x + w * 0.15, y + bodyH);
        ctx.arcTo(x, y + bodyH, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.stroke();
        if (item.text) wrappedText(ctx, item.text, x, y, w, bodyH, color);
      } else {
        ctx.strokeRect(item.x, item.y, item.w, item.h);
      }
      break;
    }
    case 'frame': {
      // フレーム: 角丸の枠と薄い塗り、左上に見出し（AI が作ったものは「AI 生成」を添える）
      const r = 10;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(item.x, item.y, item.w, item.h, r);
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(item.author === 'ai' ? [8, 4] : []);
      ctx.stroke();
      ctx.restore();
      const head = [tr(item.label ?? ''), item.author === 'ai' ? tr('AI 生成') : ''].filter(Boolean).join('  ・');
      if (head) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(item.x, item.y, item.w, FRAME_TITLE);
        ctx.clip();
        ctx.fillStyle = color;
        ctx.font = `600 14px ${fontFor().replace(/^\d+px /, '')}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(head, item.x + 12, item.y + FRAME_TITLE / 2);
        ctx.restore();
      }
      break;
    }
    case 'card': {
      // データのカード: 元データの種類（課題など）と名前
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(item.x, item.y, item.w, item.h, 8);
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.clip();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.75;
      ctx.font = fontFor(12);
      ctx.textBaseline = 'top';
      if (item.sub) ctx.fillText(item.sub, item.x + 12, item.y + 8);
      ctx.restore();
      wrappedText(ctx, item.label ?? '', item.x + 4, item.y + 22, item.w - 8, item.h - 22, color);
      break;
    }
    case 'sticky':
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = item.color && item.color !== 'auto' ? item.color : STICKY_COLOR;
      ctx.fillRect(item.x, item.y, item.w, item.h);
      ctx.restore();
      if (item.text) wrappedText(ctx, item.text, item.x, item.y, item.w, item.h, STICKY_TEXT);
      if (item.votes) {
        // ドット投票の票数: 右上の丸に数字
        ctx.save();
        ctx.fillStyle = '#c50f1f';
        ctx.beginPath();
        ctx.arc(item.x + item.w - 6, item.y + 6, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `700 13px ${fontFor().replace(/^\d+px /, '')}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(item.votes), item.x + item.w - 6, item.y + 6);
        ctx.restore();
      }
      break;
    case 'text':
      if (item.text) wrappedText(ctx, item.text, item.x, item.y, item.w, item.h, color);
      break;
    case 'image': {
      const img = item.src ? imageFor(item.src) : null;
      if (img) ctx.drawImage(img, item.x, item.y, item.w, item.h);
      else { ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(item.x, item.y, item.w, item.h); }
      break;
    }
  }
}

function intersects(b: Bounds, vis: Bounds, pad: number): boolean {
  return b.x - pad <= vis.x + vis.w && b.x + b.w + pad >= vis.x && b.y - pad <= vis.y + vis.h && b.y + b.h + pad >= vis.y;
}

export function drawBoard(ctx: CanvasRenderingContext2D, board: Pick<Board, 'strokes' | 'items' | 'background'>, o: DrawOptions): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (o.background !== false) drawBackground(ctx, board, o);
  const { view, fg } = o;
  const z = view.zoom;
  const vis: Bounds = { x: view.x, y: view.y, w: o.width / z, h: o.height / z };
  const off = o.offset ?? null;
  const detail = (s: Stroke) => Math.max(s.bounds.w, s.bounds.h) * z >= 6;

  ctx.setTransform(o.dpr * z, 0, 0, o.dpr * z, -view.x * z * o.dpr, -view.y * z * o.dpr);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 小さく見えるストロークは直線に簡略化して、色ごとにまとめて描く
  const simple = new Map<string, Path2D>();
  for (const s of board.strokes) {
    if (detail(s) || !intersects(s.bounds, vis, 2)) continue;
    const moved = off?.ids.has(s.id);
    const color = s.color === 'auto' ? fg : s.color;
    const key = `${s.tool}|${color}`;
    let path = simple.get(key);
    if (!path) { path = new Path2D(); simple.set(key, path); }
    const f = s.points[0]!, l = s.points[s.points.length - 1]!;
    const dx = moved ? off!.dx : 0, dy = moved ? off!.dy : 0;
    path.moveTo(f.x + dx, f.y + dy);
    path.lineTo(l.x + dx + 0.01, l.y + dy);
  }
  for (const [key, path] of simple) {
    const [tool, color] = key.split('|') as [string, string];
    ctx.save();
    ctx.globalAlpha = tool === 'highlighter' ? 0.35 : 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1 / z, 1.2 / z);
    ctx.stroke(path);
    ctx.restore();
  }

  for (const s of board.strokes) {
    if (!detail(s) || !intersects(s.bounds, vis, s.size * (s.tool === 'highlighter' ? 4 : 2))) continue;
    const moved = off?.ids.has(s.id);
    const color = s.color === 'auto' ? fg : s.color;
    if (moved) { ctx.save(); ctx.translate(off!.dx, off!.dy); }
    if (s.tool === 'highlighter') {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = color;
      ctx.lineWidth = s.size * 4;
      ctx.lineCap = 'butt';
      ctx.stroke(strokePath(s));
      ctx.lineCap = 'round';
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = color;
      ctx.fill(strokePath(s));
    }
    if (moved) ctx.restore();
  }

  // フレーム → コネクター → そのほかの順に描く（フレームは付箋の下、コネクターは付箋の端でとまる）
  const hasConnector = board.items.some((i) => i.type === 'connector');
  const byId = hasConnector ? new Map(board.items.map((i) => [i.id, i])) : null;
  const order = (i: BoardItem): number => (i.type === 'frame' ? 0 : i.type === 'connector' ? 1 : 2);
  for (const pass of [0, 1, 2]) {
    for (const i of board.items) {
      if (order(i) !== pass || o.hideIds?.has(i.id) || !intersects(i, vis, (i.size ?? 2) * 4 + 16)) continue;
      const moved = off?.ids.has(i.id);
      if (i.type === 'connector') {
        // つないだ項目が動いている間は、線も一緒に動かす
        const l = (byId && connectorLine(i, byId, off)) || { x1: i.x1 ?? 0, y1: i.y1 ?? 0, x2: i.x2 ?? 0, y2: i.y2 ?? 0 };
        drawItem(ctx, { ...i, type: 'shape', shape: 'arrow', ...l }, fg);
        continue;
      }
      if (moved) { ctx.save(); ctx.translate(off!.dx, off!.dy); }
      drawItem(ctx, i, fg);
      if (moved) ctx.restore();
    }
  }
}

/** 描いている途中のストローク（保存前）。 */
export function drawLiveStroke(ctx: CanvasRenderingContext2D, s: Stroke, view: ViewState, dpr: number, fg: string): void {
  const z = view.zoom;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, -view.x * z * dpr, -view.y * z * dpr);
  const color = s.color === 'auto' ? fg : s.color;
  const pts = s.points;
  if (pts.length === 0) return;
  if (s.tool === 'highlighter') {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = color;
    ctx.lineWidth = s.size * 4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    if (pts.length === 1) ctx.lineTo(pts[0]!.x + 0.01, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    strokeOutline(pts, s.size).forEach((q, i) => (i === 0 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)));
    ctx.closePath();
    ctx.fill();
  }
}

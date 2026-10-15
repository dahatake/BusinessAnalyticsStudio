// 選んだ手書きの線を PNG（base64）にする（FR-182。手書き認識の送信内容は選んだ手書きの線だけ）。Canvas が使えなければ null。
import type { Stroke } from './model';

export function strokesToPngBase64(strokes: readonly Stroke[], pad = 16, maxSide = 1600): string | null {
  if (typeof document === 'undefined' || strokes.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const k of strokes) for (const p of k.points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  if (!Number.isFinite(minX)) return null;
  const w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * scale)); canvas.height = Math.max(1, Math.ceil(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#000'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const k of strokes) {
    ctx.lineWidth = Math.max(2, k.size * scale);
    ctx.beginPath();
    k.points.forEach((p, i) => { const x = (p.x - minX + pad) * scale, y = (p.y - minY + pad) * scale; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();
  }
  const url = canvas.toDataURL('image/png');
  return url.startsWith('data:image/png;base64,') ? url.slice('data:image/png;base64,'.length) : null;
}

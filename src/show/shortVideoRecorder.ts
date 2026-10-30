// ショート動画の描画と書き出し（FR-081）。縦横 9:16 のキャンバスにスライドを順に描き、MediaRecorder で WebM に録画する。
// 動画には「サンプル」の透かしを入れる。すべてブラウザーの中で完結し、外部へは送らない。
import {
  SHORT_VIDEO_FPS, SHORT_VIDEO_HEIGHT, SHORT_VIDEO_SECONDS, SHORT_VIDEO_WATERMARK, SHORT_VIDEO_WIDTH,
  slideIndexAt, wrapText, type ShortSlide,
} from './extras';
import { tr } from '../i18n';

export interface ShortVideoSource {
  customerName: string;
  projectName: string;
  slides: ShortSlide[];
}

/** 1 フレームを描く。elapsedSec は録画の開始からの経過（秒） */
export function drawShortFrame(ctx: CanvasRenderingContext2D, src: ShortVideoSource, elapsedSec: number, totalSec: number): void {
  const w = SHORT_VIDEO_WIDTH;
  const h = SHORT_VIDEO_HEIGHT;
  const font = (px: number, weight = 400) => `${weight} ${px}px "Segoe UI", "Yu Gothic UI", "Hiragino Sans", "Noto Sans JP", sans-serif`;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#0f2b46');
  g.addColorStop(1, '#1b4f8a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const idx = slideIndexAt(src.slides.length, elapsedSec, totalSec);
  const slide = idx >= 0 ? src.slides[idx]! : null;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#9cc7ff';
  ctx.font = font(26, 600);
  ctx.fillText(`${src.customerName} × Microsoft`, 40, 70);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(30, 600);
  wrapText(src.projectName, w - 80, (t) => ctx.measureText(t).width).slice(0, 2).forEach((l, i) => ctx.fillText(l, 40, 112 + i * 40));

  if (slide) {
    ctx.fillStyle = '#9cc7ff';
    ctx.font = font(28, 600);
    ctx.fillText(slide.chapter, 40, 300);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(52, 700);
    const titleLines = wrapText(slide.title, w - 80, (t) => ctx.measureText(t).width).slice(0, 4);
    titleLines.forEach((l, i) => ctx.fillText(l, 40, 350 + i * 68));
    if (slide.text) {
      ctx.fillStyle = '#dbe8f8';
      ctx.font = font(30);
      wrapText(slide.text, w - 80, (t) => ctx.measureText(t).width).slice(0, 9).forEach((l, i) => ctx.fillText(l, 40, 350 + titleLines.length * 68 + 30 + i * 46));
    }
  }

  // 進行のバー
  const ratio = Math.min(1, Math.max(0, elapsedSec / totalSec));
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(40, h - 80, w - 80, 8);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(40, h - 80, (w - 80) * ratio, 8);

  // 透かし「サンプル」（斜めに大きく、右上に小さく）
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.font = font(150, 800);
  ctx.fillText(tr(SHORT_VIDEO_WATERMARK), 0, 0);
  ctx.restore();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = font(24, 700);
  ctx.fillText(tr(SHORT_VIDEO_WATERMARK), w - 30, 24);
  ctx.textAlign = 'left';
}

/** 録画に使える WebM の形式（なければ null） */
export function pickWebmMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
}

export interface RecordOptions {
  seconds?: number;
  onProgress?: (ratio: number) => void;
  signal?: AbortSignal;
}

/** スライドを描きながら録画し、WebM の Blob を返す。中止（signal）されたら null */
export async function recordShortVideo(src: ShortVideoSource, opts: RecordOptions = {}): Promise<Blob | null> {
  const seconds = opts.seconds ?? SHORT_VIDEO_SECONDS;
  const mime = pickWebmMimeType();
  if (!mime) throw new Error(tr('このブラウザーは WebM の録画に対応していません。'));
  const canvas = document.createElement('canvas');
  canvas.width = SHORT_VIDEO_WIDTH;
  canvas.height = SHORT_VIDEO_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(tr('キャンバスを使えません。'));
  const stream = canvas.captureStream(SHORT_VIDEO_FPS);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  const t0 = performance.now();
  const draw = () => {
    const el = (performance.now() - t0) / 1000;
    drawShortFrame(ctx, src, Math.min(el, seconds), seconds);
    opts.onProgress?.(Math.min(1, el / seconds));
    return el;
  };
  draw();
  recorder.start(1000);
  await new Promise<void>((resolve) => {
    const timer = window.setInterval(() => {
      const el = draw();
      if (el >= seconds || opts.signal?.aborted) { window.clearInterval(timer); resolve(); }
    }, Math.round(1000 / SHORT_VIDEO_FPS));
  });
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  if (opts.signal?.aborted) return null;
  return new Blob(chunks, { type: 'video/webm' });
}

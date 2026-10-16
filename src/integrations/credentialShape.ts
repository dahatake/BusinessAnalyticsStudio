// 資格情報とみなす典型的な形式の検出（NFR-SEC-006 AC-430・NFR-SEC-008 AC-445・FR-202 AC-443）。
// scripts/integration_catalog.py の secret_kinds と同じ規則: Bearer の後の値（8 文字以上・一般語を除く）、
// api_key=・token=・password= の値、32 文字以上の連続した英数字（使う文字が 2 種類以下・16 進のハッシュ長は除く）、-----BEGIN。
// 固定のダミー表記（<ここに値>・x の並び・REDACTED・アスタリスクだけ）は検出しない。値そのものは返さず、形式の名前だけ返す。

/** PARAM-067: ダミー表記とみなす x の並びの最小の長さ */
export const DUMMY_X_MIN = 3;

const BEARER_RE = /Bearer\s+([A-Za-z0-9._~+/-]+=*)/g;
const KV_RE = /(?:api[_-]?key|token|password)\s*=\s*["'`]?([^\s,;、。)）\]"'`]+)/gi;
const LONG_RE = /(?<![A-Za-z0-9])[A-Za-z0-9]{32,}(?![A-Za-z0-9])/g;
const PEM_RE = /-----BEGIN[^-\n]*-----/;
const BEARER_WORDS = new Set(['authentication', 'authorization', 'scheme', 'header', 'tokens']);
const HASH_LENGTHS = new Set([40, 56, 64, 96, 128]);

function isDummy(value: string, xMin: number): boolean {
  const v = value.trim();
  return v === '<ここに値>' || v === 'REDACTED' || /^\*+$/.test(v) || new RegExp(`^[xX]{${xMin},}$`).test(v);
}

export function credentialShapes(text: string, xMin: number = DUMMY_X_MIN): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(BEARER_RE)) {
    const v = m[1] ?? '';
    if (!isDummy(v, xMin) && v.length >= 8 && !BEARER_WORDS.has(v.toLowerCase())) { found.push('Bearer の後の値'); break; }
  }
  for (const m of text.matchAll(KV_RE)) {
    if (!isDummy(m[1] ?? '', xMin)) { found.push('api_key=・token=・password= の値'); break; }
  }
  for (const m of text.matchAll(LONG_RE)) {
    const v = m[0];
    if (new Set(v.toLowerCase()).size <= 2) continue;
    if (/^[0-9a-fA-F]+$/.test(v) && HASH_LENGTHS.has(v.length)) continue;
    found.push('32 文字以上の連続した英数字');
    break;
  }
  if (PEM_RE.test(text)) found.push('鍵・証明書の本文（-----BEGIN）');
  return found;
}

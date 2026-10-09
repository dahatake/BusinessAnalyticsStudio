// M キーの判定（純粋）。入力欄の中・修飾キー付きでは受けない。音量のスライダーの上では受ける。

export interface MuteKeyEvent {
  key: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target: { tagName?: string; type?: string; isContentEditable?: boolean } | null;
}

const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'color']);

export function isMuteKey(e: MuteKeyEvent): boolean {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key !== 'm' && e.key !== 'M') return false;
  const t = e.target;
  if (!t) return true;
  if (t.isContentEditable) return false;
  const tag = (t.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return false;
  if (tag === 'INPUT') return NON_TEXT_INPUTS.has((t.type ?? '').toLowerCase());
  return true;
}

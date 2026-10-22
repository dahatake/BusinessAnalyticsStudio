// コマンドパレットとショートカット一覧の共通の登録簿（FR-111・FR-029）。
// 機能を持つ項目（エクスポート・音のミュートなど）は、自分の操作を registerCommands で足す。パレットと一覧はここから作る。
export interface Command {
  /** 一意の ID（登録の重複を避ける） */
  id: string;
  /** 一覧に出す操作名（例: 「既定のレイアウトに戻す」） */
  label: string;
  /** 検索で一致させる別名 */
  keywords?: string[];
  /** ショートカットの表示（例: `Ctrl+Shift+E`、`M`）。複数あるときは「 / 」で区切る */
  shortcut?: string;
  run: () => void;
}

type Provider = () => Command[];
const providers = new Set<Provider>();
const listeners = new Set<() => void>();
let version = 0;
const notify = () => { version += 1; listeners.forEach((l) => l()); };

/** 登録の変更の通し番号（useSyncExternalStore 用） */
export const commandsVersion = (): number => version;

/** コマンドを返す関数を登録する。呼ぶたびに最新の一覧を返してよい。戻り値で解除。 */
export function registerCommands(provider: Provider): () => void {
  providers.add(provider);
  notify();
  return () => { providers.delete(provider); notify(); };
}

export function onCommandsChanged(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** 登録されたコマンドの一覧（ID が重複したら、先に登録したものを使う）。 */
export function getCommands(): Command[] {
  const seen = new Set<string>();
  const out: Command[] = [];
  for (const p of providers) {
    for (const c of p()) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

/** 全角・半角、大文字・小文字の違いを吸収する */
const norm = (s: string) => s.normalize('NFKC').toLowerCase();

/** 名前（と別名）にすべての語が含まれるコマンド。空の検索語はすべて。一致の強い順（名前の先頭一致 → 名前に含む → 別名）に並べる。 */
export function filterCommands(commands: readonly Command[], query: string): Command[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...commands];
  const scored: Array<{ c: Command; score: number; i: number }> = [];
  commands.forEach((c, i) => {
    const name = norm(c.label);
    const hay = `${name} ${(c.keywords ?? []).map(norm).join(' ')}`;
    if (!words.every((w) => hay.includes(w))) return;
    const score = words.every((w) => name.startsWith(w)) ? 0 : words.every((w) => name.includes(w)) ? 1 : 2;
    scored.push({ c, score, i });
  });
  return scored.sort((a, b) => a.score - b.score || a.i - b.i).map((x) => x.c);
}

/** ショートカットの一覧（操作名とキー）。コマンドのうち、ショートカットを持つものと、操作のキー（コマンドにならないもの）を合わせる。 */
export const STATIC_SHORTCUTS: ReadonlyArray<{ label: string; shortcut: string }> = [
  { label: 'コマンドパレットを開く', shortcut: 'Ctrl+K' },
  { label: 'ショートカット一覧を開く', shortcut: '?' },
  { label: '前の論点へ（プレゼンテーション中）', shortcut: '←' },
  { label: '次の論点へ（プレゼンテーション中）', shortcut: '→' },
  { label: '項目を選ぶ（フォーカスした項目）', shortcut: 'Enter / Space' },
  { label: '複数の項目を選ぶ・解除する', shortcut: 'Ctrl / Shift + クリック（または Enter）' },
  { label: 'ダイアログを閉じる・最大化を戻す・選択を解除する', shortcut: 'Esc' },
  { label: 'コンポーネントを最大化／通常に戻す（フォーカス中）', shortcut: 'Shift+F' },
  { label: 'コンポーネントを非表示にする（フォーカス中）', shortcut: 'H' },
  { label: 'キャンバスを動かす・拡大縮小する', shortcut: '矢印キー / + / -' },
];

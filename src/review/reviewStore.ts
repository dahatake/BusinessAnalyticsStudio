// 「Copilot の案」の状態（FR-278・FR-279）。端末の画面の中だけで持ち、保存しない。コンポーネントのレイアウト変更（移動・タブ化・最小化）で失われないよう、
// コンポーネントの外（この store）に置く。案は「反映」（FR-280）を押すまで、画面コンポーネントの表示とアプリが管理するデータを変えない。
import { create } from 'zustand';
import { tr } from '../i18n';
import type { ReviewTarget } from './reviewFlow';

export type RunState = 'idle' | 'running' | 'done' | 'failed';

interface ReviewState {
  run: RunState;
  /** 支援技術へ状態を伝える文（実行の開始・完了・失敗。WCAG 2.2 の 4.1.3） */
  message: string;
  /** 送らなかった・失敗した理由など、利用者が次にすることを示す案内 */
  notice: string | null;
  /** コンポーネントの key → 案の文章（編集中の内容を含む） */
  proposals: Record<string, string>;
  /** 実行が完了して案が返らなかった・データがなかったコンポーネント */
  none: Record<string, true>;
  /** 送信前の確認（FR-278）。null は閉じている */
  confirm: { targets: ReviewTarget[] } | null;
  start: () => void;
  finish: (all: readonly string[], proposals: Record<string, string>, warning?: string) => void;
  fail: (text: string) => void;
  block: (text: string) => void;
  cancel: () => void;
  edit: (key: string, text: string) => void;
  discard: (key: string) => void;
  /** 反映済みの案のコンポーネント（案の状態: 編集中→反映済み。編集すると編集中に戻る。FR-280） */
  done: Record<string, true>;
  /** 案を反映し終えた。そのコンポーネントの状態だけを変える（FR-280） */
  reflected: (key: string) => void;
  setConfirm: (c: { targets: ReviewTarget[] } | null) => void;
}

export const useReviewStore = create<ReviewState>()((set) => ({
  run: 'idle', message: '', notice: null, proposals: {}, none: {}, done: {}, confirm: null,
  start: () => set({ run: 'running', message: tr('Copilot で分析を実行しています。'), notice: null }),
  finish: (all, proposals, warning) => {
    const none: Record<string, true> = {};
    for (const k of all) if (!(k in proposals)) none[k] = true;
    set({
      run: 'done', proposals, none, done: {}, notice: warning ?? null,
      message: tr('Copilot の分析が完了しました。案は {n} 件です。', { n: Object.keys(proposals).length }),
    });
  },
  fail: (text) => set({ run: 'failed', notice: text, message: tr('Copilot の分析に失敗しました。{text}', { text }) }),
  block: (text) => set({ run: 'idle', notice: text, message: text }),
  cancel: () => set({ run: 'idle', notice: null, message: tr('送信を取り消しました。') }),
  edit: (key, text) => set((s) => {
    const { [key]: _d, ...done } = s.done;
    return { proposals: { ...s.proposals, [key]: text }, done };
  }),
  discard: (key) => set((s) => {
    const { [key]: _p, ...proposals } = s.proposals;
    const { [key]: _n, ...none } = s.none;
    const { [key]: _d, ...done } = s.done;
    return { proposals, none, done, message: tr('案を破棄しました。') };
  }),
  reflected: (key) => set((s) => ({ done: { ...s.done, [key]: true }, message: tr('案を反映しました。') })),
  setConfirm: (confirm) => set({ confirm }),
}));

let resolver: ((ok: boolean) => void) | null = null;

/** 送信前の確認を出し、答えを待つ（送る情報の種類と対象の一覧を示す） */
export function askSend(targets: readonly ReviewTarget[]): Promise<boolean> {
  resolver?.(false);
  return new Promise<boolean>((resolve) => {
    resolver = resolve;
    useReviewStore.getState().setConfirm({ targets: [...targets] });
  });
}

export function answerSend(ok: boolean): void {
  const r = resolver;
  resolver = null;
  useReviewStore.getState().setConfirm(null);
  r?.(ok);
}

/** 反映（FR-280）の部品。反映に対応するコンポーネントが、コンポーネントの key で登録する。登録がなければ「反映」は押せない */
const reflectors = new Map<string, (text: string) => void | Promise<void>>();
export function registerReflector(key: string, fn: (text: string) => void | Promise<void>): () => void {
  reflectors.set(key, fn);
  return () => { if (reflectors.get(key) === fn) reflectors.delete(key); };
}
export function reflectorOf(key: string): ((text: string) => void | Promise<void>) | undefined {
  return reflectors.get(key);
}

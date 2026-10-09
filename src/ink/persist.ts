// ボードの自動保存と復旧（IndexedDB）。FR-095 の保存の部分を、ホワイトボード（FR-097）の「再読込後も残る」のために置く。
// 変更があれば PARAM-025（2 秒）以内に保存し、起動時に読み込む。読み込みが終わってから画面を出す（main.tsx）ので、
// 最初の描画から保存した内容が見える。IndexedDB が使えないとき（テストなど）は何もしない。
import type { Board } from './model';
import { useInk } from './store';

export const AUTOSAVE_MS = 2000;
const DB_NAME = 'edb-ink';
const STORE = 'state';
const KEY = 'boards';

export interface SavedInk { v: 1; activeBoardId: string; boards: Board[] }

/** 保存する形にする。プレゼン中の一時的な注釈（temporary）は、閉じれば消えるものなので保存しない。 */
export function toSaved(activeBoardId: string, boards: ReadonlyArray<Board>): SavedInk {
  return {
    v: 1,
    activeBoardId,
    boards: boards.map((b) => (b.strokes.some((s) => s.temporary) ? { ...b, strokes: b.strokes.filter((s) => !s.temporary) } : b)),
  };
}

/** 保存された値を検べて、使えるボードだけを返す（壊れた値は捨てる）。 */
export function fromSaved(raw: unknown): SavedInk | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Partial<SavedInk>;
  if (r.v !== 1 || !Array.isArray(r.boards)) return null;
  const boards = r.boards.filter((b): b is Board => typeof b === 'object' && b !== null && typeof b.id === 'string' && Array.isArray(b.strokes) && Array.isArray(b.items) && typeof b.view === 'object');
  if (boards.length === 0) return null;
  return {
    v: 1,
    activeBoardId: typeof r.activeBoardId === 'string' ? r.activeBoardId : boards[0]!.id,
    boards: boards.map((b) => ({ ...b, size: b.size ?? { w: 800, h: 480 } })),
  };
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readSaved(): Promise<unknown> {
  const db = await open();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function writeSaved(value: SavedInk): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** 保存したボードを読み込む。読めなければ何もしない（空のボードで始まる）。timeoutMs を過ぎたら待たずに進む。 */
export async function restoreInk(timeoutMs = 1500): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    const raw = await Promise.race([readSaved(), new Promise<undefined>((r) => setTimeout(() => r(undefined), timeoutMs))]);
    const saved = fromSaved(raw);
    if (!saved) return false;
    useInk.getState().restoreBoards(saved.boards, saved.activeBoardId);
    return true;
  } catch {
    return false;
  }
}

/** 変更があれば AUTOSAVE_MS 以内に保存する。止めるときは返り値の関数を呼ぶ。 */
export function startInkAutosave(ms = AUTOSAVE_MS): () => void {
  if (typeof indexedDB === 'undefined') return () => undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = useInk.getState().boards;
  let lastActive = useInk.getState().activeBoardId;
  const flush = () => {
    timer = null;
    const s = useInk.getState();
    last = s.boards;
    lastActive = s.activeBoardId;
    void writeSaved(toSaved(s.activeBoardId, s.boards)).catch(() => undefined);
  };
  const unsub = useInk.subscribe((s) => {
    if (s.boards === last && s.activeBoardId === lastActive) return;
    if (timer === null) timer = setTimeout(flush, ms);
  });
  const onHide = () => { if (timer !== null) { clearTimeout(timer); flush(); } };
  window.addEventListener('pagehide', onHide);
  return () => { unsub(); window.removeEventListener('pagehide', onHide); if (timer !== null) clearTimeout(timer); };
}

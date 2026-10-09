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

/** 保存の中身が変わったか。視点（パン/ズーム）と描画面の大きさだけの変化は含めない（大量のストロークを 2 秒ごとに書き直さないため。AC-117）。 */
export function contentChanged(prev: ReadonlyArray<Board>, next: ReadonlyArray<Board>): boolean {
  if (prev === next) return false;
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i]!, b = next[i]!;
    if (a === b) continue;
    if (a.id !== b.id || a.name !== b.name || a.background !== b.background || a.topicId !== b.topicId || a.strokes !== b.strokes || a.items !== b.items) return true;
  }
  return false;
}

/** 保存したボード（saved）を、いまのボード（current）に混ぜる。同じ ID の線・項目は、いまのものを優先する。保存済みの内容を消さないための合流。 */
export function mergeBoards(current: ReadonlyArray<Board>, saved: ReadonlyArray<Board>): Board[] {
  const byId = new Map(current.map((b) => [b.id, b] as const));
  const out: Board[] = current.map((b) => {
    const old = saved.find((x) => x.id === b.id);
    if (!old) return b;
    const haveS = new Set(b.strokes.map((k) => k.id));
    const haveI = new Set(b.items.map((k) => k.id));
    const strokes = [...old.strokes.filter((k) => !haveS.has(k.id)), ...b.strokes];
    const items = [...old.items.filter((k) => !haveI.has(k.id)), ...b.items];
    return strokes.length === b.strokes.length && items.length === b.items.length ? b : { ...b, strokes, items };
  });
  for (const b of saved) if (!byId.has(b.id)) out.push(b);
  return out;
}

export interface InkIo {
  read: () => Promise<unknown>;
  write: (value: SavedInk) => Promise<void>;
}

export interface InkPersister {
  /** 保存したボードを読み込む。timeoutMs を過ぎたら待たずに進む（読み込みは裏で続き、終わったら合流する）。 */
  restore: (timeoutMs?: number) => Promise<boolean>;
  /** 変更があれば ms 以内に保存する。読み込みが終わるまでは書かない（保存済みを空のボードで上書きしない）。返り値で止める。 */
  startAutosave: (ms?: number) => () => void;
  /** 読み込みが終わって、保存してよい状態か。 */
  canSave: () => boolean;
}

const READ_RETRIES = 3;

/** 保存・復旧の本体。入出力（io）を差し替えられるので、IndexedDB なしでも検証できる。 */
export function createInkPersister(io: InkIo, ink: typeof useInk = useInk, retryDelayMs = 500): InkPersister {
  let saveAllowed = false;

  /** 読んで、反映して、保存を許す。読み込みに失敗したままのときは（保存済みを壊さないよう）許さない。 */
  const load = async (): Promise<boolean> => {
    const initial = ink.getState().boards;
    let raw: unknown;
    let ok = false;
    for (let attempt = 0; attempt < READ_RETRIES && !ok; attempt++) {
      try { raw = await io.read(); ok = true; } catch { await new Promise((r) => setTimeout(r, retryDelayMs)); }
    }
    if (!ok) { saveAllowed = true; return false; } // 何度読んでも読めないなら、守れる内容がない。以後の保存を止めない
    const saved = fromSaved(raw);
    if (saved) {
      const cur = ink.getState();
      if (cur.boards === initial) ink.getState().restoreBoards(saved.boards, saved.activeBoardId);
      else ink.getState().restoreBoards(mergeBoards(cur.boards, saved.boards), cur.activeBoardId); // 待つ間に描いた線は残して合流
    }
    saveAllowed = true;
    return saved !== null;
  };

  return {
    canSave: () => saveAllowed,
    restore: async (timeoutMs = 1500) => {
      const reading = load().catch(() => { saveAllowed = true; return false; });
      return Promise.race([reading, new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs))]);
    },
    startAutosave: (ms = AUTOSAVE_MS) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let last = ink.getState().boards;
      let lastActive = ink.getState().activeBoardId;
      const flush = () => {
        timer = null;
        if (!saveAllowed) { timer = setTimeout(flush, ms); return; } // 読み込みが終わるまで待つ
        const s = ink.getState();
        const changed = contentChanged(last, s.boards) || s.activeBoardId !== lastActive;
        last = s.boards;
        lastActive = s.activeBoardId;
        if (changed) void io.write(toSaved(s.activeBoardId, s.boards)).catch(() => undefined);
      };
      const unsub = ink.subscribe((s) => {
        if (!contentChanged(last, s.boards) && s.activeBoardId === lastActive) return;
        if (timer === null) timer = setTimeout(flush, ms);
      });
      const onHide = () => { if (timer !== null && saveAllowed) { clearTimeout(timer); flush(); } };
      if (typeof window !== 'undefined') window.addEventListener('pagehide', onHide);
      return () => {
        unsub();
        if (typeof window !== 'undefined') window.removeEventListener('pagehide', onHide);
        if (timer !== null) clearTimeout(timer);
      };
    },
  };
}

const idbIo: InkIo = { read: readSaved, write: writeSaved };
const persister: InkPersister | null = typeof indexedDB === 'undefined' ? null : createInkPersister(idbIo);

/** 保存したボードを読み込む。読めなければ空のボードで始まる。timeoutMs を過ぎたら待たずに進むが、読み込みが終わるまで保存は始めない。 */
export async function restoreInk(timeoutMs = 1500): Promise<boolean> {
  return persister ? persister.restore(timeoutMs) : false;
}

/** 変更があれば AUTOSAVE_MS 以内に保存する。止めるときは返り値の関数を呼ぶ。 */
export function startInkAutosave(ms = AUTOSAVE_MS): () => void {
  return persister ? persister.startAutosave(ms) : () => undefined;
}

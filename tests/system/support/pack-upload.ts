// 顧客パックのアップロード（FR-302・FR-304）の System Test の共通部品。
// 期待値は受入基準だけから決める。画面の識別子は AC の文言（ラベル・ボタン名）から決めた仮のもの（下の「画面の探し方」）。
// 画面の探し方（実装役への契約。getting-started.spec.ts と同じ流儀で、role と名前で探す）:
//  - 入口: メイン画面の region「はじめての方へ」を開き（button「はじめての方へ」）、その中の button または link「顧客パックを取り込む」を押す（FR-268 AC-856）。
//  - 取り込み画面: region「顧客パックの取り込み」。
//      file input（label「顧客パックのファイル」。multiple）、button「ファイルを選ぶ」（キーボードの Enter で選択ダイアログが開く）、
//      ドロップ先 group「ファイルのドロップ先」（drop イベントを受ける）、
//      受け付けたファイルの table（名前「受け付けたファイル」。行にファイル名・種別・サイズ）、
//      判別できない・重複・不足の一覧 list（名前「ファイルの確認」）、拒否は role=alert（ファイル名・サイズ・上限「5 MB」）。
//      取り込み先: radio「新規 Project を作成」「既存の Project の顧客パックを置き換える」、
//      新規は textbox「企業名」「Project 名」（既定は customer.json の name・projectName）、置き換えは combobox「置き換える Project」。
//      button「取り込む」。置き換えは確認 dialog（置き換わる Project 名と「現在の顧客パックが失われる」旨）と button「置き換える」「やめる」。
//      取り込み前の確認（FR-304）: region「取り込み前に確かめること」と checkbox「確かめました」。
//      region の中の文: 「出典のない数値 N 件」（1 件以上は button「位置を見る」）、「internal N 件」「shareable N 件」、「ロゴ unknown N 件」と「ロゴを確かめて差し替える」、
//      種別「人」は「種別「人」 N 件」と外部 AI・エクスポート・顧客の了承の注意。
//  - 失敗（検証・保存）は取り込み画面内の role=alert（原因と次の行動）。
import type { Locator, Page } from '@playwright/test';
import fs from 'node:fs';
import { expect } from './fixtures';
import { PACK_FILES, type Pack } from './packs';

export interface UpFile { name: string; mimeType: string; buffer: Buffer }

export const LIMIT_BYTES = 5 * 1024 * 1024; // PARAM-142（5 MB）

export function jsonFile(name: string, value: unknown): UpFile {
  return { name, mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8') };
}

/** パックの 9 つの JSON と brand-profile.json（ファイルの中身そのまま） */
export function packFiles(pack: Pack): UpFile[] {
  const files = PACK_FILES.map((n) => ({ name: `${n}.json`, mimeType: 'application/json', buffer: fs.readFileSync(pack.file(n)) }));
  files.push({ name: 'brand-profile.json', mimeType: 'application/json', buffer: fs.readFileSync(`${pack.root}/public/brand/brand-profile.json`) });
  return files;
}

export function without(files: UpFile[], ...names: string[]): UpFile[] {
  return files.filter((f) => !names.includes(f.name));
}

export function replaced(files: UpFile[], next: UpFile): UpFile[] {
  return files.map((f) => (f.name === next.name ? next : f));
}

/** メイン画面の「はじめての方へ」から取り込み画面を開く */
export async function openUploadScreen(page: Page): Promise<Locator> {
  const main = page.getByTestId('main-screen');
  await expect(main).toBeVisible();
  const toggle = main.getByRole('button', { name: 'はじめての方へ' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const guide = main.getByRole('region', { name: 'はじめての方へ' });
  const entry = guide.getByRole('button', { name: /顧客パックを取り込む/ }).or(guide.getByRole('link', { name: /顧客パックを取り込む/ }));
  await entry.first().click();
  const upload = page.getByRole('region', { name: '顧客パックの取り込み' });
  await expect(upload, '取り込み画面が開かない').toBeVisible();
  return upload;
}

/** ファイル選択（file input）で渡す。選び直しは、渡したファイルで置き換わる */
export async function selectFiles(upload: Locator, files: UpFile[]): Promise<void> {
  await upload.getByLabel('顧客パックのファイル').setInputFiles(files);
}

/** ドラッグ＆ドロップで渡す（drop イベントに DataTransfer を載せる） */
export async function dropFiles(upload: Locator, files: UpFile[]): Promise<void> {
  const payload = files.map((f) => ({ name: f.name, type: f.mimeType, data: f.buffer.toString('base64') }));
  await upload.getByRole('group', { name: 'ファイルのドロップ先' }).evaluate((zone, items) => {
    const dt = new DataTransfer();
    for (const it of items) {
      const bin = atob(it.data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      dt.items.add(new File([bytes], it.name, { type: it.type }));
    }
    for (const type of ['dragenter', 'dragover', 'drop']) zone.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, payload);
}

export function fileRows(upload: Locator): Locator {
  return upload.getByRole('table', { name: '受け付けたファイル' }).getByRole('row');
}

/** 端末内保存（localStorage）の全項目。バイト単位の比較に使う（キー順に整列） */
export async function storageSnapshot(page: Page): Promise<string> {
  return page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
}

/** 端末内に保存された顧客パック（customer と entities を持つオブジェクト）を、保存の形に依らず全部集める */
export async function storedPacks(page: Page): Promise<any[]> {
  return page.evaluate(() => {
    const out: any[] = [];
    const looks = (o: any) => o && typeof o === 'object' && 'customer' in o && 'entities' in o;
    for (const k of Object.keys(localStorage)) {
      let v: any;
      try { v = JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { continue; }
      if (looks(v)) out.push(v);
      else if (v && typeof v === 'object') for (const c of Object.values(v)) if (looks(c)) out.push(c);
    }
    return out;
  });
}

/** 保存された顧客パックの 9 つの JSON が、元のファイルと一致するもの（なければ undefined） */
export function findStored(stored: any[], pack: Pack): any | undefined {
  return stored.find((s) => PACK_FILES.every((n) => JSON.stringify(sortKeys(s[n])) === JSON.stringify(sortKeys(pack.json(n)))));
}

export function sortKeys(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

/** `value` が数値で出典（sourceIds）のない項目の数（FR-117。validatePack の「出典のない数値」と同じ定義を、テスト側で独立に数える） */
export function countUnsourced(pack: Pack): number {
  let n = 0;
  const walk = (v: any) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (typeof v.value === 'number' && !(Array.isArray(v.sourceIds) && v.sourceIds.length > 0)) n++;
      Object.values(v).forEach(walk);
    }
  };
  for (const f of PACK_FILES) walk(pack.json(f));
  return n;
}

/** 文の中の「<語> … N 件」の N */
export function countOf(text: string, label: RegExp | string): number | undefined {
  const src = typeof label === 'string' ? label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : label.source;
  const m = new RegExp(`${src}[^0-9\\n]*?(\\d+)\\s*件`).exec(text);
  return m ? Number(m[1]) : undefined;
}

/** 新規 Project を作って取り込み、メイン画面に戻る前の状態にする（取り込み先は既定の「新規」） */
export async function importAsNew(upload: Locator, opts: { company?: string; project?: string } = {}): Promise<void> {
  await upload.getByRole('radio', { name: '新規 Project を作成' }).check();
  if (opts.company) await upload.getByRole('textbox', { name: '企業名' }).fill(opts.company);
  if (opts.project) await upload.getByRole('textbox', { name: 'Project 名' }).fill(opts.project);
  const confirm = upload.getByRole('checkbox', { name: '確かめました' });
  if (await confirm.count()) await confirm.check();
  await upload.getByRole('button', { name: '取り込む' }).click();
}

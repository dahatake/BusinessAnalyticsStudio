// 生成パイプラインの共通の型・パス・時刻（FR-120〜FR-130）。
import path from 'node:path';
import { REPO_ROOT } from '../lib/pack-fs';

/** コマンド（FR-120）: research=①②、build=③〜⑦、all=①〜⑦ */
export const COMMANDS = ['research', 'build', 'all'] as const;
export type Command = (typeof COMMANDS)[number];

/** 工程。①②は事前、③〜⑦は商談直前（SRC-001 §11.1） */
export const STAGES = [
  { id: 'research-customer', step: '①', name: '顧客調査' },
  { id: 'research-brand', step: '②', name: 'ブランド調査' },
  { id: 'clone', step: '③', name: '雛形の複製' },
  { id: 'generate', step: '④', name: '顧客パックの生成' },
  { id: 'validate', step: '⑤', name: 'スキーマ検証' },
  { id: 'verify', step: '⑥', name: 'verify' },
  { id: 'launch', step: '⑦', name: '起動' },
] as const;
export type StageId = (typeof STAGES)[number]['id'];

export const COMMAND_STAGES: Record<Command, readonly StageId[]> = {
  research: ['research-customer', 'research-brand'],
  build: ['clone', 'generate', 'validate', 'verify', 'launch'],
  all: STAGES.map((s) => s.id),
};

/** 演出強度（FR-083）。既定値は Showcase */
export const INTENSITIES = ['Executive', 'Showcase', 'Entertainment'] as const;
export type Intensity = (typeof INTENSITIES)[number];
export const DEFAULT_INTENSITY: Intensity = 'Showcase';

/** 入力変数（FR-130） */
export interface Inputs {
  customer: string;
  projectName: string;
  intensity: Intensity;
  /** BGM フォルダー（任意）。生成した顧客パックの `assets/audio/` に複製する */
  bgmDir?: string;
  /** 商談メモなどの追加資料（任意。絶対パス） */
  materials: string[];
}

/** 要求定義書の PARAM（承認済み） */
export const PARAMS = {
  /** PARAM-005 雛形の複製の上限（秒） */
  cloneLimitSec: 30,
} as const;

export interface PipelinePaths {
  repoRoot: string;
  /** 顧客ごとの作業フォルダーの親。調査キャッシュ `research-cache/<顧客名>/` もここに置く（コミットしない: C-02） */
  workspace: string;
  /** 雛形（`node_modules` と `dist` を含むビルド済みのアプリ） */
  template: string;
  /** お手本の顧客パック（examples/mono） */
  samplePack: string;
}

export function defaultPaths(over: Partial<PipelinePaths> = {}): PipelinePaths {
  return {
    repoRoot: REPO_ROOT,
    workspace: path.join(REPO_ROOT, 'work', 'envisioning'),
    template: REPO_ROOT,
    samplePack: path.join(REPO_ROOT, 'examples', 'mono'),
    ...over,
  };
}

/** 顧客名をフォルダー名にする（パスとして危険な文字を除く） */
export function safeName(customer: string): string {
  const s = customer.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').replace(/^\.+/, '_');
  return s || '_';
}

export const researchCacheDir = (p: PipelinePaths, customer: string): string =>
  path.join(p.workspace, 'research-cache', safeName(customer));
export const workDir = (p: PipelinePaths, customer: string): string =>
  path.join(p.workspace, safeName(customer));

/** タイムゾーン付きの ISO 8601（例: 2026-10-09T17:00:00.000+09:00） */
export function isoLocal(d: Date): string {
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** 入力の誤り（有効な値を示して止まる）。CLI は終了コード 2 */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputError';
  }
}

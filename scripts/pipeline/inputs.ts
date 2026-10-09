// 入力変数の指定（FR-130）: 引数でも対話形式でも指定できる。
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_INTENSITY, INTENSITIES, InputError, type Inputs, type Intensity } from './common';

/** 質問して 1 行の回答を返す関数。対話形式では readline、テストでは差し替える */
export type Ask = (question: string, defaultValue?: string) => Promise<string>;

export interface ParsedArgs {
  /** 位置引数（コマンド名など） */
  positional: string[];
  /** `--key value` と `--key=value`。繰り返したキーは配列 */
  options: Record<string, string[]>;
  /** 値を取らない `--flag` */
  flags: Set<string>;
}

/** 値を取る引数の名前。ここにないものは値を取らないフラグとして扱う */
const VALUE_OPTIONS = new Set([
  'customer', 'project', 'intensity', 'bgm', 'material', 'workspace', 'template', 'sample',
  'generator', 'researcher', 'smoke',
]);

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const out: ParsedArgs = { positional: [], options: {}, flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) { out.positional.push(a); continue; }
    const eq = a.indexOf('=');
    const key = (eq < 0 ? a.slice(2) : a.slice(2, eq));
    if (!VALUE_OPTIONS.has(key)) { out.flags.add(key); continue; }
    let value: string | undefined = eq < 0 ? undefined : a.slice(eq + 1);
    if (value === undefined) {
      value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new InputError(`--${key} には値が必要です`);
      i++;
    }
    (out.options[key] ??= []).push(value);
  }
  return out;
}

/** 演出強度の値を正規化する。大文字・小文字は区別しない。3 段階以外は、有効な値を示してエラー */
export function normalizeIntensity(raw: string): Intensity {
  const hit = INTENSITIES.find((v) => v.toLowerCase() === raw.trim().toLowerCase());
  if (!hit) {
    throw new InputError(`演出強度「${raw}」は指定できません。有効な値: ${INTENSITIES.join(' / ')}`);
  }
  return hit;
}

function checkExists(kind: 'file' | 'dir', p: string, label: string): string {
  const abs = path.resolve(p);
  const ok = fs.existsSync(abs) && (kind === 'dir' ? fs.statSync(abs).isDirectory() : fs.statSync(abs).isFile());
  if (!ok) throw new InputError(`${label}が見つかりません: ${p}`);
  return abs;
}

export interface ResolveOptions {
  /** true のとき、引数にない任意の入力変数も質問する（端末での対話形式） */
  interactive?: boolean;
  ask?: Ask;
}

/**
 * 引数から入力変数を作る。すべて引数で渡されていれば質問しない。
 * 顧客名がなければ尋ねる（質問の手段がなければエラー）。演出強度は引数・回答のどちらでも検査する。
 */
export async function resolveInputs(args: ParsedArgs, opts: ResolveOptions = {}): Promise<Inputs> {
  const ask = opts.ask;
  const first = (k: string): string | undefined => args.options[k]?.[0];

  let customer = first('customer')?.trim();
  if (!customer) {
    if (!ask) throw new InputError('顧客名を --customer で指定してください');
    customer = (await ask('顧客名を入力してください')).trim();
    if (!customer) throw new InputError('顧客名が入力されませんでした');
  }

  const ask2 = async (label: string, given: string | undefined, def: string | undefined): Promise<string | undefined> => {
    if (given !== undefined) return given;
    if (opts.interactive && ask) {
      const a = (await ask(label, def)).trim();
      return a || def;
    }
    return def;
  };

  const projectName = ((await ask2('Project 名', first('project'), `${customer} プロジェクト`)) ?? '').trim()
    || `${customer} プロジェクト`;
  const intensity = normalizeIntensity(
    (await ask2(`演出強度（${INTENSITIES.join(' / ')}）`, first('intensity'), DEFAULT_INTENSITY)) ?? DEFAULT_INTENSITY,
  );
  const bgmRaw = await ask2('BGM フォルダー（なければ空）', first('bgm'), undefined);
  const bgmDir = bgmRaw ? checkExists('dir', bgmRaw, 'BGM フォルダー') : undefined;

  let matRaw = args.options['material'];
  if (!matRaw) {
    const a = await ask2('追加資料（商談メモなど。複数はカンマ区切り。なければ空）', undefined, undefined);
    matRaw = a ? a.split(',').map((s) => s.trim()).filter(Boolean) : [];
  }
  const materials = matRaw.flatMap((m) => m.split(',')).map((s) => s.trim()).filter(Boolean)
    .map((m) => checkExists('file', m, '追加資料'));

  return { customer, projectName, intensity, ...(bgmDir ? { bgmDir } : {}), materials };
}

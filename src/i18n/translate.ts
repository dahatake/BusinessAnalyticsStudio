import { EN } from './dictionary';
import { useLang, type Lang } from './store';

export type Vars = Record<string, string | number>;

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
}

/** 指定した言語での翻訳（日本語原文がキー。辞書にない文言は日本語のまま）。 */
export function translate(lang: Lang, ja: string, vars?: Vars): string {
  const base = lang === 'en' && Object.prototype.hasOwnProperty.call(EN, ja) ? EN[ja]! : ja;
  return interpolate(base, vars);
}

/** React の外で使う翻訳（現在の言語で即時に返す）。 */
export function tr(ja: string, vars?: Vars): string {
  return translate(useLang.getState().lang, ja, vars);
}

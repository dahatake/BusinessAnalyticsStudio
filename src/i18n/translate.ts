import { EN } from './dictionary';
import { useLang, type Lang } from './store';

export type Vars = Record<string, string | number>;

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
}

/** 指定した言語での翻訳（日本語原文がキー。辞書にない文言は日本語のまま）。 */
export function translate(lang: Lang, ja: string, vars?: Vars, ctx?: string): string {
  let base = ja;
  if (lang === 'en') {
    const has = (k: string) => Object.prototype.hasOwnProperty.call(EN, k);
    // 文脈つきキー `${ctx}|${ja}` を先に引き、なければ ja、なければ日本語のまま。
    if (ctx && has(`${ctx}|${ja}`)) base = EN[`${ctx}|${ja}`]!;
    else if (has(ja)) base = EN[ja]!;
  }
  return interpolate(base, vars);
}

/** React の外で使う翻訳（現在の言語で即時に返す）。 */
export function tr(ja: string, vars?: Vars, ctx?: string): string {
  return translate(useLang.getState().lang, ja, vars, ctx);
}

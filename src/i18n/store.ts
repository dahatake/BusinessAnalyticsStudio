// 表示言語のストア（FR-293 AC-786）。既定は日本語。保存値が不正なら日本語。<html lang> と同期する。
import { create } from 'zustand';

export type Lang = 'ja' | 'en';
export const LANG_STORAGE_KEY = 'bas.lang';

export function parseLang(v: unknown): Lang {
  return v === 'en' ? 'en' : 'ja';
}

function readSaved(): Lang {
  try {
    return parseLang(globalThis.localStorage?.getItem(LANG_STORAGE_KEY));
  } catch {
    return 'ja';
  }
}

function apply(lang: Lang): void {
  try {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  } catch { /* 無視 */ }
}

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLang = create<LangState>((set) => ({
  lang: readSaved(),
  setLang: (lang) => {
    const next = parseLang(lang);
    try { globalThis.localStorage?.setItem(LANG_STORAGE_KEY, next); } catch { /* 保存できなくても切り替える */ }
    apply(next);
    set({ lang: next });
  },
}));

/** 保存値を読み直して反映する（起動時・テスト用）。 */
export function initLang(): Lang {
  const lang = readSaved();
  apply(lang);
  useLang.setState({ lang });
  return lang;
}

initLang();

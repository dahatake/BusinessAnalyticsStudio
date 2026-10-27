import { useCallback } from 'react';
import { useLang } from './store';
import { translate, type Vars } from './translate';

/** コンポーネントで使う翻訳。言語が変わると再描画される。 */
export function useT(): (ja: string, vars?: Vars) => string {
  const lang = useLang((s) => s.lang);
  return useCallback((ja: string, vars?: Vars) => translate(lang, ja, vars), [lang]);
}

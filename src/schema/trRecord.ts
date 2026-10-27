// 文言の表（キー→日本語の原文）を、読むたびに現在の言語へ翻訳する表にする（言語切替で更新される。FR-294）。
// 値は日本語の原文のまま辞書（src/i18n/en）のキーになる。
import { tr } from '../i18n';

export function trRecord<K extends string>(source: Readonly<Record<K, string>>): Readonly<Record<K, string>> {
  const out = {} as Record<K, string>;
  for (const k of Object.keys(source) as K[]) {
    Object.defineProperty(out, k, { enumerable: true, get: () => tr(source[k]) });
  }
  return out;
}

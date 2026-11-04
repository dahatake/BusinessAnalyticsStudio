// 英語辞書。src/i18n/en/*.ts を自動で統合する（後続の項目は index を編集せず、en/ にファイルを足すだけ）。
// Vite の外（tsx で動かす scripts/ の check:pack・gen:schema・pack:kit）では import.meta.glob がないので、空の辞書で続ける（日本語が原文）。
let modules: Record<string, { default: Record<string, string> }> = {};
try {
  modules = import.meta.glob('./en/*.ts', { eager: true }) as Record<string, { default: Record<string, string> }>;
} catch {
  modules = {};
}

export const EN: Record<string, string> = {};
for (const path of Object.keys(modules).sort()) {
  Object.assign(EN, modules[path]?.default ?? {});
}

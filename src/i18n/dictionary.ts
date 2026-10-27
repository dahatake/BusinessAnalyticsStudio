// 英語辞書。src/i18n/en/*.ts を自動で統合する（後続の項目は index を編集せず、en/ にファイルを足すだけ）。
const modules = import.meta.glob('./en/*.ts', { eager: true }) as Record<string, { default: Record<string, string> }>;

export const EN: Record<string, string> = {};
for (const path of Object.keys(modules).sort()) {
  Object.assign(EN, modules[path]?.default ?? {});
}

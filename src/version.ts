// 雛形のバージョンと、顧客パックの対応する雛形のバージョンとの互換の判定（FR-106）。
// 雛形のバージョンは package.json の version を正とする（ビルド時に取り込む）。
import pkg from '../package.json';

export const TEMPLATE_VERSION: string = pkg.version;

export interface VersionCheck {
  compatible: boolean;
  packVersion: string;
  templateVersion: string;
}

function parse(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * 顧客パックの対応する雛形のバージョン（packVersion）が、この雛形（templateVersion）で動くかを判定する。
 * 規則: メジャーが同じで、パックが要求するマイナーが雛形のマイナー以下。メジャーが 0 の間はマイナーも同じであること。
 * 読めないバージョン表記は互換でないとして扱う。
 */
export function checkTemplateVersion(packVersion: string, templateVersion: string = TEMPLATE_VERSION): VersionCheck {
  const p = parse(packVersion);
  const t = parse(templateVersion);
  let compatible = false;
  if (p && t && p[0] === t[0]) {
    compatible = t[0] === 0 ? p[1] === t[1] && p[2] <= t[2] : p[1] <= t[1];
  }
  return { compatible, packVersion, templateVersion };
}

export function versionWarning(c: VersionCheck): string {
  return `この顧客パックの対応する雛形のバージョンは ${c.packVersion} で、雛形のバージョン ${c.templateVersion} と互換ではありません。表示が崩れたり、項目が読めなかったりすることがあります。`;
}

// 外部連携カタログ（docs/integration-catalog.md）の連携名と状態を、ビルドで取り込む（FR-201）。
// 表そのものを正本とし、ここでは値を重複して持たない。連携名は一意なので、そのまま識別子にする。
import raw from '../../docs/integration-catalog.md?raw';
import { INTEGRATION_STATUSES, type CatalogIntegration, type IntegrationStatus } from '../store/projectIntegrations';

/** カタログの Markdown から「外部連携」の表の行（連携名・状態）を取り出す */
export function parseIntegrationCatalog(md: string): CatalogIntegration[] {
  const out: CatalogIntegration[] = [];
  let inSection = false;
  for (const line of md.split(/\r?\n/)) {
    if (/^##\s+外部連携\s*$/.test(line)) { inSection = true; continue; }
    if (inSection && /^##\s/.test(line)) break;
    if (!inSection || !line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const [name, , , , st] = cells;
    if (!name || cells[0] === '連携名' || /^-+$/.test(name)) continue;
    const status = st as IntegrationStatus;
    if (!INTEGRATION_STATUSES.includes(status)) continue;
    out.push({ id: name, name, status });
  }
  return out;
}

export const INTEGRATION_CATALOG: readonly CatalogIntegration[] = parseIntegrationCatalog(raw);

export function catalogStatusOf(id: string): IntegrationStatus | undefined {
  return INTEGRATION_CATALOG.find((c) => c.id === id)?.status;
}

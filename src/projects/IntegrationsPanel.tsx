// Project ごとの外部連携の選択と設定の画面（FR-201・FR-202・FR-203・NFR-SEC-008）。
// 選択は「連携の選択を保存」で確定する（保存しない選択は残らない）。選択・設定の保存は端末内だけで、外部送信はしない。
import { useState } from 'react';
import { Badge, Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { useConsent } from '../ai/useConsent';
import { INTEGRATION_CATALOG, catalogStatusOf } from '../integrations/catalog';
import { integrationNotice } from '../integrations/sendGate';
import {
  MAX_INTEGRATIONS_PER_PROJECT, useProjectIntegrations,
  type Confirmation, type IntegrationSetting,
} from '../store/projectIntegrations';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalS, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, minWidth: '200px', flex: '1 1 200px' },
  input: { minHeight: '32px', padding: `0 ${tokens.spacingHorizontalS}`, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium, background: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground1, font: 'inherit' },
  setting: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalS, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium },
  fields: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS },
});

const blank = (id: string, name: string): IntegrationSetting => ({
  integrationId: id, name, target: '', authMethod: '', secretStoreName: '',
  terms: { status: '未確認' }, cost: { status: '未確認' }, sla: { status: '未確認' },
});

function ConfirmField({ label, value, onChange }: { label: string; value: Confirmation; onChange: (c: Confirmation) => void }) {
  const s = useStyles();
  return (
    <div className={s.field}>
      <label>
        <Text>{label}の確認状況</Text>
        <select className={s.input} value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value as Confirmation['status'] })}>
          <option value="未確認">未確認</option>
          <option value="確認済み">確認済み</option>
        </select>
      </label>
      <label>
        <Text>{label}の確認日（YYYY-MM-DD）</Text>
        <input className={s.input} value={value.date ?? ''} onChange={(e) => onChange({ ...value, date: e.target.value })} />
      </label>
      {value.status === '未確認' ? <Badge appearance="outline" color="warning">未確認</Badge> : <Badge appearance="filled" color="success">確認済み</Badge>}
    </div>
  );
}

function SettingEditor({ projectId, id, name }: { projectId: string; id: string; name: string }) {
  const s = useStyles();
  const saved = useProjectIntegrations((st) => st.byProject[projectId]?.settings[id]);
  const saveSetting = useProjectIntegrations((st) => st.saveSetting);
  const [draft, setDraft] = useState<IntegrationSetting>(saved ?? blank(id, name));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<IntegrationSetting>) => { setDraft({ ...draft, ...patch }); setMsg(null); };
  const submit = () => {
    const r = saveSetting(projectId, { ...draft, integrationId: id, name });
    setMsg(r.ok ? { ok: true, text: '設定を保存しました。' } : { ok: false, text: r.reason });
  };
  return (
    <section role="group" aria-label={`${name} の設定`} className={s.setting}>
      <Text weight="semibold">{name} の設定</Text>
      <div className={s.fields}>
        <label className={s.field}><Text>連携先</Text><input className={s.input} value={draft.target} onChange={(e) => set({ target: e.target.value })} /></label>
        <label className={s.field}><Text>認証の方式</Text><input className={s.input} value={draft.authMethod} onChange={(e) => set({ authMethod: e.target.value })} /></label>
        <label className={s.field}><Text>保管場所の名前（資格情報の値は入力しない）</Text><input className={s.input} value={draft.secretStoreName} onChange={(e) => set({ secretStoreName: e.target.value })} /></label>
      </div>
      <div className={s.fields}>
        <ConfirmField label="利用規約・ライセンス" value={draft.terms} onChange={(terms) => set({ terms })} />
        <ConfirmField label="費用" value={draft.cost} onChange={(cost) => set({ cost })} />
        <ConfirmField label="SLA・量" value={draft.sla} onChange={(sla) => set({ sla })} />
      </div>
      <div className={s.row}>
        <Button size="small" appearance="primary" onClick={submit}>設定を保存</Button>
        {msg ? <Text role={msg.ok ? 'status' : 'alert'}>{msg.text}</Text> : null}
      </div>
    </section>
  );
}

export function IntegrationsPanel({ projectId }: { projectId: string }) {
  const s = useStyles();
  const cur = useProjectIntegrations((st) => st.byProject[projectId]);
  const { select, deselect } = useProjectIntegrations.getState();
  const { granted } = useConsent();
  const saved = cur?.selected ?? [];
  const [draft, setDraft] = useState<string[]>(saved);
  const [error, setError] = useState<string | null>(null);
  const notice = integrationNotice(granted, cur);

  const toggle = (id: string, on: boolean) => {
    setDraft((d) => (on ? [...d.filter((x) => x !== id), id] : d.filter((x) => x !== id)));
    setError(null);
  };
  const save = () => {
    const reasons: string[] = [];
    for (const id of saved) if (!draft.includes(id)) deselect(projectId, id);
    for (const id of draft) {
      if (saved.includes(id)) continue;
      const item = INTEGRATION_CATALOG.find((c) => c.id === id);
      if (!item) continue;
      const r = select(projectId, item);
      if (!r.ok) reasons.push(r.reason);
    }
    setDraft(useProjectIntegrations.getState().byProject[projectId]?.selected ?? []);
    setError(reasons.length ? reasons.join(' ') : null);
  };
  const dirty = draft.length !== saved.length || draft.some((id) => !saved.includes(id));

  return (
    <section role="region" aria-label="外部連携" className={s.root} data-testid="integrations-panel">
      <Text weight="semibold">外部連携（この Project で使う連携。選択しただけでは外部へ送信しません。上限 {MAX_INTEGRATIONS_PER_PROJECT} 件）</Text>
      {INTEGRATION_CATALOG.length === 0 ? <Text>外部連携カタログに連携がありません。</Text> : (
        <ul className={s.list}>
          {INTEGRATION_CATALOG.map((c) => {
            const retired = c.status === '廃止' && !saved.includes(c.id);
            const nowStatus = catalogStatusOf(c.id) ?? c.status;
            return (
              <li key={c.id} className={s.row}>
                <label className={s.row}>
                  <input type="checkbox" aria-label={c.name} checked={draft.includes(c.id)} disabled={retired} onChange={(e) => toggle(c.id, e.target.checked)} />
                  <Text>{c.name}</Text>
                </label>
                <Badge appearance="outline" color={nowStatus === '稼働' ? 'success' : nowStatus === '廃止' ? 'danger' : 'informative'}>状態: {nowStatus}</Badge>
                {retired ? <Text>廃止のため新たに選択できません。</Text> : null}
                {saved.includes(c.id) && (nowStatus === '廃止' || nowStatus === '廃止予定') ? <Text>選択済み（{nowStatus}。設定の見直しを検討してください）</Text> : null}
              </li>
            );
          })}
        </ul>
      )}
      <div className={s.row}>
        <Button size="small" appearance="primary" onClick={save}>連携の選択を保存</Button>
        {dirty ? <Text>未保存の変更があります。</Text> : null}
      </div>
      {error ? <Text role="alert">{error}</Text> : null}
      {notice.consentNotice ? <Text role="status" data-testid="integration-consent-notice">{notice.consentNotice}</Text> : null}
      {notice.unconfirmed.length > 0 ? (
        <Text role="status" data-testid="integration-unconfirmed">未確認の項目がある連携: {notice.unconfirmed.join('、')}</Text>
      ) : null}
      {saved.map((id) => <SettingEditor key={`${projectId}:${id}`} projectId={projectId} id={id} name={cur?.names[id] ?? id} />)}
    </section>
  );
}

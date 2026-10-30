// 企業の登録と Project の一覧・作成・名称変更・アーカイブ・切替（FR-137）。
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { AnalysisPanel } from './AnalysisPanel';
import { IntegrationsPanel } from './IntegrationsPanel';
import { NameDialog, UnsavedDialog } from './dialogs';
import { useProjects, type Company, type Project } from '../store/projects';
import { useAnalyses } from '../store/analyses';
import { useMainScreen } from '../store/mainScreen';
import { useSettings } from '../store/settings';
import { useWorkTargetUi } from './workTargetUi';
import { WorkTargetPicker } from './WorkTargetPicker';
import { WorkTargetMenu } from './WorkTargetMenu';
import { workTargetLabel, type TargetChoice } from './workTarget';
import { useT } from '../i18n';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalM}`, borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  head: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap', minHeight: '28px' },
  company: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, padding: tokens.spacingHorizontalS, border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
});

type Modal = { kind: 'company' } | { kind: 'project'; company: Company } | { kind: 'rename'; project: Project };

function CompanyRegion({ company, onModal, onOpen }: { company: Company; onModal: (m: Modal) => void; onOpen: (id: string) => void }) {
  const s = useStyles();
  const t = useT();
  const projects = useProjects((st) => st.projects).filter((p) => p.companyId === company.id);
  const { openId, setArchived, setAiAllowed } = useProjects();
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  return (
    <section role="region" aria-label={t('企業 {name}', { name: company.name })} className={s.company}>
      <div className={s.row}>
        <Text weight="semibold">{company.name}</Text>
        <Button size="small" onClick={() => onModal({ kind: 'project', company })}>{t('Project を作成')}</Button>
        <label>
          <input type="checkbox" checked={company.aiAllowed === true} onChange={(e) => setAiAllowed(company.id, e.target.checked)} /> {t('外部 AI への送信を許可する')}
        </label>
      </div>
      <ul className={s.list} aria-label={t('進行中の Project')}>
        {active.map((p) => (
          <li key={p.id} className={s.row} data-testid={`project-${p.id}`}>
            {/* リンクは一覧（本文の先頭）にある。フォーカス・スクロールの要求で本文を送らない（scroll-margin で「先頭へ」の側に寄せ、位置が変わらないようにする） */}
            <a href={`#${p.id}`} style={{ scrollMarginTop: '100vh', scrollMarginBottom: '100vh' }} aria-current={openId === p.id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); onOpen(p.id); }}>{p.name}</a>
            <Button size="small" appearance="subtle" aria-label={t('{name} の名称を変更', { name: p.name })} onClick={() => onModal({ kind: 'rename', project: p })}>{t('名称変更')}</Button>
            <Button size="small" appearance="subtle" aria-label={t('{name} をアーカイブ', { name: p.name })} onClick={() => setArchived(p.id, true)}>{t('アーカイブ')}</Button>
          </li>
        ))}
      </ul>
      {archived.length > 0 ? (
        <ul className={s.list} aria-label={t('アーカイブ済みの Project')}>
          {archived.map((p) => (
            <li key={p.id} className={s.row}>
              <Text>{t('{name}（アーカイブ済み）', { name: p.name })}</Text>
              <Button size="small" appearance="subtle" aria-label={t('{name} を復元', { name: p.name })} onClick={() => setArchived(p.id, false)}>{t('復元')}</Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function ProjectsPanel({ onNavigate }: { onNavigate?: (screenKey: string) => void } = {}) {
  const s = useStyles();
  const t = useT();
  const st = useProjects();
  const [modal, setModal] = useState<Modal | null>(null);
  /** 未保存の入力があるときの切替の確認（FR-138 AC-210）。target は切替先（null は一覧へ） */
  const [pending, setPending] = useState<{ target: string | null; demo: boolean; register: boolean; toMain?: boolean } | null>(null);
  /** FR-144: デモを選んでいる間は、実際の企業・Project の一覧を出さない（デモと実際の内容を混ぜない。AC-231） */
  const demoOnly = useWorkTargetUi((u) => u.demoOnly);
  const setDemoOnly = useWorkTargetUi((u) => u.setDemoOnly);
  const showDemo = useSettings((x) => x.showDemoInPicker);
  /** FR-144: 作業先の選択画面（「作業先」ボタンで開く。起動直後はメイン画面（FR-186）で、そこから Project を開くときにも出る） */
  const [pickerOpen, setPickerOpen] = useState(false);
  const hasUnsaved = useAnalyses((a) => (st.openId ? Object.keys(a.drafts[st.openId] ?? {}).length > 0 : false));
  const demoRequest = useWorkTargetUi((u) => u.demoRequest);
  const handledDemoRequest = useRef(demoRequest);
  const apply = (target: string | null, demo: boolean, register: boolean) => {
    st.open(target);
    setDemoOnly(demo);
    if (register) setModal({ kind: 'company' });
  };
  const requestOpen = (target: string | null, demo = false, register = false) => {
    if (target === st.openId) { apply(target, demo, register); return; }
    if (hasUnsaved) setPending({ target, demo, register });
    else apply(target, demo, register);
  };
  const choose = (c: TargetChoice) => {
    setPickerOpen(false);
    if (c.kind === 'demo') requestOpen(null, true);
    else if (c.kind === 'register') requestOpen(null, false, true);
    else requestOpen(c.id);
  };
  /** FR-187: メイン画面へ戻る。未保存の入力があれば、作業先の移動と同じ確認を経由する（AC-400）。入力は Project に残る */
  const backToMain = () => {
    if (hasUnsaved) setPending({ target: st.openId, demo: demoOnly, register: false, toMain: true });
    else useMainScreen.getState().show();
  };
  const close = () => setModal(null);
  // 設定の「デモへ切り替える」（AC-241）。未保存の入力があれば、他の切替と同じ確認を経由する（AC-231）
  useEffect(() => {
    if (demoRequest === handledDemoRequest.current) return;
    handledDemoRequest.current = demoRequest;
    requestOpen(null, true);
  });
  const current = st.projects.find((p) => p.id === st.openId);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setSlot(document.getElementById('projects-head-slot')); }, []);
  const head = (
    <div className={s.head} data-testid="projects-head">
      <WorkTargetMenu projects={st.projects} companies={st.companies} openId={st.openId} demoOnly={demoOnly} onChoose={choose} onCreateProject={(company) => setModal({ kind: 'project', company })} />
      {/* FR-226 AC-525: 「[顧客名] - [プロジェクト名]」の見える表記は作業先メニューの最上段だけ。ここは文字を持たず、名前だけで現在の作業先を伝える */}
      <span data-testid="work-target" role="status" aria-label={t('現在の作業先: {label}', { label: workTargetLabel(st.openId, st.projects, st.companies) })} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
        <span style={{ display: 'none' }}>{workTargetLabel(st.openId, st.projects, st.companies)}</span>
      </span>

      {demoOnly ? <Text data-testid="demo-target-notice">{t('お手本パックのデモで作業中（実際の Project は混ざりません）')}</Text> : null}
      <Button size="small" onClick={() => setPickerOpen(true)}>{t('作業先')}</Button>
      <Button size="small" onClick={() => { setDemoOnly(false); setModal({ kind: 'company' }); }}>{t('企業を登録')}</Button>
      <Button size="small" onClick={backToMain}>{t('メイン画面へ戻る')}</Button>
      {current ? <Button size="small" onClick={() => requestOpen(null)}>{t('Project 一覧へ')}</Button> : null}
    </div>
  );
  const hasBody = (st.companies.length > 0 && !demoOnly) || !!current;
  return (
    <>
    {slot ? createPortal(head, slot) : null}
    <div className={s.root} data-testid="projects-panel" style={hasBody ? undefined : { display: 'contents' }}>
      {slot ? null : head}
      {demoOnly ? null : st.companies.map((c) => <CompanyRegion key={c.id} company={c} onModal={setModal} onOpen={(id) => requestOpen(id)} />)}
      {pickerOpen ? <WorkTargetPicker projects={st.projects} companies={st.companies} showDemo={showDemo} currentId={st.openId} onChoose={choose} onClose={() => setPickerOpen(false)} /> : null}
      {current ? <IntegrationsPanel key={current.id} projectId={current.id} /> : null}
      {current ? <AnalysisPanel projectId={current.id} onNavigate={onNavigate} /> : null}
      {pending ? (
        <UnsavedDialog
          message={pending.toMain ? t('確定していない入力は、この Project に残したままメイン画面へ戻ります。戻りますか？') : undefined}
          onCancel={() => setPending(null)}
          onConfirm={() => { if (pending.toMain) useMainScreen.getState().show(); else apply(pending.target, pending.demo, pending.register); setPending(null); }}
        />
      ) : null}
      {modal?.kind === 'company' ? (
        <NameDialog title={t('企業を登録')} label={t('企業名')} submit={t('登録')} placeholder="ミズホ精機株式会社" help={t('例: ミズホ精機株式会社。登録すると、その企業の下に Project を作成できます。')} onSubmit={st.addCompany} onClose={close} />
      ) : null}
      {modal?.kind === 'project' ? (
        <NameDialog title={t('Project を作成')} label={t('Project 名')} submit={t('作成')} placeholder={t('2026 年度 DX 構想')} help={t('例: 2026 年度 DX 構想。作成すると、その Project を開いて分析を開始できます。')} onSubmit={(n) => st.addProject(modal.company.id, n)} onClose={close} />
      ) : null}
      {modal?.kind === 'rename' ? (
        <NameDialog title={t('Project の名称を変更')} label={t('Project 名')} submit={t('変更')} initial={modal.project.name} onSubmit={(n) => st.renameProject(modal.project.id, n)} onClose={close} />
      ) : null}
    </div>
    </>
  );
}

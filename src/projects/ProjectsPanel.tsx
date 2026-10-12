// 企業の登録と Project の一覧・作成・名称変更・アーカイブ・切替（FR-137）。
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, MessageBar, MessageBarBody, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import { AnalysisPanel } from './AnalysisPanel';
import { useProjects, type Company, type Project, type Result } from '../store/projects';
import { useAnalyses } from '../store/analyses';
import { WorkTargetPicker } from './WorkTargetPicker';
import { shouldShowStartupPicker, workTargetLabel, type TargetChoice } from './workTarget';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalM}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  head: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap', minHeight: '28px' },
  company: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, padding: tokens.spacingHorizontalS, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
});

/** 1 項目の名前を入力する dialog（登録・作成・名称変更で共通） */
function NameDialog(props: { title: string; label: string; submit: string; initial?: string; onSubmit: (name: string) => Result; onClose: () => void }) {
  const [name, setName] = useState(props.initial ?? '');
  const [error, setError] = useState<string | null>(null);
  const go = () => {
    const r = props.onSubmit(name);
    if (r.ok) props.onClose();
    else setError(r.reason);
  };
  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => { if (!d.open) props.onClose(); }}>
      <DialogSurface aria-label={props.title}>
        <DialogBody>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogContent>
            <Field label={props.label}>
              <Input value={name} onChange={(_, d) => setName(d.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} autoFocus />
            </Field>
            {error ? <MessageBar intent="error" role="alert"><MessageBarBody>{error}</MessageBarBody></MessageBar> : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={props.onClose}>キャンセル</Button>
            <Button appearance="primary" onClick={go}>{props.submit}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

type Modal = { kind: 'company' } | { kind: 'project'; company: Company } | { kind: 'rename'; project: Project };

function CompanyRegion({ company, onModal, onOpen }: { company: Company; onModal: (m: Modal) => void; onOpen: (id: string) => void }) {
  const s = useStyles();
  const projects = useProjects((st) => st.projects).filter((p) => p.companyId === company.id);
  const { openId, setArchived, setAiAllowed } = useProjects();
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  return (
    <section role="region" aria-label={`企業 ${company.name}`} className={s.company}>
      <div className={s.row}>
        <Text weight="semibold">{company.name}</Text>
        <Button size="small" onClick={() => onModal({ kind: 'project', company })}>Project を作成</Button>
        <label>
          <input type="checkbox" checked={company.aiAllowed === true} onChange={(e) => setAiAllowed(company.id, e.target.checked)} /> 外部 AI への送信を許可する
        </label>
      </div>
      <ul className={s.list} aria-label="進行中の Project">
        {active.map((p) => (
          <li key={p.id} className={s.row} data-testid={`project-${p.id}`}>
            {/* リンクは一覧（本文の先頭）にある。フォーカス・スクロールの要求で本文を送らない（scroll-margin で「先頭へ」の側に寄せ、位置が変わらないようにする） */}
            <a href={`#${p.id}`} style={{ scrollMarginTop: '100vh', scrollMarginBottom: '100vh' }} aria-current={openId === p.id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); onOpen(p.id); }}>{p.name}</a>
            <Button size="small" appearance="subtle" aria-label={`${p.name} の名称を変更`} onClick={() => onModal({ kind: 'rename', project: p })}>名称変更</Button>
            <Button size="small" appearance="subtle" aria-label={`${p.name} をアーカイブ`} onClick={() => setArchived(p.id, true)}>アーカイブ</Button>
          </li>
        ))}
      </ul>
      {archived.length > 0 ? (
        <ul className={s.list} aria-label="アーカイブ済みの Project">
          {archived.map((p) => (
            <li key={p.id} className={s.row}>
              <Text>{p.name}（アーカイブ済み）</Text>
              <Button size="small" appearance="subtle" aria-label={`${p.name} を復元`} onClick={() => setArchived(p.id, false)}>復元</Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function ProjectsPanel({ onNavigate }: { onNavigate?: (screenKey: string) => void } = {}) {
  const s = useStyles();
  const st = useProjects();
  const [modal, setModal] = useState<Modal | null>(null);
  /** 未保存の入力があるときの切替の確認（FR-138 AC-210）。target は切替先（null は一覧へ） */
  const [pending, setPending] = useState<{ target: string | null; demo: boolean; register: boolean } | null>(null);
  /** FR-144: デモを選んでいる間は、実際の企業・Project の一覧を出さない（デモと実際の内容を混ぜない。AC-231） */
  const [demoOnly, setDemoOnly] = useState(false);
  /** FR-144: 作業先の選択画面。実 Project が 2 件以上ある端末では起動時に開く（AC-229）。0 件は開かずデモで始める（AC-230） */
  const [pickerOpen, setPickerOpen] = useState(() => shouldShowStartupPicker(useProjects.getState().projects));
  const hasUnsaved = useAnalyses((a) => (st.openId ? Object.keys(a.drafts[st.openId] ?? {}).length > 0 : false));
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
  const close = () => setModal(null);
  const current = st.projects.find((p) => p.id === st.openId);
  const currentCompany = current ? st.companies.find((c) => c.id === current.companyId) : undefined;
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setSlot(document.getElementById('projects-head-slot')); }, []);
  const head = (
    <div className={s.head} data-testid="projects-head">
      <Text weight="semibold">作業先:</Text>
      <Text weight="semibold" data-testid="work-target" aria-live="polite">{workTargetLabel(st.openId, st.projects, st.companies)}</Text>
      <Button size="small" onClick={() => setPickerOpen(true)}>作業先</Button>
      <Button size="small" onClick={() => setModal({ kind: 'company' })}>企業を登録</Button>
      {current ? <Button size="small" onClick={() => requestOpen(null)}>Project 一覧へ</Button> : null}
      {current && currentCompany ? <Text data-testid="current-project">開いている Project: {currentCompany.name} / {current.name}</Text> : null}
    </div>
  );
  const hasBody = (st.companies.length > 0 && !demoOnly) || !!current;
  return (
    <>
    {slot ? createPortal(head, slot) : null}
    <div className={s.root} data-testid="projects-panel" style={hasBody ? undefined : { display: 'contents' }}>
      {slot ? null : head}
      {demoOnly ? null : st.companies.map((c) => <CompanyRegion key={c.id} company={c} onModal={setModal} onOpen={(id) => requestOpen(id)} />)}
      {pickerOpen ? <WorkTargetPicker projects={st.projects} companies={st.companies} onChoose={choose} onClose={() => setPickerOpen(false)} /> : null}
      {current ? <AnalysisPanel projectId={current.id} onNavigate={onNavigate} /> : null}
      {pending ? (
        <Dialog open modalType="alert" onOpenChange={(_, d) => { if (!d.open) setPending(null); }}>
          <DialogSurface role="alertdialog" aria-label="未保存の入力があります">
            <DialogBody>
              <DialogTitle>未保存の入力があります</DialogTitle>
              <DialogContent>確定していない入力は、この Project に残したまま切り替えます。切り替えますか？</DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setPending(null)}>キャンセル</Button>
                <Button appearance="primary" onClick={() => { apply(pending.target, pending.demo, pending.register); setPending(null); }}>切り替える</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      ) : null}
      {modal?.kind === 'company' ? (
        <NameDialog title="企業を登録" label="企業名" submit="登録" onSubmit={st.addCompany} onClose={close} />
      ) : null}
      {modal?.kind === 'project' ? (
        <NameDialog title="Project を作成" label="Project 名" submit="作成" onSubmit={(n) => st.addProject(modal.company.id, n)} onClose={close} />
      ) : null}
      {modal?.kind === 'rename' ? (
        <NameDialog title="Project の名称を変更" label="Project 名" submit="変更" initial={modal.project.name} onSubmit={(n) => st.renameProject(modal.project.id, n)} onClose={close} />
      ) : null}
    </div>
    </>
  );
}

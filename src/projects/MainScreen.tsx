// メイン画面（FR-186）。users-guide/01-quick-start.md の §2・§5.1 の手順だけを行う画面。
// 手順: 企業を登録 → Project を作成 → Project を開く → 分析を開始（分析手法の選択は分析画面で行う）。
// 手順に含まれない機能（分析のコンポーネント・ツールバーなど）は並べない。アプリの起動直後に表示する（FR-144 AC-398）。
import { useState } from 'react';
import { Button, MessageBar, MessageBarBody, Text, Title2, makeStyles, tokens } from '@fluentui/react-components';
import { NameDialog, UnsavedDialog } from './dialogs';
import { WorkTargetPicker } from './WorkTargetPicker';
import { useWorkTargetUi } from './workTargetUi';
import type { TargetChoice } from './workTarget';
import { useProjects, type Company } from '../store/projects';
import { useAnalyses } from '../store/analyses';
import { useMainScreen } from '../store/mainScreen';
import { useSettings } from '../store/settings';

const useStyles = makeStyles({
  root: {
    boxSizing: 'border-box', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalL,
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalXXL}`, maxWidth: '960px', marginLeft: 'auto', marginRight: 'auto',
    backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground1,
  },
  guide: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  step: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM, flexWrap: 'wrap',
    padding: tokens.spacingHorizontalM, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  current: { border: `2px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  no: { minWidth: '2ch', fontWeight: tokens.fontWeightSemibold },
  desc: { flex: 1, minWidth: '16ch', color: tokens.colorNeutralForeground2 },
  company: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, padding: tokens.spacingHorizontalM, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  plain: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
});

type Modal = { kind: 'company' } | { kind: 'project'; company: Company };

const STEPS = [
  { name: '企業を登録', desc: '取り組む企業の名前を登録します。' },
  { name: 'Project を作成', desc: '企業の下に、分析の Project を作ります。' },
  { name: 'Project を開く', desc: '作業先（デモ、または企業と Project）を選んで開きます。' },
  { name: '分析を開始', desc: '開いた Project で、分析手法を選んで分析を始めます。' },
] as const;

export function MainScreen() {
  const s = useStyles();
  const st = useProjects();
  const showDemo = useSettings((x) => x.showDemoInPicker);
  const setDemoOnly = useWorkTargetUi((u) => u.setDemoOnly);
  const [modal, setModal] = useState<Modal | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<{ target: string | null; demo: boolean } | null>(null);
  const hasUnsaved = useAnalyses((a) => (st.openId ? Object.keys(a.drafts[st.openId] ?? {}).length > 0 : false));

  const active = st.projects.filter((p) => !p.archived);

  // いま行う手順（支援技術にも aria-current で伝える）
  const current = st.companies.length === 0 ? 0 : active.length === 0 ? 1 : 2;

  const go = (target: string | null, demo: boolean) => {
    st.open(target);
    setDemoOnly(demo);
    useMainScreen.getState().hide();
  };
  const requestGo = (target: string | null, demo: boolean) => {
    if (target !== st.openId && hasUnsaved) setPending({ target, demo });
    else go(target, demo);
  };
  const choose = (c: TargetChoice) => {
    setPickerOpen(false);
    if (c.kind === 'demo') requestGo(null, true);
    else if (c.kind === 'register') setModal({ kind: 'company' });
    else requestGo(c.id, false);
  };
  const createProject = () => {
    const company = st.companies[st.companies.length - 1];
    if (!company) setNotice('先に企業を登録してください（手順 1）。企業の登録は「企業を登録」から行えます。');
    else { setNotice(null); setModal({ kind: 'project', company }); }
  };
  const start = () => {
    if (active.length === 0) setNotice('分析を始めるには、企業を登録して Project を作成してください（手順 1・2）。デモで試すときは「Project を開く」からデモを選べます。');
    else { setNotice(null); setPickerOpen(true); }
  };
  const actions = [
    () => { setNotice(null); setModal({ kind: 'company' }); },
    createProject,
    () => { setNotice(null); setPickerOpen(true); },
    start,
  ];

  return (
    <main className={s.root} data-testid="main-screen" aria-label="メイン画面">
      <Title2 as="h1">メイン画面</Title2>
      <Text>企業を登録し、Project を作成して開き、分析を始めます（QuickStart の手順）。</Text>
      <ol className={s.guide} data-testid="main-guide" aria-label="始め方の手順">
        {STEPS.map((step, i) => (
          <li key={step.name} className={`${s.step} ${i === current ? s.current : ''}`} aria-current={i === current ? 'step' : undefined}>
            <span className={s.no} aria-hidden>{i + 1}.</span>
            <Button appearance={i === current ? 'primary' : 'secondary'} onClick={actions[i]}>{step.name}</Button>
            <Text className={s.desc}>{step.desc}{i === current ? '（いまの手順）' : ''}</Text>
          </li>
        ))}
      </ol>
      {notice ? <MessageBar intent="warning" role="alert" layout="multiline"><MessageBarBody>{notice}</MessageBarBody></MessageBar> : null}
      {st.companies.map((c) => (
        <section key={c.id} role="region" aria-label={`企業 ${c.name}`} className={s.company}>
          <div className={s.row}>
            <Text weight="semibold">{c.name}</Text>
            <Button size="small" onClick={() => setModal({ kind: 'project', company: c })}>Project を作成</Button>
          </div>
          <ul className={s.plain} aria-label="進行中の Project">
            {active.filter((p) => p.companyId === c.id).map((p) => <li key={p.id}><Text>{p.name}</Text></li>)}
          </ul>
        </section>
      ))}
      {pickerOpen ? <WorkTargetPicker projects={st.projects} companies={st.companies} showDemo={showDemo} currentId={st.openId} onChoose={choose} onClose={() => setPickerOpen(false)} /> : null}
      {pending ? <UnsavedDialog onCancel={() => setPending(null)} onConfirm={() => { go(pending.target, pending.demo); setPending(null); }} /> : null}
      {modal?.kind === 'company' ? (
        <NameDialog title="企業を登録" label="企業名" submit="登録" onSubmit={st.addCompany} onClose={() => setModal(null)} />
      ) : null}
      {modal?.kind === 'project' ? (
        <NameDialog title="Project を作成" label="Project 名" submit="作成" hint={`企業「${modal.company.name}」に作成します。`} onSubmit={(n) => st.addProject(modal.company.id, n)} onClose={() => setModal(null)} />
      ) : null}
    </main>
  );
}

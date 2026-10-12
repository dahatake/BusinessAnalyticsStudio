// 企業の登録と Project の一覧・作成・名称変更・アーカイブ・切替（FR-137）。
import { useState } from 'react';
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, MessageBar, MessageBarBody, Text, makeStyles, tokens,
} from '@fluentui/react-components';
import { useProjects, type Company, type Project, type Result } from '../store/projects';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalM, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  head: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM, flexWrap: 'wrap' },
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

function CompanyRegion({ company, onModal }: { company: Company; onModal: (m: Modal) => void }) {
  const s = useStyles();
  const projects = useProjects((st) => st.projects).filter((p) => p.companyId === company.id);
  const { openId, open, setArchived } = useProjects();
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);
  return (
    <section role="region" aria-label={`企業 ${company.name}`} className={s.company}>
      <div className={s.row}>
        <Text weight="semibold">{company.name}</Text>
        <Button size="small" onClick={() => onModal({ kind: 'project', company })}>Project を作成</Button>
      </div>
      <ul className={s.list} aria-label="進行中の Project">
        {active.map((p) => (
          <li key={p.id} className={s.row} data-testid={`project-${p.id}`}>
            <a href={`#${p.id}`} aria-current={openId === p.id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); open(p.id); }}>{p.name}</a>
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

export function ProjectsPanel() {
  const s = useStyles();
  const st = useProjects();
  const [modal, setModal] = useState<Modal | null>(null);
  const close = () => setModal(null);
  const current = st.projects.find((p) => p.id === st.openId);
  const currentCompany = current ? st.companies.find((c) => c.id === current.companyId) : undefined;
  return (
    <div className={s.root} data-testid="projects-panel">
      <div className={s.head}>
        <Text weight="semibold">企業と Project</Text>
        <Button size="small" onClick={() => setModal({ kind: 'company' })}>企業を登録</Button>
        {current && currentCompany ? <Text data-testid="current-project">開いている Project: {currentCompany.name} / {current.name}</Text> : null}
      </div>
      {st.companies.map((c) => <CompanyRegion key={c.id} company={c} onModal={setModal} />)}
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
  );
}

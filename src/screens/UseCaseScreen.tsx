// 「ユースケース」コンポーネント（FR-158・FR-155）。ステッパーの「ユースケース作成」から開く。Project ごとにユースケースを登録・編集・削除し、
// ユースケースごとにプレゼン用アニメーションを作って、その場で再生する。端末内だけで動き、AI には接続しない。
import { useEffect, useState } from 'react';
import {
  Badge, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, MessageBar, MessageBarBody, Text, Textarea, makeStyles, tokens,
} from '@fluentui/react-components';
import { Add24Regular } from '@fluentui/react-icons';
import { create } from 'zustand';
import { Panel } from '../components/Panel';
import { EmptyView } from '../components/StateViews';
import { useProjects } from '../store/projects';
import { useUseCases, useUseCaseSet } from '../store/usecases';
import {
  MAX_STEPS, SCENE_SECONDS, addStep, animationState, emptyDraft, toDraft,
  type Animation, type AnimationState, type UseCase, type UseCaseDraft,
} from '../usecase/model';

const useStyles = makeStyles({
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
  item: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, padding: tokens.spacingHorizontalM,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXS },
  form: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM },
  stepForm: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalM,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
  },
  errors: { margin: 0, paddingLeft: tokens.spacingHorizontalXL },
  player: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalL,
    border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`, borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  scene: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, minHeight: '96px', whiteSpace: 'pre-wrap' },
  forced: { forcedColorAdjust: 'auto', ':disabled': { forcedColorAdjust: 'auto' }, ':disabled:hover': { forcedColorAdjust: 'auto' }, ':disabled:hover:active': { forcedColorAdjust: 'auto' } },
});

const STATE_LABEL: Record<AnimationState, string> = { none: '未作成', latest: '最新', stale: '古い' };

/** 登録・編集ダイアログの開閉と入力中の内容。レイアウトの変更でコンポーネントが作り直されても入力が消えないよう、外に持つ（保存しない）。 */
interface DialogState { editId: string | null; draft: UseCaseDraft; errors: string[] }
const useUseCaseDialog = create<{ dlg: DialogState | null; set: (d: DialogState | null) => void }>((set) => ({ dlg: null, set: (dlg) => set({ dlg }) }));

/** 再生中のユースケース（保存しない） */
const usePlaying = create<{ id: string | null; set: (id: string | null) => void }>((set) => ({ id: null, set: (id) => set({ id }) }));

function UseCaseDialog({ projectId }: { projectId: string }) {
  const s = useStyles();
  const dlg = useUseCaseDialog((x) => x.dlg);
  const setDlg = useUseCaseDialog((x) => x.set);
  const save = useUseCases((x) => x.save);
  if (!dlg) return null;
  const { draft, errors } = dlg;
  const patch = (d: Partial<UseCaseDraft>) => setDlg({ ...dlg, draft: { ...draft, ...d } });
  const setStep = (i: number, p: Partial<UseCaseDraft['steps'][number]>) =>
    patch({ steps: draft.steps.map((st, j) => (j === i ? { ...st, ...p } : st)) });
  const onAdd = () => {
    const r = addStep(draft.steps);
    if (r.ok) setDlg({ ...dlg, draft: { ...draft, steps: r.value }, errors: [] });
    else setDlg({ ...dlg, errors: r.errors }); // 既存の手順は変えない（AC-287）
  };
  const onSave = () => {
    const r = save(projectId, draft, dlg.editId ?? undefined);
    if (r.ok) setDlg(null);
    else setDlg({ ...dlg, errors: r.errors }); // 入力済みの値は残す（AC-286）
  };
  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => { if (!d.open) setDlg(null); }}>
      <DialogSurface aria-label="ユースケース">
        <DialogBody>
          <DialogTitle>ユースケース</DialogTitle>
          <DialogContent className={s.form}>
            <Field label="名称" required><Input value={draft.name} onChange={(_, d) => patch({ name: d.value })} /></Field>
            <Field label="概要"><Textarea value={draft.summary} onChange={(_, d) => patch({ summary: d.value })} /></Field>
            <Field label="対象ペルソナ"><Input value={draft.persona} onChange={(_, d) => patch({ persona: d.value })} /></Field>
            <Field label="期待する効果"><Textarea value={draft.effect} onChange={(_, d) => patch({ effect: d.value })} /></Field>
            {draft.steps.map((st, i) => (
              <div key={i} className={s.stepForm} role="group" aria-label={`手順 ${i + 1}`}>
                <Field label={`手順 ${i + 1} の見出し`} required><Input value={st.title} onChange={(_, d) => setStep(i, { title: d.value })} /></Field>
                <Field label={`手順 ${i + 1} の説明`}><Textarea value={st.description} onChange={(_, d) => setStep(i, { description: d.value })} /></Field>
                <div><Button size="small" onClick={() => patch({ steps: draft.steps.filter((_x, j) => j !== i) })}>{`手順 ${i + 1} を削除`}</Button></div>
              </div>
            ))}
            <div className={s.row}>
              <Button icon={<Add24Regular />} onClick={onAdd}>手順を追加</Button>
              <Text size={200}>{`${draft.steps.length} / ${MAX_STEPS} 件`}</Text>
            </div>
            {errors.length > 0 ? (
              <MessageBar intent="error" layout="multiline" role="alert">
                <MessageBarBody><ul className={s.errors}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></MessageBarBody>
              </MessageBar>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={onSave}>保存</Button>
            <Button onClick={() => setDlg(null)}>キャンセル</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** アニメーションの再生（導入→手順→効果）。1 シーン SCENE_SECONDS 秒で自動に進む。 */
function AnimationPlayer({ uc, anim, onClose }: { uc: UseCase; anim: Animation; onClose: () => void }) {
  const s = useStyles();
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<'playing' | 'paused' | 'ended'>('playing');
  const total = anim.scenes.length;
  const stale = animationState(uc, anim) === 'stale';

  useEffect(() => {
    if (state !== 'playing') return undefined;
    const t = window.setTimeout(() => {
      if (index < total - 1) setIndex(index + 1);
      else setState('ended');
    }, SCENE_SECONDS * 1000);
    return () => window.clearTimeout(t);
  }, [state, index, total]);

  const next = () => setIndex((i) => Math.min(total - 1, i + 1));
  const prev = () => setIndex((i) => Math.max(0, i - 1));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const scene = anim.scenes[index]!;
  return (
    <section className={s.player} data-testid="animation-player" aria-label={`アニメーション: ${uc.name}`} data-animation-state={state} data-motion="running">
      {stale ? (
        <div role="status"><MessageBar intent="warning"><MessageBarBody>このアニメーションは古い内容です。ユースケースを編集した後に再作成していません。「アニメーションを作成」で最新にできます。</MessageBarBody></MessageBar></div>
      ) : null}
      <Text data-testid="animation-position" aria-live="polite">{`${index + 1} / ${total}`}</Text>
      <div className={s.scene} data-testid="animation-scene" data-scene-kind={scene.kind}>
        <Text as="h3" size={600} weight="semibold">{scene.title}</Text>
        {scene.body ? <Text>{scene.body}</Text> : null}
      </div>
      <div className={s.row}>
        {state === 'playing'
          ? <Button className={s.forced} onClick={() => setState('paused')}>一時停止</Button>
          : <Button className={s.forced} appearance="primary" onClick={() => { if (state === 'ended') setIndex(0); setState('playing'); }}>再生</Button>}
        <Button className={s.forced} onClick={prev} disabled={index === 0}>前へ</Button>
        <Button className={s.forced} onClick={next} disabled={index >= total - 1}>次へ</Button>
        <Button className={s.forced} onClick={onClose}>終了</Button>
      </div>
    </section>
  );
}

function UseCaseScreen() {
  const s = useStyles();
  const projectId = useProjects((x) => x.openId);
  const set = useUseCaseSet(projectId);
  const remove = useUseCases((x) => x.remove);
  const createAnimation = useUseCases((x) => x.createAnimation);
  const setDlg = useUseCaseDialog((x) => x.set);
  const playingId = usePlaying((x) => x.id);
  const setPlaying = usePlaying((x) => x.set);
  const [message, setMessage] = useState<{ id: string; errors: string[] } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const playing = playingId ? set.items.find((u) => u.id === playingId) : undefined;
  const playingAnim = playing ? set.animations[playing.id] : undefined;

  return (
    <Panel testId="component-usecase" title="ユースケース" description="Project のユースケースを登録し、ユースケースごとにプレゼン用のアニメーションを作ります。">
      <div data-testid="usecase-editor" className={s.form}>
        {!projectId ? (
          <EmptyView message="Project を開くと、ユースケースを登録できます。" />
        ) : (
          <>
            <div className={s.row}>
              <Button appearance="primary" icon={<Add24Regular />} onClick={() => setDlg({ editId: null, draft: emptyDraft(), errors: [] })}>ユースケースを追加</Button>
            </div>
            {message ? (
              <MessageBar intent="error" layout="multiline" role="alert">
                <MessageBarBody><ul className={s.errors}>{message.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></MessageBarBody>
              </MessageBar>
            ) : null}
            {set.items.length === 0 ? <EmptyView message="ユースケースはまだありません。「ユースケースを追加」から登録してください。" /> : null}
            <ul className={s.list} data-testid="usecase-list" aria-label="ユースケース一覧">
              {set.items.map((uc) => {
                const anim = set.animations[uc.id];
                const st = animationState(uc, anim);
                return (
                  <li key={uc.id} className={s.item}>
                    <div className={s.row}>
                      <Text weight="semibold">{uc.name}</Text>
                      <Badge appearance="outline" color={st === 'stale' ? 'warning' : st === 'latest' ? 'success' : 'subtle'}>{`アニメーション: ${STATE_LABEL[st]}`}</Badge>
                    </div>
                    <Text size={200}>{`手順 ${uc.steps.length} 件${uc.persona ? ` ／ 対象: ${uc.persona}` : ''}`}</Text>
                    <div className={s.row}>
                      <Button size="small" onClick={() => setDlg({ editId: uc.id, draft: toDraft(uc), errors: [] })}>編集</Button>
                      <Button size="small" onClick={() => setConfirmId(uc.id)}>削除</Button>
                      <Button size="small" onClick={() => {
                        const r = createAnimation(projectId, uc.id);
                        setMessage(r.ok ? null : { id: uc.id, errors: r.errors });
                      }}>アニメーションを作成</Button>
                      <Button size="small" className={s.forced} disabled={!anim} onClick={() => setPlaying(uc.id)}>アニメーションを再生</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {playing && playingAnim ? <AnimationPlayer key={`${playing.id}:${playingAnim.createdAt}`} uc={playing} anim={playingAnim} onClose={() => setPlaying(null)} /> : null}
            <UseCaseDialog projectId={projectId} />
            {confirmId ? (
              <Dialog open modalType="alert" onOpenChange={(_, d) => { if (!d.open) setConfirmId(null); }}>
                <DialogSurface role="alertdialog" aria-label="ユースケースの削除">
                  <DialogBody>
                    <DialogTitle>ユースケースを削除しますか</DialogTitle>
                    <DialogContent>{`「${set.items.find((u) => u.id === confirmId)?.name ?? ''}」とそのアニメーションを削除します。元に戻せません。`}</DialogContent>
                    <DialogActions>
                      <Button appearance="primary" onClick={() => { if (playingId === confirmId) setPlaying(null); remove(projectId, confirmId); setConfirmId(null); }}>削除する</Button>
                      <Button onClick={() => setConfirmId(null)}>キャンセル</Button>
                    </DialogActions>
                  </DialogBody>
                </DialogSurface>
              </Dialog>
            ) : null}
          </>
        )}
      </div>
    </Panel>
  );
}

export { UseCaseScreen };

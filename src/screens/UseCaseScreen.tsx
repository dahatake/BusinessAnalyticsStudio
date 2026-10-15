// 「ユースケース」コンポーネント（FR-158・FR-155）。ステッパーの「ユースケース作成」から開く。Project ごとにユースケースを登録・編集・削除し、
// ユースケースごとにプレゼン用アニメーションを作って、その場で再生する。端末内だけで動き、AI には接続しない。
import { useEffect, useMemo, useState } from 'react';
import {
  Badge, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input, MessageBar, MessageBarBody, Text, Textarea, makeStyles, tokens,
} from '@fluentui/react-components';
import { Add24Regular } from '@fluentui/react-icons';
import { create } from 'zustand';
import { Panel } from '../components/Panel';
import { EmptyView } from '../components/StateViews';
import { useAnimation } from '../store/animation';
import { useProjects } from '../store/projects';
import { useUseCases, useUseCaseSet } from '../store/usecases';
import {
  MAX_STEPS, SCENE_SECONDS, addStep, animationState, emptyDraft, toDraft,
  type Animation, type AnimationState, type UseCase, type UseCaseDraft, type UseCaseSource,
} from '../usecase/model';
import { deriveCandidates, type Candidate } from '../usecase/derive';
import { demoUseCases } from '../usecase/demo';
import { usePackStore } from '../store/pack';
import { storyboardState } from '../usecase/storyboard';
import { StoryboardEditor, StoryboardPlayer, StylePicker } from '../usecase/StoryboardPlayer';
import { useStoryboardUi } from '../store/storyboardUi';

const useStyles = makeStyles({
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
  item: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, padding: tokens.spacingHorizontalM,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXS },
  form: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM },
  /** 画面の下に浮かぶショーコントロールバーに、最後の操作が隠れないよう余白を取る（狭い画面でも押せる） */
  editor: { paddingBottom: '96px' },
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
  sr: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' },
  outline: { margin: 0, paddingLeft: tokens.spacingHorizontalXL, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS },
  outlineBody: { margin: 0, whiteSpace: 'pre-wrap' },
  forced: { forcedColorAdjust: 'auto', ':disabled': { forcedColorAdjust: 'auto' }, ':disabled:hover': { forcedColorAdjust: 'auto' }, ':disabled:hover:active': { forcedColorAdjust: 'auto' } },
});

const STATE_LABEL: Record<AnimationState, string> = { none: '未作成', latest: '最新', stale: '古い' };

/** 登録・編集ダイアログの開閉と入力中の内容。レイアウトの変更でコンポーネントが作り直されても入力が消えないよう、外に持つ（保存しない）。 */
interface DialogState { editId: string | null; draft: UseCaseDraft; errors: string[]; /** 候補を編集して登録するときの導出元 */ source?: UseCaseSource }
const useUseCaseDialog = create<{ dlg: DialogState | null; set: (d: DialogState | null) => void }>((set) => ({ dlg: null, set: (dlg) => set({ dlg }) }));

/** 再生中のユースケースと再生位置・状態（保存しない）。レイアウト操作でコンポーネントが作り直されても位置と一時停止が残るよう、外に持つ（NFR-UX-010 AC-288）。 */
type PlayState = 'playing' | 'paused' | 'ended';
interface PlayingStore { id: string | null; index: number; state: PlayState; set: (id: string | null) => void; setIndex: (i: number) => void; setState: (s: PlayState) => void }
const usePlaying = create<PlayingStore>((set) => ({
  id: null, index: 0, state: 'playing',
  set: (id) => set({ id, index: 0, state: 'playing' }),
  setIndex: (index) => set({ index }),
  setState: (state) => set({ state }),
}));
/** 再生の状態を初期に戻す（テスト用・Project を閉じるとき用） */
export function resetPlayback() { usePlaying.getState().set(null); useUseCaseDialog.getState().set(null); useStoryboardUi.getState().close(); useStoryboardUi.getState().edit(null); }

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
    const r = save(projectId, draft, dlg.editId ?? undefined, dlg.source);
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

/** アニメーションの再生（導入→手順→効果）。1 シーン SCENE_SECONDS 秒で自動に進む。
 *  FR-157: アニメーションの状態（P・動きを減らす設定）が停止中のときは、動きなし・自動進行なしで、全シーンを文字で示す。音声は扱わない（ミュートが既定）。 */
function AnimationPlayer({ uc, anim, onClose }: { uc: UseCase; anim: Animation; onClose: () => void }) {
  const s = useStyles();
  const index = usePlaying((x) => x.index);
  const state = usePlaying((x) => x.state);
  const setIndex = usePlaying((x) => x.setIndex);
  const setState = usePlaying((x) => x.setState);
  const motionRunning = useAnimation((x) => x.playing);
  const total = anim.scenes.length;
  const stale = animationState(uc, anim) === 'stale';

  useEffect(() => {
    if (state !== 'playing' || !motionRunning) return undefined;
    const t = window.setTimeout(() => {
      if (index < total - 1) setIndex(index + 1);
      else setState('ended');
    }, SCENE_SECONDS * 1000);
    return () => window.clearTimeout(t);
  }, [state, motionRunning, index, total, setIndex, setState]);

  const next = () => setIndex(Math.min(total - 1, index + 1));
  const prev = () => setIndex(Math.max(0, index - 1));
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
  });

  const scene = anim.scenes[Math.min(index, total - 1)]!;
  const stateText = state === 'playing' ? (motionRunning ? '再生中' : '再生中（動きは停止中）') : state === 'paused' ? '一時停止中' : '終了';
  return (
    <section className={s.player} data-testid="animation-player" aria-label={`アニメーション: ${uc.name}`} data-animation-state={state} data-motion={motionRunning ? 'running' : 'stopped'}>
      {stale ? (
        <div role="status"><MessageBar intent="warning"><MessageBarBody>このアニメーションは古い内容です。ユースケースを編集した後に再作成していません。「アニメーションを作成」で最新にできます。</MessageBarBody></MessageBar></div>
      ) : null}
      <div className={s.row}>
        <Text data-testid="animation-position" aria-live="polite">{`${index + 1} / ${total}`}</Text>
        <Text size={200} data-testid="animation-state-text">{`状態: ${stateText}`}</Text>
      </div>
      <div className={s.scene} data-testid="animation-scene" data-scene-kind={scene.kind}>
        <Text as="h3" size={600} weight="semibold">{scene.title}</Text>
        {scene.body ? <Text>{scene.body}</Text> : null}
      </div>
      <div className={s.sr} aria-live="polite" aria-atomic="true" data-testid="animation-announce">{`シーン ${index + 1} / ${total}: ${scene.title}`}</div>
      <div className={s.row} role="group" aria-label="再生の操作">
        {state === 'playing'
          ? <Button className={s.forced} onClick={() => setState('paused')}>一時停止</Button>
          : <Button className={s.forced} appearance="primary" onClick={() => { if (state === 'ended') setIndex(0); setState('playing'); }}>再生</Button>}
        <Button className={s.forced} onClick={prev} disabled={index === 0}>前へ</Button>
        <Button className={s.forced} onClick={next} disabled={index >= total - 1}>次へ</Button>
        <Button className={s.forced} onClick={onClose}>終了</Button>
      </div>
      <section aria-label="手順の一覧" data-testid="animation-outline">
        <Text weight="semibold">手順の一覧</Text>
        <ol className={s.outline}>
          {anim.scenes.map((sc, i) => (
            <li key={i} aria-current={i === index ? 'step' : undefined}>
              <Text weight={i === index ? 'semibold' : 'regular'}>{`${i === index ? '【現在】' : ''}${sc.title}`}</Text>
              {sc.body ? <Text as="p" size={200} className={s.outlineBody}>{sc.body}</Text> : null}
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
function UseCaseScreen() {
  const s = useStyles();
  const projectId = useProjects((x) => x.openId);
  const set = useUseCaseSet(projectId);
  const remove = useUseCases((x) => x.remove);
  const createAnimation = useUseCases((x) => x.createAnimation);
  const createStoryboard = useUseCases((x) => x.createStoryboard);
  const saveStoryboardScenes = useUseCases((x) => x.saveStoryboardScenes);
  const sbPlayId = useStoryboardUi((x) => x.playId);
  const sbEditId = useStoryboardUi((x) => x.editId);
  const setSbPlayId = (id: string | null) => { if (id === null) useStoryboardUi.getState().close(); else useStoryboardUi.getState().play(id); };
  const setSbEditId = useStoryboardUi.getState().edit;
  const setDlg = useUseCaseDialog((x) => x.set);
  const playingId = usePlaying((x) => x.id);
  const setPlaying = usePlaying((x) => x.set);
  const [message, setMessage] = useState<{ id: string; errors: string[] } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const packState = usePackStore((x) => x.state);
  const save = useUseCases((x) => x.save);
  const [regErrors, setRegErrors] = useState<string[]>([]);
  // 導出のやり直し: 押すたびに候補だけを作り直す（登録済みは変えない。AC-291）。候補は保存しない
  const [deriveRun, setDeriveRun] = useState(0);
  const data = packState.status === 'ready' ? packState.pack.data : undefined;
  // デモ（Project を開いていないとき）だけ、顧客パックのお手本のユースケースを読み込み専用で示す（FR-180）。実際の Project には出さない
  const demoItems = useMemo(() => (projectId ? [] : demoUseCases(data?.customer, data?.issues.solutions)), [projectId, data]);
  const demoNote = projectId ? undefined : data?.customer.fictionalNote;
  const derivation = useMemo(
    () => deriveCandidates(data?.issues.issues, data?.issues.solutions, data?.products.products, set.items.map((u) => u.source)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, set.items, deriveRun],
  );
  const registerCandidate = (c: Candidate) => {
    if (!projectId) return;
    const r = save(projectId, c.draft, undefined, c.source);
    setRegErrors(r.ok ? [] : r.errors);
  };

  const playing = playingId ? set.items.find((u) => u.id === playingId) : undefined;
  const playingAnim = playing ? set.animations[playing.id] : undefined;

  return (
    <Panel testId="component-usecase" title="ユースケース" description="Project のユースケースを登録し、ユースケースごとにプレゼン用のアニメーションを作ります。">
      <div data-testid="usecase-editor" className={`${s.form} ${s.editor}`}>
        {!projectId ? (
          <>
            <EmptyView message="Project を開くと、ユースケースを登録できます。以下はデモ（架空のお手本）のユースケースです。" />
            {demoNote ? <Text size={200} data-testid="demo-fictional-note">{demoNote}</Text> : null}
            <ul className={s.list} data-testid="usecase-list" aria-label="ユースケース一覧（デモ・架空）">
              {demoItems.map((uc) => (
                <li key={uc.id} className={s.item} data-persona={uc.persona} data-usecase-id={uc.id}>
                  <div className={s.row}>
                    <Text weight="semibold" data-testid="usecase-name">{uc.name}</Text>
                    <Badge appearance="outline" color="informative">{`対象: ${uc.persona}`}</Badge>
                  </div>
                  <Text size={200} data-testid="usecase-summary">{uc.summary}</Text>
                  <Text size={200} data-testid="usecase-steps">{uc.steps.map((st, i) => `${i + 1}. ${st.title}${st.description ? `: ${st.description}` : ''}`).join(' → ')}</Text>
                  <Text size={200} data-testid="usecase-effect">{uc.effect}</Text>
                  <Text size={200} data-testid="usecase-solution">{uc.solutionTitle ?? uc.solutionId}</Text>
                  <Text size={200} data-testid="usecase-kpi">{uc.kpiNames.join('、')}</Text>
                </li>
              ))}
            </ul>
          </>
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
            <StylePicker />
            <ul className={s.list} data-testid="usecase-list" aria-label="ユースケース一覧">
              {set.items.map((uc) => {
                const anim = set.animations[uc.id];
                const st = animationState(uc, anim);
                const sb = set.storyboards?.[uc.id];
                const sbSt = storyboardState(uc, sb);
                return (
                  <li key={uc.id} className={s.item} data-usecase-name={uc.name}>
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
                    <div className={s.row}>
                      <Badge appearance="outline" color={sbSt === 'stale' ? 'warning' : sbSt === 'latest' ? 'success' : 'subtle'}>{`ストーリーボード: ${STATE_LABEL[sbSt]}`}</Badge>
                      <Button size="small" onClick={() => {
                        const r = createStoryboard(projectId, uc.id);
                        setMessage(r.ok ? null : { id: uc.id, errors: r.errors });
                        if (r.ok) setSbEditId(null);
                      }}>ストーリーボードを作成</Button>
                      {sb ? <Button size="small" onClick={() => setSbEditId(uc.id)}>ストーリーボードを編集</Button> : null}
                      <Button size="small" className={s.forced} disabled={!sb} onClick={() => setSbPlayId(uc.id)}>ストーリーボードを再生</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {sbEditId && set.storyboards?.[sbEditId] ? (() => {
              const uc = set.items.find((u) => u.id === sbEditId);
              const sb = set.storyboards?.[sbEditId];
              return uc && sb ? (
                <StoryboardEditor key={`${uc.id}:${sb.createdAt}`} name={uc.name} persona={uc.persona} scenes={sb.scenes}
                  onSave={(sc) => saveStoryboardScenes(projectId, uc.id, sc)} onClose={() => setSbEditId(null)} />
              ) : null;
            })() : null}
            {sbPlayId && set.storyboards?.[sbPlayId] ? (
              <StoryboardPlayer key={`${sbPlayId}:${set.storyboards[sbPlayId]!.createdAt}`} name={set.items.find((u) => u.id === sbPlayId)?.name ?? ''}
                scenes={set.storyboards[sbPlayId]!.scenes} onClose={() => setSbPlayId(null)} />
            ) : null}
            {playing && playingAnim ? <AnimationPlayer key={`${playing.id}:${playingAnim.createdAt}`} uc={playing} anim={playingAnim} onClose={() => setPlaying(null)} /> : null}
            <section aria-label="導出の候補" data-testid="usecase-candidates" className={s.form}>
              <div className={s.row}>
                <Text weight="semibold">導出の候補（課題と解決策から導出。登録するまで保存されません）</Text>
                <Button size="small" onClick={() => setDeriveRun((n) => n + 1)}>導出をやり直す</Button>
              </div>
              {regErrors.length > 0 ? (
                <MessageBar intent="error" layout="multiline" role="alert">
                  <MessageBarBody><ul className={s.errors}>{regErrors.map((e, i) => <li key={i}>{e}</li>)}</ul></MessageBarBody>
                </MessageBar>
              ) : null}
              {derivation.emptyReason ? <Text>{derivation.emptyReason}</Text> : null}
              {derivation.issuesWithoutSolution > 0 && !derivation.emptyReason ? (
                <Text size={200}>{`解決策のない課題 ${derivation.issuesWithoutSolution} 件は、候補に出していません（導出の元になる解決策がないため）。`}</Text>
              ) : null}
              {!derivation.emptyReason && derivation.candidates.length === 0 ? <Text size={200}>未登録の候補はありません（すべて登録済みです）。</Text> : null}
              <ul className={s.list}>
                {derivation.candidates.map((c) => (
                  <li key={`${c.source.solutionId}:${c.source.issueId}`} className={s.item}>
                    <div className={s.row}>
                      <Badge appearance="outline" color="informative">導出（未登録）</Badge>
                      <Text size={200}>{`導出元: 解決策 ${c.source.solutionId} ／ 課題 ${c.source.issueId}`}</Text>
                    </div>
                    <Text><b>名称:</b> {c.draft.name}</Text>
                    <Text><b>概要:</b> {c.draft.summary}</Text>
                    <Text><b>対象ペルソナ:</b> {c.draft.persona || '（なし）'}</Text>
                    <div>
                      <Text><b>手順:</b> {c.draft.steps.length === 0 ? '（なし）' : null}</Text>
                      <div className={s.outline}>
                        {c.draft.steps.map((st, i) => <Text key={i} size={200}>{`${i + 1}. ${st.description ? `${st.title}: ${st.description}` : st.title}`}</Text>)}
                      </div>
                      {c.truncatedFrom ? <Text size={200}>{`手順が ${c.truncatedFrom} 件あるため、先頭の ${MAX_STEPS} 件に切り詰めています。`}</Text> : null}
                    </div>
                    <Text><b>期待する効果:</b> {c.draft.effect || '（なし）'}</Text>
                    <div className={s.row}>
                      <Button size="small" appearance="primary" onClick={() => registerCandidate(c)}>登録</Button>
                      <Button size="small" onClick={() => setDlg({ editId: null, draft: toDraft(c.draft), errors: [], source: c.source })}>編集して登録</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <ul className={s.list} data-testid="usecase-list" aria-label="ユースケース一覧">
              {set.items.map((uc) => {
                const anim = set.animations[uc.id];
                const st = animationState(uc, anim);
                return (
                  <li key={uc.id} className={s.item} data-persona={uc.persona}>
                    <div className={s.row}>
                      <Text weight="semibold" data-testid="usecase-name">{uc.name}</Text>
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
                      <Button appearance="primary" onClick={() => { if (playingId === confirmId) setPlaying(null); if (sbPlayId === confirmId) setSbPlayId(null); if (sbEditId === confirmId) setSbEditId(null); remove(projectId, confirmId); setConfirmId(null); }}>削除する</Button>
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

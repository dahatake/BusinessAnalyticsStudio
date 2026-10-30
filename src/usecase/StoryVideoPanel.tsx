// ユースケースの「ストーリー動画」（FR-291）の操作と表示、作成 1 回の予算の確認・進行・中止（FR-292）。
// 作成の操作は利用者が明示して行う（ユースケースの登録だけでは生成AIを呼ばない）。実行の前に見積りと上限を示し、確認がなければ呼び出さない。
// 生成したアニメーションは、スクリプトだけを許可した sandbox の iframe（同一オリジンの許可なし）に入れる。キーはこの画面に来ない（中継プロセスだけが持つ）。
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Badge, Button, DialogActions, DialogBody, DialogContent, DialogTitle, Field, Input, MessageBar, MessageBarBody, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { useT } from '../i18n';
import { usePackStore } from '../store/pack';
import { useAnimation } from '../store/animation';
import { useUseCases } from '../store/usecases';
import { useConsent } from '../ai/useConsent';
import { fetchFoundryView } from '../ai/foundryClient';
import { AI_SCOPE_LABEL, confirmViaUi, consentOf, countPersons, gatePersonConfirm } from '../ai/personConfirm';
import { browserUsageStore, currentUsage, recordCall } from '../ai/aiImportLogic';
import { toDraft, type UseCase } from './model';
import {
  STORY_VIDEO_BUDGET_YEN, STORY_VIDEO_SANDBOX, appendUsageLog, browserLogStore, browserPriceStore, currentPrices, isValidPrices, PRICE_MISSING_GUIDE, planStoryVideo, requestStoryVideo,
  runStoryVideo, storyVideoAvailability, storyVideoState, toSrcDoc, validateAnimationHtml, yen,
  type Plan, type Prices, type StoryVideo, type StoryVideoState,
} from './storyVideo';

const useStyles = makeStyles({
  box: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalL,
    border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1,
  },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXS },
  scenes: { margin: 0, paddingLeft: tokens.spacingHorizontalXL, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS },
  frame: { width: '100%', maxWidth: '720px', minHeight: '240px', border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  forced: { forcedColorAdjust: 'auto', ':disabled': { forcedColorAdjust: 'auto' } },
});

const STATE_LABEL: Record<StoryVideoState, string> = { none: '未作成', latest: '最新', stale: '古い' };

/** 作成の状況（保存しない）。作成中・中止・失敗は、保存済みの「最新／古い」より優先して表示する */
type JobStatus = 'idle' | 'running' | 'aborted' | 'failed';
interface Job { status: JobStatus; ucId: string | null; message: string; cumulativeYen: number; limitYen: number; calls: number }
interface Ui {
  activeId: string | null;
  job: Job;
  /** 「ストーリー動画を作る」を押した結果（利用できない理由、または確認する見積り） */
  notice: { ucId: string; text: string } | null;
  confirm: { ucId: string; plan: Plan; prices: Prices } | null;
  patch: (p: Partial<Pick<Ui, 'activeId' | 'notice' | 'confirm'>>) => void;
  setJob: (j: Partial<Job>) => void;
}
const IDLE: Job = { status: 'idle', ucId: null, message: '', cumulativeYen: 0, limitYen: STORY_VIDEO_BUDGET_YEN, calls: 0 };
export const useStoryVideoUi = create<Ui>((set) => ({
  activeId: null, job: IDLE, notice: null, confirm: null,
  patch: (p) => set(p),
  setJob: (j) => set((s) => ({ job: { ...s.job, ...j } })),
}));
export function resetStoryVideoUi(): void { cancelFlag = true; useStoryVideoUi.setState({ activeId: null, job: IDLE, notice: null, confirm: null }); }
let cancelFlag = false;

/** ユースケース 1 件の行に置く操作 */
export function StoryVideoItemActions({ uc, video }: { uc: UseCase; video: StoryVideo | undefined }) {
  const s = useStyles();
  const t = useT();
  const relayUrl = usePackStore((x) => x.runtime.relayUrl);
  const pack = usePackStore((x) => x.state);
  const { granted } = useConsent();
  const running = useStoryVideoUi((x) => x.job.status === 'running');
  const st = storyVideoState(toDraft(uc), video);

  const start = async (): Promise<void> => {
    const ui = useStoryVideoUi.getState();
    ui.patch({ notice: null, confirm: null });
    const packId = pack.status === 'ready' ? pack.pack.data.customer.name : '';
    // 条件（設定済み・実接続の有効化・了承・接続先）は、押した時点の最新を確かめる。欠けるときは呼び出し 0 回で理由と直し方を示す
    const view = await fetchFoundryView(relayUrl, packId);
    const avail = storyVideoAvailability(view, granted);
    if (!avail.available) { useStoryVideoUi.getState().patch({ notice: { ucId: uc.id, text: avail.guide } }); return; }
    if (uc.steps.length === 0) { useStoryVideoUi.getState().patch({ notice: { ucId: uc.id,     text: t('手順がないため、ストーリー動画を作成できません。「編集」から手順を追加して保存してください。') } }); return; }
    const prices = currentPrices();
        if (!prices) { useStoryVideoUi.getState().patch({ notice: { ucId: uc.id, text: t(PRICE_MISSING_GUIDE) } }); return; }
    useStoryVideoUi.getState().patch({ confirm: { ucId: uc.id, plan: planStoryVideo(toDraft(uc), prices, currentUsage(browserUsageStore, new Date())), prices } });
  };

  return (
    <div className={s.row} data-usecase-story-video={uc.id}>
      <Badge appearance="outline" color={st === 'stale' ? 'warning' : st === 'latest' ? 'success' : 'subtle'}>      {t('ストーリー動画: {state}', { state: t(STATE_LABEL[st]) })}</Badge>
            <Button size="small" disabled={running} onClick={() => { void start(); }}>{t('ストーリー動画を作る')}</Button>
            {video ? <Button size="small" className={s.forced} onClick={() => useStoryVideoUi.getState().patch({ activeId: uc.id })}>{t('ストーリー動画を見る')}</Button> : null}
            <Text size={200}>{t('（生成AIで作ります。費用の見積りを確認してから実行します）')}</Text>
    </div>
  );
}

/** 画面に 1 つだけ置く: 確認ダイアログ・進行・結果（ストーリーボードとアニメーション） */
export function StoryVideoSection({ projectId, items, videos }: { projectId: string; items: UseCase[]; videos: Record<string, StoryVideo> | undefined }) {
  const s = useStyles();
  const t = useT();
  const ui = useStoryVideoUi();
  const relayUrl = usePackStore((x) => x.runtime.relayUrl);
  const pack = usePackStore((x) => x.state);
  const { granted } = useConsent();
  const saveStoryVideo = useUseCases((x) => x.saveStoryVideo);
  const motion = useAnimation((x) => x.playing);
  const [play, setPlay] = useState<'playing' | 'paused'>(motion ? 'playing' : 'paused');
  const frameRef = useRef<HTMLIFrameElement>(null);

  const activeUc = items.find((u) => u.id === ui.activeId);
  const stored = ui.activeId ? videos?.[ui.activeId] : undefined;
  // 保存済みの内容も、表示の前にもう一度検査する（検査を通らないものは枠に出さない）
  const shown = stored && validateAnimationHtml(stored.html).ok ? stored : undefined;
  const srcDoc = shown ? toSrcDoc(shown.html) : '';

  const post = (state: 'playing' | 'paused'): void => { frameRef.current?.contentWindow?.postMessage({ storyVideo: state === 'paused' ? 'pause' : 'play' }, '*'); };
  useEffect(() => { post(play); }, [play]);
  useEffect(() => { setPlay(motion ? 'playing' : 'paused'); }, [ui.activeId, shown?.createdAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = ui.confirm;
  const setPrice = (p: Prices): void => {
    if (!confirm || !isValidPrices(p)) return;
    browserPriceStore.set(p);
    const uc = items.find((u) => u.id === confirm.ucId);
    if (uc) ui.patch({ confirm: { ucId: uc.id, prices: p, plan: planStoryVideo(toDraft(uc), p, currentUsage(browserUsageStore, new Date())) } });
  };

  const execute = async (): Promise<void> => {
    if (!confirm || !confirm.plan.ok) return;
    const { ucId, plan, prices } = confirm;
    ui.patch({ confirm: null, notice: null });
    if (pack.status !== 'ready') { ui.patch({ notice: { ucId,     text: t('顧客パックが読み込まれていないため、作成できません。') } }); return; }
    const data = pack.pack.data;
    const personCount = countPersons(data);
    const gate = await gatePersonConfirm({
          destination: 'ai', scopeLabel: `${t(AI_SCOPE_LABEL)}${t('（ストーリー動画: 選んだユースケースの名称・概要・対象ペルソナ・手順・期待する効果だけ）')}`,
      data, consent: consentOf(data), confirm: confirmViaUi,
    });
        if (!gate.allowed) { useStoryVideoUi.getState().patch({ notice: { ucId, text: gate.reason ?? t('送信しませんでした。') } }); return; }
    cancelFlag = false;
    useStoryVideoUi.getState().setJob({ status: 'running', ucId, message: '', cumulativeYen: 0, limitYen: plan.limitYen, calls: 0 });
    let inTok = 0; let outTok = 0;
    const out = await runStoryVideo(
      { payload: plan.payload, limits: plan.limits, limitYen: plan.limitYen, monthRemainingYen: plan.monthRemainingYen, prices },
      {
        call: (kind, payload, maxOutputTokens) => requestStoryVideo(relayUrl, { packId: data.customer.name, kind, usecase: payload, consent: granted, includesPerson: personCount > 0, personConfirmed: true, maxOutputTokens }),
        // 失敗した呼び出しも概算に算入する（FR-276・安全側）。月の概算費用（FR-276 の記録）に合算する
        recordCost: (cost, u) => { recordCall(browserUsageStore, new Date(), cost); inTok += u.inputTokens; outTok += u.outputTokens; },
        isCancelled: () => cancelFlag,
        onProgress: (cum, calls) => useStoryVideoUi.getState().setJob({ cumulativeYen: cum, calls }),
      },
    );
    appendUsageLog(browserLogStore, {
      date: new Date().toISOString().slice(0, 10), calls: out.calls, inputTokens: inTok, outputTokens: outTok, costYen: out.costYen,
      outcome: out.status === 'done' ? 'done' : out.status === 'aborted' ? out.reason : 'failed',
    });
    if (out.status === 'done') {
      saveStoryVideo(projectId, ucId, { scenes: out.scenes, html: out.html });
      useStoryVideoUi.getState().setJob({ status: 'idle', ucId, message: '', cumulativeYen: out.costYen, calls: out.calls });
      useStoryVideoUi.getState().patch({ activeId: ucId });
    } else {
      useStoryVideoUi.getState().setJob({ status: out.status === 'aborted' ? 'aborted' : 'failed', ucId, message: out.message, cumulativeYen: out.costYen, calls: out.calls });
      useStoryVideoUi.getState().patch({ activeId: ucId });
    }
  };

  const job = ui.job;
  const showJob = job.status !== 'idle' && job.ucId === ui.activeId;
  const derived = activeUc ? storyVideoState(toDraft(activeUc), stored) : 'none';
  const statusText = showJob ? (job.status === 'running' ? '作成中' : job.status === 'aborted' ? '中止' : '失敗') : STATE_LABEL[derived];
  const noticeUc = ui.notice ? items.find((u) => u.id === ui.notice!.ucId) : undefined;

  return (
    <section aria-label={t('ストーリー動画')} data-testid="story-video-section" className={s.row} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      {ui.notice ? <MessageBar intent="warning" layout="multiline" role="alert" data-testid="story-video-notice"><MessageBarBody>{`${noticeUc ? `${t('「{name}」: ', { name: noticeUc.name })}` : ''}${ui.notice.text}`}</MessageBarBody></MessageBar> : null}
      {job.status === 'running' ? (
        <div className={s.row} role="status" data-testid="story-video-progress">
          <Text>{t('作成中: 概算の累計費用 {cost} ／ 上限 {limit}（呼び出し {calls} 回）', { cost: yen(job.cumulativeYen), limit: yen(job.limitYen), calls: job.calls })}</Text>
          <Button size="small" onClick={() => { cancelFlag = true; }}>{t('作成を中止')}</Button>
        </div>
      ) : null}
      {activeUc && (shown || showJob) ? (
        <div className={s.box} data-testid="story-video-result" aria-label={t('ストーリー動画: {name}', { name: activeUc.name })}>
          <div className={s.row}>
            <Text weight="semibold">{activeUc.name}</Text>
            <Badge appearance="outline" data-testid="story-video-status" color={statusText === '最新' ? 'success' : statusText === '古い' || statusText === '作成中' ? 'warning' : statusText === '未作成' ? 'subtle' : 'danger'}>{t('作成状態: {state}', { state: t(statusText) })}</Badge>
            <Button size="small" onClick={() => ui.patch({ activeId: null })}>{t('閉じる')}</Button>
          </div>
          {showJob && job.message ? <MessageBar intent="error" layout="multiline" role="alert"><MessageBarBody>{job.message}</MessageBarBody></MessageBar> : null}
          {derived === 'stale' && !showJob ? <div role="status"><MessageBar intent="warning"><MessageBarBody>{t('このストーリー動画は古い内容です。ユースケースの手順などを編集した後に再作成していません。「ストーリー動画を作る」で最新にできます。')}</MessageBarBody></MessageBar></div> : null}
          {shown ? (
            <>
              <ol className={s.scenes} data-testid="story-video-storyboard" aria-label={t('ストーリーボード')}>
                {shown.scenes.map((sc, i) => (
                  <li key={i}>
                    <Text as="p" weight="semibold">{t('場面: {v}', { v: sc.scene })}</Text>
                    <Text as="p">{t('登場する人: {v}', { v: sc.person })}</Text>
                    <Text as="p">{t('困りごと: {v}', { v: sc.trouble })}</Text>
                    <Text as="p">{t('実現後の変化: {v}', { v: sc.change })}</Text>
                  </li>
                ))}
              </ol>
              <iframe ref={frameRef} data-testid="story-video-frame" title={t('ストーリー動画のアニメーション: {name}', { name: activeUc.name })} className={s.frame}
                sandbox={STORY_VIDEO_SANDBOX} referrerPolicy="no-referrer" srcDoc={srcDoc} onLoad={() => post(play)} />
              <div className={s.row} role="group" aria-label={t('ストーリー動画の再生の操作')}>
                <Button className={s.forced} appearance="primary" aria-label={t('ストーリー動画を再生')} onClick={() => setPlay('playing')}>{t('再生')}</Button>
                <Button className={s.forced} aria-label={t('ストーリー動画を一時停止')} onClick={() => setPlay('paused')}>{t('一時停止')}</Button>
                <Text data-testid="story-video-state" aria-live="polite">{t('状態: {state}', { state: play === 'playing' ? t('再生中') : t('一時停止中') })}</Text>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <Dialog open={!!confirm} modalType="modal" onOpenChange={(_, d) => { if (!d.open) ui.patch({ confirm: null }); }}>
        <DialogSurface aria-label={t('ストーリー動画の作成の確認')}>
          <DialogBody>
            <DialogTitle>{t('ストーリー動画を作成しますか')}</DialogTitle>
            <DialogContent>
              {confirm ? (
                <div className={s.box} style={{ border: 'none', padding: 0 }}>
                  <Text>{t('Microsoft Foundry（有料）で作成します。送信されるのは、選んだユースケースの名称・概要・対象ペルソナ・手順・期待する効果だけです（ほかのユースケースは含みません）。')}</Text>
                  <Text as="p" data-testid="story-video-estimate" role="status">
                    {t('見積りの費用: {estimate} ／ 上限: {limit}（1 回の上限 {perCall}、月の予算の残額 {remaining} の小さいほう）', { estimate: yen(confirm.plan.estimateYen), limit: yen(confirm.plan.limitYen), perCall: yen(STORY_VIDEO_BUDGET_YEN), remaining: yen(confirm.plan.monthRemainingYen) })}
                  </Text>
                  {confirm.plan.ok && confirm.plan.truncated ? <Text role="status">{confirm.plan.truncatedNote}</Text> : null}
                  {!confirm.plan.ok ? <MessageBar intent="error" layout="multiline" role="alert"><MessageBarBody>{confirm.plan.message}</MessageBarBody></MessageBar> : null}
                  <Field label={t('入力の単価（円／100万トークン）')}><Input type="number" min={0} value={String(confirm.prices.inPerM)} onChange={(_, d) => { const n = Number(d.value); if (Number.isFinite(n) && n >= 0) setPrice({ ...confirm.prices, inPerM: n }); }} /></Field>
                  <Field label={t('出力の単価（円／100万トークン）')}><Input type="number" min={0} value={String(confirm.prices.outPerM)} onChange={(_, d) => { const n = Number(d.value); if (Number.isFinite(n) && n >= 0) setPrice({ ...confirm.prices, outPerM: n }); }} /></Field>
                </div>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary"               onClick={() => ui.patch({ confirm: null })}>{t('キャンセル')}</Button>
                            {confirm?.plan.ok ? <Button appearance="primary" onClick={() => { void execute(); }}>{t('実行')}</Button> : null}
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </section>
  );
}

// ストーリーボードの再生と編集（FR-163〜FR-166）。端末内だけで動き、AI には接続しない。
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, Field, Input, MessageBar, MessageBarBody, Portal, Text, Textarea, makeStyles, tokens } from '@fluentui/react-components';
import { RadioGroup, Radio } from '../components/ChoiceRadio';
import { useAnimation } from '../store/animation';
import { useStoryStyle } from '../store/storyboardStyle';
import { useStoryboardUi } from '../store/storyboardUi';
import { useCaptionSpeech } from '../speech/useCaptionSpeech';
import {
  STYLES, is3dStyle, isStyle, moveScene, sceneMs, telopParts, telopPlain, validateScenes, TELOP_MAX,
  type StoryScene, type StoryStyle,
} from './storyboard';
import './storyboard.css';

/** WebGL（3D の描画）を使えるか */
export function canRenderWebGl(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

const STYLE_CLASS: Record<StoryStyle, string> = {
  '3D': 'sbp-style-3d', 'アニメ': 'sbp-style-anime', 'Geometric 3D': 'sbp-style-geometric', 'Isometric 3D': 'sbp-style-isometric', 'Whimsical 3D': 'sbp-style-whimsical',
};

/** 全画面で再生する。Esc・終了で閉じる。全画面にできないときは、画面全体を覆う表示で代わりにする（FR-164 AC-317） */
export function StoryboardPlayer({ name, scenes, onClose }: { name: string; scenes: readonly StoryScene[]; onClose: () => void }) {
  const style = useStoryStyle((s) => s.style);
  const motionRunning = useAnimation((s) => s.playing);
  const [rootEl, setRootEl] = useState<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const index = useStoryboardUi((s) => s.index);
  const state = useStoryboardUi((s) => s.state);
  const setIndex = useStoryboardUi((s) => s.setIndex);
  const setState = useStoryboardUi((s) => s.setState);
  const [fallback, setFallback] = useState(false);
  const [webgl] = useState(() => canRenderWebGl());
  const total = scenes.length;
  const flat = is3dStyle(style) && !webgl;

  // 全画面
  useEffect(() => {
    const el = rootEl;
    if (!el) return undefined;
    let enteredAt = 0;
    if (el && typeof el.requestFullscreen === 'function') {
      el.requestFullscreen().catch(() => setFallback(true));
    } else {
      setFallback(true);
    }
    const onFs = () => {
      if (document.fullscreenElement) { enteredAt = Date.now(); return; }
      if (enteredAt === 0) return;
      // 入ってすぐ（0.5 秒未満）に全画面が終わったのは、環境が全画面を保てないとき。再生は続け、覆う表示に切り替える。
      // それより後に終わったのは、利用者の Esc などなので、再生も終える
      if (Date.now() - enteredAt < 500) { enteredAt = 0; setFallback(true); } else closeRef.current();
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      // 閉じるとき（開いている印が外れているとき）だけ全画面を終える。レイアウトの変更で作り直されたときは、全画面のまま引き継ぐ
      if (useStoryboardUi.getState().playId === null && document.fullscreenElement && typeof document.exitFullscreen === 'function') document.exitFullscreen().catch(() => undefined);
    };
  }, [rootEl]);

  // 自動の進行: 全体が約 30 秒に収まるよう、シーン数で割る。動きの停止中・一時停止中は進めない
  useEffect(() => {
    if (state !== 'playing' || !motionRunning) return undefined;
    const t = window.setTimeout(() => {
      if (index < total - 1) setIndex(index + 1);
      else setState('ended');
    }, sceneMs(total));
    return () => window.clearTimeout(t);
  }, [state, motionRunning, index, total]);

  const next = () => setIndex((i) => Math.min(total - 1, i + 1));
  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const restartOrPlay = () => {
    if (state === 'ended') setIndex(0);
    setState('playing');
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const scene = scenes[Math.min(index, total - 1)]!;
  const speech = useCaptionSpeech(scene.caption);
  const shapes = Math.min(8, index + 1);
  return (
    <Portal>
    <section
      ref={setRootEl}
      className={`sbp-root ${STYLE_CLASS[style]}${flat ? ' sbp-2d' : ''}`}
      data-testid="storyboard-player"
      role="dialog"
      aria-modal="true"
      aria-label={`ストーリーボード: ${name}`}
      data-storyboard-state={state}
      data-motion={motionRunning ? 'running' : 'stopped'}
    >
      <div className="sbp-bar">
        <b data-testid="storyboard-position" aria-live="polite">{`${index + 1} / ${total}`}</b>
        <span>スタイル: <b data-testid="storyboard-style-name">{style}</b></span>
        <span>{state === 'playing' ? (motionRunning ? '再生中' : '再生中（動きは停止中）') : state === 'paused' ? '一時停止中' : '終了'}</span>
      </div>
      {fallback ? <p className="sbp-notice" role="status" data-testid="storyboard-fullscreen-fallback">この環境では全画面にできないため、画面全体を覆う表示で再生しています。</p> : null}
      {flat ? <p className="sbp-notice" role="status" data-testid="storyboard-style-notice">3D を描けない環境（WebGL が使えない）のため、2D のアニメの表現で再生しています。</p> : null}
      {speech.sending ? <p className="sbp-notice" role="status" data-testid="speech-sending-notice">字幕の文言を音声合成の接続先（{speech.host}）へ送って読み上げています。</p> : null}
      {speech.error ? <p className="sbp-notice" role="status" data-testid="speech-error">{speech.error}</p> : null}
      <div className="sbp-stage">
        <h2 className="sbp-heading" key={`h${index}`}>{scene.heading}</h2>
        <div className="sbp-world" aria-hidden="true">
          {Array.from({ length: shapes }, (_, i) => <span key={i} className={`sbp-shape${i === shapes - 1 ? ' sbp-lit' : ''}`} />)}
        </div>
      </div>
      <p className="sbp-telop" data-testid="storyboard-telop">
        {telopParts(scene.telop).map((p, i) => (p.emphasis ? <span key={i} className="sbp-emphasis" data-testid="storyboard-emphasis">{p.text}</span> : <span key={i}>{p.text}</span>))}
      </p>
      <p className="sbp-caption" data-testid="storyboard-caption" aria-live="polite">{scene.caption}</p>
      <div className="sbp-controls" role="group" aria-label="再生の操作">
        <Button appearance="primary" onClick={restartOrPlay}>再生</Button>
        <Button onClick={() => setState('paused')}>一時停止</Button>
        <Button onClick={prev} disabled={index === 0}>前へ</Button>
        <Button onClick={next} disabled={index >= total - 1}>次へ</Button>
        <Button onClick={onClose}>終了</Button>
      </div>
      <ol className="sbp-sr" aria-label="全シーンの字幕">
        {scenes.map((sc, i) => <li key={i}>{sc.caption}</li>)}
      </ol>
    </section>
    </Portal>
  );
}

const useStyles = makeStyles({
  box: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalL,
    border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`, borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM },
  scene: {
    display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, padding: tokens.spacingHorizontalM,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium,
  },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: tokens.spacingHorizontalS, rowGap: tokens.spacingVerticalXS },
  errors: { margin: 0, paddingLeft: tokens.spacingHorizontalXL },
});

/** シーンの文言と順序の編集（FR-163）。保存したものが次の再生に使われる。元のユースケースは変えない。Esc で閉じる */
export function StoryboardEditor({ name, persona, scenes, onSave, onClose }: {
  name: string; persona: string; scenes: readonly StoryScene[];
  onSave: (scenes: StoryScene[]) => { ok: true } | { ok: false; errors: string[] };
  onClose: () => void;
}) {
  const s = useStyles();
  const [draft, setDraft] = useState<StoryScene[]>(() => scenes.map((x) => ({ ...x })));
  const [errors, setErrors] = useState<string[]>([]);
  const patch = (i: number, p: Partial<StoryScene>) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const save = () => {
    const v = validateScenes(draft);
    if (!v.ok) { setErrors(v.errors); return; }
    const r = onSave(draft);
    if (r.ok) { setErrors([]); onClose(); } else setErrors(r.errors);
  };
  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface aria-label={`ストーリーボードの編集: ${name}`} style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <DialogBody>
          <DialogContent>
            <section className={s.box} data-testid="storyboard-editor">
              <Text weight="semibold">{`ストーリーボードの編集（対象ペルソナ: ${persona || '（未入力）'}）`}</Text>
              <ol className={s.list} data-testid="storyboard-scenes">
                {draft.map((sc, i) => (
                  <li key={i} className={s.scene}>
                    <Text weight="semibold">{`シーン ${i + 1}`}</Text>
                    <Field label="見出し"><Input aria-label={`シーン ${i + 1} の見出し`} value={sc.heading} onChange={(_, d) => patch(i, { heading: d.value })} /></Field>
                    <Field label="字幕（読み上げる文と同じ文言）"><Textarea aria-label={`シーン ${i + 1} の字幕`} value={sc.caption} onChange={(_, d) => patch(i, { caption: d.value })} /></Field>
                    <Field label={`強調テロップ（強調する語は * で囲む。${TELOP_MAX} 文字以内）`} hint={`${Array.from(telopPlain(sc.telop)).length} / ${TELOP_MAX} 文字`}>
                      <Input aria-label={`シーン ${i + 1} の強調テロップ`} value={sc.telop} onChange={(_, d) => patch(i, { telop: d.value })} />
                    </Field>
                    <div className={s.row}>
                      <Button size="small" disabled={i === 0} onClick={() => setDraft((d) => moveScene(d, i, i - 1))}>{`シーン ${i + 1} を前へ`}</Button>
                      <Button size="small" disabled={i === draft.length - 1} onClick={() => setDraft((d) => moveScene(d, i, i + 1))}>{`シーン ${i + 1} を後ろへ`}</Button>
                    </div>
                    <Text size={200}>{`見出し: ${sc.heading} ／ 字幕: ${sc.caption} ／ テロップ: ${telopPlain(sc.telop)}`}</Text>
                  </li>
                ))}
              </ol>
              {errors.length > 0 ? (
                <MessageBar intent="error" layout="multiline" role="alert">
                  <MessageBarBody><ul className={s.errors}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></MessageBarBody>
                </MessageBar>
              ) : null}
            </section>
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={save}>保存</Button>
            <Button onClick={onClose}>閉じる</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** スタイルの選択（FR-166）。選んだものは端末内に保存される */
export function StylePicker() {
  const style = useStoryStyle((s) => s.style);
  const setStyle = useStoryStyle((s) => s.setStyle);
  return (
    <Field label="スタイル" hint="ストーリーボードの再生の見た目（既定は Isometric 3D）">
      <RadioGroup layout="horizontal" aria-label="スタイル" value={style} onChange={(_, d) => { if (isStyle(d.value)) setStyle(d.value); }}>
        {STYLES.map((n) => <Radio key={n} value={n} label={n} />)}
      </RadioGroup>
    </Field>
  );
}

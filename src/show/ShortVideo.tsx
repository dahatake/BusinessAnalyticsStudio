// ショート動画の書き出し（FR-081）。ヘッダーのボタンから画面を開き、約 60 秒（PARAM-013）の 9:16 の WebM を録画してダウンロードする。
// 動画には「サンプル」の透かしが入る（画面にも明記する）。録画はブラウザーの中だけで行い、外部へは送らない。
import { useMemo, useRef, useState } from 'react';
import {
  Button, DialogActions, DialogBody, DialogContent, DialogTitle, MessageBar, MessageBarBody, ProgressBar, Text,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { Video20Regular } from '@fluentui/react-icons';
import { usePackStore } from '../store/pack';
import { useShowUi } from '../store/show';
import { readTelop } from './model';
import { SHORT_VIDEO_SECONDS, SHORT_VIDEO_WATERMARK, readNarration, shortVideoFileName, type ShortSlide } from './extras';
import { pickWebmMimeType, recordShortVideo, type ShortVideoSource } from './shortVideoRecorder';
import { useT } from '../i18n';

/** 顧客パックの show.json から、動画に出すスライド（章・論点・台本またはテロップ）を作る。最初に顧客名とプロジェクト名のスライドを置く */
function useShortSource(): ShortVideoSource | null {
  const state = usePackStore((s) => s.state);
  return useMemo(() => {
    if (state.status !== 'ready') return null;
    const { customer, show } = state.pack.data;
    const slides: ShortSlide[] = [{ chapter: 'The Future Ahead', title: customer.projectName, text: `${customer.name} × Microsoft` }];
    for (const c of show.chapters) {
      for (const t of c.topics) {
        slides.push({ chapter: c.title, title: t.title, text: readNarration(t) ?? readTelop(t)?.text ?? '' });
      }
    }
    return { customerName: customer.name, projectName: customer.projectName, slides };
  }, [state]);
}

export function ShortVideoButton() {
  const open = useShowUi((s) => s.setShortVideoOpen);
  const t = useT();
  return (
    <Button icon={<Video20Regular aria-hidden />} onClick={() => open(true)}>{t('ショート動画を書き出す')}</Button>
  );
}

type Phase = 'idle' | 'recording' | 'done' | 'error';

export function ShortVideoDialog() {
  const t = useT();
  const isOpen = useShowUi((s) => s.shortVideoOpen);
  const setOpen = useShowUi((s) => s.setShortVideoOpen);
  const src = useShortSource();
  const [phase, setPhase] = useState<Phase>('idle');
  const [ratio, setRatio] = useState(0);
  const [message, setMessage] = useState('');
  const abort = useRef<AbortController | null>(null);
  const supported = pickWebmMimeType() !== null;

  const close = () => {
    abort.current?.abort();
    setOpen(false);
    setPhase('idle');
    setRatio(0);
  };
  const start = async () => {
    if (!src) return;
    const ac = new AbortController();
    abort.current = ac;
    setPhase('recording');
    setRatio(0);
    try {
      const blob = await recordShortVideo(src, { signal: ac.signal, onProgress: setRatio });
      if (!blob) { setPhase('idle'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = shortVideoFileName(src.projectName);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setPhase('done');
      setMessage(t('{name} を書き出しました。', { name: a.download }));
    } catch (e) {
      setPhase('error');
      setMessage(e instanceof Error ? e.message : t('書き出しに失敗しました。'));
    } finally {
      abort.current = null;
    }
  };

  return (
    <Dialog open={isOpen} modalType="modal" onOpenChange={(_, d) => { if (!d.open) close(); }}>
      <DialogSurface aria-label={t('ショート動画の書き出し')}>
        <DialogBody>
          <DialogTitle>{t('ショート動画の書き出し')}</DialogTitle>
          <DialogContent>
            <Text as="p" block>{t('縦横比 9:16・約 {n} 秒の動画（WebM）を、このブラウザーの中で作ります。外部には送りません。', { n: SHORT_VIDEO_SECONDS })}</Text>
            <Text as="p" block data-testid="short-watermark">{t('動画には「{mark}」の透かしが入ります。', { mark: t(SHORT_VIDEO_WATERMARK) })}</Text>
            {!supported ? <MessageBar intent="warning"><MessageBarBody>{t('このブラウザーは WebM の録画に対応していません。')}</MessageBarBody></MessageBar> : null}
            {phase === 'recording' ? (
              <div data-testid="short-progress">
                <ProgressBar value={ratio} aria-label={t('書き出しの進み具合')} />
                <Text size={200}>{t('録画中です（約 {n} 秒かかります）。このまま画面を開いたままにしてください。', { n: SHORT_VIDEO_SECONDS })}</Text>
              </div>
            ) : null}
            {phase === 'done' ? <MessageBar intent="success"><MessageBarBody>{message}</MessageBarBody></MessageBar> : null}
            {phase === 'error' ? <MessageBar intent="error"><MessageBarBody>{message}</MessageBarBody></MessageBar> : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={close}>{phase === 'recording' ? t('中止') : t('閉じる')}</Button>
            <Button appearance="primary" disabled={!supported || !src || phase === 'recording'} onClick={() => { void start(); }}>{t('書き出す')}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

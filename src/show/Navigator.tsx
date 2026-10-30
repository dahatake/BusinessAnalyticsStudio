// AI ナビゲーター（FR-080）。プレゼンテーション中、論点に台本（show.json の narration）があるときに、字幕つきで出す。
// 台本は AI が生成したものなので、「AI 生成」のラベルを常に付ける。音声合成（任意）の接続先は設定されていないので、字幕だけで進行する（外部へは接続しない）。
// 字幕は文ごとに順に出す。アニメーションが停止中（または動きを減らす設定）のときは、台本の全文を一度に出す。
import { useEffect, useMemo, useState } from 'react';
import { Badge, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Bot24Regular } from '@fluentui/react-icons';
import { usePlaying } from '../motion/useMotion';
import { subtitleDurationMs, splitSubtitles } from './extras';
import { useAzure } from '../ai/useAzure';
import { synthesizeSpeech } from '../ai/azureClient';
import { useT, tr } from '../i18n';

const useStyles = makeStyles({
  nav: {
    position: 'fixed',
    right: tokens.spacingHorizontalL,
    bottom: '72px',
    zIndex: 25,
    width: 'min(340px, calc(100vw - 32px))',
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow16,
  },
  head: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
  avatar: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  subtitles: {
    minHeight: '3.2em',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    lineHeight: tokens.lineHeightBase300,
    overflowWrap: 'anywhere',
  },
});

/** 論点の台本の字幕。台本を文に分け、再生中は文ごとに順に出す */
export function Navigator({ script, topicId }: { script: string; topicId: string }) {
  const s = useStyles();
  const t = useT();
  const playing = usePlaying();
  const sentences = useMemo(() => splitSubtitles(script), [script]);
  const [index, setIndex] = useState(0);
  // 論点が変わったら先頭から出し直す
  useEffect(() => { setIndex(0); }, [topicId, script]);
  useEffect(() => {
    if (!playing || index >= sentences.length - 1) return undefined;
    const id = window.setTimeout(() => setIndex((i) => i + 1), subtitleDurationMs(sentences[index]!));
    return () => window.clearTimeout(id);
  }, [playing, index, sentences]);
  const text = playing ? sentences[Math.min(index, sentences.length - 1)] ?? '' : sentences.join('');
  // 音声合成の実接続（FR-182）。有効なときだけ中継プロセスに台本を送る。失敗しても字幕だけで進める
  const { realEnabled, relayUrl, packId } = useAzure('speech');
  const [speechError, setSpeechError] = useState<string | null>(null);
  useEffect(() => {
    setSpeechError(null);
    if (!realEnabled || !playing) return undefined;
    let cancelled = false;
    let audio: HTMLAudioElement | null = null;
    void synthesizeSpeech({ relayUrl, realEnabled, packId }, script).then((o) => {
      if (cancelled) return;
      if (o.kind === 'error') setSpeechError(o.message);
      else if (o.kind === 'audio' && typeof Audio !== 'undefined') {
        audio = new Audio(`data:${o.contentType};base64,${o.audioBase64}`);
        void audio.play().catch(() => setSpeechError(tr('音声を再生できませんでした。字幕だけで進行します。')));
      }
    });
    return () => { cancelled = true; audio?.pause(); };
  }, [realEnabled, playing, relayUrl, packId, script, topicId]);
  return (
    <section className={s.nav} data-testid="navigator" aria-label={t('AI ナビゲーター')}>
      <div className={s.head}>
        <span className={s.avatar} aria-hidden><Bot24Regular /></span>
        <Text weight="semibold">{t('ナビゲーター')}</Text>
        <Badge appearance="outline" color="informative" data-testid="ai-generated-label">{t('AI 生成')}</Badge>
      </div>
      <div className={s.subtitles} data-testid="subtitles" role="status" aria-live="polite" aria-label={t('字幕')}>{text}</div>
      {speechError ? <Text size={200} role="alert" data-testid="speech-error">{speechError}{t('（字幕だけで進行します）')}</Text> : null}
      <Text size={200}>{realEnabled ? t('音声: Azure AI Speech') : t('音声: 未設定（字幕のみ）')}</Text>
    </section>
  );
}

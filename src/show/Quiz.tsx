// AI 成熟度クイズとリアクションボタン（FR-082）。
// クイズ: 議題の quiz（show.json）の質問に答え、全問に答えると「結果を見る」で成熟度のレベルを出す。
// リアクション: プレゼンテーション中、画面の端にボタンを出す。押すと反応の表示が出て、件数が増える（件数は画面を開いている間だけ持つ）。
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Field, Text, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Radio, RadioGroup } from '../components/ChoiceRadio';
import { usePlaying } from '../motion/useMotion';
import { useShowUi } from '../store/show';
import { REACTIONS, scoreQuiz, type Quiz, type ReactionId } from './extras';

const useStyles = makeStyles({
  quiz: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, maxWidth: '760px' },
  question: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS },
  result: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, padding: tokens.spacingHorizontalM },
  level: { color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightBold },
  reactions: {
    position: 'fixed',
    right: tokens.spacingHorizontalL,
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 26,
    display: 'flex',
    flexDirection: 'column',
    rowGap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalS,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow8,
  },
  count: { marginLeft: tokens.spacingHorizontalXS, fontVariantNumeric: 'tabular-nums' },
  burst: {
    position: 'fixed',
    right: '96px',
    zIndex: 45,
    fontSize: '48px',
    pointerEvents: 'none',
    animationName: { from: { opacity: 1, transform: 'translateY(0) scale(1)' }, to: { opacity: 0, transform: 'translateY(-120px) scale(1.4)' } },
    animationDuration: '1800ms',
    animationFillMode: 'forwards',
    animationTimingFunction: 'ease-out',
  },
  burstStatic: { opacity: 1 },
});

/** クイズ。全問に答えるまで「結果を見る」は押せない */
export function QuizView({ quiz }: { quiz: Quiz }) {
  const s = useStyles();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [shown, setShown] = useState(false);
  const result = useMemo(() => scoreQuiz(quiz, answers), [quiz, answers]);
  return (
    <div className={s.quiz} data-testid="quiz" role="group" aria-label={quiz.title}>
      <Text as="h2" size={500} weight="semibold" block>{quiz.title}</Text>
      {quiz.questions.map((q) => (
        <Field key={q.id} label={q.text} className={s.question}>
          <RadioGroup
            layout="horizontal-stacked"
            aria-label={q.text}
            value={answers[q.id] === undefined ? '' : String(answers[q.id])}
            onChange={(_, d) => { setShown(false); setAnswers((a) => ({ ...a, [q.id]: Number(d.value) })); }}
          >
            {q.options.map((o, i) => <Radio key={i} value={String(i)} label={o.label} />)}
          </RadioGroup>
        </Field>
      ))}
      <div>
        <Button appearance="primary" disabled={result === null} onClick={() => setShown(true)}>結果を見る</Button>
      </div>
      {shown && result ? (
        <Card className={s.result} data-testid="quiz-result" role="status" aria-live="polite">
          <Text size={400} weight="semibold">AI 成熟度の結果</Text>
          <Text className={s.level} size={500}>{result.level.label}</Text>
          <Text>成熟度スコア: {result.score} / {result.max}</Text>
          {result.level.description ? <Text>{result.level.description}</Text> : null}
        </Card>
      ) : null}
    </div>
  );
}

interface Burst { key: number; emoji: string; top: number }

/** リアクションのボタン。押すと反応（絵文字）が浮かび、件数が増える */
export function Reactions() {
  const s = useStyles();
  const playing = usePlaying();
  const counts = useShowUi((st) => st.reactions);
  const react = useShowUi((st) => st.react);
  const [bursts, setBursts] = useState<Burst[]>([]);
  useEffect(() => {
    if (bursts.length === 0) return undefined;
    const id = window.setTimeout(() => setBursts((b) => b.slice(1)), 1800);
    return () => window.clearTimeout(id);
  }, [bursts]);
  const press = (id: ReactionId, emoji: string) => {
    react(id);
    setBursts((b) => [...b, { key: Date.now() + Math.random(), emoji, top: 200 + Math.round(Math.random() * 200) }]);
  };
  return (
    <>
      <div className={s.reactions} data-testid="reactions" role="group" aria-label="リアクション">
        {REACTIONS.map((r) => (
          <Button key={r.id} size="small" appearance="subtle" onClick={() => press(r.id, r.emoji)} aria-label={`${r.label} ${counts[r.id]} 件`}>
            <span aria-hidden>{r.emoji}</span>
            <Text className={s.count} size={200} data-testid="reaction-count">{counts[r.id]}</Text>
          </Button>
        ))}
      </div>
      {bursts.map((b) => (
        <span key={b.key} className={mergeClasses(s.burst, !playing && s.burstStatic)} style={{ top: b.top }} data-testid="reaction-burst" aria-hidden>{b.emoji}</span>
      ))}
    </>
  );
}

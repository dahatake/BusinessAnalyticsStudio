// 他のビューの上に書き込む注釈（FR-086）。ビューの上に透明な描画面を重ね、「注釈を書く」を入れている間だけ入力を受ける。
// 注釈はビューごとに store に残るので、ビューを切り替えて戻っても消えない。
import { useLayoutEffect } from 'react';
import { Button, makeStyles, tokens } from '@fluentui/react-components';
import { BoardSurface } from './BoardSurface';
import { InkToolbar } from './InkToolbar';
import { annotationBoardId, useInk } from './store';
import { useT } from '../i18n';

const useStyles = makeStyles({
  bar: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, marginTop: tokens.spacingVerticalS },
  row: { display: 'flex', alignItems: 'center', columnGap: tokens.spacingHorizontalS },
  forcedAuto: { forcedColorAdjust: 'auto', '@media (forced-colors: active)': { forcedColorAdjust: 'auto' } },
});

function useAnnotationBoard(viewKey: string): string {
  const ensure = useInk((st) => st.ensureAnnotationBoard);
  useLayoutEffect(() => { ensure(viewKey); }, [ensure, viewKey]);
  return annotationBoardId(viewKey);
}

/** 重ねる側（親は position: relative で、描画面と同じ大きさにする）。 */
export function AnnotationLayer({ viewKey, label, active }: { viewKey: string; label: string; active: boolean }) {
  const id = useAnnotationBoard(viewKey);
  const t = useT();
  return <BoardSurface boardId={id} testId="annotation-layer" ariaLabel={t('{label}の上の注釈', { label })} overlay active={active} />;
}

/** 「注釈を書く」の切替と、書いている間のツールバー。 */
export function AnnotationControls({ viewKey, active, onToggle }: { viewKey: string; active: boolean; onToggle: (next: boolean) => void }) {
  const s = useStyles();
  const t = useT();
  const id = useAnnotationBoard(viewKey);
  const removeObjects = useInk((st) => st.removeObjects);
  const count = useInk((st) => {
    const b = st.boards.find((x) => x.id === id);
    return b ? b.strokes.length + b.items.length : 0;
  });
  return (
    <div className={s.bar}>
      <div className={s.row}>
        <Button className={s.forcedAuto} appearance={active ? 'primary' : 'secondary'} aria-pressed={active} onClick={() => onToggle(!active)}>{t('注釈を書く')}</Button>
        {count > 0 && (
          <Button
            appearance="subtle"
            onClick={() => {
              const b = useInk.getState().boards.find((x) => x.id === id);
              if (b) removeObjects(id, [...b.strokes.map((k) => k.id), ...b.items.map((i) => i.id)]);
            }}
          >
            {t('注釈を消す')}
          </Button>
        )}
      </div>
      {active && <InkToolbar boardId={id} label={t('注釈の道具')} />}
    </div>
  );
}

// 表現が成り立たない項目の通知（FR-113）。地図・3D・ガントなどの画面が、必要な属性のない項目を表現から外したときに、
// 「位置情報なし: N 件」のように理由と件数を示す。通知を選ぶと、該当の項目を表で見られる（表のコンポーネントがあればそこに、なければこの下に一覧で）。
import { useId, useState } from 'react';
import { Button, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Info16Regular } from '@fluentui/react-icons';
import { fallbackLabel, type FallbackReason } from '../analysis/fallback';
import { isComponentAvailable, useLayout } from '../store/layout';
import { useFallbackStore } from '../store/fallback';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalXS, alignItems: 'flex-start' },
  list: { margin: 0, paddingLeft: tokens.spacingHorizontalXL, maxHeight: '160px', overflowY: 'auto' },
});

export interface UnrenderableItem { id: string; label: string }

export interface UnrenderableNoteProps {
  /** 表現の key（`map` など） */
  source: string;
  reason: FallbackReason | string;
  /** その表現に出せなかった項目 */
  items: readonly UnrenderableItem[];
}

export function UnrenderableNote({ source, reason, items }: UnrenderableNoteProps) {
  const s = useStyles();
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const text = fallbackLabel(reason, items.length);
  const reasonText = typeof reason === 'string' ? reason : reason.label;
  const hasTable = isComponentAvailable('table');
  const onClick = () => {
    useFallbackStore.getState().open({ source, reason: reasonText, ids: items.map((i) => i.id) });
    if (hasTable) useLayout.getState().showComponent('table');
    else setExpanded((v) => !v);
  };
  return (
    <div className={s.root} data-testid="unrenderable-note">
      <Button
        size="small"
        appearance="outline"
        icon={<Info16Regular aria-hidden />}
        aria-expanded={hasTable ? undefined : expanded}
        aria-controls={hasTable || !expanded ? undefined : listId}
        onClick={onClick}
      >
        {text}
      </Button>
      {!hasTable && expanded ? (
        <ul id={listId} className={s.list} aria-label={`${text}の項目`}>
          {items.map((i) => <li key={i.id} data-entity-id={i.id}><Text>{i.label}</Text></li>)}
        </ul>
      ) : null}
    </div>
  );
}

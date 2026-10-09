// 読み込み中・0 件・エラーの表示（ui-design の状態表示）。
import { MessageBar, MessageBarBody, MessageBarTitle, Skeleton, SkeletonItem, Text, makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  box: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalXXL },
  list: { margin: 0, paddingLeft: tokens.spacingHorizontalXL },
});

export function LoadingView({ label = '読み込み中' }: { label?: string }) {
  const s = useStyles();
  return (
    <div className={s.box} role="status" aria-label={label} data-testid="state-loading">
      <Skeleton aria-label={label}>
        <SkeletonItem size={24} />
        <SkeletonItem size={16} />
        <SkeletonItem size={16} />
      </Skeleton>
    </div>
  );
}

export function EmptyView({ message }: { message: string }) {
  const s = useStyles();
  return (
    <div className={s.box} data-testid="state-empty">
      <Text>{message}</Text>
    </div>
  );
}

export function ErrorView({ title, messages, action }: { title: string; messages: string[]; action?: string }) {
  const s = useStyles();
  return (
    <div className={s.box} data-testid="state-error">
      <MessageBar intent="error" layout="multiline">
        <MessageBarBody>
          <MessageBarTitle>{title}</MessageBarTitle>
          <ul className={s.list}>
            {messages.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
          {action ? <Text block>{action}</Text> : null}
        </MessageBarBody>
      </MessageBar>
    </div>
  );
}

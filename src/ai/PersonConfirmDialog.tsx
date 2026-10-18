// 種別「人」を含む顧客パックの外部送信・エクスポート前の確認の画面（FR-219）。共通の Dialog を使う。
// 件数・送る範囲・確認日を文字で示し、個人名・連絡先の値は出さない。了承の記録がなければ続行できない。
import { Button, DialogActions, DialogBody, DialogContent, DialogTitle, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { CONSENT_SELF_DECLARED_NOTICE } from './consent';
import { DESTINATION_LABELS, usePersonConfirmUi } from './personConfirm';

const useStyles = makeStyles({
  list: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, margin: 0, paddingLeft: tokens.spacingHorizontalXL },
  hint: { color: tokens.colorNeutralForeground3 },
  blocked: { color: tokens.colorPaletteRedForeground1 },
});

export function PersonConfirmDialog() {
  const s = useStyles();
  const request = usePersonConfirmUi((u) => u.request);
  const answer = usePersonConfirmUi((u) => u.answer);
  const consented = !!request?.confirmedOn;
  return (
    <Dialog open={!!request} modalType="alert" onOpenChange={(_, d) => { if (!d.open) answer('cancel'); }}>
      <DialogSurface aria-label="種別「人」を含む顧客パックの確認">
        <DialogBody>
          <DialogTitle>種別「人」を含む顧客パックの確認</DialogTitle>
          <DialogContent>
            {request ? (
              <>
                <ul className={s.list}>
                  <li>送る・出力する先: {DESTINATION_LABELS[request.destination]}</li>
                  <li>範囲: {request.scopeLabel}</li>
                  <li>種別「人」のエンティティ: {request.personCount} 件（個人名・連絡先の値は、この確認には表示しません）</li>
                  <li>{request.confirmedOn ? `顧客の了承の記録: あり（確認日 ${request.confirmedOn}）` : '顧客の了承の記録なし'}</li>
                  {request.destination === 'export' ? <li>種別「人」の値は機密区分を持たないため、匿名化の対象ではありません。そのまま出力されます。</li> : null}
                </ul>
                {consented ? null : (
                  <Text role="alert" className={s.blocked} block>
                    了承の記録がないため、続行できません。送信も出力もしません。設定画面で了承の記録を入力してください。
                  </Text>
                )}
                <Text size={200} className={s.hint} block>{CONSENT_SELF_DECLARED_NOTICE}</Text>
              </>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={() => answer('cancel')}>中止</Button>
            <Button appearance="primary" disabled={!consented} onClick={() => answer('proceed')}>続行</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

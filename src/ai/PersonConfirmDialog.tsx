// 種別「人」を含む顧客パックの外部送信・エクスポート前の確認の画面（FR-219）。共通の Dialog を使う。
// 件数・範囲だけを出し、個人名・連絡先の値は出さない。
import { Button, DialogActions, DialogBody, DialogContent, DialogTitle, makeStyles, tokens } from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import { DESTINATION_LABELS, usePersonConfirmUi } from './personConfirm';
import { useT } from '../i18n';

const useStyles = makeStyles({
  list: { display: 'flex', flexDirection: 'column', rowGap: tokens.spacingVerticalS, margin: 0, paddingLeft: tokens.spacingHorizontalXL },
});

export function PersonConfirmDialog() {
  const t = useT();
  const s = useStyles();
  const request = usePersonConfirmUi((u) => u.request);
  const answer = usePersonConfirmUi((u) => u.answer);
  return (
    <Dialog open={!!request} modalType="alert" onOpenChange={(_, d) => { if (!d.open) answer('cancel'); }}>
      <DialogSurface aria-label={t('種別「人」を含む顧客パックの確認')}>
        <DialogBody>
          <DialogTitle>{t('種別「人」を含む顧客パックの確認')}</DialogTitle>
          <DialogContent>
            {request ? (
              <>
                <ul className={s.list}>
                  <li>{t('送る・出力する先:')} {t(DESTINATION_LABELS[request.destination])}</li>
                  <li>{t('範囲:')} {t(request.scopeLabel)}</li>
                  <li>{t('種別「人」のエンティティ: {n} 件（個人名・連絡先の値は、この確認には表示しません）', { n: request.personCount })}</li>
                  {request.destination === 'export' ? <li>{t('種別「人」の値は機密区分を持たないため、匿名化の対象ではありません。そのまま出力されます。')}</li> : null}
                </ul>
              </>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={() => answer('cancel')}>{t('中止')}</Button>
            <Button appearance="primary" onClick={() => answer('proceed')}>{t('続行')}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

// 企業・Project の画面（ProjectsPanel と、メイン画面 MainScreen）が共有する dialog（FR-137・FR-138・FR-144・FR-186・FR-187）。
import { useState } from 'react';
import {
  Button, DialogActions, DialogBody, DialogContent, DialogTitle, Field, Input, MessageBar, MessageBarBody,
} from '@fluentui/react-components';
import { Dialog, DialogSurface } from '../components/Dialog';
import type { Result } from '../store/projects';

/** 1 項目の名前を入力する dialog（登録・作成・名称変更で共通）。不正な入力は原因を示し、入力済みの内容を残す（AC-397） */
export function NameDialog(props: { title: string; label: string; submit: string; initial?: string; hint?: string; placeholder?: string; help?: string; onSubmit: (name: string) => Result; onClose: () => void }) {
  const [name, setName] = useState(props.initial ?? '');
  const [error, setError] = useState<string | null>(null);
  const go = () => {
    const r = props.onSubmit(name);
    if (r.ok) props.onClose();
    else setError(r.reason);
  };
  return (
    <Dialog open modalType="modal" onOpenChange={(_, d) => { if (!d.open) props.onClose(); }}>
      <DialogSurface aria-label={props.title}>
        <DialogBody>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogContent>
            {props.hint ? <p>{props.hint}</p> : null}
            <Field label={props.label} hint={props.help}>
              <Input placeholder={props.placeholder} value={name} onChange={(_, d) => setName(d.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} autoFocus />
            </Field>
            {error ? <MessageBar intent="error" role="alert"><MessageBarBody>{error}</MessageBarBody></MessageBar> : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={props.onClose}>キャンセル</Button>
            <Button appearance="primary" onClick={go}>{props.submit}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** 未保存の入力があるときの、移動前の確認（FR-138 AC-210・FR-144 AC-231・FR-187 AC-400） */
export function UnsavedDialog(props: { message?: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Dialog open modalType="alert" onOpenChange={(_, d) => { if (!d.open) props.onCancel(); }}>
      <DialogSurface role="alertdialog" aria-label="未保存の入力があります">
        <DialogBody>
          <DialogTitle>未保存の入力があります</DialogTitle>
          <DialogContent>{props.message ?? '確定していない入力は、この Project に残したまま切り替えます。切り替えますか？'}</DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={props.onCancel}>キャンセル</Button>
            <Button appearance="primary" onClick={props.onConfirm}>切り替える</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

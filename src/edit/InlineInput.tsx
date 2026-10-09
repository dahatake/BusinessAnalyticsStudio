// その場で編集する入力欄（FR-044・FR-046）。Enter で確定、Esc で取り消し。確定できない入力（数値の欄に文字など）は、保存せずに理由を出す。
import { useEffect, useRef, useState } from 'react';
import { Field, Input } from '@fluentui/react-components';

export interface InlineInputProps {
  initial: string;
  /** 入力欄の名前（読み上げ・操作の対象の説明） */
  label: string;
  /** 確定する。保存できないときは理由（文字列）を返す。保存できたら undefined */
  onSubmit: (text: string) => string | undefined;
  onClose: () => void;
  /** 数値の欄のとき、モバイルの入力を数字のキーボードにする */
  numeric?: boolean;
}

export function InlineInput({ initial, label, onSubmit, onClose, numeric }: InlineInputProps) {
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (): void => { done.current = true; onClose(); };
  const submit = (): void => {
    const msg = onSubmit(text);
    if (msg) setError(msg);
    else finish();
  };

  return (
    <Field validationState={error ? 'error' : 'none'} validationMessage={error} size="small">
      <Input
        ref={ref}
        size="small"
        value={text}
        aria-label={label}
        inputMode={numeric ? 'decimal' : undefined}
        onChange={(_, d) => { setText(d.value); if (error) setError(undefined); }}
        onClick={(e) => { e.stopPropagation(); }}
        onDoubleClick={(e) => { e.stopPropagation(); }}
        onKeyDown={(e) => {
          // 行や画面のキー操作（選択・非表示など）に渡さない
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          else if (e.key === 'Escape') { e.preventDefault(); finish(); }
        }}
        onBlur={() => {
          // フォーカスが外れたら、保存できる入力は保存し、保存できない入力は取り消す
          if (done.current) return;
          done.current = true;
          if (text !== initial) onSubmit(text);
          onClose();
        }}
      />
    </Field>
  );
}

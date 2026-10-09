// 択一の選択肢（NFR-A11Y-001 AC-170）。Fluent の RadioGroup / Radio と同じ使い方で、次の 2 点を足す。
//  1. すべての選択肢に Tab で到達できる（既定のラジオは同じグループのうち 1 つにしか Tab が止まらない）。
//     選択肢ごとに別の name を付け、グループの中の矢印キー（← → ↑ ↓、Home、End）は、このグループが受けて移す。
//  2. 矢印キーで選択を移すと、フォーカスも移る（スクリーンリーダーが選択を読み上げる）。
import {
  Radio as FluentRadio,
  RadioGroup as FluentRadioGroup,
  useId,
  type RadioGroupProps,
  type RadioProps,
} from '@fluentui/react-components';
import { forwardRef, type KeyboardEvent } from 'react';
import { rovingTarget } from './roving';

/** 択一のグループ。矢印キーで、フォーカスと選択を前後の選択肢へ移す（先頭・末尾は回り込む）。 */
export const RadioGroup = forwardRef<HTMLDivElement, RadioGroupProps>(function RadioGroup({ onKeyDown, ...rest }, ref) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    (onKeyDown as ((ev: KeyboardEvent<HTMLDivElement>) => void) | undefined)?.(e);
    if (e.defaultPrevented) return;
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const target = e.target as HTMLElement;
    if (!(target instanceof HTMLInputElement) || target.type !== 'radio') return;
    const radios = [...e.currentTarget.querySelectorAll<HTMLInputElement>('input[type="radio"]:not(:disabled)')];
    const at = radios.indexOf(target);
    if (at < 0 || radios.length < 2) return;
    const next = rovingTarget(e.key, at, radios.length);
    const nextRadio = next === null ? undefined : radios[next];
    if (!nextRadio) return;
    e.preventDefault();
    nextRadio.focus();
    nextRadio.click();
  };
  return <FluentRadioGroup {...rest} ref={ref} onKeyDown={handleKeyDown} />;
});

/** 択一の選択肢 1 つ。name を選択肢ごとに分けて、Tab でどれにも止まれるようにする。 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(props, ref) {
  const name = useId('choice-');
  return <FluentRadio {...props} ref={ref} name={props.name ?? name} />;
});

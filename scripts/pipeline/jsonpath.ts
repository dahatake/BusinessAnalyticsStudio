// 検証エラーの位置（例: `issues[2].parentId`）で JSON の一部を読み書きする（FR-126）。
export type Segment = string | number;

/** `issues[2].parentId` → ['issues', 2, 'parentId']。空の文字列は [] */
export function parsePath(p: string): Segment[] {
  const out: Segment[] = [];
  for (const m of p.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) out.push(m[2] !== undefined ? Number(m[2]) : m[1]!);
  return out;
}

export function getAt(root: unknown, segs: readonly Segment[]): unknown {
  let cur: unknown = root;
  for (const s of segs) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[s];
  }
  return cur;
}

/** `segs` の位置を `value` に置き換えた新しい値を返す（元の値は変えない）。途中がなければ作らず、置けなかったら undefined */
export function setAt(root: unknown, segs: readonly Segment[], value: unknown): unknown | undefined {
  if (segs.length === 0) return value;
  if (root === null || typeof root !== 'object') return undefined;
  const [head, ...rest] = segs as [Segment, ...Segment[]];
  const container = root as Record<string | number, unknown>;
  const child = rest.length === 0 ? value : setAt(container[head], rest, value);
  if (child === undefined && rest.length > 0) return undefined;
  if (Array.isArray(root)) {
    const copy = [...root];
    copy[head as number] = child;
    return copy;
  }
  return { ...container, [head]: child };
}

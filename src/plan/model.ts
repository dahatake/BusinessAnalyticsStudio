// Feature ごとの工程（FR-007）の純粋なロジック。画面の部品を参照しない。
// 工程（いつ・誰が・何を）を、Feature ごとにまとめ、ガントチャートの位置（割合）に変える。
import { tr } from '../i18n';
import type { PackData } from '../schema';

export type Feature = PackData['plan']['features'][number];
export type Task = PackData['plan']['tasks'][number];

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` を UTC の日数にする。形式が正しくない・存在しない日付は undefined */
export function parseDay(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return undefined;
  return Math.round(t / DAY_MS);
}

export interface GanttTask {
  task: Task;
  /** 開始・終了のどちらかが無い／不正なときは undefined（バーを描けない） */
  startDay?: number;
  endDay?: number;
  /** 期間全体に対する位置と幅（%） */
  leftPct: number;
  widthPct: number;
}

export interface GanttGroup {
  feature: Feature;
  tasks: GanttTask[];
}

export interface GanttMonth { label: string; leftPct: number }

export interface GanttModel {
  startDay: number;
  endDay: number;
  months: GanttMonth[];
  groups: GanttGroup[];
  /** どの Feature にも属さない（または存在しない Feature を指す）工程 */
  orphans: GanttTask[];
}

function byStart(a: GanttTask, b: GanttTask): number {
  return (a.startDay ?? Number.MAX_SAFE_INTEGER) - (b.startDay ?? Number.MAX_SAFE_INTEGER);
}

/** 全工程の最小の開始日から最大の終了日までを期間にして、Feature ごとの工程を並べる */
export function buildGantt(features: readonly Feature[], tasks: readonly Task[]): GanttModel {
  const days = tasks.flatMap((t) => [parseDay(t.start), parseDay(t.end)]).filter((d): d is number => d !== undefined);
  const hasRange = days.length > 0;
  const startDay = hasRange ? Math.min(...days) : 0;
  const endDay = hasRange ? Math.max(...days) : 1;
  const span = Math.max(1, endDay - startDay + 1);

  const place = (task: Task): GanttTask => {
    const s = parseDay(task.start);
    const e = parseDay(task.end);
    if (s === undefined || e === undefined) return { task, leftPct: 0, widthPct: 0 };
    const lo = Math.min(s, e);
    const hi = Math.max(s, e);
    return {
      task, startDay: lo, endDay: hi,
      leftPct: ((lo - startDay) / span) * 100,
      widthPct: Math.max(1.5, ((hi - lo + 1) / span) * 100),
    };
  };

  const featureIds = new Set(features.map((f) => f.id));
  const groups = features.map((feature) => ({
    feature,
    tasks: tasks.filter((t) => t.featureId === feature.id).map(place).sort(byStart),
  }));
  const orphans = tasks.filter((t) => !t.featureId || !featureIds.has(t.featureId)).map(place).sort(byStart);

  const months: GanttMonth[] = [];
  if (hasRange) {
    const first = new Date(startDay * DAY_MS);
    let y = first.getUTCFullYear();
    let m = first.getUTCMonth();
    for (let guard = 0; guard < 240; guard++) {
      const day = Math.round(Date.UTC(y, m, 1) / DAY_MS);
      if (day > endDay) break;
      months.push({ label: tr('{y}年{m}月', { y, m: m + 1 }), leftPct: Math.max(0, ((day - startDay) / span) * 100) });
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
  }
  return { startDay, endDay, months, groups, orphans };
}

/** 工程の期間を「開始日 〜 終了日」の文字列にする。日付が無ければ「日付なし」 */
export function formatPeriod(task: Task): string {
  return task.start && task.end ? `${task.start} 〜 ${task.end}` : tr('日付なし');
}

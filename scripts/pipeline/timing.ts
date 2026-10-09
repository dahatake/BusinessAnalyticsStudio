// 工程ごとの時間計測とコマンドの記録（FR-129、FR-124 の確認に使う）。
// `logs/timing.json` に工程ごとの開始・終了時刻（タイムゾーン付き）と所要時間、合計を書く。
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { STAGES, isoLocal, type Command, type StageId } from './common';

export interface StageTiming {
  id: StageId;
  step: string;
  name: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  ok: boolean;
  [extra: string]: unknown;
}

export interface CommandRecord {
  at: string;
  command: string;
}

export class Recorder {
  readonly stages: StageTiming[] = [];
  readonly commands: CommandRecord[] = [];
  private readonly startedAt: string;

  constructor(
    readonly logsDir: string,
    private readonly command: Command,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.startedAt = isoLocal(this.now());
  }

  /** 外部に対して実行したコマンド（ファイルの複製、サーバーの起動など）を記録する */
  recordCommand(text: string): void {
    this.commands.push({ at: isoLocal(this.now()), command: text });
  }

  /** 工程を実行して所要時間を記録する。`fn` が返すオブジェクトは、その工程の記録に足す。失敗しても記録して再送出する */
  async stage(id: StageId, fn: () => Promise<Record<string, unknown> | void>): Promise<void> {
    const meta = STAGES.find((s) => s.id === id)!;
    const t0 = performance.now();
    const start = this.now();
    let extra: Record<string, unknown> | void = undefined;
    let ok = false;
    try {
      extra = await fn();
      ok = true;
    } finally {
      const durationMs = Math.round((performance.now() - t0) * 10) / 10;
      this.stages.push({
        id, step: meta.step, name: meta.name,
        startedAt: isoLocal(start), finishedAt: isoLocal(this.now()), durationMs, ok,
        ...(extra ?? {}),
      });
    }
  }

  /** 合計（各工程の所要時間の和） */
  get totalMs(): number {
    return Math.round(this.stages.reduce((s, x) => s + x.durationMs, 0) * 10) / 10;
  }

  write(): { timing: string; commands: string } {
    fs.mkdirSync(this.logsDir, { recursive: true });
    const timing = path.join(this.logsDir, 'timing.json');
    const commands = path.join(this.logsDir, 'commands.json');
    fs.writeFileSync(timing, JSON.stringify({
      command: this.command, startedAt: this.startedAt, finishedAt: isoLocal(this.now()),
      totalMs: this.totalMs, stages: this.stages,
    }, null, 2) + '\n', 'utf8');
    fs.writeFileSync(commands, JSON.stringify(this.commands, null, 2) + '\n', 'utf8');
    return { timing, commands };
  }

  /** 画面に出す要約（工程ごとの所要時間と合計） */
  summary(): string[] {
    return [
      ...this.stages.map((s) => `${s.step} ${s.name}: ${(s.durationMs / 1000).toFixed(2)} 秒${s.ok ? '' : '（失敗）'}`),
      `合計: ${(this.totalMs / 1000).toFixed(2)} 秒`,
    ];
  }
}

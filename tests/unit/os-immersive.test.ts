// @vitest-environment jsdom
// FR-299 OS の操作慣習・キー、FR-300 没入（素材・Focus）の単体・結合テスト。
// 要求 ID と AC ID は各テスト名に書く（AC-812 は単体、AC-813 は静的検査＋キーの重複の検査の結合）。
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ZONE_CHORDS, chordLabel, detectOs, isLetterChord, matchZoneOp, modifierLabel, resolveOs, type OsEnv, type ZoneOp,
} from '../../src/workspace/os';
import { useOsPref, getOs } from '../../src/store/osConvention';
import { useImmersion } from '../../src/store/immersion';
import { useTaskWorkspaces, activeWorkspace } from '../../src/store/taskWorkspaces';
import { bootImmersion, shownZones, stepZone, toggleFocus } from '../../src/workspace/immersive';
import { DEFAULT_RATIOS, ZONE_NAMES, implicitRoles, zoneLayout } from '../../src/workspace/zones';
import { FRAME_OPACITY, parseColor, withOpacity } from '../../src/theme/frameMaterial';
import { STATIC_SHORTCUTS } from '../../src/commands/registry';

const ev = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) =>
  ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

describe('FR-299 AC-812 OS の判別', () => {
  const win: OsEnv = { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
  const mac: OsEnv = { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };
  const linux: OsEnv = { platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' };

  // FR-299 AC-812
  it('FR-299 AC-812 Windows・macOS・判別不能（Linux など）の環境は、それぞれ Windows・macOS・Windows（既定）の慣習に分類される', () => {
    expect(detectOs(win)).toBe('windows');
    expect(detectOs(mac)).toBe('mac');
    expect(detectOs(linux)).toBe('windows');
    expect(detectOs({})).toBe('windows');
    expect(detectOs({ uaPlatform: 'macOS' })).toBe('mac');
    expect(detectOs({ uaPlatform: 'Windows' })).toBe('windows');
    // platform がないときは userAgent で補う。iPhone などのモバイルは macOS の慣習にしない
    expect(detectOs({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toBe('mac');
    expect(detectOs({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile' })).toBe('windows');
  });

  // FR-299 AC-812
  it('FR-299 AC-812 上書き設定があるときは、環境にかかわらず設定が優先され、「自動」は判別に従う', () => {
    expect(resolveOs('mac', win)).toBe('mac');
    expect(resolveOs('windows', mac)).toBe('windows');
    expect(resolveOs('auto', mac)).toBe('mac');
    expect(resolveOs('auto', linux)).toBe('windows');
  });

  // FR-299 AC-812（設定の保存先）
  it('FR-299 AC-812 設定ストアの上書きが現在の慣習に反映され、「自動」に戻せる', () => {
    useOsPref.getState().setPref('mac');
    expect(getOs()).toBe('mac');
    useOsPref.getState().setPref('windows');
    expect(getOs()).toBe('windows');
    useOsPref.getState().setPref('auto');
    expect(['windows', 'mac']).toContain(getOs());
  });
});

describe('FR-299 AC-811 キーの表記と押下の判定', () => {
  // FR-299 AC-811
  it('FR-299 AC-811 Windows は「Ctrl+Alt+→」、macOS は「⌃⌥→」で、操作の名前に関わらず同じキーを指す', () => {
    expect(chordLabel('windows', 'move')).toBe('Ctrl+Alt+→');
    expect(chordLabel('mac', 'move')).toBe('⌃⌥→');
    expect(chordLabel('windows', 'focus')).toBe('Ctrl+Alt+Enter');
    expect(chordLabel('mac', 'focus')).toBe('⌃⌥Enter');
    expect(modifierLabel('windows')).toBe('Ctrl+Alt+');
    expect(modifierLabel('mac')).toBe('⌃⌥');
  });

  // FR-299 AC-810・AC-811
  it('FR-299 AC-810 AC-811 Ctrl+Alt と物理キーだけで 5 つの操作と Focus が決まり、Shift・⌘ を加えると反応しない', () => {
    const map: Array<[string, ZoneOp]> = [['ArrowRight', 'move'], ['ArrowLeft', 'moveBack'], ['ArrowDown', 'snap'], ['ArrowUp', 'expand'], ['KeyG', 'group'], ['KeyW', 'switch'], ['Enter', 'focus']];
    for (const [code, op] of map) expect(matchZoneOp(ev(code, { ctrlKey: true, altKey: true }))).toBe(op);
    expect(matchZoneOp(ev('ArrowRight', { ctrlKey: true }))).toBeNull();
    expect(matchZoneOp(ev('ArrowRight', { altKey: true }))).toBeNull();
    expect(matchZoneOp(ev('ArrowRight', { ctrlKey: true, altKey: true, shiftKey: true }))).toBeNull();
    expect(matchZoneOp(ev('ArrowRight', { ctrlKey: true, altKey: true, metaKey: true }))).toBeNull();
    expect(matchZoneOp(ev('Escape', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(isLetterChord('group')).toBe(true);
    expect(isLetterChord('move')).toBe(false);
  });
});

describe('FR-299 AC-813 予約キーを割り当てず、既存のキーと重ならない（静的検査＋キーの重複の検査）', () => {
  const src = path.resolve(__dirname, '..', '..', 'src');
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) files.push(p);
    }
  };
  walk(src);

  // FR-299 AC-813
  it('FR-299 AC-813 Win キー・⌘ + 方向キーの割り当てが、ソースの実行する行に 1 つもない', () => {
    expect(files.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const f of files) {
      fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
        if (/(metaKey|'Meta'|"Meta"|\bOS\b|'Win'|⌘)/.test(l) && /Arrow(Left|Right|Up|Down)/.test(l)) bad.push(`${path.relative(src, f)}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  // FR-299 AC-813
  it('FR-299 AC-813 割り当てたキー（Ctrl+Alt+…）は互いに重ならず、既存のキー（Shift+F・H・Esc・Ctrl+K）と重ならない', () => {
    const ops = Object.keys(ZONE_CHORDS) as ZoneOp[];
    for (const os of ['windows', 'mac'] as const) {
      const labels = ops.map((o) => chordLabel(os, o));
      expect(new Set(labels).size, `${os}: 割り当てが重なる`).toBe(labels.length);
      const codes = ops.map((o) => ZONE_CHORDS[o].code);
      expect(new Set(codes).size).toBe(codes.length);
    }
    const existing = new Set(['Shift+F', 'H', 'Esc', 'Ctrl+K', '⌘K', ...STATIC_SHORTCUTS.map((s) => s.shortcut)]);
    for (const o of ops) {
      expect(existing.has(chordLabel('windows', o)), `既存のキーと重なる: ${o}`).toBe(false);
      expect(existing.has(chordLabel('mac', o)), `既存のキーと重なる（mac）: ${o}`).toBe(false);
    }
    // 修飾キーは Ctrl+Alt だけ（Win・⌘ ではない）
    expect(modifierLabel('windows')).not.toMatch(/Win|Meta|⌘/);
    expect(modifierLabel('mac')).not.toMatch(/⌘/);
  });
});

describe('FR-300 AC-816 Focus の切替と直前の配置への復帰', () => {
  beforeEach(() => {
    bootImmersion();
    useImmersion.setState({ before: {}, recalled: [], selectedKey: null });
    const st = useTaskWorkspaces.getState();
    st.setMode('research');
  });

  // FR-300 AC-816
  it('FR-300 AC-816 Focus にすると Main 以外が減光・縮小され、解除（キー・別モード）すると直前のモードの配置に戻る', () => {
    const st = useTaskWorkspaces.getState();
    st.setMode('compare');
    const compare = zoneLayout('compare', activeWorkspace(useTaskWorkspaces.getState()).ratios);
    expect(toggleFocus()).toBe('entered');
    expect(activeWorkspace(useTaskWorkspaces.getState()).mode).toBe('focus');
    const f = zoneLayout('focus', DEFAULT_RATIOS);
    expect(f.main.dimmed).toBe(false);
    for (const n of ['reference', 'communication'] as const) {
      expect(f[n].dimmed, `${n} が減光されない`).toBe(true);
      expect(f[n].rect!.w, `${n} が縮小されない`).toBeLessThan(zoneLayout('research', DEFAULT_RATIOS)[n].rect!.w);
    }
    expect(toggleFocus()).toBe('left');
    expect(activeWorkspace(useTaskWorkspaces.getState()).mode).toBe('compare');
    expect(zoneLayout('compare', DEFAULT_RATIOS).main.rect).toEqual(compare.main.rect);
    // 別のモードの選択でも解除でき、そのとき呼び出したゾーンは戻る
    toggleFocus();
    useImmersion.getState().toggleRecall('reference');
    useTaskWorkspaces.getState().setMode('meeting');
    expect(useImmersion.getState().recalled).toEqual([]);
  });

  // FR-300 AC-816（異常系: Focus に入る前の記録がなければ既定のモードへ）
  it('FR-300 AC-816 異常系: 入る前のモードの記録がなくても、解除は既定のモード（Research）へ戻る', () => {
    useTaskWorkspaces.getState().setMode('focus');
    useImmersion.setState({ before: {} });
    expect(toggleFocus()).toBe('left');
    expect(activeWorkspace(useTaskWorkspaces.getState()).mode).toBe('research');
  });

  // FR-300 AC-816
  it('FR-300 AC-816 呼び出したゾーンは、割合どおりの大きさで出て、減光されず、情報（ゾーン）は欠けない', () => {
    const l = zoneLayout('focus', DEFAULT_RATIOS, [], ['reference']);
    expect(l.reference.dimmed).toBe(false);
    expect(l.reference.rect!.w).toBeGreaterThan(zoneLayout('focus', DEFAULT_RATIOS).reference.rect!.w);
    expect(ZONE_NAMES.filter((n) => l[n].rect)).toEqual(['main', 'reference', 'communication']);
    const total = ZONE_NAMES.reduce((s, n) => s + (l[n].rect?.w ?? 0), 0);
    expect(total).toBeCloseTo(1, 6);
  });
});

describe('FR-299 AC-810 ゾーン間の移動（Move）と、モードによる既定の置き先', () => {
  // FR-299 AC-810
  it('FR-299 AC-810 Move は出しているゾーンを順に回り、2 つ未満なら動かない（逆向きは前のゾーン）', () => {
    const r = zoneLayout('research', DEFAULT_RATIOS);
    expect(shownZones(r)).toEqual(['main', 'reference', 'communication']);
    expect(stepZone(r, 'main', 1)).toBe('reference');
    expect(stepZone(r, 'communication', 1)).toBe('main');
    expect(stepZone(r, 'main', -1)).toBe('communication');
    expect(stepZone(r, undefined, 1)).toBe('reference');
    const merged = zoneLayout('research', DEFAULT_RATIOS, ['reference', 'communication']);
    expect(shownZones(merged)).toEqual(['main', 'reference']);
    expect(stepZone(merged, 'communication', 1)).toBe('main');
    const one = zoneLayout('research', { main: 98, reference: 1, communication: 1 }, ['main', 'reference', 'communication']);
    expect(stepZone(one, 'main', 1)).toBeNull();
  });

  // FR-300 AC-815
  it('FR-300 AC-815 ロールのないコンポーネントも、モードの構成で出しているゾーンへ置かれる（主役はいちばん広いゾーン）', () => {
    const l = zoneLayout('focus', DEFAULT_RATIOS);
    const roles = implicitRoles(l, ['a', 'b', 'c', 'd'], (k) => (k === 'a' ? 'primary' : 'supporting'), { d: 'communication' });
    expect(roles.a).toBe('main');
    expect(['reference', 'communication']).toContain(roles.b);
    expect(roles.d).toBeUndefined(); // 明示のロールは触らない
    for (const z of Object.values(roles)) expect(l[z].rect).not.toBeNull();
    const monitor = zoneLayout('monitor', DEFAULT_RATIOS);
    expect(implicitRoles(monitor, ['p'], () => 'primary', {}).p).toBe('monitor');
    expect(implicitRoles(zoneLayout('research', DEFAULT_RATIOS, ['main', 'reference', 'communication']), ['x', 'y'], () => 'supporting', {})).toEqual({ x: 'main', y: 'main' });
  });
});

describe('FR-300 AC-814 枠の面の素材', () => {
  // FR-300 AC-814（PARAM-141 = 80%）
  it('FR-300 AC-814 枠の面の不透明度は 80% 以上 100% 未満で、色は解決済みの値から rgba にする', () => {
    expect(FRAME_OPACITY).toBeGreaterThanOrEqual(0.8);
    expect(FRAME_OPACITY).toBeLessThan(1);
    expect(parseColor('#f5f5f5')).toEqual([245, 245, 245]);
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
    expect(parseColor('rgb(41, 41, 41)')).toEqual([41, 41, 41]);
    expect(parseColor('rgba(41 41 41 / 0.5)')).toEqual([41, 41, 41]);
    expect(parseColor('color(srgb 1 1 1)')).toBeNull();
    expect(withOpacity([245, 245, 245], FRAME_OPACITY)).toBe(`rgba(245, 245, 245, ${FRAME_OPACITY})`);
  });
});

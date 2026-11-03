import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  cleanup, isWin, makeSandbox, repoRoot, runScript, startReal,
} from '../system/launch/support.mjs';

// Windows CI exercises both the cmd -> PowerShell entry point and the POSIX
// launcher using Git Bash. POSIX hosts exercise the same sh used by Mac/Linux.
const bash = isWin
  ? path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe')
  : 'bash';
const launchers = isWin ? ['start.cmd', 'start.ps1', 'start.sh'] : ['start.sh'];

function runLauncher(script, sb, fail = []) {
  if (script === (isWin ? 'start.cmd' : 'start.sh')) return runScript(sb, { fail });
  if (script === 'start.sh') {
    // The shared sandbox creates a .cmd shim on Windows; supply its POSIX
    // equivalent without changing the read-only System Test helper.
    fs.writeFileSync(path.join(sb.bin, 'npm'),
      `#!/bin/sh\nexec "${process.execPath.replaceAll('\\', '/')}" "$(dirname "$0")/shim.mjs" "$@"\n`);
  }
  const env = {
    ...process.env,
    PATH: sb.bin + path.delimiter + process.env.PATH,
    FAKE_NPM_LOG: sb.log,
    FAKE_NPM_FAIL: fail.join(','),
  };
  const result = spawnSync(script === 'start.sh' ? bash : 'powershell.exe',
    script === 'start.sh' ? [script] : ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
    { cwd: sb.dir, env, input: '\n', encoding: 'utf8', timeout: 120_000 });
  return {
    status: result.status,
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    calls: fs.existsSync(sb.log) ? fs.readFileSync(sb.log, 'utf8').split(/\r?\n/).filter(Boolean) : [],
    error: result.error,
  };
}

for (const script of launchers) {
  describe(`FR-141 ${script}`, () => {
    test.each([true, false])('AC-220 builds before start with installed dependencies (dist=%s), including relaunch', (dist) => {
      const sb = makeSandbox({ nodeModules: true, dist });
      try {
        for (const source of ['first source', 'changed source']) {
          fs.writeFileSync(path.join(sb.dir, 'source.txt'), source);
          // A stale artifact must be replaced when dist already exists;
          // leave it absent for the first run of the dist=false case.
          if (fs.existsSync(path.join(sb.dir, 'dist'))) {
            fs.writeFileSync(path.join(sb.dir, 'dist/index.html'), 'STALE');
          }
          fs.rmSync(sb.log, { force: true });
          const result = runLauncher(script, sb);
          expect(result.error).toBeUndefined();
          expect(result.status, result.output).toBe(0);
          expect(result.calls).toEqual(['run build', 'start']);
          expect(result.output).toMatch(/http:\/\/127\.0\.0\.1:\d+/);
          expect(fs.readFileSync(path.join(sb.dir, 'dist/index.html'), 'utf8')).not.toBe('STALE');
        }
      } finally { cleanup(sb); }
    });

    test.each([true, false])('AC-221 installs then builds then starts (dist=%s)', (dist) => {
      const sb = makeSandbox({ nodeModules: false, dist });
      try {
        const result = runLauncher(script, sb);
        expect(result.error).toBeUndefined();
        expect(result.status, result.output).toBe(0);
        expect(result.calls).toEqual(['install', 'run build', 'start']);
      } finally { cleanup(sb); }
    });

    test.each([
      ['install', false, false, ['install']],
      ['install', false, true, ['install']],
      ['build', true, false, ['run build']],
      ['build', true, true, ['run build']],
      ['build', false, true, ['install', 'run build']],
    ])('AC-221 stops on %s failure (dependencies=%s dist=%s)', (failure, nodeModules, dist, calls) => {
      const sb = makeSandbox({ nodeModules, dist });
      try {
        const result = runLauncher(script, sb, [failure]);
        expect(result.error).toBeUndefined();
        expect(result.status, result.output).not.toBeNull();
        expect(result.status, result.output).not.toBe(0);
        expect(result.calls).toEqual(calls);
        expect(result.output).toContain(`FAKE-CAUSE-${failure.toUpperCase()}`);
      } finally { cleanup(sb); }
    });
  });
}

test('FR-141 AC-220 real launcher builds before start and serves the built app on 127.0.0.1', async () => {
  const app = await startReal();
  try {
    expect(app.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/?/);
    const output = app.output();
    expect(output).toContain('npm run build');
    expect(output.indexOf('npm run build')).toBeLessThan(output.indexOf('npm start'));
    expect(output).toMatch(/vite v[\d.]+ building/);
    const response = await fetch(app.url);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toBe(fs.readFileSync(path.join(repoRoot, 'dist/index.html'), 'utf8'));
    const asset = html.match(/src="([^"]+\.js)"/)?.[1];
    expect(asset).toBeTruthy();
    const js = await fetch(new URL(asset, app.url));
    expect(js.status).toBe(200);
    expect(await js.text()).toBe(fs.readFileSync(path.join(repoRoot, 'dist', asset.replace(/^\//, '')), 'utf8'));
  } finally { app.stop(); }
});

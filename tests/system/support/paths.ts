import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** tests/system */
export const SYSTEM_DIR = path.resolve(here, '..');
/** リポジトリのルート */
export const REPO_ROOT = path.resolve(SYSTEM_DIR, '..', '..');
/** お手本パック（FR-118 の `examples/`。CONTRACT.md §3） */
export const EXAMPLES_DIR = path.join(REPO_ROOT, 'examples');
/** 証跡の保存先（work/runs/<run-id>/evidence。RUN_ID が無いときは work/system-test/evidence） */
export const EVIDENCE_DIR = process.env.RUN_ID
  ? path.join(REPO_ROOT, 'work', 'runs', process.env.RUN_ID, 'evidence')
  : path.join(REPO_ROOT, 'work', 'system-test', 'evidence');
/** 一時ファイル（変種のパックなど） */
export const TMP_DIR = process.env.RUN_ID
  ? path.join(REPO_ROOT, 'work', 'runs', process.env.RUN_ID, 'tmp', 'system-test')
  : path.join(REPO_ROOT, 'work', 'system-test', 'tmp');

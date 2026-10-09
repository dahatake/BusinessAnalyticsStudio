// zod スキーマから `schema/*.json`（JSON Schema）を生成する。`--check` では生成せず、差分があれば失敗する。
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { BrandProfileSchema, DATA_SCHEMAS } from '../src/schema';
import { REPO_ROOT } from './lib/pack-fs';

export function buildJsonSchemas(): Record<string, string> {
  const all: Record<string, z.ZodType> = { ...DATA_SCHEMAS, 'brand-profile': BrandProfileSchema };
  const out: Record<string, string> = {};
  for (const [name, schema] of Object.entries(all)) {
    out[`${name}.json`] = JSON.stringify(z.toJSONSchema(schema, { io: 'input' }), null, 2) + '\n';
  }
  return out;
}

if (process.argv[1] && /gen-schema\.ts$/.test(process.argv[1])) {
  const dir = path.join(REPO_ROOT, 'schema');
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [file, text] of Object.entries(buildJsonSchemas())) {
    const target = path.join(dir, file);
    if (check) {
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8').replaceAll('\r\n', '\n') !== text) { console.error(`古い: schema/${file}`); stale++; }
    } else {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(target, text);
    }
  }
  if (stale) process.exit(1);
}

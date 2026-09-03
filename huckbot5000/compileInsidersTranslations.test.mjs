import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileHuckbotInsiders } from './compileInsidersTranslations.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('compileHuckbotInsiders writes a plugin.manifest.json', () => {
  const tmp = fs.mkdtempSync(path.join(__dirname, 'tmp-insiders-'));
  const include = path.join(tmp, 'insiders-include.ndjson');
  fs.writeFileSync(
    include,
    `${JSON.stringify({
      zh: '太守',
      gloss: 'Governor',
      dynasty: '漢',
      officeIds: ['cbdb:office:1'],
      collisionFlag: 'ocr',
    })}\n`,
  );
  const outDir = path.join(tmp, 'pack');
  const result = compileHuckbotInsiders({ inputPath: include, outDir });
  assert.equal(result.count, 1);
  const plugin = JSON.parse(fs.readFileSync(path.join(outDir, 'plugin.manifest.json'), 'utf8'));
  assert.equal(plugin.id, 'huckbot5000-insiders');
  assert.equal(plugin.contributions.authorityPacks[0].id, 'huckbot5000-insiders');
  assert.ok(fs.existsSync(path.join(outDir, 'manifest.json')));
  assert.ok(fs.existsSync(path.join(outDir, 'dist/register.mjs')));
  fs.rmSync(tmp, { recursive: true, force: true });
});

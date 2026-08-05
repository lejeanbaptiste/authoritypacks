#!/usr/bin/env node
/**
 * Build purge-orders.ndjson from a previous vs next Norbert concordance.
 *
 *   node scripts/build-purge-orders.mjs \
 *     --previous packs/norbert/norbert-concordance.prev.ndjson \
 *     --next packs/norbert/norbert-concordance.ndjson \
 *     --out packs/purge-orders/purge-orders.ndjson \
 *     --bundle-version 0.1.0
 *
 * Without --previous, emits a single pack-note that new links are present
 * (useful for first ship). Reviewed CSV link rows can also be passed via
 * --review-csv to annotate the note.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readNdjson } from '../shared/ndjson.mjs';
import {
  makePurgeOrder,
  purgeOrdersFromConcordanceDiff,
  serializePurgeOrders,
} from '../shared/purgeOrders.mjs';

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
}

const previousPath = arg('--previous');
const nextPath = arg('--next');
const outPath = arg('--out', 'packs/purge-orders/purge-orders.ndjson');
const bundleVersion = arg('--bundle-version', '');
const notePrefix = arg('--note-prefix', 'Authority pack update:');

if (!nextPath) {
  console.error(
    'Usage: node scripts/build-purge-orders.mjs --next CONCORDANCE.ndjson [--previous PREV.ndjson] --out FILE',
  );
  process.exit(1);
}

const next = readNdjson(nextPath);
const previous = previousPath && fs.existsSync(previousPath) ? readNdjson(previousPath) : [];

/** @type {import('../shared/purgeOrders.mjs').PurgeOrder[]} */
let orders;
if (!previous.length) {
  orders = [
    makePurgeOrder({
      kind: 'pack-note',
      bundleVersion: bundleVersion || undefined,
      note: `${notePrefix} New person concordance with ${next.length} accepted links. No prior concordance was shipped for diffing; review new crosswalks in the packs as needed.`,
    }),
  ];
} else {
  orders = purgeOrdersFromConcordanceDiff(previous, next, {
    bundleVersion: bundleVersion || undefined,
    notePrefix,
  });
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, serializePurgeOrders(orders), 'utf8');
console.log(`Wrote ${orders.length} purge orders → ${outPath}`);

/**
 * Resolve dynasty id lists from CLI flags (--dynasty, --dynasties, --priority).
 */
import fs from 'node:fs';

/** @param {import('./dynasties.json').dynasties} dynasties */
export function dynastiesByPriority(dynasties, priority) {
  return dynasties.filter((d) => d.priority === priority);
}

/**
 * @param {typeof import('./dynasties.json').dynasties} dynasties
 * @param {{ dynastyId?: string, dynastyIds?: string[], priority?: number }} opts
 */
export function resolveDynastySelection(dynasties, opts) {
  /** @type {typeof dynasties} */
  let selected;

  if (opts.priority != null) {
    selected = dynastiesByPriority(dynasties, opts.priority);
    if (selected.length === 0) {
      throw new Error(`No dynasties with priority=${opts.priority} in dynasties.json`);
    }
  } else if (opts.dynastyIds?.length) {
    selected = opts.dynastyIds.map((id) => {
      const d = dynasties.find((x) => x.id === id);
      if (!d) throw new Error(`Unknown dynasty "${id}" — see wikidata/dynasties.json`);
      return d;
    });
  } else if (opts.dynastyId) {
    const d = dynasties.find((x) => x.id === opts.dynastyId);
    if (!d) throw new Error(`Unknown dynasty "${opts.dynastyId}" — see wikidata/dynasties.json`);
    selected = [d];
  } else {
    throw new Error('Specify --dynasty, --dynasties, or --priority');
  }

  const ids = selected.map((d) => d.id);
  const qids = selected.map((d) => d.qid);
  const slug =
    opts.priority != null
      ? `priority${opts.priority}`
      : ids.length === 1
        ? ids[0]
        : ids.join('+');

  return { dynasties: selected, ids, qids, slug };
}

/** @param {string} filePath */
export function countNdjsonLines(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return 0;
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.trim()) return 0;
  return text.split('\n').filter((l) => l.trim()).length;
}

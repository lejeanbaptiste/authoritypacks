/**
 * Pack **purge orders**: developer-authored concordance / pack change notices
 * shipped inside the authority-pack bundle. On install, LJB copies pending
 * orders into the user's local docket for manual review (never silent
 * rewrite of project entities.xml).
 *
 * Each order is one NDJSON line. `from` is always `developer` for shipped
 * orders so the UI can label them as coming from the pack maintainers.
 */

/**
 * @typedef {{
 *   id: string,
 *   kind: 'concordance-unlink' | 'concordance-link' | 'concordance-replace' | 'pack-note',
 *   when: string,
 *   from: 'developer',
 *   note: string,
 *   bundleVersion?: string,
 *   entityKind?: 'person' | 'place' | 'org' | 'work' | 'office',
 *   source?: string,
 *   authorityId?: string,
 *   remove?: Record<string, string>,
 *   add?: Record<string, string>,
 * }} PurgeOrder
 */

/**
 * @param {Partial<PurgeOrder> & Pick<PurgeOrder, 'kind' | 'note'>} partial
 * @returns {PurgeOrder}
 */
export function makePurgeOrder(partial) {
  const id =
    partial.id ??
    `purge-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 8)}`;
  return {
    id,
    kind: partial.kind,
    when: partial.when ?? new Date().toISOString(),
    from: 'developer',
    note: partial.note,
    ...(partial.bundleVersion ? { bundleVersion: partial.bundleVersion } : {}),
    ...(partial.entityKind ? { entityKind: partial.entityKind } : {}),
    ...(partial.source ? { source: partial.source } : {}),
    ...(partial.authorityId != null ? { authorityId: String(partial.authorityId) } : {}),
    ...(partial.remove && Object.keys(partial.remove).length ? { remove: partial.remove } : {}),
    ...(partial.add && Object.keys(partial.add).length ? { add: partial.add } : {}),
  };
}

/**
 * Diff two Norbert-style concordance row lists into purge orders.
 * Rows must carry `metadata.norbert.authorityId` and `metadata.matched`.
 *
 * @param {any[]} previousAccepted
 * @param {any[]} nextAccepted
 * @param {{ bundleVersion?: string, notePrefix?: string }} [opts]
 * @returns {PurgeOrder[]}
 */
export function purgeOrdersFromConcordanceDiff(previousAccepted, nextAccepted, opts = {}) {
  /** @type {Map<string, { source: string, authorityId: string, primaryName?: string }>} */
  const prev = new Map();
  /** @type {Map<string, { source: string, authorityId: string, primaryName?: string }>} */
  const next = new Map();

  const keyOf = (row) => {
    const norbertId = row?.metadata?.norbert?.authorityId;
    const source = String(row?.metadata?.matched?.source ?? '').toLowerCase();
    if (norbertId == null || !source) return null;
    return `${norbertId}||${source}`;
  };

  for (const row of previousAccepted ?? []) {
    const key = keyOf(row);
    if (!key) continue;
    prev.set(key, {
      source: String(row.metadata.matched.source).toLowerCase(),
      authorityId: String(row.metadata.matched.authorityId),
      primaryName: row.metadata.norbert?.primaryName ?? row.primaryName,
    });
  }
  for (const row of nextAccepted ?? []) {
    const key = keyOf(row);
    if (!key) continue;
    next.set(key, {
      source: String(row.metadata.matched.source).toLowerCase(),
      authorityId: String(row.metadata.matched.authorityId),
      primaryName: row.metadata.norbert?.primaryName ?? row.primaryName,
    });
  }

  /** @type {PurgeOrder[]} */
  const orders = [];
  const prefix = opts.notePrefix ? `${opts.notePrefix} ` : '';

  for (const [key, before] of prev) {
    const after = next.get(key);
    const [norbertId] = key.split('||');
    if (!after) {
      orders.push(
        makePurgeOrder({
          kind: 'concordance-unlink',
          bundleVersion: opts.bundleVersion,
          entityKind: 'person',
          source: 'Norbert',
          authorityId: norbertId,
          remove: { [before.source]: before.authorityId },
          note: `${prefix}Removed ${before.source} link for ${before.primaryName ?? norbertId} (${before.authorityId}). Review project idnos if present.`,
        }),
      );
      continue;
    }
    if (after.authorityId !== before.authorityId) {
      orders.push(
        makePurgeOrder({
          kind: 'concordance-replace',
          bundleVersion: opts.bundleVersion,
          entityKind: 'person',
          source: 'Norbert',
          authorityId: norbertId,
          remove: { [before.source]: before.authorityId },
          add: { [after.source]: after.authorityId },
          note: `${prefix}Replaced ${before.source} link for ${before.primaryName ?? norbertId}: ${before.authorityId} → ${after.authorityId}.`,
        }),
      );
    }
  }

  for (const [key, after] of next) {
    if (prev.has(key)) continue;
    const [norbertId] = key.split('||');
    orders.push(
      makePurgeOrder({
        kind: 'concordance-link',
        bundleVersion: opts.bundleVersion,
        entityKind: 'person',
        source: 'Norbert',
        authorityId: norbertId,
        add: { [after.source]: after.authorityId },
        note: `${prefix}New ${after.source} link for ${after.primaryName ?? norbertId} (${after.authorityId}).`,
      }),
    );
  }

  return orders;
}

/**
 * @param {PurgeOrder[]} orders
 * @returns {string}
 */
export function serializePurgeOrders(orders) {
  if (!orders.length) return '';
  return `${orders.map((o) => JSON.stringify(o)).join('\n')}\n`;
}

/**
 * @param {string} text
 * @returns {PurgeOrder[]}
 */
export function parsePurgeOrders(text) {
  /** @type {PurgeOrder[]} */
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed);
      if (row?.id && row?.kind && row?.note) out.push(row);
    } catch {
      // skip bad lines
    }
  }
  return out;
}

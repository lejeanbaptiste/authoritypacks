/**
 * Minimal Wikidata Query Service client (JSON results).
 */

export const WDQS = 'https://query.wikidata.org/sparql';
export const WDQS_USER_AGENT = 'authority-extraction/0.1 (leaf-writer DH; contact: local dev)';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {string} sparql
 * @param {{ retries?: number, accept?: string }} [opts]
 */
export async function runSparql(sparql, opts = {}) {
  const { retries = 4, accept = 'application/sparql-results+json' } = opts;
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(WDQS, {
        method: 'POST',
        headers: {
          Accept: accept,
          'Content-Type': 'application/sparql-query',
          'User-Agent': WDQS_USER_AGENT,
        },
        body: sparql,
      });
      if (!res.ok) {
        const text = await res.text();
        const retryable = res.status >= 500 || res.status === 429;
        if (retryable && attempt < retries) {
          await sleep(3000 * attempt);
          continue;
        }
        throw new Error(`WDQS ${res.status}: ${text.slice(0, 500)}`);
      }
      if (accept.includes('json')) {
        return /** @type {SparqlJsonResponse} */ (await res.json());
      }
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await sleep(3000 * attempt);
        continue;
      }
    }
  }
  throw lastErr ?? new Error('WDQS request failed');
}

/** @typedef {{ head: { vars: string[] }, results: { bindings: Record<string, { value: string }>[] } }} SparqlJsonResponse */

/** @param {SparqlJsonResponse} json @param {string} varName */
export function bindingValues(json, varName) {
  return json.results.bindings
    .map((row) => row[varName]?.value)
    .filter((value) => typeof value === 'string');
}

/** @param {string} uri */
export function qidFromUri(uri) {
  const m = /\/(Q\d+)$/.exec(uri);
  return m ? m[1] : uri;
}

/**
 * All Q-ids that are the root or a P279 subclass of it.
 * @param {string} rootQid e.g. Q7725634
 */
export function subclassClosureQuery(rootQid) {
  return `
SELECT DISTINCT ?sub WHERE {
  ?sub wdt:P279* wd:${rootQid} .
}
`.trim();
}

/**
 * @param {string} rootQid
 */
export async function fetchSubclassClosure(rootQid) {
  const json = /** @type {SparqlJsonResponse} */ (await runSparql(subclassClosureQuery(rootQid)));
  const qids = bindingValues(json, 'sub').map(qidFromUri);
  return [...new Set(qids)].sort((a, b) => {
    const na = Number.parseInt(a.slice(1), 10);
    const nb = Number.parseInt(b.slice(1), 10);
    return na - nb;
  });
}

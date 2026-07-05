import { NDL_SPARQL_ENDPOINT, NDL_USER_AGENT } from './constants.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * NDL sometimes returns HTTP 200 with `head.status: error` and unescaped
 * newlines inside `msg`, which breaks JSON.parse.
 * @param {string} text
 */
export function parseSparqlJson(text) {
  if (/\"status\"\s*:\s*\"error\"/i.test(text)) {
    const snippet = text.replace(/\s+/g, ' ').slice(0, 240);
    throw new Error(`NDL SPARQL query failed: ${snippet}`);
  }
  return JSON.parse(text);
}

/**
 * @param {string} sparql
 * @param {{ retries?: number, accept?: string }} opts
 */
export async function runNdlSparql(sparql, opts = {}) {
  const retries = opts.retries ?? 3;
  const accept = opts.accept ?? 'application/sparql-results+json';
  let lastErr;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const url = new URL(NDL_SPARQL_ENDPOINT);
      url.searchParams.set('query', sparql);
      const res = await fetch(url, {
        headers: {
          Accept: accept,
          'User-Agent': NDL_USER_AGENT,
        },
      });
      const text = await res.text();
      if (!res.ok) {
        const retryable = res.status >= 500 || res.status === 429;
        if (retryable && attempt < retries) {
          await sleep(2000 * attempt);
          continue;
        }
        throw new Error(`NDL SPARQL ${res.status}: ${text.slice(0, 500)}`);
      }
      return parseSparqlJson(text);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await sleep(2000 * attempt);
        continue;
      }
    }
  }
  throw lastErr ?? new Error('NDL SPARQL request failed');
}

/** @param {{ results?: { bindings?: Array<Record<string, { type?: string, value?: string }>> } }} json */
export function bindingsFromJson(json) {
  return json?.results?.bindings ?? [];
}

/** @param {{ type?: string, value?: string } | undefined} cell */
export function bindingValue(cell) {
  return cell?.value ?? '';
}

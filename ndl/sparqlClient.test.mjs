import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSparqlJson } from './sparqlClient.mjs';

test('parseSparqlJson — rejects NDL error payloads with raw newlines', () => {
  const bad = '{"head": {"status":"error", "msg": "failed\n\nline2"}}';
  assert.throws(() => parseSparqlJson(bad), /NDL SPARQL query failed/);
});

test('parseSparqlJson — parses normal bindings', () => {
  const ok = '{"results":{"bindings":[{"x":{"value":"1"}}]}}';
  assert.deepEqual(parseSparqlJson(ok).results.bindings[0].x.value, '1');
});

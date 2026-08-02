#!/usr/bin/env node
/**
 * Produce a human-review CSV of authority strings which look like noble
 * titles. This is an audit only: it never changes a pack or the include.
 *
 * Usage: node scripts/audit-noble-titles.mjs [--packs DIR] [--out FILE]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readNdjson } from '../shared/ndjson.mjs';
import { normalizeSurface } from '../shared/normalize.mjs';
import {
  indexApprovedNobleTitleRules,
  loadApprovedNobleTitleRules,
  approvedNobleTitleRule,
} from '../shared/nobleTitleFilter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const arg = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at >= 0 && process.argv[at + 1] ? path.resolve(process.argv[at + 1]) : fallback;
};
const packsDir = arg('--packs', path.join(root, 'packs'));
const outPath = arg('--out', path.join(root, 'reports/noble-title-authority-review.csv'));
const includePath = path.join(root, 'noble-titles/approved-include.ndjson');

// Longest first. A title is only reported when there is material before the
// rank; bare ranks are intentionally not audit candidates.
const RANKS = [
  '皇太后', '皇太子', '皇后', '太后', '太妃', '太子', '世子', '公主', '皇女',
  '貴妃', '賢妃', '淑妃', '夫人', '天皇', '天王', '後主', '幼主',
  '帝', '王', '公', '侯', '伯', '子', '男', '后', '妃', '君', '主', '姬', '嬪', '妾',
].sort((a, b) => b.length - a.length);

const csv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

/**
 * Norbert's structured title rows are evidence, not decisions: they keep the
 * review report focused on title-shaped strings that share a real title
 * component, rather than every Chinese personal name ending in 子/公/王.
 */
function collectNorbertMarkers(packsRoot) {
  const markers = new Set();
  const titlePrefixes = new Set();
  const add = (value) => {
    const text = normalizeSurface(value);
    if (text && text.length >= 2) markers.add(text);
  };
  const addTitle = (title) => {
    if (!title?.roleName) return;
    const fief = normalizeSurface(title.fief);
    const posthumous = normalizeSurface(title.posthumousName);
    const roleName = normalizeSurface(title.roleName);
    for (const value of [[fief, roleName], [fief, posthumous, roleName], [posthumous, roleName]]) {
      const text = value.filter(Boolean).join('');
      if (text.length >= 2) titlePrefixes.add(text);
    }
  };
  for (const name of ['persons.ndjson', 'person-wrappers.ndjson', 'wiki-nt-links.ndjson']) {
    const file = path.join(packsRoot, 'norbert', name);
    if (!fs.existsSync(file)) continue;
    for (const row of readNdjson(file)) {
      for (const title of row.metadata?.nobleTitles ?? []) {
        add(title.fief); add(title.posthumousName); add(row.metadata?.dynasty);
        addTitle(title);
      }
      const title = row.metadata?.nobleTitle;
      if (title) { add(title.fief); add(title.posthumousName); add(row.metadata?.dynasty); addTitle(title); }
      const wrapper = row.metadata?.wrapper?.components;
      if (wrapper) {
        add(wrapper.fief); add(wrapper.posthumousName); add(wrapper.nationality);
        addTitle({ fief: wrapper.fief, posthumousName: wrapper.posthumousName, roleName: wrapper.roleName });
      }
    }
  }
  return { markers, titlePrefixes };
}

function infer(surface, evidence) {
  const text = normalizeSurface(surface);
  // Source office labels often contain punctuation, wildcards, explanatory
  // prose, or romanization. They are not candidate *authority names* for
  // this review. Restrict this first-pass report to compact Han-only strings;
  // an editor can still add a deliberately exceptional surface to the include.
  if (!text || text.length < 2 || text.length > 10 || !/^\p{Script=Han}+$/u.test(text)) return null;
  for (const rank of RANKS) {
    const at = text.indexOf(rank);
    if (at <= 0) continue;
    const before = text.slice(0, at);
    const after = text.slice(at + rank.length);
    // A rank in the middle is a useful review signal only if the tail is
    // plausibly an identity string (the familiar title + name shape).
    if (after.length > 3) continue;
    // A title's pre-rank part must share a fief, posthumous name, or dynasty
    // marker from Norbert's structured title data. This deliberately leaves
    // unfamiliar cases out of the first audit rather than flooding review.
    const exactKnownTitlePrefix = evidence.titlePrefixes.has(`${before}${rank}`);
    if (!exactKnownTitlePrefix) continue;
    return {
      roleName: rank,
      prefix: before,
      personName: after || '',
      suggestedAction: after ? 'personWrapper? (review)' : 'nobleTitle? (review)',
      reason: `${after ? 'rank plus trailing possible personal name' : 'rank-final possible noble title'}; Norbert title form: ${before}${rank}`,
    };
  }
  return null;
}

function walkNdjson(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkNdjson(full));
    else if (entry.isFile() && entry.name.endsWith('.ndjson')) out.push(full);
  }
  return out;
}

const approved = indexApprovedNobleTitleRules(loadApprovedNobleTitleRules(includePath));
const norbertMarkers = collectNorbertMarkers(packsDir);
const rowsByAuthoritySurface = new Map();
for (const file of walkNdjson(packsDir)) {
  // Derived title/wrapper assets are evidence for parsing, not source-name
  // material to audit again.
  if (/person-wrappers|wiki-nt-links|concordance|appointments|office-relations/.test(file)) continue;
  for (const candidate of readNdjson(file)) {
    if (!['person', 'office'].includes(candidate.kind)) continue;
    const fields = [
      ['primaryName', candidate.primaryName],
      ...candidate.searchStrings.map((surface) => ['searchStrings', surface]),
      ...(candidate.names ?? []).map((name) => [`names:${name.type ?? 'untyped'}`, name.text]),
    ];
    for (const [field, raw] of fields) {
      const surface = normalizeSurface(raw);
      const inferred = infer(surface, norbertMarkers);
      if (!inferred) continue;
      const dedupe = `${candidate.source}\0${candidate.authorityId}\0${candidate.kind}\0${surface}`;
      const existing = rowsByAuthoritySurface.get(dedupe);
      if (existing) {
        if (!existing.fields.includes(field)) existing.fields.push(field);
        continue;
      }
      const rule = approvedNobleTitleRule(approved, candidate, surface);
      rowsByAuthoritySurface.set(dedupe, {
        source: candidate.source,
        authorityId: candidate.authorityId,
        kind: candidate.kind,
        packFile: path.relative(packsDir, file),
        fields: [field],
        surface,
        status: rule ? `approved:${rule.id}` : 'review',
        suggestedAction: rule?.action ?? inferred.suggestedAction,
        suggestedPrefix: inferred.prefix,
        suggestedRoleName: rule?.components.roleName ?? inferred.roleName,
        suggestedPersonName: rule?.components.personName ?? inferred.personName,
        reason: rule ? 'exact reviewed include match' : inferred.reason,
      });
    }
  }
}
const rows = [...rowsByAuthoritySurface.values()];
rows.sort((a, b) => a.source.localeCompare(b.source) || a.surface.localeCompare(b.surface) || a.authorityId.localeCompare(b.authorityId));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const columns = ['source', 'authorityId', 'kind', 'packFile', 'fields', 'surface', 'status', 'suggestedAction', 'suggestedPrefix', 'suggestedRoleName', 'suggestedPersonName', 'reason'];
fs.writeFileSync(outPath, `${columns.join(',')}\n${rows.map((row) => columns.map((key) => csv(row[key])).join(',')).join('\n')}\n`);
console.log(`Noble-title audit: ${rows.length} rows → ${outPath}`);

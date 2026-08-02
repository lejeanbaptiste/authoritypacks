#!/usr/bin/env node
/** Convert the curator's CSV decisions into exact, source-scoped include rules. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return path.resolve(index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback);
};
const input = arg('--input', path.join(root, 'reports/noble-title-authority-review.csv'));
const output = arg('--output', path.join(root, 'noble-titles/approved-include.ndjson'));

const norbertTitleByAuthority = new Map();
const norbertPersons = path.join(root, 'packs/norbert/persons.ndjson');
if (fs.existsSync(norbertPersons)) {
  for (const line of fs.readFileSync(norbertPersons, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    if (row.authorityId && row.metadata?.nobleTitles) norbertTitleByAuthority.set(row.authorityId, row.metadata.nobleTitles);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const push = () => { row.push(field); field = ''; };
  const finish = () => { push(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') push();
    else if (c === '\n') finish();
    else if (c !== '\r') field += c;
  }
  if (field || row.length) finish();
  const headers = rows.shift();
  return rows.filter((r) => r.length && r.some(Boolean)).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

function parseParts(action) {
  const body = action.replace(/^\w+\s*,\s*/, '').replace(/\(天皇\)/g, '').replace('rôle', 'role');
  return body.split('+').map((part) => {
    const match = part.match(/^([A-Za-z]+)(?:\{(\d+)\})?$/);
    return match ? { name: match[1], length: match[2] ? Number(match[2]) : undefined } : { name: part };
  });
}

function take(text, offset, length, label) {
  if (length == null) return [text.slice(offset), text.length];
  return [text.slice(offset, offset + length), offset + length];
}

function componentsFor(row) {
  const action = row.suggestedAction;
  if (action === 'nobleTitle, role-only') return { roleName: row.surface };
  const isWrapper = action.startsWith('personWrapper');
  const personName = row.suggestedPersonName?.trim();
  const titleSurface = isWrapper && personName && row.surface.endsWith(personName)
    ? row.surface.slice(0, -personName.length)
    : row.surface;
  // Norbert already has authoritative structured components. Prefer them for
  // legacy action annotations whose brace counts describe the source's title
  // convention rather than literal character counts (e.g. 後梁末帝).
  if (row.source === 'Norbert' && !action.includes('family')) {
    const title = (norbertTitleByAuthority.get(row.authorityId) ?? []).find((candidate) =>
      [candidate.fief, candidate.posthumousName, candidate.roleName].filter(Boolean).join('') === titleSurface ||
      [candidate.fief, candidate.roleName].filter(Boolean).join('') === titleSurface,
    );
    if (title) {
      return {
        ...(title.fief ? { fief: title.fief } : {}),
        ...(title.posthumousName ? { posthumousName: title.posthumousName } : {}),
        ...(title.roleName ? { roleName: title.roleName } : {}),
        ...(personName && isWrapper ? { personName } : {}),
      };
    }
  }
  const parts = parseParts(action);
  const components = {};
  const rolePart = parts.find((part) => part.name === 'role');
  const roleLength = rolePart?.length ?? row.suggestedRoleName?.length;
  if (!rolePart) throw new Error(`No role component in ${row.source}/${row.authorityId}/${row.surface}`);
  const roleName = roleLength ? titleSurface.slice(-roleLength) : row.suggestedRoleName;
  const prefixSurface = titleSurface.slice(0, titleSurface.length - (roleName?.length ?? 0));
  let offset = 0;
  for (const part of parts) {
    if (['given', 'givenName', 'shi'].includes(part.name) || (isWrapper && part.name === 'family')) continue;
    if (part.name === 'role') {
      components.roleName = roleName;
    } else if (part.name === 'fief' || part.name === 'pn') {
      const inferredLength = part.name === 'pn' && rolePart?.length == null && !(parts.some((item) => item.name === 'family') && !isWrapper)
        ? prefixSurface.length - offset
        : part.length ?? prefixSurface.length - offset;
      const [value, next] = take(prefixSurface, offset, inferredLength, part.name);
      if (part.name === 'fief') components.fief = value;
      else components.posthumousName = value;
      offset = next;
    } else if (part.name === 'family') {
      const [value, next] = take(prefixSurface, offset, part.length, 'family');
      components.familyName = value;
      offset = next;
    }
  }
  // Unbraced fief+role is the common simple form.
  if (offset !== prefixSurface.length) throw new Error(`Could not consume title prefix for ${row.source}/${row.authorityId}/${row.surface}: ${action}`);
  if (!components.roleName) throw new Error(`No roleName could be derived for ${row.source}/${row.authorityId}/${row.surface}`);
  const reconstructed = parts
    .filter((part) => !['given', 'givenName', 'shi'].includes(part.name) && !(isWrapper && part.name === 'family'))
    .map((part) => part.name === 'fief' ? components.fief : part.name === 'pn' ? components.posthumousName : part.name === 'family' ? components.familyName : components.roleName)
    .filter(Boolean)
    .join('');
  if (reconstructed !== titleSurface) throw new Error(`Parsed components do not reconstruct ${row.surface}: ${reconstructed}`);
  if (isWrapper) {
    if (!personName) throw new Error(`Accepted personWrapper has no person name: ${row.source}/${row.authorityId}/${row.surface}`);
    components.personName = personName;
  }
  return components;
}

const rows = parseCsv(fs.readFileSync(input, 'utf8'));
const accepted = rows.filter((row) => row.status === 'accepted');
const rules = [];
const seen = new Set();
for (const row of accepted) {
  const action = row.suggestedAction;
  if (!action || action === 'further study' || action.startsWith('ignore')) continue;
  const key = `${row.source}\0${row.surface}`;
  if (seen.has(key)) continue;
  const actionKind = action.startsWith('personWrapper') ? 'personWrapper' : 'nobleTitle';
  const components = componentsFor(row);
  rules.push({
    id: `${row.source.toLowerCase()}:${row.authorityId}`,
    surface: row.surface,
    action: actionKind,
    sources: [row.source.toUpperCase()],
    components,
    note: `Compiled from noble-title-authority-review.csv; ${row.suggestedAction}`,
  });
  seen.add(key);
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify({ schemaVersion: 1, source: path.relative(root, input) })}\n${rules.map((rule) => JSON.stringify(rule)).join('\n')}\n`);
console.log(`Compiled ${rules.length} accepted noble-title rules from ${rows.length} review rows → ${output}`);

/**
 * Per-person DILA reference lookup (A6) against Buddhist_Studies_Person_Authority.xml.
 */
import fs from 'node:fs';
import { XMLParser } from 'fast-xml-parser';
import { personFromRecord } from './compileRecords.mjs';
import { loadCbdbDynastyMap } from '../shared/dynastyMap.mjs';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});

/**
 * Extract one <person xml:id="…"> fragment by id (depth-safe).
 * @param {string} content
 * @param {string} authorityId
 */
export function extractDilaPersonFragment(content, authorityId) {
  const needle = `xml:id="${authorityId}"`;
  const startHint = content.indexOf(`<person `);
  if (startHint < 0) return null;
  // Prefer exact xml:id match on person.
  const re = new RegExp(`<person\\s+[^>]*xml:id="${authorityId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`, 'i');
  const startMatch = re.exec(content);
  if (!startMatch) return null;
  const start = startMatch.index;
  const tagRe = /<person(?:\s[^>]*)?>|<\/person>/g;
  tagRe.lastIndex = start;
  let depth = 0;
  let end = -1;
  let m;
  while ((m = tagRe.exec(content)) !== null) {
    if (m[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) {
        end = tagRe.lastIndex;
        break;
      }
    } else {
      depth += 1;
    }
  }
  if (end < 0) return null;
  return content.slice(start, end);
}

/**
 * @param {string} xmlPath
 * @param {string} authorityId
 * @param {{ dynastyMap?: ReturnType<typeof loadCbdbDynastyMap>, content?: string }} [opts]
 */
export function lookupDilaPerson(xmlPath, authorityId, opts = {}) {
  const content = opts.content ?? fs.readFileSync(xmlPath, 'utf8');
  const fragment = extractDilaPersonFragment(content, String(authorityId));
  if (!fragment) return null;
  const parsed = parser.parse(fragment);
  const person = parsed.person;
  if (!person) return null;
  const dynastyMap = opts.dynastyMap ?? loadCbdbDynastyMap();
  return personFromRecord(person, { dynastyMap });
}

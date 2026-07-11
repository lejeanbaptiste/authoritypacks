import fs from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});

/** @param {unknown} v */
export function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** @param {unknown} node */
export function teiId(node) {
  if (!node || typeof node !== 'object') return undefined;
  return /** @type {Record<string, string>} */ (node)['@_xml:id'] || /** @type {Record<string, string>} */ (node)['@_id'];
}

/**
 * Split a TEI list file into element XML strings.
 * @param {string} filePath
 * @param {string} tag e.g. person, place
 */
export function splitTeiRecords(filePath, tag) {
  const content = fs.readFileSync(filePath, 'utf8');
  const re = new RegExp(`<${tag}\\s+xml:id="[^"]+"[\\s\\S]*?<\\/${tag}>`, 'g');
  return content.match(re) ?? [];
}

/**
 * @param {string} fragmentXml
 */
export function parseTeiFragment(fragmentXml) {
  return parser.parse(fragmentXml);
}

/**
 * @param {string} filePath
 * @param {string} tag
 */
export function* iterateTeiRecords(filePath, tag) {
  for (const fragment of splitTeiRecords(filePath, tag)) {
    const root = parseTeiFragment(fragment);
    const node = root[tag];
    if (node) yield node;
  }
}

/**
 * Load districts.xml → map PLA id → label.
 * @param {string | null | undefined} filePath
 */
export function loadDistrictMap(filePath) {
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!filePath || !fs.existsSync(filePath)) return map;

  for (const place of iterateTeiRecords(filePath, 'place')) {
    const id = teiId(place);
    const names = asArray(place.placeName);
    const hant = names.find((n) => (n['@_xml:lang'] || n['@_lang'] || '').startsWith('zho'));
    const label = textContent(hant) || textContent(names[0]);
    if (id && label) map.set(id, label);
  }
  return map;
}

/** @param {unknown} node */
export function textContent(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node).trim();
  if (typeof node === 'object' && node !== null && '#text' in node) {
    return String(/** @type {{ '#text': string }} */ (node)['#text']).trim();
  }
  return '';
}

/**
 * @param {Record<string, unknown>} personOrPlace
 * @param {string} noteType
 */
export function notesOfType(personOrPlace, noteType) {
  return asArray(personOrPlace.note)
    .filter((n) => n?.['@_type'] === noteType)
    .map((n) => textContent(n))
    .filter(Boolean);
}

/**
 * DILA place records carry their 備註/description as a plain <note> with no @_type.
 * @param {Record<string, unknown>} personOrPlace
 */
export function untypedNotes(personOrPlace) {
  return asArray(personOrPlace.note)
    .filter((n) => !n?.['@_type'])
    .map((n) => textContent(n))
    .filter(Boolean);
}

/**
 * zho-Hant persName / placeName strings only.
 * @param {Record<string, unknown>} el
 * @param {string} tag
 */
export function hantNames(el, tag) {
  return asArray(el[tag])
    .filter((n) => {
      const lang = n?.['@_xml:lang'] || n?.['@_lang'] || '';
      return !lang || lang.startsWith('zho');
    })
    .map((n) => textContent(n))
    .filter(Boolean);
}

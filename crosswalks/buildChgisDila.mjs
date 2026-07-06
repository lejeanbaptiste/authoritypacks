import fs from 'node:fs';
import path from 'node:path';
import { normalizeSurface } from '../shared/normalize.mjs';

export const GEO_THRESHOLD_DEG = 0.5;

const CROSSWALK_HEADER = 'chgis_sys_id\tdila_pl_id\tmatch_method\tdelta_lat\tdelta_lon\tname';
const AMBIGUOUS_HEADER = 'chgis_sys_id\tdila_pl_id\treason\tname';

function tsvCell(value) {
  return String(value ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

/**
 * @param {string} line
 * @returns {string[]}
 */
function splitTsvLine(line) {
  return line.split('\t');
}

/**
 * @param {string} filePath
 * @returns {Record<string, string>[]}
 */
export function readTsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const header = splitTsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitTsvLine(line);
    /** @type {Record<string, string>} */
    const row = {};
    header.forEach((key, i) => {
      row[key] = cells[i] ?? '';
    });
    return row;
  });
}

/**
 * @param {string} raw
 * @returns {number | undefined}
 */
function parseCoord(raw) {
  if (raw == null || raw === '') return undefined;
  const n = parseFloat(String(raw));
  return Number.isFinite(n) ? n : undefined;
}

/**
 * @param {{ lat?: number, lon?: number }} a
 * @param {{ lat?: number, lon?: number }} b
 */
export function geoCompatible(a, b) {
  const aHas = a.lat != null && a.lon != null;
  const bHas = b.lat != null && b.lon != null;
  if (!aHas || !bHas) {
    return { ok: true, method: 'name-only', deltaLat: '', deltaLon: '' };
  }
  const deltaLat = Math.abs(a.lat - b.lat);
  const deltaLon = Math.abs(a.lon - b.lon);
  if (deltaLat <= GEO_THRESHOLD_DEG && deltaLon <= GEO_THRESHOLD_DEG) {
    return { ok: true, method: 'name+geo', deltaLat, deltaLon };
  }
  return { ok: false, method: '', deltaLat, deltaLon };
}

/**
 * @param {string} pipeSeparated
 * @returns {string[]}
 */
function namesFromPipe(pipeSeparated) {
  return pipeSeparated
    .split('|')
    .map((s) => normalizeSurface(s))
    .filter(Boolean);
}

/**
 * @param {Record<string, string>[]} chgisRows
 * @param {Record<string, string>[]} dilaRows
 */
export function buildChgisDilaCrosswalk(chgisRows, dilaRows) {
  /** @type {Map<string, { plId: string, lat?: number, lon?: number, names: Set<string> }[]>} */
  const dilaByName = new Map();

  for (const row of dilaRows) {
    const plId = row.pl_id?.trim();
    if (!plId) continue;
    const names = new Set([
      normalizeSurface(row.primary_name),
      ...namesFromPipe(row.search_strings),
    ]);
    names.delete('');
    const entry = {
      plId,
      lat: parseCoord(row.lat),
      lon: parseCoord(row.lon),
      names,
    };
    for (const name of names) {
      const bucket = dilaByName.get(name) ?? [];
      bucket.push(entry);
      dilaByName.set(name, bucket);
    }
  }

  /** @type {string[]} */
  const crosswalkLines = [CROSSWALK_HEADER];
  /** @type {string[]} */
  const ambiguousLines = [AMBIGUOUS_HEADER];
  let matched = 0;
  let ambiguous = 0;
  let noNameMatch = 0;

  for (const chgis of chgisRows) {
    const sysId = chgis.sys_id?.trim();
    const nameFt = normalizeSurface(chgis.name_ft);
    if (!sysId || !nameFt) continue;

    const chgisNames = new Set([
      nameFt,
      ...namesFromPipe(chgis.search_strings),
    ]);
    chgisNames.delete('');

    /** @type {Map<string, { plId: string, method: string, deltaLat: number | string, deltaLon: number | string, name: string }>} */
    const candidates = new Map();
    const chgisGeo = { lat: parseCoord(chgis.lat), lon: parseCoord(chgis.lon) };

    for (const name of chgisNames) {
      const bucket = dilaByName.get(name) ?? [];
      for (const dila of bucket) {
        const geo = geoCompatible(chgisGeo, { lat: dila.lat, lon: dila.lon });
        if (!geo.ok) continue;
        const existing = candidates.get(dila.plId);
        if (!existing || geo.method === 'name+geo') {
          candidates.set(dila.plId, {
            plId: dila.plId,
            method: geo.method,
            deltaLat: geo.deltaLat,
            deltaLon: geo.deltaLon,
            name,
          });
        }
      }
    }

    if (candidates.size === 0) {
      noNameMatch += 1;
      continue;
    }
    if (candidates.size > 1) {
      ambiguous += 1;
      for (const c of candidates.values()) {
        ambiguousLines.push(
          [sysId, c.plId, 'multiple_dila_candidates', c.name].map(tsvCell).join('\t'),
        );
      }
      continue;
    }

    const winner = [...candidates.values()][0];
    crosswalkLines.push(
      [sysId, winner.plId, winner.method, winner.deltaLat, winner.deltaLon, winner.name]
        .map(tsvCell)
        .join('\t'),
    );
    matched += 1;
  }

  return {
    crosswalkLines,
    ambiguousLines,
    stats: { matched, ambiguous, noNameMatch, chgisTotal: chgisRows.length },
  };
}

/**
 * @param {string} chgisTsv
 * @param {string} dilaTsv
 * @param {{ crosswalkOut: string, ambiguousOut?: string }} options
 */
export function writeChgisDilaCrosswalk(chgisTsv, dilaTsv, options) {
  const chgisRows = readTsv(chgisTsv);
  const dilaRows = readTsv(dilaTsv);
  const result = buildChgisDilaCrosswalk(chgisRows, dilaRows);

  fs.mkdirSync(path.dirname(options.crosswalkOut), { recursive: true });
  fs.writeFileSync(options.crosswalkOut, `${result.crosswalkLines.join('\n')}\n`);

  if (options.ambiguousOut) {
    fs.writeFileSync(options.ambiguousOut, `${result.ambiguousLines.join('\n')}\n`);
  }

  return result.stats;
}

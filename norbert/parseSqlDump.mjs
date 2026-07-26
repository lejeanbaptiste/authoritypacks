import fs from 'node:fs';
import readline from 'node:readline';

/**
 * Stream-parse mysqldump INSERT rows for one table.
 * @param {string} filePath
 * @param {string} tableName
 * @returns {AsyncGenerator<any[]>}
 */
export async function* loadTableRows(filePath, tableName) {
  const prefix = `INSERT INTO \`${tableName}\` VALUES `;
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.startsWith(`INSERT INTO \`${tableName}\``)) continue;
    const marker = ' VALUES ';
    const idx = line.indexOf(marker);
    if (idx < 0) continue;
    let valuesPart = line.slice(idx + marker.length).trim();
    if (valuesPart.endsWith(';')) valuesPart = valuesPart.slice(0, -1);
    yield* parseValueTuples(valuesPart);
  }
}

/**
 * @param {string} s
 * @returns {Generator<any[]>}
 */
export function* parseValueTuples(s) {
  let i = 0;
  while (i < s.length) {
    if (s[i] === '(') {
      const [values, next] = parseTuple(s, i);
      yield values;
      i = next;
    } else {
      i += 1;
    }
  }
}

/**
 * @param {string} s
 * @param {number} start index of opening (
 * @returns {[any[], number]}
 */
function parseTuple(s, start) {
  let i = start + 1;
  /** @type {any[]} */
  const values = [];
  while (i < s.length) {
    i = skipWs(s, i);
    if (s[i] === ')') return [values, i + 1];
    const [value, next] = parseValue(s, i);
    values.push(value);
    i = skipWs(s, next);
    if (s[i] === ',') i += 1;
  }
  throw new Error(`Unclosed tuple at ${start}`);
}

/**
 * @param {string} s
 * @param {number} i
 */
function skipWs(s, i) {
  while (i < s.length && /\s/.test(s[i])) i += 1;
  return i;
}

/**
 * @param {string} s
 * @param {number} i
 * @returns {[any, number]}
 */
function parseValue(s, i) {
  i = skipWs(s, i);
  if (s.startsWith('NULL', i)) return [null, i + 4];
  if (s.startsWith('_binary', i)) return parseBinary(s, i);
  if (s[i] === "'") return parseString(s, i);
  if (s[i] === '-' || (s[i] >= '0' && s[i] <= '9')) return parseNumber(s, i);
  throw new Error(`Unexpected value at ${i}: ${s.slice(i, i + 40)}`);
}

/**
 * @param {string} s
 * @param {number} i
 * @returns {[string, number]}
 */
function parseString(s, i) {
  let out = '';
  i += 1;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'") {
      if (s[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      return [out, i + 1];
    }
    if (ch === '\\' && i + 1 < s.length) {
      const esc = s[i + 1];
      if (esc === 'n') out += '\n';
      else if (esc === 'r') out += '\r';
      else if (esc === 't') out += '\t';
      else out += esc;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  throw new Error('Unclosed string');
}

/**
 * @param {string} s
 * @param {number} i
 * @returns {[number, number]}
 */
function parseNumber(s, i) {
  let j = i;
  if (s[j] === '-') j += 1;
  while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j += 1;
  return [Number(s.slice(i, j)), j];
}

/**
 * @param {string} s
 * @param {number} i
 * @returns {[number | null, number]}
 */
function parseBinary(s, i) {
  const quote = s.indexOf("'", i);
  const end = s.indexOf("'", quote + 1);
  const payload = s.slice(quote + 1, end);
  return [payload === '\0' || payload === '' ? 0 : 1, end + 1];
}

/**
 * @param {string} filePath
 * @param {string[]} tableNames
 */
export async function loadNorbertTables(filePath, tableNames) {
  /** @type {Record<string, any[][]>} */
  const out = Object.fromEntries(tableNames.map((t) => [t, []]));
  const wanted = new Set(tableNames);
  const prefixes = [...wanted].map((t) => `INSERT INTO \`${t}\` VALUES `);

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const prefix = prefixes.find((p) => line.startsWith(p.slice(0, p.indexOf(' VALUES '))));
    if (!prefix) continue;
    const tableName = prefix.match(/`([^`]+)`/)?.[1];
    if (!tableName || !wanted.has(tableName)) continue;
    const marker = ' VALUES ';
    const idx = line.indexOf(marker);
    let valuesPart = line.slice(idx + marker.length).trim();
    if (valuesPart.endsWith(';')) valuesPart = valuesPart.slice(0, -1);
    for (const row of parseValueTuples(valuesPart)) {
      out[tableName].push(row);
    }
  }
  return out;
}

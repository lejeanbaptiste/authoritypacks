import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} root
 * @returns {string[]}
 */
export function discoverShapefiles(root) {
  /** @type {string[]} */
  const found = [];

  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.shp')) {
        found.push(full);
      }
    }
  };

  const stat = fs.statSync(root);
  if (stat.isFile() && root.toLowerCase().endsWith('.shp')) return [root];
  if (stat.isDirectory()) walk(root);

  return [...new Set(found)].sort();
}

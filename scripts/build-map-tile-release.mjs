import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const outputDir = path.resolve('release');
const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'authoritypacks-map-'));
const pmtilesVersion = '1.31.2';
const sourceHost = 'https://build.protomaps.com';

const regions = [
  { id: 'tibet', bbox: [78.0, 26.0, 103.5, 39.8] },
  { id: 'china', bbox: [73.5, 15.8, 134.8, 53.6] },
  { id: 'japan', bbox: [122.9, 24.0, 154.0, 45.7] },
];

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} downloading ${url}`);
  await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

function sha256(file) {
  return fs.readFile(file).then((data) => createHash('sha256').update(data).digest('hex'));
}

function dateString(date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

let sourceUrl;
for (let daysAgo = 0; daysAgo < 8 && !sourceUrl; daysAgo += 1) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  const candidate = `${sourceHost}/${dateString(date)}.pmtiles`;
  const response = await fetch(candidate, { method: 'HEAD' });
  if (response.ok) sourceUrl = candidate;
}
if (!sourceUrl) throw new Error('No recent Protomaps daily build was found.');

const cliArchive = path.join(workDir, 'pmtiles.tar.gz');
const cliDir = path.join(workDir, 'pmtiles');
await fs.mkdir(cliDir);
await download(
  `https://github.com/protomaps/go-pmtiles/releases/download/${pmtilesVersion}/go-pmtiles_${pmtilesVersion}_Linux_x86_64.tar.gz`,
  cliArchive,
);
await execFileAsync('tar', ['-xzf', cliArchive, '-C', cliDir]);
const cli = path.join(cliDir, 'pmtiles');
await fs.chmod(cli, 0o755);
await fs.mkdir(outputDir, { recursive: true });

const assets = [];
for (const region of regions) {
  const fileName = `${region.id}.pmtiles`;
  const outputPath = path.join(outputDir, fileName);
  await execFileAsync(cli, [
    'extract', sourceUrl, outputPath,
    `--bbox=${region.bbox.join(',')}`,
  ], { maxBuffer: 2 * 1024 * 1024 });
  await execFileAsync(cli, ['verify', outputPath]);
  const stat = await fs.stat(outputPath);
  assets.push({
    id: region.id,
    fileName,
    bytes: stat.size,
    sha256: await sha256(outputPath),
    bbox: region.bbox,
  });
}

await fs.writeFile(
  path.join(outputDir, 'map-tiles-index.json'),
  `${JSON.stringify({ version: sourceUrl.split('/').at(-1)?.replace('.pmtiles', ''), sourceUrl, assets }, null, 2)}\n`,
);
console.log(`Built ${assets.length} regional PMTiles assets from ${sourceUrl}`);

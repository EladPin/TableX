/* gen_site.mjs — write a new-site workbook from a Planet group export.
 *
 *   node tools/gen_site.mjs <export.xlsx> <spec.json> <out.xlsx>
 *
 * The offline driver for TableX/js/sitegen.js, which is the same module the
 * app loads — so a file produced here is written by the code that will write
 * it in the app, and a Planet import that accepts this one accepts that one.
 * Zero dependencies: SheetJS is already vendored, Node has the rest.
 *
 * spec.json:
 *   { "templateSite": "EA0402C",
 *     "groupName": "TableX_Test",      // the Planet group, created FIRST
 *     "sites": [ { "siteId": "...", "name": "...", "lon": 0, "lat": 0,
 *                  "sectors": [ { "sectorId": "...", "band": "1800_20",
 *                                 "az": 0, "height": 30, "tilt": 2,
 *                                 "etilt": 3, "model": "x.pafx",
 *                                 "pwr": 52 } ] } ] }
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const XLSX = require(join(here, '..', 'TableX', 'js', 'xlsx.full.min.js'));
const SG = require(join(here, '..', 'TableX', 'js', 'sitegen.js'));

const [src, specPath, outDir] = process.argv.slice(2);
if (!src || !specPath || !outDir) {
  console.error('usage: node tools/gen_site.mjs <export.xlsx> <spec.json> <out-dir>');
  process.exit(1);
}

const spec = JSON.parse(readFileSync(specPath, 'utf8'));

// The FILE NAME is the group name — Planet refused the same workbook named
// anything else (TS, 2026-10-02). The driver names the file, rather than
// taking a name that could disagree with the group inside it.
const out = join(outDir, SG.groupFileName(spec.groupName));

console.log('reading', src, '...');
const wb = XLSX.read(readFileSync(src), { type: 'buffer' });
const sheets = SG.readSheets(XLSX, wb);
console.log('sheets:', sheets.map(s => `${s.name} (${s.rows.length})`).join(', '));

// Refuse a collision before it reaches a shared project — an import that
// reuses a Site ID overwrites a real site for the whole team.
const existing = SG.existingSiteIds(sheets);
const clash = spec.sites.map(s => s.siteId).filter(id => existing.has(String(id).toLowerCase()));
if (clash.length) {
  console.error('REFUSED — these Site IDs already exist in the export:', clash.join(', '));
  process.exit(2);
}

const bands = SG.bandDonors(sheets);
console.log('bands available:', [...bands.keys()].join(', '));

const specs = spec.sites.map(s => ({ ...s, templateSite: s.templateSite || spec.templateSite }));
// The group a sector joins is a `Group: <name>` column headed with that
// group's exact name, so the group must exist in Planet before the import.
if (spec.groupName) console.log('group:', 'Group: ' + spec.groupName, '(must already exist in Planet)');
const { wb: outWb, warnings } = SG.buildWorkbook(XLSX, sheets, specs,
  { groupName: spec.groupName });
for (const w of warnings) console.warn('  WARNING:', w);

writeFileSync(out, SG.writeWorkbook(XLSX, outWb));

// What was written, sheet by sheet — the line to photograph on TS, the same
// job the import toast's band list does for the database path.
const written = SG.readSheets(XLSX, XLSX.read(readFileSync(out), { type: 'buffer' }));
console.log('\nwrote', out);
for (const sh of written) console.log(`   ${sh.name.padEnd(32)} ${sh.rows.length} rows`);
console.log('\ntotal', written.reduce((n, s) => n + s.rows.length, 0), 'rows for',
  specs.length, 'site(s)');

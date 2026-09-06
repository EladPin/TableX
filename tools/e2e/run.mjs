/* TableX end-to-end suites.
 *
 *   node tools/e2e/run.mjs                 (server must already be running)
 *   node tools/e2e/run.mjs --keep-shots    also writes screenshots
 *   node tools/e2e/run.mjs deck            just one suite
 *
 * Exits non-zero if anything fails, so it can gate a build.
 *
 * Start the server first: .\server.ps1 -NoLaunch
 *
 * WHY A BROWSER. Everything worth testing in this app is interactive --
 * clicking a slot onto a slide, dragging it, typing into a table cell,
 * feeding a .pptx through a file input. None of it is reachable from Node,
 * and all of it is where the bugs were: the two real defects these suites
 * have caught (a clone taking a patched slide, and graphicFrame using the
 * wrong XML namespace) were both invisible to inspection.
 *
 * WHAT THEY CANNOT COVER. The fixtures are built by the app's own
 * PptxGenJS, so no file from real PowerPoint passes through them. That is a
 * known limit, and it is the reason js/pptx.js is written to copy whatever
 * it does not understand instead of interpreting it.
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, connect, session, findBrowser } from './cdp.mjs';

const BASE = process.env.TABLEX_URL || 'http://localhost:8094';
const PORT = 9222 + (process.pid % 500);

const SUITES = {
  engine: './engine.mjs',
  deck:   './deck.mjs',
  app:    './app.mjs',
};

const args = process.argv.slice(2);
const keepShots = args.includes('--keep-shots');
const only = args.filter(a => !a.startsWith('--'));
const chosen = only.length ? only : Object.keys(SUITES);

for (const name of chosen) {
  if (!SUITES[name]) {
    console.error(`unknown suite "${name}" — pick from: ${Object.keys(SUITES).join(', ')}`);
    process.exit(2);
  }
}

if (!findBrowser()) {
  console.error('No Edge or Chrome found. Set TABLEX_BROWSER to the .exe.');
  process.exit(2);
}

try {
  const r = await fetch(BASE + '/', { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error('status ' + r.status);
} catch (e) {
  console.error(`Cannot reach ${BASE} — start the server first:\n  .\\server.ps1 -NoLaunch`);
  process.exit(2);
}

let shotDir = null;
if (keepShots) {
  shotDir = join(tmpdir(), 'tablex-e2e-shots');
  mkdirSync(shotDir, { recursive: true });
}

const browser = await launch(PORT);
let failed = 0, passed = 0;

try {
  const wsUrl = await connect(PORT);
  for (const name of chosen) {
    const suite = (await import(SUITES[name])).default;
    // A fresh page per suite: these share a server, and one leaving a
    // template or a generated table behind would make the next one pass
    // or fail for the wrong reason.
    const t = await session(wsUrl, { base: BASE, shotDir });
    await t.open('/');
    let crash = null;
    try {
      await suite(t);
    } catch (e) {
      crash = e;
    }
    for (const r of t.results) {
      if (r.pass) passed++; else failed++;
      if (!r.pass || process.env.TABLEX_VERBOSE) {
        console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${name}: ${r.name}` +
                    (r.note !== undefined ? `  ${r.note}` : ''));
      }
    }
    if (crash) {
      failed++;
      console.log(`FAIL  ${name}: suite threw — ${crash.message}`);
    }
    console.log(`${name.padEnd(7)} ${t.results.filter(r => r.pass).length}/${t.results.length}` +
                (crash ? '  (aborted)' : ''));
    t.close();
  }
} finally {
  browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (shotDir) console.log(`screenshots: ${shotDir}`);
process.exit(failed ? 1 : 0);

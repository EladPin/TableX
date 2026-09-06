/* Shared harness for the end-to-end suites.
 *
 * Drives a real headless Chromium over the DevTools Protocol, because both
 * things worth testing here are interactive: you cannot click a slot into a
 * slide, or a cell into edit mode, with a screenshot.
 *
 * Zero dependencies on purpose, like tools/*.py. Node 22+ has a global
 * WebSocket and fetch, so this needs nothing installed -- which matters
 * because the machines this ships to have no internet and no npm.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];

export function findBrowser() {
  const env = process.env.TABLEX_BROWSER;
  if (env && existsSync(env)) return env;
  for (const b of BROWSERS) if (existsSync(b)) return b;
  return null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch(port) {
  const exe = findBrowser();
  if (!exe) throw new Error('no Edge or Chrome found; set TABLEX_BROWSER');
  const profile = mkdtempSync(join(tmpdir(), 'tablex-e2e-'));
  const proc = spawn(exe, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`,
    '--window-size=1400,950', 'about:blank',
  ], { stdio: 'ignore', detached: false });
  return {
    close() {
      try { proc.kill(); } catch (e) { /* already gone */ }
      try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* locked */ }
    },
  };
}

export async function connect(port, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const t = list.find(x => x.type === 'page' && x.webSocketDebuggerUrl);
      if (t) return t.webSocketDebuggerUrl;
    } catch (e) { /* not listening yet */ }
    await sleep(250);
  }
  throw new Error('no CDP target on port ' + port);
}

/* A test context: one page, one growing list of results. */
export async function session(wsUrl, { base, shotDir }) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise(res => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

  // Every expression is wrapped in an async IIFE, so a suite can await
  // inside it and return a plain value.
  async function ev(expr) {
    const m = await send('Runtime.evaluate', {
      expression: `(async () => { ${expr} })()`,
      awaitPromise: true, returnByValue: true,
    });
    if (m.result.exceptionDetails) {
      throw new Error(m.result.exceptionDetails.exception?.description ||
                      JSON.stringify(m.result.exceptionDetails));
    }
    return m.result.result.value;
  }

  async function shot(name) {
    if (!shotDir) return;
    const m = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(shotDir, name + '.png'), Buffer.from(m.result.data, 'base64'));
  }

  const results = [];
  const ok = (name, pass, note) => results.push({ name, pass: !!pass, note });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',
             { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false });

  async function open(path = '/') {
    await send('Page.navigate', { url: base + path });
    await sleep(3000);              // the loader waits on the DB fetches
  }

  return { send, ev, shot, ok, sleep, open, results, close: () => ws.close() };
}

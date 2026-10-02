/* ═══════════════════════════════════════════════════════════════════
   TableX — Planet point analysis → Hebrew report table → PPTX / PDF

   Data model: three networks, each pre-loaded from data/<network>.json at
   startup. A network holds
       sites   { siteId   : hebrewName }
       sectors { sectorId : [siteId, sector, freqMHz, bwMHz] }
   Lookup is sector-first (that is what Planet reports), falling back to
   site id and flagging the row approximate. Unresolved codes are surfaced,
   never silently rendered as the raw English code.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const T = (k, v) => I18N.t(k, v);
  // Order matters: lookup() walks this list, so our own sites resolve
  // before the commercial operators if a code ever appears in both.
  const NETWORKS = ['idf', 'cellcom', 'partner', 'pelephone'];

  // The optional keys of the file shape, in one place: the import, the backup
  // and the site editor's Save all have to carry every one of them or a save
  // silently drops what the import worked to collect.
  const OPTIONAL = ['notes', 'coords', 'ant', 'pwr', 'crs'];

  // Networks whose תדר מרכזי is the raw EARFCN rather than MHz. IDF only:
  // requested 2026-09-06 because the team reads ENM and the EARFCN is the
  // number they recognise. It is the ONE place the deliverable's frequency
  // column carries two units, and it is a known, accepted property. Defined
  // here so the importer and freqText() cannot disagree about it.
  const EARFCN_NETS = new Set(['idf']);

  // network → { label, sites, sectors, source, built, siteSectors }
  const DB = Object.create(null);

  let lastRows = null;   // [{ pt, rows: [...] }]
  let origRows = null;   // deep copy taken at generate, for Revert
  let tableAnim = true;  // stagger the row reveal on arrival, not on every edit
  let lastMiss = [];     // codes that resolved to nothing
  let dbsReady = false;  // gate: generating before the DBs land yields a table
                         // of untranslated English codes, which is the exact
                         // failure this app exists to prevent

  /* ── toast ───────────────────────────────────────────────────────── */
  let toastTimer = null;
  function toast(msg, isErr) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.toggle('err', !!isErr);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), isErr ? 6000 : 3200);
  }

  const fmt = n => n.toLocaleString('en-US');

  /* ── DB loading ──────────────────────────────────────────────────── */
  function indexDb(db) {
    // siteId → first sector id seen, for the approximate fallback
    const bySite = Object.create(null);
    // siteId → EVERY sector id, so a carrier hint can narrow the fallback
    // instead of settling for whichever sector happened to be first.
    const allBySite = Object.create(null);
    for (const secId in db.sectors) {
      const siteId = db.sectors[secId][0];
      if (!(siteId in bySite)) bySite[siteId] = secId;
      (allBySite[siteId] || (allBySite[siteId] = [])).push(secId);
    }
    db.siteSectors = bySite;
    db.siteSectorsAll = allBySite;
    db.alias = aliasIndex(db);
    return db;
  }

  // ── chained sites (אתרים משורשרים) ─────────────────────────────────
  // An RRU standing at one site, fibred back to ANOTHER site's baseband. ENM
  // names the cell after the site the antenna is on and hangs it under the
  // baseband's NodeId, prefixed with its cell number on that baseband:
  //
  //   node Nahal_Sion   cells 1_Nahal_Sion_1  2_Zivanit_2  4_Hadas_1 …
  //                           ^ its own       ^ Zivanit's  ^ Hadas's
  //
  // Planet's point inspect reports the cell WITHOUT that prefix — `IDF_Hadas_1`,
  // not `IDF_4_Hadas_1` (two real codes off a soldier's paste, 2026-09-10). So
  // one cell has two spellings and both have to resolve: the ENM one because it
  // is the key and what the team reads in ENM, the Planet one because it is what
  // actually gets pasted. Aliasing rather than re-keying means neither is lost.
  //
  // IDF only. Every other network leads with digits that mean something else —
  // stripping Cellcom's `3634249_270` would leave a bare `270` claiming to be a
  // cell id, on hundreds of rows at once.
  const SLOT_PREFIX = /^\d+[-_]/;

  function aliasIndex(db) {
    const m = Object.create(null);
    if (db.network !== 'idf') return m;
    for (const secId in db.sectors) {
      const a = secId.replace(SLOT_PREFIX, '');
      // A real key is never shadowed by an alias, and an alias two cells both
      // claim resolves to neither — a wrong site on a slide is worse than a
      // missing one, which is the rule the Pelephone bandwidth path follows.
      if (a === secId || a in db.sectors) continue;
      m[a] = (a in m) ? null : secId;
    }
    for (const k in m) if (m[k] === null) delete m[k];
    return m;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function hideLoader() {
    const el = $('loader');
    if (!el || el.classList.contains('done')) return;
    el.classList.add('done');
    setTimeout(() => el.remove(), 500);
  }

  // Safety net: if anything below throws, the page must not stay covered.
  setTimeout(hideLoader, 8000);

  async function loadAll() {
    dbsReady = false;
    $('btnGenerate').disabled = true;
    updateHint();

    const t0 = performance.now();
    const bar = $('loaderBar'), status = $('loaderStatus');
    let done = 0;
    const step = () => {
      done++;
      if (bar) bar.style.width = Math.round((done / (NETWORKS.length + 1)) * 100) + '%';
    };

    await Promise.all(NETWORKS.map(async net => {
      try {
        const r = await fetch('data/' + net + '.json', { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        DB[net] = indexDb(await r.json());
      } catch (e) {
        // A missing file is a valid state — the slot is simply empty.
        DB[net] = indexDb({ network: net, label: net, sites: {}, sectors: {} });
      }
      step();
    }));

    // Wait for the webfonts too, so the hero doesn't repaint under the user
    // the moment the loader lifts. Raced with a timeout — a font that never
    // resolves must not hold the app hostage.
    if (status) {
      const n = NETWORKS.reduce((s, x) => s + count(x, 'sectors'), 0);
      status.textContent = T('loader.done', { n: fmt(n) });
    }
    try {
      await Promise.race([document.fonts ? document.fonts.ready : null, sleep(2500)]);
    } catch (e) { /* fonts are cosmetic — never block on them */ }
    step();

    dbsReady = true;
    $('btnGenerate').disabled = false;
    renderDbCards();
    updateChip();
    updateHint();

    // Minimum on-screen time. The DBs load in well under this locally, so this
    // is the number that actually decides how long the loader shows — it is a
    // deliberate brand beat, not a technical wait. The 8s safety timeout above
    // must stay comfortably above it.
    await sleep(Math.max(0, 2500 - (performance.now() - t0)));
    hideLoader();
  }

  const isEmpty = net => !DB[net] || !Object.keys(DB[net].sectors).length;
  const count = (net, k) => (DB[net] ? Object.keys(DB[net][k]).length : 0);

  function updateChip() {
    const live = NETWORKS.filter(n => !isEmpty(n));
    const dot = $('dbChipDot');
    dot.className = 'db-chip-dot' +
      (live.length === NETWORKS.length ? ' ok' : live.length ? ' partial' : '');
    $('dbChipText').textContent = live.length
      ? T('chip.dbs', { n: live.length, total: NETWORKS.length,
                        s: fmt(live.reduce((s, n) => s + count(n, 'sectors'), 0)) })
      : T('chip.none');
  }

  // Every network label is a proper noun, so none of them translate.
  const LABELS = { idf: 'IDF', cellcom: 'Cellcom',
                   partner: 'Partner', pelephone: 'Pelephone' };
  const label = net => LABELS[net] || net;

  // Placeholder examples for the site editor's add-sector form, per network.
  // Until now every network showed Partner's shapes, which teaches the wrong
  // format to anyone adding a Cellcom or Pelephone site by hand.
  //
  // These are sample DATA, not UI copy — the same in both languages, like the
  // paste box's example rows — so they live here beside LABELS rather than in
  // i18n.js. Cellcom's and Pelephone's come from screen captures, since their
  // workbooks live on TS and cannot leave it; treat them as illustrative.
  // IDF's were blank while its format was unknown; the ENM dump landed on
  // 2026-09-06 and they are now real rows from it. Note IDF's `freq` is an
  // EARFCN, not MHz — which is exactly why these placeholders matter here.
  const EXAMPLES = {
    partner:   { secId: 'LNN4610Da',    siteId: 'MN4610A',    name: 'גג בית העם  דישון',
                 sector: 'Da',  freq: '1800', bw: '20' },
    cellcom:   { secId: '3634249_270',  siteId: '14196',      name: '',
                 sector: '270', freq: '2600', bw: '20' },
    pelephone: { secId: '935739_22',    siteId: 'P935739',    name: 'EINAV',
                 sector: '22',  freq: '750',  bw: '10' },
    idf:       { secId: 'Halif_11_SL_1', siteId: 'Halif_11_SL', name: 'כיפת שמיים 11',
                 sector: '1',   freq: '9335', bw: '5' },
  };

  function applyExamples(net) {
    const ex = EXAMPLES[net] || EXAMPLES.idf;
    $('edSectorId').placeholder = ex.secId;
    $('edSiteId').placeholder = ex.siteId;
    $('edSiteName').placeholder = ex.name;
    $('edSector').placeholder = ex.sector;
    $('edFreq').placeholder = ex.freq;
    $('edBw').placeholder = ex.bw;
  }

  function renderDbCards() {
    $('dbGrid').innerHTML = NETWORKS.map((net, i) => {
      const db = DB[net], empty = isEmpty(net);
      const sectors = count(net, 'sectors'), sites = count(net, 'sites');
      const meta = empty
        ? T('db.none')
        : T('db.source') + ': ' + esc(db.source || '—') + '<br/>' +
          T('db.built') + ': ' + esc(db.built || '—');
      return `
        <div class="card db-card reveal ${empty ? '' : 'loaded'}"
             id="dbCard-${net}" style="--d:${i * 70}ms">
          <div class="db-card-head">
            <span class="db-name">${esc(label(net))}</span>
            <span class="db-state ${empty ? '' : 'on'}">${empty ? T('db.empty') : T('db.loaded')}</span>
          </div>
          <div class="db-count ${empty ? 'empty' : ''}" data-to="${sectors}">
            0
            <small>${empty ? T('db.sectors') : T('db.sites', { n: fmt(sites) })}</small>
          </div>
          <div class="db-meta">${meta}</div>
          <div class="db-actions">
            <button class="btn btn-outline btn-sm" data-update="${net}">
              ${empty ? T('db.load') : T('db.update')}
            </button>
            <button class="btn btn-ghost btn-sm" data-edit="${net}">${T('ed.open')}</button>
            ${empty ? '' : `<button class="btn btn-ghost btn-sm" data-backup="${net}"
                                    title="${esc(T('db.backupTitle'))}">${T('db.backup')}</button>`}
            ${empty ? '' : `<button class="btn btn-ghost btn-sm btn-danger"
                                    data-clear="${net}">${T('db.clear')}</button>`}
          </div>
        </div>`;
    }).join('');

    $('dbGrid').querySelectorAll('[data-update]')
      .forEach(b => b.onclick = () => pickFile(b.dataset.update));
    $('dbGrid').querySelectorAll('[data-edit]')
      .forEach(b => b.onclick = () => openEditor(b.dataset.edit));
    $('dbGrid').querySelectorAll('[data-backup]')
      .forEach(b => b.onclick = () => backupDb(b.dataset.backup));
    $('dbGrid').querySelectorAll('[data-clear]')
      .forEach(b => b.onclick = () => clearDb(b.dataset.clear));

    // count up, once the cards have settled in
    $('dbGrid').querySelectorAll('.db-count[data-to]').forEach(el => {
      const to = +el.dataset.to;
      if (!to) return;
      countUp(el, to);
    });
  }

  function countUp(el, to) {
    const small = el.querySelector('small');
    const dur = 700, t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      const v = Math.round(to * (1 - Math.pow(1 - p, 3)));   // ease-out cubic
      el.firstChild.nodeValue = fmt(v);
      if (small) el.appendChild(small);
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  // Distinct frequencies in a parsed database, ascending, as "700, 1800, 2600".
  const bandList = (sectors, net) => {
    const seen = new Set();
    for (const k in sectors) if (sectors[k][2] != null) seen.add(sectors[k][2]);
    const vals = [...seen].sort((a, b) => a - b);
    if (!vals.length) return '—';
    const line = vals.join(', ');
    // For an EARFCN network the raw values mean nothing at a glance, so the
    // bands they land in are named too — that is what makes this line a
    // check rather than a number. `9260, 3525 (700, 900)`.
    if (!EARFCN_NETS.has(net) || !self.TableXBandOf) return line;
    const bands = [...new Set(vals.map(v => self.TableXBandOf(v)).filter(Boolean))]
                    .sort((a, b) => a - b);
    return bands.length ? line + ' (' + bands.join(', ') + ')' : line;
  };

  /* ── in-app confirm ──────────────────────────────────────────────── */
  // window.confirm() renders as "האתר localhost:8094 אומר" — the browser's
  // voice, not the app's, and in the packaged exe it becomes Electron's chrome
  // instead of TableX's. Every prompt goes through this instead.
  //
  // Takes the SAME multi-paragraph strings window.confirm() took: the first
  // paragraph becomes the dialog's question, the rest its body. Returns a
  // Promise<boolean>, so callers must await it.
  let askDone = null;
  function ask(text, opts) {
    const o = opts || {};
    const paras = String(text).split(/\n{2,}/);
    $('askTitle').textContent = paras.shift();
    $('askBody').innerHTML = paras.map(p => '<p>' + esc(p) + '</p>').join('');
    $('askBody').hidden = !paras.length;
    $('askYes').textContent = T(o.ok || 'ask.ok');
    $('askYes').classList.toggle('danger', !!o.danger);
    $('askNo').textContent = T('ask.cancel');
    $('askOverlay').classList.remove('hidden');
    // Focus lands on Cancel, not the confirm: a stray Enter on a destructive
    // prompt must not be the thing that empties a database.
    setTimeout(() => $('askNo').focus(), 40);
    return new Promise(res => { askDone = res; });
  }

  function closeAsk(answer) {
    if (!askDone) return;
    const done = askDone;
    askDone = null;
    $('askOverlay').classList.add('hidden');
    done(answer);
  }

  $('askYes').onclick = () => closeAsk(true);
  $('askNo').onclick = () => closeAsk(false);
  $('askOverlay').onclick = e => { if (e.target === $('askOverlay')) closeAsk(false); };

  /* ── DB clear ────────────────────────────────────────────────────── */
  // Writes an empty database through the SAME api/db/<network> route the xlsx
  // import uses, so the server keeps its one .bak. That rollback copy is the
  // only copy — data/*.bak is gitignored and the source workbooks are not in
  // the repo — so it is worth saying so in the confirm rather than assuming
  // whoever clicks this knows.
  async function clearDb(net) {
    const sectors = count(net, 'sectors'), sites = count(net, 'sites');
    if (!sectors && !sites) return;                 // already empty, nothing to do
    const ok = await ask(T('db.clearConfirm', {
      label: label(net), n: fmt(sectors), s: fmt(sites),
    }), { ok: 'db.clear', danger: true });
    if (!ok) return;

    const card = $('dbCard-' + net);
    if (card) card.classList.add('busy');
    const payload = { network: net, label: label(net), source: null, built: null,
                      sites: {}, sectors: {} };
    try {
      const res = await fetch('api/db/' + net, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text() || res.status);
      DB[net] = indexDb(payload);
      renderDbCards();
      updateChip();
      toast(T('toast.dbCleared', { label: label(net), n: fmt(sectors) }));
    } catch (ex) {
      // Deliberately NOT the import's "use it for this session anyway": a
      // failed import still leaves the user their work, but a failed clear
      // leaves the file on disk intact. Emptying the card would be a lie that
      // un-tells itself on the next refresh.
      if (card) card.classList.remove('busy');
      toast(T('toast.clearFail', { e: ex.message }), true);
    }
  }

  /* ── DB update: xlsx → parsed → POSTed to the server ─────────────── */
  let pendingNet = null;
  const fileInput = $('dbFileInput');

  function pickFile(net) { pendingNet = net; fileInput.value = ''; fileInput.click(); }

  /* ── backup and restore ──────────────────────────────────────────────
     The server keeps exactly ONE .bak per network, taken on the way past a
     write, and data/*.bak is gitignored — so a second mistake overwrites the
     only rollback copy there is. IDF is the worst case: it comes from an ENM
     dump, not a workbook, so a cleared idf.json cannot be rebuilt from inside
     the app at all. Backing one up therefore used to mean finding the file on
     disk, which is not something to ask of someone who has just wiped it.

     Restore rides the SAME api/db/<network> route the xlsx import uses, so the
     server takes its .bak here too and a restored file is byte-identical in
     shape to an imported one. */

  // The file shape CLAUDE.md documents, minus the two lookup indexes that
  // indexDb() adds in place. Rebuilt from memory rather than re-fetched from
  // data/<net>.json, so a database that only ever loaded for the session
  // (because the server write failed) can still be saved out.
  function dbFileShape(net) {
    const db = DB[net] || {};
    return {
      network: net,
      label: label(net),
      source: db.source || '—',
      built: db.built || '—',
      sites: db.sites || {},
      sectors: db.sectors || {},
      ...OPTIONAL.reduce((o, k) => {
        if (db[k] && Object.keys(db[k]).length) o[k] = db[k];
        return o;
      }, {}),
    };
  }

  function backupDb(net) {
    const f = net + '-' + new Date().toISOString().slice(0, 10) + '.json';
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(dbFileShape(net))], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = f;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(T('toast.backupDone', { label: label(net), f }));
  }

  // Throws with a short reason rather than returning null, so the toast can
  // say WHICH part of the file was wrong instead of a bare "invalid".
  function readBackup(text) {
    const d = JSON.parse(text);
    if (!d || typeof d !== 'object') throw new Error('not an object');
    if (!d.sites || typeof d.sites !== 'object') throw new Error('sites');
    if (!d.sectors || typeof d.sectors !== 'object') throw new Error('sectors');
    const bad = Object.keys(d.sectors).find(k => !Array.isArray(d.sectors[k]));
    if (bad) throw new Error('sector ' + bad);
    return d;
  }

  // Shared by the import and the restore: both REPLACE the database, so both
  // owe the user the same warning before a big drop.
  async function confirmShrink(net, now) {
    const was = count(net, 'sectors');
    if (!was || now >= was * 0.6) return true;
    return ask(T('db.shrink', {
      label: label(net), was: fmt(was), now: fmt(now),
      pct: Math.round((1 - now / was) * 100),
    }), { ok: 'db.update', danger: true });
  }

  // One definition of "write it to the server and adopt it", so the import and
  // the restore cannot drift. A failed write still leaves the parsed data in
  // memory for the session — deliberately the opposite of clearDb(), which
  // must NOT apply in memory when the disk write failed.
  async function persistDb(net, payload, okMsg) {
    try {
      const res = await fetch('api/db/' + net, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text() || res.status);
      DB[net] = indexDb(payload);
      renderDbCards();
      updateChip();
      toast(okMsg);
    } catch (ex) {
      DB[net] = indexDb(payload);
      renderDbCards();
      updateChip();
      toast(T('toast.dbSession', { e: ex.message }), true);
    }
  }

  // The workbook contract lives in js/dbparse.js, which runs in a Worker.
  // Parsing an 8 MB Planet group export is 4–6 s of straight-line CPU: on the
  // main thread that is long enough for Chrome to raise "page unresponsive",
  // which is alarming in a browser and unacceptable once this is an exe.
  //
  // dbparse.js is ALSO loaded as a plain script by index.html, so if a Worker
  // cannot start we still parse — inline, freezing as before, rather than
  // refusing the user's file. One copy of the parser serves both paths.
  //
  // `op` picks which side of dbparse.js runs: 'parse' builds a database,
  // 'inspect' just reports what is in the workbook. One driver for both, so
  // the Worker, the fallback and the error handling cannot drift apart.
  function parseWorkbookAsync(buf, onStage, op, opts) {
    op = op || 'parse';
    return new Promise((resolve, reject) => {
      const inline = () => {
        try {
          resolve(op === 'inspect'
            ? self.TableXInspect(buf)
            : self.TableXParse(buf, null, opts));
        } catch (ex) { reject(ex); }
      };
      let w = null;
      try { w = new Worker('js/dbparse.js'); } catch (e) { w = null; }
      if (!w) return inline();

      let settled = false;
      w.onmessage = ev => {
        const m = ev.data || {};
        if (m.stage) return onStage(m.stage);
        settled = true;
        w.terminate();
        if (m.error) reject(new Error(m.error));
        else resolve(m.result);
      };
      w.onerror = () => {
        if (settled) return;
        settled = true;
        w.terminate();
        inline();
      };
      // Structured clone, NOT a transfer: a transfer detaches the buffer here,
      // and the inline fallback above would then have nothing left to parse.
      w.postMessage({ op, buf, opts });
    });
  }


  fileInput.onchange = e => {
    const file = e.target.files[0], net = pendingNet;
    if (!file || !net) return;
    const card = $('dbCard-' + net);
    if (card) card.classList.add('busy');
    toast(T('toast.reading', { f: file.name }));

    // A .json is one of our own backups, not a Planet export: it needs no
    // parsing, no Worker and no band check, because it was written by the
    // side of the app that had already done all three.
    if (/\.json$/i.test(file.name)) {
      const jr = new FileReader();
      jr.onload = async ev => {
        const stop = msg => {
          if (card) card.classList.remove('busy');
          toast(msg, true);
        };
        let d = null;
        try { d = readBackup(ev.target.result); }
        catch (ex) { return stop(T('toast.badJson', { e: ex.message })); }

        // Restoring Partner's backup onto the IDF card would replace a good
        // database with another network's rows — the same data loss the
        // shrink guard and the server's -cmatch whitelist exist to prevent.
        // The file names its own network, so trust that over the card that
        // happened to be clicked.
        if (d.network && d.network !== net) {
          return stop(T('toast.wrongNet', { got: d.network, want: net }));
        }

        if (!await confirmShrink(net, Object.keys(d.sectors).length)) {
          if (card) card.classList.remove('busy');
          toast(T('toast.importCancelled'));
          return;
        }

        // Keep the backup's own provenance: a restored IDF database still came
        // from IDF_DB.txt on the day it was built, not from a .json today.
        await persistDb(net, {
          network: net,
          label: label(net),
          source: d.source || file.name,
          built: d.built || new Date().toISOString().slice(0, 10),
          sites: d.sites,
          sectors: d.sectors,
          // The plant rides the restore too. It used to be left out, so
          // restoring a backup silently dropped every coordinate, antenna,
          // power and CRS value the import had collected.
          ...OPTIONAL.reduce((o, k) => {
            if (d[k] && typeof d[k] === 'object' && Object.keys(d[k]).length) o[k] = d[k];
            return o;
          }, {}),
        }, T('toast.restored', {
          label: label(net),
          n: fmt(Object.keys(d.sectors).length),
          s: fmt(Object.keys(d.sites).length),
        }));
        if (card) card.classList.remove('busy');
      };
      jr.readAsText(file);          // UTF-8, so the Hebrew names survive
      return;
    }

    const reader = new FileReader();
    reader.onload = async ev => {
      let parsed = null, err = null;
      try {
        parsed = await parseWorkbookAsync(
          ev.target.result, stage => toast(T('toast.' + stage)), 'parse',
          { freq: EARFCN_NETS.has(net) ? 'earfcn' : null });
      } catch (ex) { err = ex.message; }

      if (!parsed) {
        if (card) card.classList.remove('busy');
        toast(T('toast.badSheet') + (err ? ' — ' + err : ''), true);
        return;
      }

      // A repeated Sector ID is not a key — the second row overwrites the
      // first, so the import would report success while most of the network
      // quietly vanished. That is data loss, not a blank field, so it is a
      // hard refusal rather than a prompt.
      if (parsed.dupes) {
        if (card) card.classList.remove('busy');
        toast(T('toast.dupSectors', { n: fmt(parsed.dupes),
                                      total: fmt(parsed.rows),
                                      id: parsed.dupeExample }), true);
        return;
      }

      // Band Name that does not resolve to a real band label (an EARFCN, say)
      // leaves frequency blank rather than printing a wrong number. Say so and
      // let the user decide — the site names may still be worth having.
      if (parsed.unknownBand) {
        const go = await ask(T('db.unknownBand', {
          n: fmt(parsed.unknownBand), total: fmt(parsed.rows),
          ex: parsed.bandExample || '—',
        }), { ok: 'db.update', danger: true });
        if (!go) {
          if (card) card.classList.remove('busy');
          toast(T('toast.importCancelled'));
          return;
        }
      }

      // An import REPLACES the database, it does not merge. A group export
      // filtered to one region would otherwise quietly shrink a live DB, and
      // the first sign of trouble is a table of untranslated English codes —
      // exactly the failure this app exists to prevent. Confirm a big drop;
      // the normal case (a refresh that grows) is never interrupted.
      if (!await confirmShrink(net, Object.keys(parsed.sectors).length)) {
        if (card) card.classList.remove('busy');
        toast(T('toast.importCancelled'));
        return;
      }

      const payload = {
        network: net,
        label: label(net),
        source: file.name,
        built: new Date().toISOString().slice(0, 10),
        sites: parsed.sites,
        sectors: parsed.sectors,
      };
      // Optional, and each omitted when empty, so a database with none of
      // them stays shape-identical to one imported before they existed.
      for (const k of OPTIONAL) {
        if (parsed[k] && Object.keys(parsed[k]).length) payload[k] = parsed[k];
      }

      // The bands are the cheapest possible check that the import read the
      // workbook correctly, and the only one available on a machine whose
      // files can never be sent out: "700, 1800, 2600" is obviously right,
      // "1400, 2850, 9360" is obviously an EARFCN column read as MHz.
      // The composite key is said out loud for the same reason the band list
      // is: on a machine whose files never leave, the toast is the only place
      // the import can be checked. A database that quietly re-keyed itself is
      // exactly the thing someone should see.
      await persistDb(net, payload, T('toast.dbSaved', {
        label: label(net),
        n: fmt(Object.keys(parsed.sectors).length),
        f: bandList(parsed.sectors, net),
      }) + (parsed.composite ? ' \u00b7 ' + T('toast.compositeKey') : ''));
      if (card) card.classList.remove('busy');
    };
    reader.readAsArrayBuffer(file);
  };

  /* ── site notes ─────────────────────────────────────── */
  // A trailing parenthetical on a site name is RF-team information, not part
  // of the name — `אמיתי (סקטורים 2,3 הם של ק.ד 235)`. dbparse.js splits it
  // off so the deliverable gets the clean name, and it surfaces HERE instead:
  // in the lookup and the site editor, where someone is asking what a site is.
  //
  // It is deliberately absent from renderTable(), the PPTX writers and the
  // print view, which is the same rule the network chips and `סקטור משוער`
  // already follow: the slide stays seven clean columns.
  function siteNote(net, siteId) {
    const db = DB[net];
    return (db && db.notes && db.notes[siteId]) || null;
  }

  function noteSpan(note) {
    return note ? '<span class="ed-note" title="' + esc(note) + '">' +
                  esc(note) + '</span>' : '';
  }

  /* ── workbook inspector ──────────────────────────────────────────── */
  // The Cellcom, Pelephone and IDF workbooks live on TS and can never leave
  // it, so every parser here has been designed from photographs of a screen.
  // This screen is built to BE that photograph: load any .xlsx and it reports
  // every sheet, every column, a sample value, and which columns are empty —
  // which is the fact a header list alone cannot carry, and the one that has
  // already cost this project once (`Site Name`, empty in all 3,129 rows of
  // the Partner export).
  //
  // It reads the workbook and writes nothing. No database is touched, so it is
  // safe to point at a live export with no card selected and nothing at risk.
  const insInput = $('dbInspectInput');
  let insData = null, insOpen = {};

  $('btnInspect').onclick = () => { insInput.value = ''; insInput.click(); };
  $('insClose').onclick = closeInspect;
  $('dbInspect').onclick = e => { if (e.target === $('dbInspect')) closeInspect(); };
  $('insAll').onclick = () => {
    const all = insData.sheets.every((_, i) => insOpen[i]);
    insData.sheets.forEach((_, i) => { insOpen[i] = !all; });
    renderInspect();
  };

  function closeInspect() { $('dbInspect').classList.add('hidden'); }

  insInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    toast(T('toast.reading', { f: file.name }));

    const reader = new FileReader();
    reader.onload = async ev => {
      let d = null, err = null;
      try {
        d = await parseWorkbookAsync(ev.target.result,
                                     stage => toast(T('toast.' + stage)), 'inspect');
      } catch (ex) { err = ex.message; }

      if (!d || !d.sheets.length) {
        toast(T('toast.insFail') + (err ? ' — ' + err : ''), true);
        return;
      }

      insData = d;
      insOpen = {};
      // The sheets the importer would use open on their own: "why did my file
      // not import" is the other half of this screen's job, and the answer is
      // usually a missing header on one of them.
      d.sheets.forEach((sh, i) => { if (sh.role) insOpen[i] = true; });
      $('insFile').textContent = file.name;
      renderInspect();
      $('dbInspect').classList.remove('hidden');
    };
    reader.readAsArrayBuffer(file);
  };

  function renderInspect() {
    const d = insData;
    if (!d) return;

    $('insCount').textContent = T('ins.count', {
      n: fmt(d.sheets.length), layout: T('ins.layout.' + (d.layout || 'none')),
    });

    $('insList').innerHTML = d.sheets.map((sh, i) => `
      <div class="ins-sheet${insOpen[i] ? ' open' : ''}">
        <button class="ins-head" data-sheet="${i}" aria-expanded="${!!insOpen[i]}">
          <span class="ins-caret" aria-hidden="true">▸</span>
          <span class="mono ins-name">${esc(sh.name)}</span>
          ${sh.role ? `<span class="tag tag-net">${T('ins.role.' + sh.role)}</span>` : ''}
          <span class="grow"></span>
          <span class="ins-dim">${T('ins.cols', { n: sh.cols.length, r: fmt(sh.sampled) })}</span>
        </button>
        ${insOpen[i] ? `<div class="ins-cols">${sh.cols.map(c => `
          <div class="ins-col${c.fill ? '' : ' empty'}">
            <span class="ins-letter mono">${esc(c.col)}</span>
            <span class="ins-h mono">${esc(c.head || '—')}</span>
            <span class="ins-v">${c.fill ? esc(bidiIso(c.sample)) : T('ins.emptyCol')}</span>
          </div>`).join('')}</div>` : ''}
      </div>`).join('');

    $('insList').querySelectorAll('[data-sheet]').forEach(b => b.onclick = () => {
      const i = +b.dataset.sheet;
      insOpen[i] = !insOpen[i];
      renderInspect();
    });

    $('insAll').textContent = d.sheets.every((_, i) => insOpen[i])
      ? T('ins.collapseAll') : T('ins.expandAll');
  }

  /* ── lookup — sector first, then site, across every loaded network ── */
  // What the סקטור column shows, per network. Cellcom's Sector ID is
  // <ECI>_<azimuth>, and the ECI is what names the cell in Planet's Site Editor
  // — site 13207's sectors read 3381013_90, 3381023_90, 3381063_90, all on
  // azimuth 90 and told apart only by the ECI. Printing the azimuth there put
  // "90" on three different cells. The ECI is read back off the sector key
  // rather than restored in the database, so no Cellcom re-import is needed.
  function sectorLabel(net, key, sec) {
    if (net === 'cellcom' && key && key.indexOf('_') > 0) return key.split('_')[0];
    return (sec && sec[1]) || '-';
  }

  // A named cell: sector, frequency and bandwidth are the real values for the
  // cell the code named, so the row is exact. `secId` is the key the values
  // were read under, which is not always the code that was looked up — see
  // aliasIndex().
  function exactHit(net, db, secId) {
    const sec = db.sectors[secId];
    return { net, site: db.sites[sec[0]] || sec[0], siteId: sec[0],
             sector: sectorLabel(net, secId, sec),
             freq: sec[2] == null ? '-' : sec[2],
             bw: sec[3] == null ? '-' : sec[3], exact: true };
  }

  function lookup(code, mhz) {
    if (!code) return null;
    for (const net of NETWORKS) {
      const db = DB[net]; if (!db) continue;
      if (db.sectors[code]) return exactHit(net, db, code);
    }
    // The same cell under its other spelling. Still exact — the cell is
    // identified beyond doubt, only its id is written the other way round.
    for (const net of NETWORKS) {
      const db = DB[net]; if (!db || !db.alias) continue;
      if (db.alias[code]) return exactHit(net, db, db.alias[code]);
    }
    for (const net of NETWORKS) {
      const db = DB[net]; if (!db) continue;
      if (code in db.sites) {
        // With a carrier hint the frequency is certain, so the only open
        // question is which of the site's sectors on that carrier served the
        // point. Filtering to the carrier is what stopped a 700 MHz Pelephone
        // cell from reporting the 2600 of whichever sector was indexed first.
        if (mhz != null) {
          const hits = (db.siteSectorsAll[code] || [])
            .filter(id => db.sectors[id][2] === mhz);
          const bws = new Set(hits.map(id => db.sectors[id][3]));
          return { net, site: db.sites[code] || code, siteId: code,
                   // one sector on the carrier means it can only be that one
                   sector: hits.length === 1
                     ? sectorLabel(net, hits[0], db.sectors[hits[0]]) : '-',
                   freq: mhz,
                   // agree -> certain; disagree or none -> say so, never pick
                   bw: bws.size === 1 ? [...bws][0] : '-',
                   exact: hits.length === 1 };
        }
        const secId = db.siteSectors[code];
        const sec = secId ? db.sectors[secId] : null;
        return { net, site: db.sites[code] || code, siteId: code,
                 sector: sectorLabel(net, secId, sec),
                 freq: sec && sec[2] != null ? sec[2] : '-',
                 bw: sec && sec[3] != null ? sec[3] : '-', exact: false };
      }
    }
    return null;
  }

  /* ── Planet point-inspect codes ──────────────────────────── */
  // Point inspect reports <SiteID>_<cell>, and the shape differs per operator.
  // Verified 2026-09-06 against a real point inspect pasted out of Planet:
  //   Partner    NC4050C_LNC4050Ia            -> sector LNC4050Ia     5/5
  //   Cellcom    13207_3381063_90             -> sector 3381063_90    4/4
  //   IDF        IDF_Halif_11_SL_1            -> cell   Halif_11_SL_1 2/2
  //   Pelephone  P630012_630012_1911236_9260  -> site   P630012
  // Cellcom's leading field is the SITE ID, not the azimuth: ECI minus
  // SiteID*256 lands in 0..255 on every sample. The azimuth trails.
  // Pelephone's code carries no sector at all, so it can only ever reach the
  // site — which lookup() already tags approximate.
  function planetKey(code) {
    if (!code) return null;
    const p = code.split('_');
    if (p[0] === 'IDF') return p.slice(1).join('_');
    if (p.length === 4 && /^P\d+$/.test(p[0])) return p[0];
    if (p.length === 3 && /^\d+$/.test(p[0]) && /^\d+$/.test(p[1]))
      return p[1] + '_' + p[2];
    if (p.length === 2) return p[1];
    return code;
  }

  // Pelephone's code names no sector, but its trailing field is the EARFCN of
  // the carrier that served the point. That is enough to pick the right
  // carrier out of the site instead of guessing at the whole site.
  function planetCarrier(code) {
    const p = String(code || '').split('_');
    if (p.length === 4 && /^P\d+$/.test(p[0]) && /^\d+$/.test(p[3])) {
      return parseInt(p[3], 10);
    }
    return null;
  }

  // EARFCN → MHz, using the importer's own table (exported by dbparse.js) so
  // there is no second copy here to drift out of step with it.
  function mhzOf(earfcn) {
    if (earfcn == null) return null;
    for (const b of (self.TableXBands || [])) {
      if (earfcn >= b[0] && earfcn <= b[1]) return b[2];
    }
    return null;
  }

  // Derived key first, raw code second, so a bare sector id typed by hand
  // still resolves.
  function lookupPlanet(code) {
    const k = planetKey(code);
    const carrier = planetCarrier(code);
    const mhz = mhzOf(carrier);
    const hit = (k && k !== code ? lookup(k, mhz) : null) || lookup(code, mhz);

    // Pelephone prints what its own code carries. `P630012_630012_1911236_9260`
    // names the site, the cell (1911236) and the carrier (EARFCN 9260) — no
    // azimuth anywhere, so there is nothing to look a sector up by and nothing
    // worth guessing. Decided 2026-09-06: show the cell id in the sector column
    // and the RAW EARFCN as the frequency, both straight from the code, the way
    // IDF already prints its EARFCN. Nothing here is estimated, so the row is
    // NOT tagged `סקטור משוער`.
    //
    // The MHz conversion still happens, but only inside lookup() to find the
    // bandwidth — the one field the code does not carry. It comes from the
    // site's sectors on that carrier and prints '-' when they disagree.
    if (hit && carrier != null) {
      const cell = code.split('_')[2];
      if (cell) { hit.sector = cell; hit.exact = true; }
      hit.freq = carrier;
    }
    return hit;
  }

  const isNum  = s => /^-?\d+(\.\d+)?$/.test(s);
  // Planet writes -9999 in BOTH the code and the level column for "no server
  // here". That is an empty slot, not an unresolvable code, so it must never
  // reach the warning banner.
  const isDead = v => !v || /^-?9999(\.0+)?$/.test(v);

  /* ── level formatting ────────────────────────────────────────────── */
  // At most 2 decimals, trailing zeros trimmed:
  //   85 -> "85"   84.3 -> "84.3"   84.30 -> "84.3"   84.333 -> "84.33"
  // The Planet path used to be toFixed(0), which silently rounded a pasted
  // 84.3 down to 84 — a real value change in a commander-facing table, not a
  // display nicety. The legacy path used toFixed(2), which forced "84.30".
  // Both feed the SAME column of the SAME table, so they share this.
  // `negate`: Planet levels are pasted as positive magnitudes and must print
  // negative; legacy rows are already resolved, so their sign is kept.
  function level(raw, negate) {
    const v = parseFloat(raw);
    if (isNaN(v)) return '-';
    const n = parseFloat(Math.abs(v).toFixed(2));
    // `n !== 0` guard: without it a level of 0 prints as "-0".
    return (n !== 0 && (negate || v < 0) ? '-' : '') + n;
  }

  /* ── parse the pasted block ──────────────────────────────────────── */
  function parseInput(raw) {
    const groups = Object.create(null);
    const miss = [];

    for (const line of raw.trim().split(/\r?\n/)) {
      const c = line.split('\t').map(s => s.trim());
      if (c.length < 7) continue;

      // Planet point inspect:  נקודה | RSRP1..3 | BS1..3
      // Three RSRPs in a row and a non-numeric BS1 is what separates this from
      // the legacy layout, whose columns 5 and 6 are frequency and bandwidth.
      // Levels arrive ALREADY negative, and the servers keep Planet's
      // BS1/BS2/BS3 order rather than being re-sorted by strength.
      if (isNum(c[1]) && isNum(c[2]) && isNum(c[3]) && !isNum(c[4])) {
        const pt = parseInt(c[0], 10);
        if (isNaN(pt)) continue;
        groups[pt] = [];
        [0, 1, 2].forEach(i => {
          const code = c[4 + i], lvl = c[1 + i];
          if (isDead(code) || isDead(lvl)) {
            groups[pt].push({ rank: i + 1, code: '-', net: null, exact: null,
                              site: '-', sector: '-', freq: '-', bw: '-',
                              power: '-' });
            return;
          }
          const hit = lookupPlanet(code);
          if (!hit) miss.push(code);
          groups[pt].push({
            rank: i + 1,
            code: code,
            net: hit ? hit.net : null,
            exact: hit ? hit.exact : null,
            site: hit ? hit.site : code,
            sector: hit ? hit.sector : '-',
            freq: hit ? hit.freq : '-',
            bw: hit ? hit.bw : '-',
            power: level(lvl, false),
          });
        });

      } else {
        // Legacy: already-resolved rows, no lookup.
        const pt = parseInt(c[0], 10);
        if (isNaN(pt)) continue;
        if (!groups[pt]) groups[pt] = [];
        groups[pt].push({
          rank: parseInt(c[1], 10) || groups[pt].length + 1,
          code: c[2], net: null, exact: true,
          site: c[2], sector: c[3], freq: c[4], bw: c[5],
          power: level(c[6], false),
        });
      }
    }

    for (const k in groups) groups[k].sort((a, b) => a.rank - b.rank);
    lastMiss = [...new Set(miss)];
    return groups;
  }

  /* ── render ──────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // A site cell holds either a Hebrew name or a raw English code, and the two
  // need OPPOSITE text direction. In an RTL cell the bidi algorithm reorders a
  // digits-and-underscores code: Cellcom's `13207_3381063_90` paints as
  // `90_3381063_13207` -- the same bytes backwards. CLAUDE.md records that this
  // exact reversal, read off Planet's own RTL grid, already produced a wrong
  // conclusion once; printing it on a commander's slide would be the same
  // mistake with our name on it. Pelephone's `P630012_...` happens to survive
  // only because a leading letter anchors the run, which is luck, not safety.
  // So direction follows CONTENT: anything with no Hebrew in it is rendered LTR
  // in the table, the PPTX and the print view alike.
  const HEB = /[\u0590-\u05FF]/;
  const isLtrText = v => !HEB.test(String(v == null ? '' : v));

  // Interpolating a user-typed value into a Hebrew sentence has the same
  // hazard, except the value may be Hebrew OR Latin, so a fixed direction is
  // wrong half the time. U+2068 FIRST STRONG ISOLATE takes its direction from
  // the value's own first strong character and U+2069 pops back, which is the
  // mechanism Unicode defines for exactly this. Invisible, so it survives
  // esc() and works in textContent as well as innerHTML.
  const bidiIso = v => '\u2068' + String(v == null ? '' : v) + '\u2069';

  // Derived from LABELS rather than a second map: the old one still said
  // `ours` (renamed to `idf`) and had no cellcom, so those chips rendered blank.
  // Printed as the proper noun it is (Partner, not PARTNER): the chip is app
  // chrome, and capitals were the loudest thing in every table row.
  const netTag = net => LABELS[net] || net;

  // The sheet carries the style as classes; main.css ("output styles")
  // turns them into the same ink the PPTX writers put in the file.
  function styleSheet(page) {
    page.classList.toggle('out-lean', lean());
    page.dataset.style = outStyle;
  }
  function legendHtml() {
    const cap = legendCaption();
    if (!cap) return '';
    return '<div class="tbl-legend"><span class="lg-label">' + esc(cap.label) + '</span>' +
      '<span class="lg-items" dir="ltr">' + cap.items.map(it =>
        '<span class="lg-item"><i style="background:#' + it.tint + '"></i>' + esc(it.text) + '</span>'
      ).join('') + '</span></div>';
  }

  function renderTable(groups) {
    const keys = Object.keys(groups).map(Number).sort((a, b) => a - b);
    let i = 0;

    let h = `
      <h1 class="tbl-title">טבלת נתונים</h1>
      <table class="data-table" dir="rtl">
        <thead>
          <tr>
            <th style="width:60px"></th>
            <th style="width:52px">מס"ד</th>
            <th>שם אתר משרת</th>
            <th style="width:68px">סקטור</th>
            <th style="width:100px">תדר מרכזי</th>
            <th style="width:110px">רוחב פס (Mhz)</th>
            <th style="width:110px">עוצמה(dBm)</th>
          </tr>
        </thead>
        <tbody>`;

    keys.forEach((nk, gi) => {
      const rows = groups[nk];
      const cls = gi % 2 === 0 ? 'row-a' : 'row-b';
      rows.forEach((r, ri) => {
        // The network chip rides the export (NET_CHIP, below): print shows it
        // and both PPTX writers add it as a run beside the name. The other two
        // annotations stay app-only, and the table stays seven columns.
        let tag = '';
        if (r.net === null && r.exact === null) {
          tag = `<span class="tag tag-miss">לא נמצא</span>`;
        } else {
          if (r.net) tag += `<span class="tag tag-net">${esc(netTag(r.net))}</span>`;
          if (r.exact === false) tag += `<span class="tag tag-warn">סקטור משוער</span>`;
        }
        // Stagger is capped: past row 18 they all arrive together, so a long
        // table never makes the user wait for a decorative animation.
        // Editable cell. The address travels in data-e so a commit can find
        // its row again after the table is rebuilt; `td-edited` marks a
        // hand-typed value and, like every .tag, is app-only.
        const ec = (f, v, extra, st) =>
          `<td class="${extra || ''} td-ed${r.edited && r.edited[f] ? ' td-edited' : ''}` +
          `${f === 'site' && isLtrText(v) ? ' td-ltr' : ''}"` +
          (st ? ` style="${st}"` : '') +
          ` data-e="${nk}:${ri}:${f}" tabindex="0">${esc(v)}`;
        const lv = outStyle === 'coverage' ? rsrpClass(r.power) : null;

        h += `<tr class="${cls}${ri === rows.length - 1 ? ' g-end' : ''}" style="--i:${Math.min(i++, 18)}">`;
        if (ri === 0) h += `<td class="nk-cell" rowspan="${rows.length}">נק' ${nk}</td>`;
        h += `
          <td class="td-rank">${r.rank}</td>
          ${ec('site', r.site, 'td-site')}${tag}</td>
          ${ec('sector', r.sector)}</td>
          ${ec('freq', r.freq)}</td>
          ${ec('bw', r.bw)}</td>
          ${ec('power', r.power, '', lv ? `background:#${lv.tint}` : '')}</td>
        </tr>`;
      });
    });

    // The stagger belongs to the arrival of a NEW table. Re-running it on
    // every cell commit would make the whole table flicker on each edit.
    if (!tableAnim) h = h.replace('class="data-table"', 'class="data-table no-anim"');
    $('docPage').innerHTML = h + `</tbody></table>` + legendHtml();
    styleSheet($('docPage'));
    tableAnim = false;
    $('tableMeta').textContent = T('tbl.meta', { p: keys.length, r: i });

    const ne = editCount();
    $('editNote').textContent = ne ? T('tbl.edited', { n: ne }) : '';
    $('editNote').classList.toggle('hidden', !ne);
    $('btnRevert').classList.toggle('hidden', !ne);

    // the warning that stops an untranslated code reaching a commander
    const notice = $('missNotice');
    if (lastMiss.length) {
      $('missTitle').textContent = T('miss.title', { n: lastMiss.length });
      $('missBody').innerHTML = T('miss.body') +
        lastMiss.map(c => `<span class="mono">${esc(c)}</span>`).join(', ');
      notice.classList.remove('hidden');
    } else {
      notice.classList.add('hidden');
    }
  }

  /* ── editing the generated table ─────────────────────────────────────
     The last mile. A lookup that comes back slightly wrong, or a name that
     needs adjusting for the deck, used to mean fixing it in PowerPoint —
     which is exactly the 20 minutes this app exists to remove. Cells are
     edited in place and every renderer reads `lastRows`, so the HTML table,
     the PPTX and the print view all follow with no second code path.

     An edited cell is marked in the app and NOT in the export, which is the
     same rule `סקטור משוער` already follows: the deliverable stays seven
     clean columns. The toolbar therefore always states the count out loud,
     and Revert puts everything back — a hand-typed value must never be
     invisible to the person about to send the slide. */
  let editing = null;   // { nk, ri, field, td }

  function editCount() {
    let n = 0;
    for (const k in (lastRows || {})) {
      for (const r of lastRows[k]) if (r.edited) n += Object.keys(r.edited).length;
    }
    return n;
  }

  function openCell(td) {
    if (editing) commitCell();
    const [nk, ri, field] = td.dataset.e.split(':');
    const row = lastRows[nk][+ri];
    const inp = document.createElement('input');
    inp.className = 'td-input';
    inp.value = row[field] == null ? '' : String(row[field]);
    inp.dir = field === 'site' ? 'rtl' : 'ltr';
    editing = { nk, ri: +ri, field, td };
    td.textContent = '';
    td.appendChild(inp);
    inp.focus();
    inp.select();
    inp.onkeydown = e => {
      if (e.key === 'Enter')      { e.preventDefault(); commitCell(1); }
      else if (e.key === 'Tab')   { e.preventDefault(); commitCell(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { e.preventDefault(); editing = null; renderTable(lastRows); }
    };
    // Clearing `editing` first is what stops the blur that renderTable's
    // own teardown fires from re-entering this and committing twice.
    inp.onblur = () => commitCell();
  }

  function commitCell(step) {
    if (!editing) return;
    const e = editing;
    editing = null;
    const inp = e.td.querySelector('input');
    if (inp) {
      const v = inp.value.trim();
      const row = lastRows[e.nk][e.ri];
      const was = row[e.field] == null ? '' : String(row[e.field]);
      if (was !== v) {
        row[e.field] = v;
        const orig = origRows && origRows[e.nk] && origRows[e.nk][e.ri];
        const back = orig && String(orig[e.field] == null ? '' : orig[e.field]) === v;
        if (!row.edited) row.edited = {};
        if (back) delete row.edited[e.field]; else row.edited[e.field] = true;
        if (!Object.keys(row.edited).length) delete row.edited;
      }
    }
    renderTable(lastRows);
    if (!step) return;
    // The DOM was just rebuilt, so the neighbour is found by address.
    const cells = [...$('docPage').querySelectorAll('[data-e]')];
    const i = cells.findIndex(c => c.dataset.e === `${e.nk}:${e.ri}:${e.field}`);
    if (cells[i + step]) openCell(cells[i + step]);
  }

  /* ── site data — the sheet an operator request needs ─────────────
     A commander who wants better כיסוי somewhere has to file a request with
     the operator, and that form wants the site's whole physical plant: every
     sector's power, carrier, azimuth, antenna and height, under the site's
     Hebrew name and its coordinates. Elad was reading the first four columns
     out of TableX and typing the rest into PowerPoint by hand.

     It is the REPORT's palette, not the app's — same rule the point-analysis
     table follows, because both are deliverables rather than app chrome. */
  const SD_CAP = 40;                       // candidates collected per search
  const sd = { picked: [], per: 'multi' };

  // dBm -> watts. 49.03 -> 80 W and 46.02 -> 40 W, which is the `80WAT` /
  // `40WAT` an operator request form prints. Nothing is snapped to a
  // "standard" wattage: the arithmetic is exact on what Planet stored, and
  // rounding 79.4 up to 80 would be inventing a number.
  function watts(dbm) {
    if (typeof dbm !== 'number') return null;
    const w = Math.pow(10, (dbm - 30) / 10);
    return w >= 10 ? Math.round(w) : Math.round(w * 10) / 10;
  }

  // Planet writes WGS84 degrees in one project and projected metres in
  // another under the SAME two headers, so the unit is decided by the value
  // rather than assumed — a degree cannot exceed 180.
  function coordText(xy) {
    if (!xy) return null;
    const deg = Math.abs(xy[0]) <= 180 && Math.abs(xy[1]) <= 180;
    const f = v => deg ? v.toFixed(6) : v.toFixed(3);
    return f(xy[0]) + ' \\ ' + f(xy[1]);
  }

  function sdHas(net, id) {
    return sd.picked.some(p => p.net === net && p.id === id);
  }

  // Every site of every network whose name or id matches, capped.
  function sdFind(q) {
    const out = [];
    const t = q.trim().toLowerCase();
    if (!t) return out;
    for (const net of NETWORKS) {
      const db = DB[net];
      if (!db || !db.sites) continue;
      for (const id in db.sites) {
        const nm = db.sites[id] || '';
        if (id.toLowerCase().indexOf(t) < 0 && nm.toLowerCase().indexOf(t) < 0) continue;
        out.push({ net, id, name: nm });
        if (out.length >= SD_CAP) return out;
      }
    }
    return out;
  }

  // One site's rows, in sector order, each carrying whatever plant the
  // database holds. A missing field renders as `-` rather than vanishing,
  // so a gap in the export is visible instead of silent.
  function sdRows(net, id) {
    const db = DB[net] || {};
    const keys = (db.siteSectorsAll && db.siteSectorsAll[id]) || [];
    return keys.slice().sort().map(k => {
      const v = db.sectors[k] || [];
      const a = (db.ant && db.ant[k]) || [];
      const w = watts(db.pwr && db.pwr[k]);
      const crs = db.crs && db.crs[k];
      return {
        sector: sectorLabel(net, k, v),
        freq: v[2] == null ? null : freqText(v[2], net),
        bw: v[3] == null ? null : v[3] + ' MHz',
        az: a[1] == null ? null : String(a[1]),
        height: a[0] == null ? null : String(a[0]),
        antenna: a[3] ? String(a[3]).replace(/\.pafx$/i, '') : null,
        power: w == null ? null : w + ' W',
        // Planet's `Reference Signal Power Boosting (dB)`, as the workbook
        // states it — a boost relative to the data REs, not the RS power.
        crs: typeof crs === 'number' ? crs + ' dB' : null,
        // The numbers behind the text, for the Stylish drawing: it stands
        // each antenna at its real height, facing its real azimuth, tilted
        // by its real mechanical tilt.
        raw: { h: a[0], az: a[1], tilt: a[2], file: a[3],
               mhz: v[2] == null ? null : EARFCN_NETS.has(net) ? mhzOf(v[2]) : v[2] },
      };
    });
  }

  const SD_COLS = ['sector', 'freq', 'bw', 'az', 'height', 'antenna', 'power', 'crs'];
  const SD_HEAD = ['\u05e1\u05e7\u05d8\u05d5\u05e8', '\u05ea\u05d3\u05e8 \u05de\u05e8\u05db\u05d6\u05d9', '\u05e8\u05d5\u05d7\u05d1 \u05e4\u05e1',
                  '\u05d0\u05d6\u05d9\u05de\u05d5\u05d8', '\u05d2\u05d5\u05d1\u05d4', '\u05d3\u05d2\u05dd \u05d0\u05e0\u05d8\u05e0\u05d4', '\u05d4\u05e1\u05e4\u05e7', 'CRS'];

  function sdBlock(p) {
    const db = DB[p.net] || {};
    const rows = sdRows(p.net, p.id);
    const xy = coordText(db.coords && db.coords[p.id]);
    const note = siteNote(p.net, p.id);
    const nm = db.sites && db.sites[p.id];
    return '<section class="sd-site">' +
      '<header class="sd-site-head">' +
        '<h3 class="sd-site-name' + (isLtrText(nm || p.id) ? ' td-ltr' : '') + '">' +
          esc(nm || p.id) + '</h3>' +
        '<span class="sd-site-id mono">' + esc(p.id) + '</span>' +
        '<span class="sd-site-net">' + esc(netTag(p.net)) + '</span>' +
        (xy ? '<span class="sd-site-xy mono">' + esc(xy) + '</span>' : '') +
      '</header>' +
      (note ? '<p class="sd-site-note">' + esc(note) + '</p>' : '') +
      '<table class="data-table sd-table"><thead><tr>' +
        SD_HEAD.map(h => '<th>' + h + '</th>').join('') +
      '</tr></thead><tbody>' +
      (rows.length
        ? rows.map((r, i) => '<tr class="' + (i % 2 ? 'rb' : 'ra') + '">' +
            SD_COLS.map(c => '<td' + (isLtrText(r[c] || '') ? ' class="td-ltr"' : '') +
              '>' + esc(r[c] == null ? '-' : r[c]) + '</td>').join('') +
          '</tr>').join('')
        : '<tr><td colspan="' + SD_COLS.length + '">-</td></tr>') +
      '</tbody></table></section>';
  }

  /* ── STYLISH — the site drawn as it stands, with its data beside it ────
     Elad's sketches (2026-09-29): a mast, an arrow per sector at its real
     azimuth, the degrees at the tips, the height beside it, and the sector
     lines to one side. So each site becomes a card: the site in 2.5D — the
     mast, its antennas to scale, a wedge and an arrow per DISTINCT azimuth on
     the ground — and the sector table beside it, each row carrying its
     wedge's colour so the eye goes arrow -> row.

     Grouped by azimuth, not by sector, because a real site stacks carriers
     on one azimuth (Cellcom 14196: 700, 1800 and 2600 all at 70°) and three
     arrows drawn on top of each other read as one arrow anyway.

     The diagram is ONE SVG string, used twice: inline on the sheet, and
     rasterised (svgPng) into the PPTX, so the slide shows exactly what the
     screen showed. Its text is digits, ° and N only, set in Arial — an SVG
     painted as an image cannot reach the page's webfonts, and Hebrew inside
     it would be the one thing that renders differently on the slide.
     A sector with no azimuth is not guessed at: it gets no arrow and a grey
     '-' row, the same rule every other missing field follows. */
  const BEAM = ['4A3F8C', '0E7C66', 'D9480F', '1C7ED6', 'AE3EC9', '5C940D'];
  const BEAM_NONE = '8A8A99';

  function azGroups(rows) {
    const m = new Map();
    rows.forEach(r => {
      const n = r.az == null ? NaN : ((parseFloat(r.az) % 360) + 360) % 360;
      const k = isFinite(n) ? String(n) : 'x';
      if (!m.has(k)) m.set(k, { az: isFinite(n) ? n : null, rows: [] });
      m.get(k).rows.push(r);
    });
    const gs = [...m.values()].sort((a, b) =>
      (a.az == null) - (b.az == null) || (a.az || 0) - (b.az || 0));
    let ci = 0;
    gs.forEach(g => { g.color = g.az == null ? BEAM_NONE : BEAM[ci++ % BEAM.length]; });
    return gs;
  }

  /* The drawing — the site as it stands, in 2.5D (second pass, 2026-09-29).
     An oblique view looking NORTH from the south, 28° above the horizon, so
     north is "into the page" and an arrow on the ground points the way a map
     would: 90° to the right, 180° towards you.

     Everything above the ground is TO SCALE, in one px-per-metre `s` fitted
     to the site: the lattice, each antenna at its own height, facing its own
     azimuth, tilted by its own mechanical tilt and sized from its datasheet
     (ANT_DIMS), a 1.75 m person and a 7 m tree at the foot for scale. The
     compass on the ground is NOT to scale — coverage is kilometres and the
     mast is metres — it carries direction only: a wedge per azimuth, as
     wide as the antenna's horizontal beamwidth, with the degrees at its rim.

     Nothing is guessed. An antenna without both a height and an azimuth is
     not stood on the mast; an azimuth without a height still gets its wedge;
     a site with no plant at all gets a pale generic mast and no dimensions. */
  const SV = { W: 620, H: 600 };
  const EL = 28 * Math.PI / 180, SE = Math.sin(EL), CE = Math.cos(EL);
  const VIEW = [0, CE, -SE];                  // into the page, looking down
  const LIGHT = (v => v.map(x => x / Math.hypot(...v)))([-0.5, -0.45, 0.74]);
  const GR = 188;                             // the ground compass, px
  let svgSeq = 0;                             // gradient ids, unique per card

  // Real antenna bodies, metres: [length, width, depth, horizontal beamwidth].
  // From the manufacturers' datasheets — sources in CLAUDE.md ("Stylish").
  // Keyed by the model as Planet's pattern file names it: upper-case, no
  // hyphens, band suffix cut, because `EGV465DR6_700.pafx` and
  // `EGV465DR6_1800.pafx` are ONE physical EGV4-65D-R6 modelled once per band.
  // A model without a length here is drawn at the typical size for what it
  // carries (TYPICAL); a beamwidth alone still narrows its wedge. A fifth
  // field names a shape other than a panel: 'dish'. 360° is an omni.
  const ANT_DIMS = {
    EGV465DR6:          [2.688, 0.350, 0.208],        // CommScope EGV4-65D-R6
    EGZV565DR6:         [2.688, 0.395, 0.228],        // CommScope EGZV5-65D-R6
    RV465DR5:           [2.688, 0.350, 0.208],        // CommScope RV4-65D-R5
    RV4PX310R:          [2.533, 0.350, 0.208],        // CommScope RV4PX310R
    RV4PX306R:          [1.599, 0.353, 0.209],        // CommScope RV4PX306R
    RVV65DC33XR:        [2.645, 0.301, 0.180],        // CommScope RVV65D-C3-3XR
    RVV33BR3:           [1.830, 0.640, 0.235, 33],    // CommScope RVV-33B-R3
    DBXLH6565C:         [2.577, 0.269, 0.132],        // CommScope DBXLH-6565C
    TBXLHA6565C:        [2.577, 0.269, 0.132],        // CommScope TBXLHA-6565C
    ODI065R17M18JJJJGQ: [2.680, 0.380, 0.138],        // Comba ODI-065R17M18JJJJ-GQ
    '80010866':         [2.441, 0.377, 0.169],        // Kathrein 800 10866
    '84510866':         [2.441, 0.377, 0.169],        //   the same panel, 845 config
    '80010864':         [1.402, 0.377, 0.169],        // Kathrein 800 10864 (IDF)
    '80010867':         [1.459, 0.377, 0.169],        // Kathrein 800 10867 (IDF)
    LNX6515DS:          [2.449, 0.301, 0.181],        // CommScope LNX-6515DS (-VTM, -A1M)
    ODI032R20M:         [2.600, 0.600, 0.200, 32],    // Comba ODI-032R20M-Q, estimated
    CC12:               [2.000, 2.000, 0.550, 13, 'dish'], // Vega CC12-WB: 2.0 m grid dish
    '80010892':         [2.691, 0.377, 0.169],        // Kathrein 800 10892
    '80010292':         [2.694, 0.262, 0.149],        // Kathrein 800 10292
    '80010622':         [1.415, 0.323, 0.071],        // Kathrein 800 10622
    '742264':           [1.334, 0.261, 0.146],        // Kathrein 742 264
    '741571':           [0.078, 0.210, 0.210, 360],   // Kathrein indoor ceiling omni
    TNA340A33:          [1.300, 0.300, 0.150],        // estimated, see CLAUDE.md
    HBXX3319DS: [0, 0, 0, 33], HBX3319DS: [0, 0, 0, 33],
    HBX4517DS:  [0, 0, 0, 45], HBX4517DS1: [0, 0, 0, 45], DBXLH9090C: [0, 0, 0, 90],
  };
  // No datasheet: the median of the ones above for what it carries — a
  // panel with a low band (700-900) is a long multiband, one without is not.
  const TYPICAL = { low: [2.6, 0.35, 0.17], mid: [1.4, 0.30, 0.12] };
  const antModel = f => String(f || '').toUpperCase().replace(/\.PAFX$/, '')
    .replace(/_.*$/, '').replace(/[-\s]/g, '');
  // Exact first, then the longest known model the name STARTS with, so that
  // `80010892V01`, `LNX6515DSA1M` and a Vega `CC12V` all find their entry.
  const antSpec = model => ANT_DIMS[model] || ANT_DIMS[Object.keys(ANT_DIMS)
    .filter(k => k.length >= 4 && model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0]] || [];

  // The physical antennas of a site: one per model per height on each
  // azimuth. Where two on one azimuth would overlap in height they stand
  // side by side on the mount, as a real head frame carries them.
  function siteAntennas(groups) {
    const out = [];
    groups.forEach(g => {
      g.hpbw = 65; g.omni = false;
      if (g.az == null) return;
      const m = new Map();
      g.rows.forEach(r => {
        const a = r.raw || {};
        if (typeof a.h !== 'number') return;
        const model = antModel(a.file);
        const k = model + '\u0000' + a.h;
        if (!m.has(k)) m.set(k, { g, h: a.h, tilt: typeof a.tilt === 'number' ? a.tilt : 0,
                                  model, mhz: [] });
        if (a.mhz) m.get(k).mhz.push(a.mhz);
      });
      const list = [...m.values()].sort((a, b) => a.h - b.h);
      list.forEach(a => {
        const d = antSpec(a.model);
        const t = a.mhz.some(f => f < 1000) ? TYPICAL.low : TYPICAL.mid;
        Object.assign(a, { L: d[0] || t[0], W: d[1] || t[1], D: d[2] || t[2],
                           hpbw: d[3] || 65, omni: d[3] === 360, dish: d[4] === 'dish', off: 0 });
      });
      const tiers = [];
      list.forEach(a => {
        const tier = tiers.find(ti => ti.some(b => Math.abs(a.h - b.h) < (a.L + b.L) / 2));
        if (tier) tier.push(a); else tiers.push([a]);
      });
      tiers.forEach(ti => {
        let x = -(ti.reduce((n, a) => n + a.W, 0) + 0.15 * (ti.length - 1)) / 2;
        ti.forEach(a => { a.off = x + a.W / 2; x += a.W + 0.15; });
      });
      if (list.length) {
        g.omni = list.every(a => a.omni);
        g.hpbw = Math.max(...list.map(a => a.omni ? 0 : a.hpbw)) || 65;
      }
      out.push(...list);
    });
    return out;
  }

  const hexRgb = h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  // `k` darkens (light falling on the face), `w` mixes towards white.
  const tone = (hex, k, w) => '#' + hexRgb(hex).map(c =>
    Math.max(0, Math.min(255, Math.round((c + (255 - c) * (w || 0)) * k)))
      .toString(16).padStart(2, '0')).join('');
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  const angDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

  function siteSvg(groups) {
    const { W, H } = SV;
    const id = 'st' + (++svgSeq);
    const cx = W / 2, gy = H - GR * SE - 54;
    const rad = d => d * Math.PI / 180;
    const f = n => n.toFixed(1);
    const INK = '#1A1A2E', STEEL = '#4B4963', DIM = '#6B6B7B';

    const ants = siteAntennas(groups);
    const lit = groups.filter(g => g.az != null);
    const known = ants.length > 0;
    const pole = known && ants.every(a => a.omni);
    const bodyTop = known ? Math.max(...ants.map(a => a.h + a.L / 2)) : 30;
    // A site whose antennas all end by 6 m is not a tower: a pipe on a
    // concrete block (בטונדה), Elad's call for the small ones (2026-09-29).
    // Drawn larger, since there is no mast to fit.
    const low = known && bodyTop <= 6;
    // The structure clears the highest antenna body; a site with no plant
    // gets a nominal 30 m, drawn pale and without dimensions.
    const top = known ? bodyTop + (low ? 0 : 0.4) : 30;
    const s = Math.min(low ? 95 : 26, (gy - 44) / (CE * (top + (low ? 0.4 : 1.8))));
    // a lattice about a tenth as wide as it is tall at the foot, 1.1 m at the
    // top; a 76 mm pipe for a pole or on a block
    const r0 = pole || low ? 0.04 : Math.min(3.4, 0.5 + 0.055 * top) * Math.SQRT2;
    const r1 = pole || low ? 0.04 : 0.55 * Math.SQRT2;
    const rAt = z => r0 + (r1 - r0) * Math.max(0, Math.min(1, z / top));
    const mountR = z => rAt(z) + (low ? 0.18 : 0.45);
    // what the structure covers on the ground: the block is 2 m long
    const BLOCK = { half: 1.0, h: 0.81, axis: 62 };
    const foot = low ? BLOCK.half : r0;
    // one oblique projection, at any scale and centred on any height
    const proj = (ox, oy, k, z0) => (x, y, z) => [ox + k * x, oy - k * (y * SE + (z - z0) * CE)];
    const P = proj(cx, gy, s, 0);
    const pt = p => f(p[0]) + ' ' + f(p[1]);
    const G = (az, r) => [cx + r * Math.sin(rad(az)), gy - r * Math.cos(rad(az)) * SE];
    const line = (a, b, st, w, extra) =>
      `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${st}" ` +
      `stroke-width="${f(w)}"${extra || ''}/>`;
    const steel = known ? STEEL : '#C4C2D3';

    // One antenna's frame in the world: its facing (n), its up (u, leaning
    // out by the mechanical tilt), its width axis (w), and its corners.
    const antFrame = a => {
      const az = rad(a.g.az), tl = rad(a.tilt);
      const nv = [Math.sin(az) * Math.cos(tl), Math.cos(az) * Math.cos(tl), -Math.sin(tl)];
      const uv = [Math.sin(az) * Math.sin(tl), Math.cos(az) * Math.sin(tl), Math.cos(tl)];
      const wv = [Math.cos(az), -Math.sin(az), 0];
      const R = mountR(a.h) + a.D / 2 + 0.06;
      const c = [Math.sin(az) * R + wv[0] * a.off, Math.cos(az) * R + wv[1] * a.off, a.h];
      const V = (su, sw, sn) => [0, 1, 2].map(i =>
        c[i] + uv[i] * su * a.L / 2 + wv[i] * sw * a.W / 2 + nv[i] * sn * a.D / 2);
      return { az, nv, uv, wv, V };
    };
    const antCorners = a => {
      if (a.omni) {
        const r = a.W / 2;
        return [[-r, -r, a.h - a.L / 2], [r, r, a.h + a.L / 2], [-r, r, a.h + a.L / 2], [r, -r, a.h - a.L / 2]];
      }
      const { V } = antFrame(a), out = [];
      [1, -1].forEach(su => [1, -1].forEach(sw => [1, -1].forEach(sn => out.push(V(su, sw, sn)))));
      return out;
    };

    // The mast and everything on it, for a given projection: drawn once to
    // scale, and once more magnified inside each inset. `k` is px per metre,
    // `wk` thickens the strokes to suit it, `list` is the antennas to hang.
    function rig(P, k, wk, list) {
      const C3 = (c, z) => {
        const r = rAt(z), q = [[0, -r], [r, 0], [0, r], [-r, 0]][c];   // S, E, N, W
        return P(q[0], q[1], z);
      };
      const n = Math.max(2, Math.round(top / 4));
      const zs = Array.from({ length: n + 1 }, (_, i) => top * i / n);
      const face = (k1, k2, col, w) => {
        let t = '';
        for (let i = 0; i < n; i++) {
          t += line(C3(k1, zs[i]), C3(k2, zs[i]), col, w * wk);
          t += line(C3(k1, zs[i]), C3(k2, zs[i + 1]), col, w * wk * 0.8);
          t += line(C3(k2, zs[i]), C3(k1, zs[i + 1]), col, w * wk * 0.8);
        }
        return t + line(C3(k1, top), C3(k2, top), col, w * wk);
      };
      const leg = (c, col, w) => line(C3(c, 0), C3(c, top), col, w * wk, ' stroke-linecap="round"');
      const pale = known ? '#B9B7CC' : '#E1E0EA';
      // The block: a New Jersey barrier section — 0.81 m tall, 0.61 m at the
      // base, 0.15 m at the top, its two slopes breaking at 0.33 m — laid at an
      // angle so both a slope and an end show. Faces painted far to near.
      const block = () => {
        const th = rad(BLOCK.axis), ax = [Math.sin(th), Math.cos(th), 0], bx = [Math.cos(th), -Math.sin(th), 0];
        const prof = [[-0.305, 0], [0.305, 0], [0.305, 0.075], [0.2, 0.33], [0.075, 0.81],
                      [-0.075, 0.81], [-0.2, 0.33], [-0.305, 0.075]];
        const X = (l, q) => [l * ax[0] + q[0] * bx[0], l * ax[1] + q[0] * bx[1], q[1]];
        const L = BLOCK.half, faces = [];
        prof.forEach((q0, i) => {
          const q1 = prof[(i + 1) % prof.length], ey = q1[0] - q0[0], ez = q1[1] - q0[1], el = Math.hypot(ey, ez);
          const m = [0, 1, 2].map(j => (ez / el) * bx[j] + (j === 2 ? -ey / el : 0));
          faces.push({ m, q: [X(-L, q0), X(-L, q1), X(L, q1), X(L, q0)] });
        });
        faces.push({ m: ax, q: prof.map(q => X(L, q)) });
        faces.push({ m: ax.map(v => -v), q: prof.map(q => X(-L, q)) });
        const dep = fc => fc.q.reduce((n, v) => n + v[1] * CE - v[2] * SE, 0) / fc.q.length;
        return faces.filter(fc => dot(fc.m, VIEW) < 0).sort((a, b) => dep(b) - dep(a)).map(fc => {
          const lum = 0.6 + 0.4 * Math.max(0, dot(fc.m, LIGHT));
          return `<path d="M ${fc.q.map(v => pt(P(...v))).join(' L ')} Z" fill="${tone('C2BEB5', lum)}" ` +
                 `stroke="${tone('C2BEB5', 0.62)}" stroke-width="${f(0.6 * wk)}" stroke-linejoin="round"/>`;
        }).join('');
      };
      const backMast = low ? block() : pole ? '' :
        face(1, 2, pale, 0.8) + face(2, 3, pale, 0.8) + leg(2, known ? '#A9A7BE' : '#DCDBE6', 1.4);
      const frontMast = low || pole
        ? line(P(0, 0, low ? BLOCK.h : 0), P(0, 0, top), steel, Math.max(1.6, k * 0.076), ' stroke-linecap="round"')
        : face(3, 0, steel, 1) + face(0, 1, steel, 1) +
          leg(3, steel, 1.7) + leg(1, steel, 1.7) + leg(0, known ? INK : steel, 2.1);

      // head frames: a ring per mounting height, its back half behind the
      // mast. A pipe has clamps, not a frame.
      const tiersZ = low ? [] : [...new Set(list.filter(a => !a.omni).map(a => a.h))];
      const ring = (z, back) => {
        const c = P(0, 0, z), rx = k * mountR(z), ry = rx * SE;
        return `<path d="M ${f(c[0] + (back ? -rx : rx))} ${f(c[1])} A ${f(rx)} ${f(ry)} 0 0 1 ` +
               `${f(c[0] + (back ? rx : -rx))} ${f(c[1])}" fill="none" stroke="${STEEL}" ` +
               `stroke-width="${f(1.3 * wk)}"/>`;
      };

      // one antenna: a box of its real size, each face shaded by where it points
      const antenna = a => {
        const col = a.g.color;
        if (a.omni) {
          const t = P(0, 0, a.h + a.L / 2), b = P(0, 0, a.h - a.L / 2);
          const rx = Math.max(2.5, k * a.W / 2), ry = rx * SE;
          return `<path d="M ${f(b[0] - rx)} ${f(t[1])} L ${f(b[0] - rx)} ${f(b[1])} A ${f(rx)} ${f(ry)} 0 0 0 ` +
                 `${f(b[0] + rx)} ${f(b[1])} L ${f(b[0] + rx)} ${f(t[1])} Z" fill="${tone(col, 0.8)}"/>` +
                 `<ellipse cx="${f(t[0])}" cy="${f(t[1])}" rx="${f(rx)}" ry="${f(ry)}" fill="${tone(col, 1, 0.3)}"/>`;
        }
        const fr = antFrame(a), { az, nv, uv, wv } = fr;
        const V = (su, sw, sn) => P(...fr.V(su, sw, sn));
        const neg = v => v.map(x => -x);
        const arm = r => P(Math.sin(az) * r + wv[0] * a.off, Math.cos(az) * r + wv[1] * a.off, a.h);
        const armLine = line(P(Math.sin(az) * rAt(a.h) * 0.7, Math.cos(az) * rAt(a.h) * 0.7, a.h),
                             arm(mountR(a.h) + 0.06), STEEL, 1.1 * wk);
        if (a.dish) {
          // a grid dish: its rim a circle facing the azimuth, the bowl behind
          // it, the feed in front on three struts
          const c = fr.V(0, 0, 0), R = a.L / 2;
          const at = (r, t, dn) => P(...[0, 1, 2].map(j =>
            c[j] + r * (Math.cos(t) * wv[j] + Math.sin(t) * uv[j]) + nv[j] * dn));
          const ring = (r, dn) => Array.from({ length: 32 }, (_, i) => pt(at(r, i / 32 * 2 * Math.PI, dn))).join(' L ');
          const faceUs = dot(nv, VIEW) < 0;
          const lum = 0.7 + 0.3 * Math.max(0, dot(faceUs ? nv : neg(nv), LIGHT));
          const mesh = tone('B9BCC4', lum), rib = tone('8C8F98', lum);
          let t = armLine;
          // from behind: the bowl's ribs run from the hub to the rim
          if (!faceUs) {
            for (let i = 0; i < 8; i++) {
              t += line(at(0, 0, -a.D / 2), at(R, i * Math.PI / 4, a.D / 2), rib, 0.9 * wk);
            }
          }
          t += `<path d="M ${ring(R, a.D / 2)} Z" fill="${mesh}" fill-opacity="${faceUs ? 0.9 : 0.55}" ` +
               `stroke="#${col}" stroke-width="${f(Math.max(1.6, 2.2 * wk))}" stroke-linejoin="round"/>`;
          [0.7, 0.4].forEach(r => {
            t += `<path d="M ${ring(R * r, a.D / 2 * (faceUs ? 1 - r * r : 1))} Z" fill="none" ` +
                 `stroke="${rib}" stroke-width="${f(0.6 * wk)}" stroke-opacity="0.8"/>`;
          });
          if (!faceUs) t += `<circle cx="${f(at(0, 0, -a.D / 2)[0])}" cy="${f(at(0, 0, -a.D / 2)[1])}" ` +
                            `r="${f(Math.max(1.5, k * 0.08))}" fill="${rib}"/>`;
          // in front: the feed at the focus, on three struts from the rim
          if (faceUs) {
            const feed = at(0, 0, a.D / 2 + R * 0.55);
            [0, 2, 4].forEach(i => { t += line(at(R, i * Math.PI / 3 + 0.5, a.D / 2), feed, rib, 0.8 * wk); });
            t += `<circle cx="${f(feed[0])}" cy="${f(feed[1])}" r="${f(Math.max(1.5, k * 0.09))}" fill="#${col}"/>`;
          }
          return t;
        }
        const faces = [
          { m: nv, q: [V(1, -1, 1), V(1, 1, 1), V(-1, 1, 1), V(-1, -1, 1)], w: 0.18 },
          { m: neg(nv), q: [V(1, -1, -1), V(1, 1, -1), V(-1, 1, -1), V(-1, -1, -1)], w: 0 },
          { m: wv, q: [V(1, 1, 1), V(1, 1, -1), V(-1, 1, -1), V(-1, 1, 1)], w: 0 },
          { m: neg(wv), q: [V(1, -1, 1), V(1, -1, -1), V(-1, -1, -1), V(-1, -1, 1)], w: 0 },
          { m: uv, q: [V(1, -1, 1), V(1, 1, 1), V(1, 1, -1), V(1, -1, -1)], w: 0.35 },
        ];
        // the arm that carries it, from inside the mast to its back
        let t = armLine;
        faces.filter(fc => dot(fc.m, VIEW) < 0).forEach(fc => {
          const lum = 0.62 + 0.38 * Math.max(0, dot(fc.m, LIGHT));
          t += `<path d="M ${fc.q.map(pt).join(' L ')} Z" fill="${tone(col, lum, fc.w)}" ` +
               `stroke="${tone(col, 0.55)}" stroke-width="${f(0.5 * wk)}" stroke-linejoin="round"/>`;
        });
        return t;
      };
      const depth = a => Math.cos(rad(a.g.az));      // north is far
      const behind = list.filter(a => !a.omni && depth(a) > 0).sort((a, b) => depth(b) - depth(a));
      const front = list.filter(a => a.omni || depth(a) <= 0).sort((a, b) => depth(b) - depth(a));
      return backMast + tiersZ.map(z => ring(z, true)).join('') + behind.map(antenna).join('') +
        frontMast + tiersZ.map(z => ring(z, false)).join('') + front.map(antenna).join('') +
        (pole || low ? '' : line(P(0, 0, top), P(0, 0, top + 1.6), steel, 1.3 * wk, ' stroke-linecap="round"'));
    }

    // direction="ltr" is load-bearing: inline on an RTL page the SVG inherits
    // rtl, which FLIPS text-anchor — every label then grew back over its own
    // arrow on screen, while the rasterised copy (an image, so ltr) did not,
    // and the slide and the screen disagreed.
    let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ` +
      `direction="ltr" font-family="Arial, Helvetica, sans-serif" ` +
      // what was drawn, for anyone checking it without looking
      `data-mount="${low ? 'block' : pole ? 'pole' : known ? 'lattice' : 'none'}" ` +
      `data-shapes="${[...new Set(ants.map(a => a.dish ? 'dish' : a.omni ? 'omni' : 'panel'))].join(' ')}">` +
      `<defs><radialGradient id="${id}g" cx="50%" cy="50%" r="50%">` +
        `<stop offset="0" stop-color="#ECEBF4"/><stop offset="1" stop-color="#F8F8FB"/></radialGradient>` +
      `<radialGradient id="${id}f" cx="50%" cy="50%" r="50%">` +
        `<stop offset="0" stop-color="#1A1A2E" stop-opacity="0.26"/>` +
        `<stop offset="1" stop-color="#1A1A2E" stop-opacity="0"/></radialGradient></defs>`;

    // ── the ground: compass, wedges, arrows ──
    o += `<ellipse cx="${cx}" cy="${f(gy)}" rx="${GR}" ry="${f(GR * SE)}" fill="url(#${id}g)" ` +
         `stroke="#D9D7E6" stroke-width="1.2"/>`;
    o += `<ellipse cx="${cx}" cy="${f(gy)}" rx="${f(GR * 0.62)}" ry="${f(GR * 0.62 * SE)}" fill="none" ` +
         `stroke="#E3E1EE" stroke-width="1" stroke-dasharray="3 5"/>`;
    for (let a = 0; a < 360; a += 30) {
      o += line(G(a, GR), G(a, GR + (a % 90 ? 6 : 12)), '#BDB8D6', a % 90 ? 1 : 1.6);
    }
    lit.forEach(g => {
      if (g.omni) {
        o += `<ellipse cx="${cx}" cy="${f(gy)}" rx="${GR}" ry="${f(GR * SE)}" fill="#${g.color}" ` +
             `fill-opacity="0.10" stroke="#${g.color}" stroke-opacity="0.8" stroke-width="2.4"/>`;
        return;
      }
      const hw = g.hpbw / 2, a0 = G(g.az - hw, GR), a1 = G(g.az + hw, GR);
      const arc = `A ${GR} ${f(GR * SE)} 0 ${g.hpbw > 180 ? 1 : 0} 1 ${pt(a1)}`;
      o += `<path d="M ${cx} ${f(gy)} L ${pt(a0)} ${arc} Z" fill="#${g.color}" fill-opacity="0.15"/>`;
      o += `<path d="M ${pt(a0)} ${arc}" fill="none" stroke="#${g.color}" stroke-opacity="0.85" ` +
           `stroke-width="3" stroke-linecap="round"/>`;
    });
    const rin = s * foot + 14;
    lit.forEach(g => {
      if (g.omni) return;
      o += line(G(g.az, rin), G(g.az, GR - 12), '#' + g.color, 3.2, ' stroke-linecap="round"');
      o += `<path d="M ${pt(G(g.az, GR + 3))} L ${pt(G(g.az - 5, GR - 16))} ` +
           `L ${pt(G(g.az + 5, GR - 16))} Z" fill="#${g.color}"/>`;
    });
    o += `<ellipse cx="${cx}" cy="${f(gy)}" rx="${f(s * foot + 18)}" ry="${f((s * foot + 18) * SE)}" ` +
         `fill="url(#${id}f)"/>`;

    // ── layout first: everything that carries words gets its place, and the
    // tree and the person go where none of it is ──
    const boxes = [];                               // [x0, y0, x1, y1]
    const cw = (txt, size) => txt.length * size * 0.56;

    // the degrees at each wedge's rim, and what it carries under them
    const labels = lit.map(g => {
      const fq = [...new Set(g.rows.map(r => r.freq).filter(Boolean)
        .map(v => String(v).replace(/^EARFCN\s*/, '').replace(/\s*MHz$/, '')))]
        .sort((a, b) => parseFloat(a) - parseFloat(b));
      const sub = fq.slice(0, 3).join('/') + (fq.length > 3 ? ' +' + (fq.length - 3) : '');
      const a = g.omni ? 135 : g.az;
      const sx = Math.sin(rad(a)), cy = Math.cos(rad(a));
      let [lx, ly] = G(a, GR + 18);
      let anchor = sx > 0.3 ? 'start' : sx < -0.3 ? 'end' : 'middle';
      ly += cy > 0.3 ? -10 : cy < -0.3 ? 24 : 7;
      // Behind the mast the far rim is where the lattice stands, so the label
      // steps out to the side the arrow leans to.
      if (cy > 0.82) {
        anchor = sx < -0.02 ? 'end' : 'start';
        lx = G(a, GR)[0] + (anchor === 'start' ? 1 : -1) * (s * foot + 16);
        ly = G(a, GR)[1] + 2;
      }
      const deg = g.omni ? 'Omni' : Math.round(g.az * 10) / 10 + '\u00b0';
      const w = Math.max(cw(deg, 25), sub ? cw(sub, 15) : 0);
      // never past the edge of the picture — the slide crops nothing for us
      if (anchor === 'end') lx = Math.max(lx, w + 6);
      else if (anchor === 'start') lx = Math.min(lx, W - w - 6);
      else lx = Math.max(w / 2 + 6, Math.min(lx, W - w / 2 - 6));
      const x0 = anchor === 'start' ? lx : anchor === 'end' ? lx - w : lx - w / 2;
      boxes.push([x0, ly - 21, x0 + w, ly + (sub ? 24 : 5)]);
      return `<text x="${f(lx)}" y="${f(ly)}" text-anchor="${anchor}" font-size="25" font-weight="700" ` +
             `fill="#${g.color}">${esc(deg)}</text>` +
             (sub ? `<text x="${f(lx)}" y="${f(ly + 19)}" text-anchor="${anchor}" font-size="15" ` +
                    `fill="${DIM}">${esc(sub)}</text>` : '');
    }).join('');

    // the heights, as a dimension line beside the mast. Heights too close to
    // letter apart share one label, as a range.
    let dims = '';
    if (known) {
      const hs = [...new Set(ants.map(a => a.h))].sort((a, b) => b - a);
      const reach = Math.max(...ants.map(a => a.omni ? 0 : mountR(a.h) + a.D + Math.abs(a.off) + a.W));
      const xd = Math.min(W - 96, cx + s * Math.max(foot, reach) + 30);
      const yTop = P(0, 0, hs[0])[1];
      dims += line([xd, gy], [xd, yTop], '#8C8AA0', 1) + line([xd - 5, gy], [xd + 5, gy], '#8C8AA0', 1);
      const runs = [];
      hs.forEach(h => {
        const y = P(0, 0, h)[1];
        dims += line([xd - 5, y], [xd + 5, y], '#8C8AA0', 1.2);
        dims += line([cx + s * mountR(h), y], [xd - 7, y], '#B4B2C6', 0.8, ' stroke-dasharray="2 3"');
        const last = runs[runs.length - 1];
        if (last && y - last.y0 < 19) last.lo = h; else runs.push({ hi: h, lo: h, y0: y });
      });
      const m = v => String(Math.round(v * 10) / 10);
      runs.forEach(r => {
        const t = (r.lo === r.hi ? m(r.hi) : m(r.lo) + '\u2013' + m(r.hi)) + ' m';
        dims += `<text x="${f(xd + 9)}" y="${f(r.y0 + 6)}" font-size="17" font-weight="700" fill="${INK}">${esc(t)}</text>`;
      });
      boxes.push([xd - 8, yTop - 14, xd + 12 + cw('00.0\u201300.0 m', 17), gy + 4]);
    }

    // the insets: each tier of antennas, magnified. At true scale a 2.7 m
    // antenna on a 40 m mast is a few pixels tall. A circle shows the same
    // antennas in the same projection and the same proportions, only closer:
    // a similarity of the main drawing about the tier's own centre.
    let insets = '';
    if (known && !pole && !low) {
      const sorted = ants.slice().sort((a, b) => b.h - a.h);
      const tiers = [];
      sorted.forEach(a => {
        const t = tiers[tiers.length - 1];
        if (t && t.lo - (a.h + a.L / 2) < 3) { t.list.push(a); t.lo = Math.min(t.lo, a.h - a.L / 2); }
        else tiers.push({ list: [a], lo: a.h - a.L / 2 });
      });
      const use = tiers.slice(0, 3);
      const IR = use.length === 1 ? 94 : use.length === 2 ? 80 : 66;
      use.forEach((t, i) => {
        const pts = [];
        // framed on the antennas alone; the head frame may run off the edge
        t.list.forEach(a => antCorners(a).forEach(p => pts.push(P(...p))));
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        const bx = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        const bc = [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2];
        // the box's DIAGONAL fits the circle, so no corner of it is clipped
        const zm = Math.min(64 / s, 2 * (IR - 8) / Math.max(Math.hypot(bx[2] - bx[0], bx[3] - bx[1]), 1));
        if (zm < 1.3) return;
        const ix = 14 + IR, iy = 14 + IR + i * (2 * IR + 14);
        const Pz = (x, y, z) => { const q = P(x, y, z); return [ix + (q[0] - bc[0]) * zm, iy + (q[1] - bc[1]) * zm]; };
        const hr = Math.max(8, Math.hypot(bx[2] - bx[0], bx[3] - bx[1]) / 2 + 4);
        const dx = bc[0] - ix, dy = bc[1] - iy, dl = Math.hypot(dx, dy) || 1;
        const cid = id + 'c' + i;
        insets += `<defs><clipPath id="${cid}"><circle cx="${ix}" cy="${f(iy)}" r="${IR}"/></clipPath></defs>` +
          `<circle cx="${f(bc[0])}" cy="${f(bc[1])}" r="${f(hr)}" fill="none" stroke="#9E9BB5" stroke-width="1.2"/>` +
          line([ix + dx / dl * IR, iy + dy / dl * IR], [bc[0] - dx / dl * hr, bc[1] - dy / dl * hr], '#9E9BB5', 1.2) +
          `<circle cx="${ix}" cy="${f(iy)}" r="${IR}" fill="#FFFFFF" stroke="#9E9BB5" stroke-width="1.4"/>` +
          `<g clip-path="url(#${cid})">` + rig(Pz, s * zm, Math.min(2, 0.8 + zm * 0.12), t.list) + `</g>` +
          `<text x="${f(ix + IR * 0.74)}" y="${f(iy + IR * 0.94)}" font-size="13" font-weight="700" ` +
          `fill="${DIM}">\u00d7${zm < 3 ? zm.toFixed(1) : Math.round(zm)}</text>`;
        boxes.push([ix - IR, iy - IR, ix + IR, iy + IR]);
      });
    }

    // ── scale: a 7 m tree, a 1.75 m person, two shrubs ──
    const hit = b => boxes.reduce((n, q) =>
      n + Math.max(0, Math.min(b[2], q[2]) - Math.max(b[0], q[0])) *
          Math.max(0, Math.min(b[3], q[3]) - Math.max(b[1], q[1])), 0);
    // how much of the arrows a box would cover, sampled along each arrow
    const onArrows = b => lit.reduce((n, g) => {
      if (g.omni) return n;
      for (let r = rin; r <= GR; r += 8) {
        const q = G(g.az, r);
        if (q[0] > b[0] && q[0] < b[2] && q[1] > b[1] && q[1] < b[3]) n++;
      }
      return n;
    }, 0);
    const treeAt = (az, d) => {
      const x = d * Math.sin(rad(az)), y = d * Math.cos(rad(az)), b = P(x, y, 0);
      return { az, x, y, b, box: [b[0] - 2.8 * s, P(x, y, 7.1)[1], b[0] + 2.8 * s, b[1] + 2] };
    };
    // the mast itself is in the way of a tree too — not of the person, who
    // stands at its foot
    const mastBox = [cx - s * foot - 6, P(0, 0, top)[1], cx + s * foot + 6, gy + s * foot * SE + 6];
    boxes.push(mastBox);
    const cands = [];
    [235, 260, 285, 210, 310, 125, 150, 335, 100, 60, 30].forEach((az, i) =>
      [foot + 3.4, foot + 5.6].forEach(d => {
        const t = treeAt(az, d);
        const off = t.box[0] < 4 || t.box[2] > W - 4 || t.box[1] < 4;
        // covering words is the worst thing a tree can do here
        t.score = hit(t.box) * 30 + onArrows(t.box) * 250 + (off ? 1e6 : 0) + i * 40 + (d > foot + 4 ? 20 : 0);
        cands.push(t);
      }));
    boxes.pop();                                     // the mast box, again
    // A 7 m tree beside a block site would be the subject of the picture;
    // there the person alone gives the scale. Nor is a tree ever drawn
    // hanging off the edge because no spot inside was free.
    const best = cands.sort((a, b) => a.score - b.score)[0];
    const tr = !low && s * 2.8 < cx - 20 && best.score < 1e6 ? best : null;
    const tree = !tr ? '' : (() => {
      const t = P(tr.x, tr.y, 2.8);
      let o2 = `<ellipse cx="${f(tr.b[0])}" cy="${f(tr.b[1])}" rx="${f(s * 2)}" ry="${f(s * 2 * SE)}" fill="#1A1A2E" fill-opacity="0.05"/>` +
        `<rect x="${f(tr.b[0] - s * 0.17)}" y="${f(t[1])}" width="${f(s * 0.34)}" height="${f(tr.b[1] - t[1])}" fill="#8A7A68"/>`;
      [[-0.9, 4.2, 1.8, '#8FAF89'], [1.0, 4.5, 1.65, '#86A680'], [0, 5.3, 1.75, '#A2BF9C']].forEach(([dx, z, r, c]) => {
        const p = P(tr.x + dx, tr.y, z);
        o2 += `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(s * r)}" fill="${c}"/>`;
      });
      return o2;
    })();
    if (tr) boxes.push(tr.box);

    const personAt = az => {
      const d = foot + (low ? 0.9 : 1.9), x = d * Math.sin(rad(az)), y = d * Math.cos(rad(az)), b = P(x, y, 0);
      return { x, y, b, box: [b[0] - 0.5 * s, P(x, y, 1.8)[1], b[0] + 0.5 * s, b[1]] };
    };
    const pp = [200, 160, 225, 135, 245, 115].map(personAt).sort((a, b) => hit(a.box) - hit(b.box))[0];
    const person = (() => {
      const b = pp.b, hip = P(pp.x, pp.y, 0.86), sh = P(pp.x, pp.y, 1.45), hd = P(pp.x, pp.y, 1.63);
      const bw = Math.max(1.2, s * 0.19), lw = Math.max(1, s * 0.11);
      return `<ellipse cx="${f(b[0])}" cy="${f(b[1])}" rx="${f(s * 0.35)}" ry="${f(s * 0.35 * SE)}" fill="#1A1A2E" fill-opacity="0.12"/>` +
        line([b[0] - s * 0.09, b[1]], [hip[0] - s * 0.05, hip[1]], '#55536A', lw, ' stroke-linecap="round"') +
        line([b[0] + s * 0.09, b[1]], [hip[0] + s * 0.05, hip[1]], '#55536A', lw, ' stroke-linecap="round"') +
        `<rect x="${f(hip[0] - bw)}" y="${f(sh[1])}" width="${f(bw * 2)}" height="${f(hip[1] - sh[1] + s * 0.04)}" ` +
        `rx="${f(bw * 0.7)}" fill="#55536A"/>` +
        `<circle cx="${f(hd[0])}" cy="${f(hd[1])}" r="${f(Math.max(1.3, s * 0.12))}" fill="#55536A"/>`;
    })();
    const bush = (az, d, r) => {
      const c = P(d * Math.sin(rad(az)), d * Math.cos(rad(az)), r * 0.55);
      return `<circle cx="${f(c[0] - s * r * 0.55)}" cy="${f(c[1] + s * r * 0.1)}" r="${f(s * r * 0.62)}" fill="#9CB896"/>` +
             `<circle cx="${f(c[0] + s * r * 0.5)}" cy="${f(c[1] + s * r * 0.15)}" r="${f(s * r * 0.55)}" fill="#8BAA85"/>` +
             `<circle cx="${f(c[0])}" cy="${f(c[1] - s * r * 0.2)}" r="${f(s * r * 0.7)}" fill="#A8C3A2"/>`;
    };
    const tAz = tr ? tr.az : 235;
    // shrubs are real shrubs too: at a block site's scale they stay small
    const bushBack = bush(tAz + 150, foot + 1.1, low ? 0.4 : 0.8),
          bushFront = bush(tAz + 35, foot + 1.6, low ? 0.3 : 0.6);

    // ── paint, back to front ──
    o += (tr && tr.y > 0 ? tree : '') + bushBack;
    o += rig(P, s, 1, ants);
    o += (tr && tr.y > 0 ? '' : tree) + person + bushFront;
    o += dims + labels + insets;

    // north, as a small compass lying on the same ground, in the corner
    {
      const x0 = W - 40, y0 = 42, r = 22;
      o += `<ellipse cx="${x0}" cy="${y0}" rx="${r}" ry="${f(r * SE)}" fill="none" stroke="#C9C6DA" stroke-width="1"/>`;
      o += `<path d="M ${x0} ${f(y0 - r * SE - 3)} L ${x0 - 5} ${f(y0 + 2)} L ${x0} ${f(y0 - 1)} L ${x0 + 5} ${f(y0 + 2)} Z" fill="${INK}"/>`;
      o += `<text x="${x0}" y="${f(y0 - r * SE - 8)}" text-anchor="middle" font-size="14" font-weight="700" fill="${INK}">N</text>`;
    }
    return o + '</svg>';
  }

  // Rasterised at 3x for the slide: sharp on a projector, and a PNG opens
  // in every PowerPoint the TS machines might run, where an SVG picture
  // needs 2019 or later.
  async function svgPng(svg, scale) {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement('canvas');
    c.width = SV.W * scale; c.height = SV.H * scale;
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  // The card's table: one row per sector, grouped by azimuth. The stripe
  // and the azimuth carry the beam colour; the azimuth is written once per
  // group, like the point label in the report table.
  const ST_COLS = ['sector', 'freq', 'bw', 'height', 'antenna', 'power', 'crs'];
  const ST_HEAD = ['אזימוט', 'סקטור', 'תדר מרכזי',
                   'רוחב פס', 'גובה', 'דגם אנטנה', 'הספק', 'CRS'];

  function sdCard(p) {
    const db = DB[p.net] || {};
    const groups = azGroups(sdRows(p.net, p.id));
    const xy = coordText(db.coords && db.coords[p.id]);
    const note = siteNote(p.net, p.id);
    const nm = (db.sites && db.sites[p.id]) || p.id;
    const azTxt = g => g.az == null ? '-' : (Math.round(g.az * 10) / 10) + '°';
    const body = groups.map(g => g.rows.map((r, i) =>
      '<tr class="' + (i === g.rows.length - 1 ? 'g-end' : '') + '">' +
        '<td class="st-stripe" style="background:#' + g.color + '"></td>' +
        '<td class="st-az" style="color:#' + g.color + '">' + (i ? '' : azTxt(g)) + '</td>' +
        ST_COLS.map(c => '<td' + (isLtrText(r[c] || '') ? ' class="td-ltr"' : '') + '>' +
          esc(r[c] == null ? '-' : r[c]) + '</td>').join('') +
      '</tr>').join('')).join('');
    return '<section class="sd-site sd-card">' +
      '<header class="st-head">' +
        '<h3 class="st-name' + (isLtrText(nm) ? ' td-ltr' : '') + '">' + esc(nm) + '</h3>' +
        '<p class="st-meta"><span class="mono">' + esc(p.id) + '</span>' +
          '<span class="st-net">' + esc(netTag(p.net)) + '</span>' +
          (xy ? '<span class="mono">' + esc(xy) + '</span>' : '') + '</p>' +
      '</header>' +
      (note ? '<p class="sd-site-note">' + esc(note) + '</p>' : '') +
      '<div class="st-body">' +
        '<table class="st-table"><thead><tr><th class="st-stripe"></th>' +
          ST_HEAD.map(h => '<th>' + h + '</th>').join('') + '</tr></thead>' +
          '<tbody>' + (body || '<tr><td colspan="' + (ST_COLS.length + 2) + '">-</td></tr>') + '</tbody></table>' +
        '<div class="st-diagram">' + siteSvg(groups) + '</div>' +
      '</div>' +
    '</section>';
  }

  // The site sheet's own style — kept apart from the report table's, since
  // the two sheets offer different styles (Stylish needs azimuths; Coverage
  // needs RSRP) and share only Classic and Clean.
  function siteSheet(page) {
    page.classList.toggle('out-lean', siteStyle === 'clean');
    page.classList.toggle('out-stylish', siteStyle === 'stylish');
    page.dataset.style = siteStyle;
  }

  function renderSite() {
    // candidates
    const q = $('sdSearch').value || '';
    const hits = sdFind(q);
    $('sdResults').innerHTML = !q.trim()
      ? ''
      : hits.length
        ? hits.map(h => '<button class="sd-hit' + (sdHas(h.net, h.id) ? ' on' : '') +
            '" data-sd-net="' + esc(h.net) + '" data-sd-id="' + esc(h.id) + '">' +
            '<span class="sd-hit-name">' + esc(h.name || h.id) + '</span>' +
            '<span class="sd-hit-id mono">' + esc(h.id) + '</span>' +
            '<span class="tag tag-net">' + esc(netTag(h.net)) + '</span></button>').join('')
        : '<p class="ed-msg">' + esc(T('sd.noHits')) + '</p>';

    // the chosen sites
    $('sdPicked').innerHTML = sd.picked.map(p =>
      '<span class="sd-chip"><span>' + esc((DB[p.net].sites || {})[p.id] || p.id) + '</span>' +
      '<button class="sd-chip-x" data-sd-rm data-sd-net="' + esc(p.net) +
      '" data-sd-id="' + esc(p.id) + '" title="' +
      esc(T('sd.remove')) + '">\u00d7</button></span>').join('');

    $('sdActions').classList.toggle('hidden', !sd.picked.length);
    const stylish = siteStyle === 'stylish';
    $('sdPage').innerHTML = sd.picked.length
      ? (stylish
          ? sd.picked.map(sdCard).join('')
          : '<h2 class="tbl-title">\u05e0\u05ea\u05d5\u05e0\u05d9 \u05d0\u05ea\u05e8</h2>' +
            sd.picked.map(sdBlock).join(''))
      : '<p class="ed-msg">' + esc(T('sd.empty')) + '</p>';
    siteSheet($('sdPage'));
    // A stylish card is a slide of its own, so "all on one slide" does not
    // apply to it and the toggle steps aside rather than lying.
    $('sdPer').classList.toggle('hidden', stylish);

    $('sdPer').querySelectorAll('[data-sd-per]').forEach(b =>
      b.classList.toggle('on', b.dataset.sdPer === sd.per));
  }

  $('sdSearch').addEventListener('input', renderSite);
  $('viewSite').addEventListener('click', e => {
    // Checked BEFORE the row, because the remove button sits inside a chip.
    const rm = e.target.closest('[data-sd-rm]');
    if (rm) {
      const net = rm.dataset.sdNet, id = rm.dataset.sdId;
      sd.picked = sd.picked.filter(x => !(x.net === net && x.id === id));
      return renderSite();
    }
    const hit = e.target.closest('.sd-hit');
    if (hit) {
      const net = hit.dataset.sdNet, id = hit.dataset.sdId;
      if (sdHas(net, id)) sd.picked = sd.picked.filter(x => !(x.net === net && x.id === id));
      else sd.picked.push({ net, id });
      return renderSite();
    }
    const per = e.target.closest('[data-sd-per]');
    if (per) { sd.per = per.dataset.sdPer; return renderSite(); }
  });

  $('sdClear').onclick = () => { sd.picked = []; renderSite(); };
  $('sdPrint').onclick = () => window.print();

  /* PptxGenJS 3.12 writes a paragraph's properties (<a:pPr>) before EVERY
     run, so a paragraph of several runs — the network chip beside a site
     name, the coverage legend's swatches — carries several. The schema allows
     one, first; a file that breaks it is the kind PowerPoint offers to
     "repair". So every presentation is tidied on its way out: each paragraph
     keeps its first <a:pPr> and drops the rest. Hooked at exportPresentation,
     which both write() and writeFile() go through. */
  const onePPr = xml => xml.replace(/<a:p>([\s\S]*?)<\/a:p>/g, (m, body) => {
    let seen = false;
    return '<a:p>' + body.replace(/<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/g,
      pp => (seen ? '' : (seen = true, pp))) + '</a:p>';
  });
  function tidyPptx(pptx) {
    const exp = pptx.exportPresentation.bind(pptx);
    pptx.exportPresentation = async props => {
      const buf = await exp(Object.assign({}, props, { outputType: 'arraybuffer' }));
      const z = await JSZip.loadAsync(buf);
      for (const n of Object.keys(z.files)) {
        if (/^ppt\/slides\/slide\d+\.xml$/.test(n)) z.file(n, onePPr(await z.file(n).async('string')));
      }
      const t = props && props.outputType;
      return z.generateAsync({
        type: t === 'STREAM' ? 'nodebuffer' : (t || 'blob'),
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        compression: props && props.compression ? 'DEFLATE' : 'STORE',
      });
    };
    return pptx;
  }

  // The PPTX. Same palette and the same hand-reversed column order as the
  // point-analysis table — PowerPoint tables have no RTL column order, so the
  // arrays are built with the last Hebrew column first. `sd.per` decides
  // whether the chosen sites stack onto one slide or take one each.
  $('sdPptx').onclick = async () => {
    if (!sd.picked.length) return;
    if (typeof PptxGenJS === 'undefined') { toast(T('toast.pptxMissing'), true); return; }
    const btn = $('sdPptx');
    btn.disabled = true;
    try {
      const pptx = tidyPptx(new PptxGenJS());
      pptx.layout = 'LAYOUT_WIDE';
      const BD = { type: 'solid', pt: TBL.border.pt, color: TBL.border.color };
      const cell = (t, o) => ({
        text: t,
        options: Object.assign({
          border: BD, fontSize: TBL.size, fontFace: 'Arial',
          valign: 'middle', align: 'center',
        }, o || {}),
      });

      if (siteStyle === 'stylish') {
        await stylishSlides(pptx);
        await pptx.writeFile({ fileName: 'TableX-sites.pptx' });
        toast(T('toast.pptxDone'));
        return;
      }
      const lean = () => siteStyle === 'clean';

      const groups = sd.per === 'one'
        ? sd.picked.map(x => [x])
        : [sd.picked];

      for (const group of groups) {
        const slide = pptx.addSlide();
        slide.background = { color: 'FFFFFF' };
        let y = 0.35;
        for (const pick of group) {
          const db = DB[pick.net] || {};
          const nm = (db.sites && db.sites[pick.id]) || pick.id;
          const xy = coordText(db.coords && db.coords[pick.id]);
          slide.addText(nm + '   ' + pick.id + (xy ? '   ' + xy : ''), {
            x: 0.3, y, w: 12.7, h: 0.4, fontSize: 15, bold: true,
            color: lean() ? LEAN.ink : '1a1a2e', align: 'right', rtlMode: !isLtrText(nm),
            fontFace: 'Arial',
          });
          y += 0.45;

          const rows = sdRows(pick.net, pick.id);
          // reversed by hand, strongest-Hebrew-column-last
          const L = LEAN;
          const head = SD_HEAD.slice().reverse().map(h => lean()
            ? cell(h, { fill: { color: L.fill }, color: L.ink, bold: true, rtlMode: true,
                        border: pgBorder({ bd: bdLean(L.head) }) })
            : cell(h, { fill: { color: TBL.head }, color: 'FFFFFF', bold: true, rtlMode: true }));
          const body = rows.map((r, i) => SD_COLS.slice().reverse().map(c => lean()
            ? cell(r[c] == null ? '-' : r[c], {
                fill: { color: L.fill }, color: L.ink, rtlMode: !isLtrText(r[c] || ''),
                border: pgBorder({ bd: Object.assign(bdLean(i === rows.length - 1 ? L.end : L.hair),
                                                     { t: i ? L.hair : L.head }) }),
              })
            : cell(r[c] == null ? '-' : r[c], {
                fill: { color: i % 2 ? TBL.rowB : TBL.rowA }, color: '1a1a2e',
                rtlMode: !isLtrText(r[c] || ''),
              })));
          slide.addTable([head].concat(body), {
            x: 0.3, y, w: 12.7, rowH: TBL.rowH,
          });
          y += TBL.rowH * (rows.length + 1) + 0.35;
        }
      }

      await pptx.writeFile({ fileName: 'TableX-sites.pptx' });
      toast(T('toast.pptxDone'));
    } catch (e) {
      toast(T('toast.pptxFail', { e: e.message }), true);
    } finally {
      btn.disabled = false;
    }
  };

  // One slide per site: name and meta across the top, the diagram on the
  // left as a picture, the table on the right as a NATIVE table so the
  // numbers stay editable in PowerPoint. Columns reversed by hand, as in
  // every other writer here.
  async function stylishSlides(pptx) {
    const INK = '1A1A2E', DIM = '6B6B7B';
    const HAIR = { type: 'solid', pt: 0.5, color: 'E4E2EE' };
    const END = { type: 'solid', pt: 0.75, color: '8C8AA0' };
    const HEAD = { type: 'solid', pt: 1.5, color: INK };
    const NONE = { type: 'none' };
    // the antenna column fits `RVV65DC33XR_1800` on one line at 10 pt
    const colW = [0.6, 0.66, 1.62, 0.52, 0.74, 0.95, 0.85, 0.7, 0.09];   // crs .. az, stripe
    const W = colW.reduce((a, b) => a + b, 0), X = 12.83 - W;
    for (const pick of sd.picked) {
      const db = DB[pick.net] || {};
      const nm = (db.sites && db.sites[pick.id]) || pick.id;
      const xy = coordText(db.coords && db.coords[pick.id]);
      const groups = azGroups(sdRows(pick.net, pick.id));
      const slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };

      slide.addShape('rect', { x: 12.23, y: 0.42, w: 0.6, h: 0.06, fill: { color: '4A3F8C' }, line: { color: '4A3F8C', width: 0 } });
      slide.addText(nm, { x: 0.5, y: 0.52, w: 12.33, h: 0.62, fontSize: 28, bold: true, color: INK,
                          align: 'right', rtlMode: !isLtrText(nm), fontFace: 'Arial' });
      // written left-to-right with the id LAST, so it lands at the right edge
      slide.addText([xy, netTag(pick.net), pick.id].filter(Boolean).join('   ·   '), {
        x: 0.5, y: 1.12, w: 12.33, h: 0.36, fontSize: 12, color: DIM, align: 'right',
        rtlMode: false, fontFace: 'Arial' });

      // the drawing, as tall as the space under the title allows
      const ih = 5.45, iw = ih * SV.W / SV.H;
      slide.addImage({ data: await svgPng(siteSvg(groups), 3), x: Math.max(0.2, X - 0.25 - iw), y: 1.62, w: iw, h: ih });

      const cell = (t, o) => ({ text: t, options: Object.assign({
        fontSize: 10, fontFace: 'Arial', color: INK, valign: 'middle', align: 'center',
        fill: { color: 'FFFFFF' } }, o) });
      const head = [ST_HEAD.slice().reverse().map(h =>
          cell(h, { bold: true, color: DIM, rtlMode: true, border: [NONE, NONE, HEAD, NONE] }))
        .concat([cell('', { border: [NONE, NONE, NONE, NONE] })])];
      const body = [];
      groups.forEach(g => g.rows.forEach((r, i) => {
        const last = i === g.rows.length - 1;
        const bd = [i ? HAIR : (body.length ? END : HEAD), NONE, last ? END : HAIR, NONE];
        body.push(ST_COLS.slice().reverse().map(c => cell(r[c] == null ? '-' : r[c],
            { rtlMode: !isLtrText(r[c] || ''), border: bd }))
          .concat([
            cell(i ? '' : (g.az == null ? '-' : (Math.round(g.az * 10) / 10) + '°'),
                 { bold: true, color: g.color, border: [i ? NONE : bd[0], NONE, last ? END : NONE, NONE] }),
            cell('', { fill: { color: g.color }, border: [NONE, NONE, NONE, NONE] }),
          ]));
      }));
      slide.addTable(head.concat(body), { x: X, y: 1.9, w: W, colW, rowH: 0.34 });
    }
  }

  /* ── views ───────────────────────────────────────────────────────── */
  function show(which) {
    const table = which === 'table', lk = which === 'lookup', dk = which === 'decks';
    const sd = which === 'site', db = which === 'db', qu = which === 'quest';
    $('viewHome').classList.toggle('hidden', table || lk || dk || sd || db || qu);
    $('viewDb').classList.toggle('hidden', !db);
    $('viewLookup').classList.toggle('hidden', !lk);
    $('viewDecks').classList.toggle('hidden', !dk);
    $('viewSite').classList.toggle('hidden', !sd);
    $('viewQuest').classList.toggle('hidden', !qu);
    $('viewTable').classList.toggle('hidden', !table);
    // The nav hides for the TABLE view only — that one is the deliverable
    // and carries its own toolbar. The others are places you leave again, so
    // they keep the nav.
    $('nav').classList.toggle('hidden', table);
    const at = lk ? 'lookup' : dk ? 'decks' : sd ? 'site' : db ? 'db'
      : qu ? 'quest' : 'home';
    document.querySelectorAll('.nav-link[data-goto]').forEach(b =>
      b.classList.toggle('active', b.dataset.goto === at));
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (lk) { renderLookup(); setTimeout(() => $('lkSearch').focus(), 60); }
    if (sd) { renderSite(); setTimeout(() => $('sdSearch').focus(), 60); }
    // Templates live on the server, so another copy of the app may have
    // added one since this tab loaded.
    if (dk && global.TableXDeck) global.TableXDeck.reload();
    if (qu && global.TableXQuest) global.TableXQuest.render();
  }

  /* ── lookup view ─────────────────────────────────────────────────────
     The databases are the app's real asset — tens of thousands of sectors
     carrying Hebrew site names that exist in usable form nowhere else on
     these machines. Until now they were reachable only in service of
     generating a table, or through the site editor's search, which is a
     modal about EDITING one network.

     This searches all four at once, deliberately: a code read off Planet
     does not say which operator it belongs to, which is the same reason
     lookup() walks every network rather than taking a selector. */
  const LK_ROW_CAP = 60;     // sites rendered
  const LK_SCAN_CAP = 400;   // sites collected before the scan gives up
  const lkOpen = new Set();  // "net:siteId" expanded by hand

  // Marks every occurrence of the query inside a name, a site id or a sector
  // code. A broad query ("בית") matches hundreds of sites in wildly different
  // positions, and without this the list gives no clue WHY any given row is in
  // it. Escaping happens per fragment, after the split, so the match indices
  // are computed against the raw string and no escape sequence can be cut in
  // half — building the HTML first and searching it second would do exactly
  // that to a name containing & or ".
  function lkHi(text, q) {
    const v = String(text == null ? '' : text);
    if (!q) return esc(v);
    const low = v.toLowerCase();
    let out = '', from = 0, i = low.indexOf(q);
    while (i >= 0) {
      out += esc(v.slice(from, i)) +
             '<mark class="lk-hi">' + esc(v.slice(i, i + q.length)) + '</mark>';
      from = i + q.length;
      i = low.indexOf(q, from);
    }
    return out + esc(v.slice(from));
  }

  // The lookup's empty, hint and no-hit states. They used to be bare <p>s
  // floating in a 200px-tall void, which reads as a search that broke rather
  // than as an answer. One panel, and the second line (which names the
  // databases that ship empty) belongs INSIDE it rather than as a second
  // orphaned paragraph. Deliberately not .ed-msg: deck.js styles its own
  // empty states with that class and has no reason to change.
  const lkPanel = (main, sub) =>
    '<div class="lk-empty">' +
      '<p class="lk-empty-main">' + esc(main) + '</p>' +
      (sub ? '<p class="lk-empty-sub">' + esc(sub) + '</p>' : '') +
    '</div>';

  // exact code first, then prefix, then anything — so typing a full sector
  // id puts its site at the top instead of alphabetically among its peers
  function lkRank(h, q) {
    if (h.id.toLowerCase() === q || h.secs.some(s => s.toLowerCase() === q)) return 0;
    if (h.id.toLowerCase().startsWith(q) ||
        h.secs.some(s => s.toLowerCase().startsWith(q))) return 1;
    return 2;
  }

  // dir="ltr" on every spec: "1800 MHz" is an LTR string, and inside the
  // RTL document bidi reorders it to read "MHz 1800".
  function lkSpecs(net, id, v) {
    return '<span class="ed-spec sec" dir="ltr">' + esc(sectorLabel(net, id, v)) + '</span>' +
           '<span class="ed-spec freq" dir="ltr">' + esc(freqText(v[2], net)) + '</span>' +
           '<span class="ed-spec bw" dir="ltr">' + esc(v[3] == null ? '-' : v[3]) + ' MHz</span>';
  }

  function renderLookup() {
    const raw = $('lkSearch').value.trim(), q = raw.toLowerCase();
    const list = $('lkList'), direct = $('lkDirect');
    const live = NETWORKS.filter(n => !isEmpty(n));
    direct.innerHTML = '';

    if (!live.length) { list.innerHTML = lkPanel(T('lk.empty')); return; }
    if (!raw) {
      list.innerHTML = lkPanel(T('lk.hint', {
        s: fmt(live.reduce((s, n) => s + count(n, 'sectors'), 0)), n: live.length }));
      return;
    }
    if (raw.length < 2) { list.innerHTML = lkPanel(T('lk.short')); return; }

    // A code pasted straight out of Point Inspect resolves through the very
    // function the generator uses, so the answer here IS the answer there —
    // including Pelephone's read-it-off-the-code path and Cellcom's ECI.
    const hit = lookupPlanet(raw);
    if (hit) {
      direct.innerHTML =
        '<div class="lk-direct' + (hit.exact === false ? ' approx' : '') + '">' +
          '<span class="lk-dtag">' + esc(T(hit.exact === false ? 'lk.approx' : 'lk.direct')) + '</span>' +
          '<span class="lk-dname">' + esc(hit.site) + '</span>' +
          '<span class="ed-code" dir="ltr">' + esc(hit.siteId) + '</span>' +
          '<span class="ed-spec" dir="ltr">' + esc(hit.sector) + '</span>' +
          '<span class="ed-spec" dir="ltr">' + esc(freqText(hit.freq, hit.net)) + '</span>' +
          '<span class="ed-spec" dir="ltr">' + esc(hit.bw) + ' MHz</span>' +
          '<span class="grow"></span>' +
          '<span class="tag tag-net">' + esc(netTag(hit.net)) + '</span>' +
        '</div>';
    }

    const hits = [];
    let capped = false;
    scan:
    for (const net of NETWORKS) {
      const db = DB[net]; if (!db) continue;
      for (const id in db.sites) {
        const name = String(db.sites[id] || '');
        const secs = db.siteSectorsAll[id] || [];
        if (id.toLowerCase().includes(q) || name.toLowerCase().includes(q) ||
            secs.some(s => s.toLowerCase().includes(q))) {
          hits.push({ net, id, name, secs });
          // Stop scanning rather than sort thousands: localeCompare('he')
          // over every Partner site on a two-letter query is what would
          // make this feel slow.
          if (hits.length >= LK_SCAN_CAP) { capped = true; break scan; }
        }
      }
    }

    if (!hits.length) {
      // "Not found" reads as a broken search when the network the code
      // belongs to simply ships empty — cellcom and pelephone do, because
      // their workbooks never leave TS. Name them rather than let someone
      // conclude the lookup is wrong.
      const dark = NETWORKS.filter(n => isEmpty(n)).map(label);
      list.innerHTML = lkPanel(
        T('lk.noHits', { q: bidiIso(raw) }),
        dark.length ? T('lk.noHitsEmpty', { list: dark.join(', ') }) : '');
      return;
    }

    hits.sort((a, b) => {
      const ra = lkRank(a, q), rb = lkRank(b, q);
      return ra !== rb ? ra - rb
        : String(a.name || a.id).localeCompare(String(b.name || b.id), 'he');
    });

    const auto = hits.length <= 5;   // few enough to just show the answer
    list.innerHTML = hits.slice(0, LK_ROW_CAP).map((h, i) => {
      const key = h.net + ':' + h.id;
      const open = auto || lkOpen.has(key);
      const db = DB[h.net];
      const rows = !open ? '' :
        '<div class="ed-sectors">' + h.secs.slice().sort().map((id, j) => {
          const v = db.sectors[id];
          return '<div class="ed-sector lk-sector' +
            (id.toLowerCase().includes(q) ? ' hit' : '') +
            '" data-copy="' + esc(id) + '" style="animation-delay:' + (j * 20) + 'ms">' +
            '<span class="mono" dir="ltr">' + lkHi(id, q) + '</span>' + lkSpecs(h.net, id, v) +
          '</div>';
        }).join('') + '</div>';
      return '<div class="ed-site lk-site ' + (open ? 'open' : '') + '" style="--i:' + i + '">' +
        '<div class="ed-site-row" data-lk-toggle="' + esc(key) + '">' +
          '<span class="ed-caret">▶</span>' +
          '<span class="ed-name" data-copy="' + esc(h.name || h.id) + '">' +
            lkHi(h.name || h.id, q) + '</span>' +
          noteSpan(siteNote(h.net, h.id)) +
          '<span class="ed-code" dir="ltr" data-copy="' + esc(h.id) + '">' +
            lkHi(h.id, q) + '</span>' +
          '<span class="tag tag-net">' + esc(netTag(h.net)) + '</span>' +
          '<span class="ed-badge">' + h.secs.length + '</span>' +
        '</div>' + rows +
      '</div>';
    }).join('') +
      (hits.length > LK_ROW_CAP || capped
        ? '<p class="ed-more">' + esc(T('lk.showing',
            { n: Math.min(LK_ROW_CAP, hits.length), total: fmt(hits.length) + (capped ? '+' : '') })) + '</p>'
        : '');

    list.querySelectorAll('[data-lk-toggle]').forEach(el => el.onclick = e => {
      if (e.target.closest('[data-copy]')) return;   // copying is not toggling
      const k = el.dataset.lkToggle;
      if (lkOpen.has(k)) lkOpen.delete(k); else lkOpen.add(k);
      renderLookup();
    });
  }

  // Electron and http://localhost are both secure contexts, so the async
  // clipboard is normally there; the execCommand path is for a plain http://
  // origin, where it is simply absent.
  async function copyText(v) {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(v);
        ok = true;
      }
    } catch (e) { ok = false; }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = v;
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
    }
    toast(ok ? T('lk.copied', { v }) : T('lk.copyFail'), !ok);
  }

  /* ── wiring ──────────────────────────────────────────────────────── */
  // Real Partner codes in point-inspect shape, so the demo resolves 21/21.
  const SAMPLE = [
    '1\t-72.4245\t-78.8269\t-84.1238\tNS3373B_LNS3373Da\tJW1038J_LJW1038Da\tSO5093C_LSO5093Da',
    '2\t-76.2232\t-82.6274\t-88.9477\tWE6261D_LWE6261Da\tEA2362A_LEA2362Da\tEI2402A_LEI2402Da',
    '3\t-80.5771\t-86.3967\t-92.9763\tWE0777A_LWE0777Da\tIN4699B_LIN4699Da\tSM5402B_LSO5402Da',
    '4\t-84.0466\t-90.8585\t-96.2896\tWE3217D_LWE3217Da\tEI2044B_LEI2044Da\tTS0301F_LTS0301Da',
    '5\t-88.1443\t-94.1178\t-100.3085\tNC4491F_LNC4491Da\tEA2271A_LEA2271Da\tIN4130C_LIN4130Da',
    '6\t-92.8161\t-98.1807\t-104.5816\tSO5476C_LSO5476Da\tSO5324B_LSO5324Da\tEI2372B_LEI2372Da',
    '7\t-96.6389\t-102.3724\t-108.5477\tNE4432D_LNE4432Da\tIN4623B_LIN4623Da\tWE3020B_LWE3020Da',
  ].join('\n');

  const ta = $('inputArea');

  $('btnSample').onclick = () => { ta.value = SAMPLE; updateHint(); };

  function updateHint() {
    const hint = $('pasteHint');
    if (!hint) return;
    if (!dbsReady) {
      hint.textContent = T('hint.loading');
      hint.classList.remove('ready');
      return;
    }
    const n = ta.value.trim()
      ? ta.value.trim().split(/\r?\n/).filter(l => l.includes('\t')).length : 0;
    hint.textContent = n ? T('hint.ready', { n: n }) : T('hint.waiting');
    hint.classList.toggle('ready', n > 0);
  }

  ta.addEventListener('input', updateHint);

  $('btnGenerate').onclick = () => {
    if (!dbsReady) { toast(T('toast.dbsLoading'), true); return; }
    const raw = ta.value.trim();
    if (!raw) { toast(T('toast.noData'), true); ta.focus(); return; }
    const groups = parseInput(raw);
    if (!Object.keys(groups).length) {
      toast(T('toast.badData'), true);
      return;
    }
    lastRows = groups;
    origRows = JSON.parse(JSON.stringify(groups));   // what Revert goes back to
    tableAnim = true;
    renderTable(groups);
    show('table');
  };

  // Click or keyboard-focus a cell to edit it; delegated, because the table
  // is rebuilt on every commit.
  $('docPage').addEventListener('click', e => {
    const td = e.target.closest('[data-e]');
    if (td && !td.querySelector('input')) openCell(td);
  });
  $('docPage').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName === 'INPUT') return;
    const td = e.target.closest('[data-e]');
    if (td) { e.preventDefault(); openCell(td); }
  });

  $('btnRevert').onclick = async () => {
    const n = editCount();
    if (!n || !origRows) return;
    if (!(await ask(T('tbl.revertConfirm', { n }), { ok: 'tbl.revertOk', danger: true }))) return;
    lastRows = JSON.parse(JSON.stringify(origRows));
    renderTable(lastRows);
    toast(T('tbl.reverted'));
  };

  $('btnBack').onclick = () => show('home');
  $('btnPrint').onclick = () => window.print();
  $('brandHome').onclick = e => { e.preventDefault(); show('home'); };

  // Named rather than an if-chain: this used to list the views one by one and
  // fall through to home, so a NEW view's nav button silently went home
  // instead — which is what `quest` did until 2026-10-02. An unknown target
  // still goes home, but adding a view is one entry here.
  const GOTO = ['lookup', 'site', 'decks', 'db', 'quest'];
  document.querySelectorAll('[data-goto]').forEach(b => b.onclick = () =>
    show(GOTO.includes(b.dataset.goto) ? b.dataset.goto : 'home'));

  $('lkSearch').addEventListener('input', renderLookup);
  $('viewLookup').addEventListener('click', e => {
    const c = e.target.closest('[data-copy]');
    if (c) copyText(c.dataset.copy);
  });

  $('dbChip').onclick = () => show('db');

  /* ── about the builder ───────────────────────────────────────────── */
  const about = $('aboutModal');
  const openAbout  = () => about.classList.remove('hidden');
  const closeAbout = () => about.classList.add('hidden');

  $('btnAbout').onclick = openAbout;
  $('btnAboutClose').onclick = closeAbout;
  about.onclick = e => { if (e.target === about) closeAbout(); };

  addEventListener('keydown', e => {
    if (e.key === 'Escape' && !about.classList.contains('hidden')) closeAbout();
  });

  addEventListener('scroll', () => $('nav').classList.toggle('scrolled', scrollY > 4),
                   { passive: true });

  // Ctrl+Enter generates — the whole point is speed
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('btnGenerate').click();
  });

  /* ── output styles ─────────────────────────────────────────────────────
     The deliverable comes in three styles, chosen from the table's own
     toolbar and KEPT per machine (tablex_style), because a commander reads a
     familiar table faster than a correct-but-different one: whichever style
     a team settles on has to come out the same every time.

       classic   the purple table commanders already know — the default, and
                 byte-for-byte what every earlier build produced.
       clean     black on white. No fills; a heavy rule under the header,
                 hairlines between rows, a darker rule where a point ends.
       coverage  clean, plus each level tinted in the class Planet 7.10's own
                 RSRP legend puts it in — the colours of the coverage-map
                 screenshots beside it in the deck — with that legend under
                 the table, labelled PREDICTED (see the top of CLAUDE.md).

     One definition feeds every renderer: the HTML through classes on the
     sheet, both PPTX writers through tableMatrix()'s per-cell fills and
     borders, and the template path through TableXReport.caption(). */
  const STYLE_KEY = 'tablex_style';
  const STYLES = ['classic', 'clean', 'coverage'];
  let outStyle = 'classic';
  try {
    const v = localStorage.getItem(STYLE_KEY);
    if (STYLES.includes(v)) outStyle = v;
  } catch (e) { /* private mode */ }
  const lean = () => outStyle !== 'classic';     // clean and coverage share a table

  // The site sheet's style is its own setting: classic, clean or stylish
  // (the drawn site — see STYLISH by renderSite()).
  const SITE_STYLE_KEY = 'tablex_site_style';
  const SITE_STYLES = ['classic', 'clean', 'stylish'];
  let siteStyle = 'classic';
  try {
    const v = localStorage.getItem(SITE_STYLE_KEY);
    if (SITE_STYLES.includes(v)) siteStyle = v;
  } catch (e) { /* private mode */ }

  // Planet 7.10's RSRP legend, exactly as Interfex's drivecore.js carries it
  // (min inclusive, max exclusive) — the classes engineers read off the map.
  // `tint` is the colour at 35% on white: a cell fill black text still reads
  // on, where the pure legend green (#40D63E) would not.
  const RSRP_CLASSES = [
    { min: -60,  max: null, tint: 'F6B8B5', label: '\u2265 \u221260' },
    { min: -75,  max: -60,  tint: 'F5BEE0', label: '\u221275\u2026\u221260' },
    { min: -90,  max: -75,  tint: 'B6D2B7', label: '\u221290\u2026\u221275' },
    { min: -110, max: -90,  tint: 'BCF1BB', label: '\u2212110\u2026\u221290' },
    { min: -120, max: -110, tint: 'B6C5EF', label: '\u2212120\u2026\u2212110' },
    { min: null, max: -120, tint: 'ABABAB', label: '< \u2212120' },
  ];
  // The caption's Hebrew is the DELIVERABLE's, like the headers: fixed, and
  // never translated by the UI language. It says "predicted RSRP".
  const LEGEND_LABEL = 'RSRP \u05d7\u05d6\u05d5\u05d9 (Planet)';
  function rsrpClass(v) {
    const n = parseFloat(v);
    if (!isFinite(n)) return null;
    return RSRP_CLASSES.find(c =>
      (c.min == null || n >= c.min) && (c.max == null || n < c.max)) || null;
  }

  // The lean styles' ink and rules, shared by the point table and the site
  // sheet so the two cannot drift apart.
  const LEAN = {
    ink: '1A1A1A', dim: '6B6B6B', fill: 'FFFFFF',
    head: { pt: 1.5, color: '1A1A1A' },
    hair: { pt: 0.5, color: 'DCDCDC' },
    end:  { pt: 0.75, color: '8C8C8C' },
  };
  // [top, right, bottom, left], each a line or null — the one border model
  // both PPTX writers understand (pptx.js cellXml reads the same object).
  const bdLean = bottom => ({ t: null, r: null, b: bottom, l: null });
  const pgBorder = (c, BD) => c.bd
    ? ['t', 'r', 'b', 'l'].map(k => c.bd[k]
        ? { type: 'solid', pt: c.bd[k].pt, color: c.bd[k].color }
        : { type: 'none' })
    : BD;

  // The picker sits in both toolbars (the table's and the site sheet's);
  // they are one setting, so both follow. The sheet on screen re-renders at
  // once and settles in with a short fade, so the change is seen, not just
  // made — and the next export is in the new style with nothing else to do.
  function markStyle() {
    document.querySelectorAll('[data-out-style]').forEach(b =>
      b.classList.toggle('on', b.dataset.outStyle === outStyle));
    document.querySelectorAll('[data-site-style]').forEach(b =>
      b.classList.toggle('on', b.dataset.siteStyle === siteStyle));
  }
  const settle = page => {
    if (page && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      page.animate([{ opacity: 0.35, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
                   { duration: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
  };
  function setSiteStyle(next) {
    if (!SITE_STYLES.includes(next) || next === siteStyle) return;
    siteStyle = next;
    try { localStorage.setItem(SITE_STYLE_KEY, next); } catch (e) { /* private mode */ }
    markStyle();
    renderSite();
    settle($('sdPage'));
  }
  function setStyle(next) {
    if (!STYLES.includes(next) || next === outStyle) return;
    outStyle = next;
    try { localStorage.setItem(STYLE_KEY, next); } catch (e) { /* private mode */ }
    markStyle();
    let page = null;
    if (lastRows && !$('viewTable').classList.contains('hidden')) { renderTable(lastRows); page = $('docPage'); }
    if (!$('viewSite').classList.contains('hidden')) { renderSite(); page = $('sdPage'); }
    if (page && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      page.animate([{ opacity: 0.35, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
                   { duration: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-out-style]');
    if (b) setStyle(b.dataset.outStyle);
    const sb = e.target.closest('[data-site-style]');
    if (sb) setSiteStyle(sb.dataset.siteStyle);
  });
  markStyle();

  /* ── PPTX export ─────────────────────────────────────────────────── */
  /* ── the report table, as data ────────────────────────────────────────
     ONE definition of the deliverable's shape, because there are now two
     writers for it: the standalone slide below, and the injector that
     drops it into a template slot (js/deck.js -> js/pptx.js). They used to
     be one function and a copy would have drifted the moment either was
     touched.

     Columns are REVERSED by hand. PowerPoint tables have no RTL column
     order — rtlMode/rtl="1" only set text direction inside a cell — so the
     row arrays are built strongest-column-last, mirroring the HTML. Change
     one, change all of them.

     Colours are the document's own purple, not the app's mint: this is a
     preview of a PowerPoint slide, not app chrome (DESIGN.md invariant 1). The
     clean and coverage styles are leanMatrix(), below. */
  const TBL = {
    colW: [1.3, 1.2, 1.2, 0.85, 4.5, 0.85, 0.8],   // inches
    border: { color: 'BBB5E0', pt: 0.5 },
    head: '4A3F8C', group: '6B5FB5', rowA: 'F0EEFF', rowB: 'FAF9FF',
    rowH: 0.36, size: 10,
  };
  TBL.frac = TBL.colW.map(w => w / TBL.colW.reduce((a, b) => a + b, 0));

  // The network chip beside the site name — the app's green `.tag-net`,
  // stated as file colours so both PPTX writers and print carry the same one.
  // Asked for on 2026-09-29: a slide that mixes operators has to say which is
  // which. It rides the export as a second, smaller run in the SAME cell (a
  // highlighted run is what PowerPoint has for a chip), so the table keeps its
  // seven columns and the chip wraps with the name instead of floating over it.
  // Only the network: `סקטור משוער` and `לא נמצא` stay app-only.
  const NET_CHIP = { color: '0C6F4B', hl: 'E3F1EA', sz: 8 };
  const chipOf = r => r.net ? Object.assign({ t: netTag(r.net) }, NET_CHIP) : null;

  // [[{t, fill, color, bold, align}, ...], ...] — align uses the OOXML
  // spelling ('ctr' / 'r'); the PptxGenJS writer maps it.
  function tableMatrix(groups) {
    if (lean()) return leanMatrix(groups);
    const H = t => ({ t, fill: TBL.head, color: 'FFFFFF', bold: true, align: 'ctr' });
    const out = [[
      H('עוצמה(dBm)'), H('רוחב פס (Mhz)'), H('תדר מרכזי'), H('סקטור'),
      { ...H('שם אתר משרת'), align: 'r' }, H('מס"ד'), H(''),
    ]];
    Object.keys(groups).map(Number).sort((a, b) => a - b).forEach((nk, gi) => {
      const fill = gi % 2 === 0 ? TBL.rowA : TBL.rowB;
      groups[nk].forEach((r, i) => {
        const c = t => ({ t: String(t), fill, color: '000000', align: 'ctr' });
        out.push([
          c(r.power), c(r.bw), c(r.freq), c(r.sector),
          { ...c(r.site), align: 'r', ltr: isLtrText(r.site), tag: chipOf(r) }, c(r.rank),
          { t: i === 0 ? `נק' ${nk}` : '', fill: TBL.group,
            color: 'FFFFFF', bold: true, align: 'ctr' },
        ]);
      });
    });
    return out;
  }

  // Clean and coverage. Same columns, same hand-reversed order; only the
  // ink changes. The point label sits on its group's first row alone, and
  // its column draws no line inside a group, so it reads as one merged cell.
  function leanMatrix(groups) {
    const L = LEAN;
    const H = (t, align) => ({ t, fill: L.fill, color: L.ink, bold: true,
                               align: align || 'ctr', bd: bdLean(L.head) });
    const out = [[
      H('עוצמה(dBm)'), H('רוחב פס (Mhz)'), H('תדר מרכזי'), H('סקטור'),
      H('שם אתר משרת', 'r'), H('מס"ד'), H(''),
    ]];
    Object.keys(groups).map(Number).sort((a, b) => a - b).forEach(nk => {
      const rows = groups[nk];
      rows.forEach((r, i) => {
        const last = i === rows.length - 1;
        const c = (t, o) => Object.assign({ t: String(t), fill: L.fill, color: L.ink,
                                            align: 'ctr', bd: bdLean(last ? L.end : L.hair) }, o);
        const lv = outStyle === 'coverage' ? rsrpClass(r.power) : null;
        out.push([
          c(r.power, lv ? { fill: lv.tint } : null),
          c(r.bw), c(r.freq), c(r.sector),
          c(r.site, { align: 'r', ltr: isLtrText(r.site), tag: chipOf(r) }),
          c(r.rank, { color: L.dim }),
          c(i === 0 ? `נק' ${nk}` : '', { bold: true, bd: bdLean(last ? L.end : null) }),
        ]);
      });
    });
    // A shared edge is stated by BOTH cells that meet at it, and they must
    // agree — so each cell's top is the bottom of the cell above it.
    for (let r = 1; r < out.length; r++) {
      out[r].forEach((cell, k) => { cell.bd.t = out[r - 1][k].bd.b; });
    }
    return out;
  }

  // Coverage only: the legend under the table. `items` run strongest to
  // weakest and are written LEFT TO RIGHT — a range like −75…−60 inside an
  // RTL paragraph is exactly the run the bidi algorithm turns around.
  function legendCaption() {
    if (outStyle !== 'coverage') return null;
    return { label: LEGEND_LABEL, items: RSRP_CLASSES.map(c => ({ tint: c.tint, text: c.label })) };
  }

  // PptxGenJS text runs for the legend line: a tinted square, then its range.
  const legendRuns = cap => cap.items.flatMap((it, i) => [
    { text: '\u25a0 ', options: { color: it.tint, fontSize: 12 } },
    { text: it.text + (i < cap.items.length - 1 ? '     ' : ''), options: { color: '444444' } },
  ]);

  $('btnPptx').onclick = async () => {
    if (!lastRows) return;
    if (typeof PptxGenJS === 'undefined') {
      toast(T('toast.pptxMissing'), true);
      return;
    }
    const btn = $('btnPptx');
    btn.disabled = true;
    try {
      const pptx = tidyPptx(new PptxGenJS());
      pptx.layout = 'LAYOUT_WIDE';
      const slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };

      slide.addText('טבלת נתונים', lean()
        ? { x: 0.3, y: 0.2, w: 12.7, h: 0.6, fontSize: 22, bold: true, color: LEAN.ink,
            align: 'right', rtlMode: true, fontFace: 'Arial' }
        : { x: 0.4, y: 0.12, w: 12.5, h: 0.7, fontSize: 28, bold: true, color: '1a1a2e',
            align: 'center', rtlMode: true, fontFace: 'Arial' });

      const BD = { type: 'solid', pt: TBL.border.pt, color: TBL.border.color };
      const matrix = tableMatrix(lastRows);
      // A chip is a second run in the same paragraph: the name, a gap, then
      // the network, smaller and highlighted, padded with no-break spaces so
      // the highlight reads as a chip rather than a marker stroke.
      const runs = c => [
        { text: c.t, options: { color: c.color, bold: !!c.bold, fontSize: TBL.size, fontFace: 'Arial', rtlMode: !c.ltr } },
        { text: '  ', options: { fontSize: TBL.size, fontFace: 'Arial', rtlMode: !c.ltr } },
        { text: '\u00a0' + c.tag.t + '\u00a0', options: { color: c.tag.color, highlight: c.tag.hl,
                                                   fontSize: c.tag.sz, fontFace: 'Arial', rtlMode: !c.ltr } },
      ];
      const rows = matrix.map(row => row.map(c => ({
        text: c.tag ? runs(c) : c.t,
        options: {
          fill: { color: c.fill }, color: c.color, bold: !!c.bold,
          align: c.align === 'r' ? 'right' : 'center', valign: 'middle',
          rtlMode: !c.ltr, border: pgBorder(c, BD), fontSize: TBL.size, fontFace: 'Arial',
        },
      })));

      slide.addTable(rows, {
        x: 0.3, y: 1.0, w: 12.7, colW: TBL.colW, rowH: TBL.rowH,
      });

      const cap = legendCaption();
      if (cap) {
        const y = 1.0 + TBL.rowH * matrix.length + 0.15;
        slide.addText(cap.label, { x: 10.3, y, w: 2.7, h: 0.3, fontSize: 9, bold: true,
          color: LEAN.ink, align: 'right', rtlMode: true, fontFace: 'Arial' });
        slide.addText(legendRuns(cap), { x: 0.3, y, w: 10.0, h: 0.3, fontSize: 9,
          align: 'right', rtlMode: false, fontFace: 'Arial' });
      }

      await pptx.writeFile({ fileName: 'TableX.pptx' });
      toast(T('toast.pptxDone'));
    } catch (e) {
      toast(T('toast.pptxFail', { e: e.message }), true);
    } finally {
      btn.disabled = false;
    }
  };

  /* The deck builder needs the report without owning its shape. Exposing a
     narrow bridge keeps js/deck.js from reaching into app internals, and
     keeps the table's definition here with the other renderers. */
  /* Shared chrome. js/deck.js must speak in the app's voice — the same
     toast and the same in-app dialog — rather than grow a second set that
     drifts, or fall back to window.confirm() (see "Prompts are in-app"). */
  global.TableXUI = { toast, ask, T };

  global.TableXReport = {
    TBL,
    matrix: () => (lastRows ? tableMatrix(lastRows) : null),
    caption: () => (lastRows ? legendCaption() : null),
    has: () => !!lastRows,
    meta: () => {
      if (!lastRows) return null;
      const keys = Object.keys(lastRows);
      return { points: keys.length, rows: keys.reduce((n, k) => n + lastRows[k].length, 0) };
    },
  };


  /* ── site editor ─────────────────────────────────────────────────────
     Partner and Pelephone get refreshed from a Planet export every few
     months; our own sites change by roughly ONE SITE A MONTH, and
     re-importing a whole workbook for one row is exactly the friction this
     app exists to remove. So: add and remove single sectors in place.

     Edits are staged on a deep copy and written only on Save. A per-change
     POST would mean a 689 KB round trip per edit and could leave the file
     half-modified if one failed; `dirty` counts staged changes so the footer
     can say what is about to be written. */
  const ED_ROW_CAP = 150;   // Partner has 2,899 sites; rendering them all
                            // janks the modal. Search narrows, this caps.
  let ed = null;

  function openEditor(net) {
    const src = DB[net] || { sites: {}, sectors: {} };
    ed = {
      net: net,
      sites: JSON.parse(JSON.stringify(src.sites || {})),
      // Staged and written back even though nothing here edits them: a Save
      // posts the WHOLE database, so leaving any of them out would silently
      // wipe every one the next time somebody added a sector.
      notes: JSON.parse(JSON.stringify(src.notes || {})),
      coords: JSON.parse(JSON.stringify(src.coords || {})),
      ant: JSON.parse(JSON.stringify(src.ant || {})),
      pwr: JSON.parse(JSON.stringify(src.pwr || {})),
      crs: JSON.parse(JSON.stringify(src.crs || {})),
      sectors: JSON.parse(JSON.stringify(src.sectors || {})),
      open: new Set(),
      dirty: 0,
      q: '',
    };
    $('edNet').textContent = label(net);
    applyExamples(net);
    $('edSearch').value = '';
    $('edAdd').classList.add('hidden');
    $('dbEditor').classList.remove('hidden');
    renderEditor();
    setTimeout(() => $('edSearch').focus(), 60);
  }

  async function closeEditor(force) {
    if (!force && ed && ed.dirty &&
        !(await ask(T('ed.discard'), { ok: 'ed.discardOk', danger: true }))) return;
    $('dbEditor').classList.add('hidden');
    ed = null;
  }

  // IDF's frequency slot holds a raw EARFCN rather than MHz — see CLAUDE.md,
  // "IDF comes from an ENM CLI dump". Labelling 9335 as "MHz" in the editor was
  // simply wrong. Both are unit symbols, identical in Hebrew and English, so
  // they stay inline here the way ' MHz' always has rather than going to i18n.
  // `net` is optional and defaults to the editor's open network, so the
  // editor's own calls are unchanged; the lookup view passes it explicitly
  // because it shows all four networks in one list.
  function freqText(v, net) {
    if (v == null) return '-';
    return EARFCN_NETS.has(net || (ed && ed.net)) ? 'EARFCN ' + v : v + ' MHz';
  }

  // siteId -> [sectorId, ...]. Rebuilt per render; cheap next to the DOM work.
  function sectorsBySite() {
    const m = Object.create(null);
    for (const secId in ed.sectors) {
      const siteId = ed.sectors[secId][0];
      (m[siteId] || (m[siteId] = [])).push(secId);
    }
    return m;
  }

  function renderEditor() {
    const bySite = sectorsBySite();
    const siteIds = Object.keys(ed.sites);
    const q = ed.q.trim().toLowerCase();

    const hits = !q ? siteIds : siteIds.filter(id =>
      id.toLowerCase().includes(q) ||
      String(ed.sites[id] || '').toLowerCase().includes(q) ||
      (bySite[id] || []).some(sec => sec.toLowerCase().includes(q)));

    hits.sort((a, b) =>
      String(ed.sites[a] || a).localeCompare(String(ed.sites[b] || b), 'he'));

    $('edCount').textContent = T('ed.count', {
      sites: fmt(siteIds.length),
      sectors: fmt(Object.keys(ed.sectors).length),
    });

    const list = $('edList');
    if (!siteIds.length) {
      list.innerHTML = '<p class="ed-msg">' + esc(T('ed.none')) + '</p>';
    } else if (!hits.length) {
      list.innerHTML = '<p class="ed-msg">' + esc(T('ed.noHits', { q: ed.q })) + '</p>';
    } else {
      const shown = hits.slice(0, ED_ROW_CAP);
      list.innerHTML = shown.map((id, i) => {
        const secs = (bySite[id] || []).slice().sort();
        const isOpen = ed.open.has(id);
        const rows = !isOpen ? '' :
          '<div class="ed-sectors">' + secs.map((sec, j) => {
            const v = ed.sectors[sec];
            return '<div class="ed-sector" style="animation-delay:' + (j * 20) + 'ms">' +
              '<span class="mono" dir="ltr">' + esc(sec) + '</span>' +
              '<span class="ed-spec sec" dir="ltr">' + esc(v[1] || '-') + '</span>' +
              '<span class="ed-spec freq" dir="ltr">' + esc(freqText(v[2])) + '</span>' +
              '<span class="ed-spec bw" dir="ltr">' + esc(v[3] == null ? '-' : v[3]) + ' MHz</span>' +
              '<span class="grow"></span>' +
              '<button class="ed-rm" data-rm-sector="' + esc(sec) + '" title="' +
                esc(T('ed.rmSector')) + '">\u2212</button>' +
            '</div>';
          }).join('') + '</div>';
        return '<div class="ed-site ' + (isOpen ? 'open' : '') + '" style="--i:' + i + '">' +
          '<div class="ed-site-row" data-toggle="' + esc(id) + '">' +
            '<span class="ed-caret">\u25B6</span>' +
            '<span class="ed-name">' + esc(ed.sites[id] || id) + '</span>' +
            noteSpan(ed.notes && ed.notes[id]) +
            '<span class="ed-code" dir="ltr">' + esc(id) + '</span>' +
            '<span class="ed-badge">' + secs.length + '</span>' +
            '<button class="ed-add-sec" data-add-sector="' + esc(id) + '" title="' +
              esc(T('ed.addSector')) + '">+</button>' +
            '<button class="ed-rm" data-rm-site="' + esc(id) + '" title="' +
              esc(T('ed.rmSite')) + '">\u2212</button>' +
          '</div>' + rows +
        '</div>';
      }).join('') + (hits.length > ED_ROW_CAP
        ? '<p class="ed-more">' + esc(T('ed.showing',
            { n: ED_ROW_CAP, total: fmt(hits.length) })) + '</p>'
        : '');

      list.querySelectorAll('[data-toggle]').forEach(el => el.onclick = e => {
        // neither the minus nor the plus is a toggle
        if (e.target.closest('.ed-rm, .ed-add-sec')) return;
        const id = el.dataset.toggle;
        if (ed.open.has(id)) ed.open.delete(id); else ed.open.add(id);
        renderEditor();
      });
      list.querySelectorAll('[data-add-sector]').forEach(b =>
        b.onclick = () => addSectorTo(b.dataset.addSector));
      list.querySelectorAll('[data-rm-site]').forEach(b =>
        b.onclick = () => removeSite(b.dataset.rmSite));
      list.querySelectorAll('[data-rm-sector]').forEach(b =>
        b.onclick = () => removeSector(b.dataset.rmSector));
    }

    const dirtyEl = $('edDirty');
    dirtyEl.textContent = ed.dirty ? T('ed.dirty', { n: ed.dirty }) : T('ed.clean');
    dirtyEl.classList.toggle('on', ed.dirty > 0);
    const save = $('edSave');
    save.disabled = !ed.dirty;
    save.textContent = ed.dirty ? T('ed.saveN', { n: ed.dirty }) : T('ed.save');
  }

  // The `+` on a site row. The add form already accepted an existing Site ID —
  // this just fills it in, so adding a sector to a known site does not mean
  // retyping its code and name and risking a typo that forks it into a new one.
  // A note belongs to a site, so it goes when the site does — the same rule
  // the parsers apply to a site left with no sectors.
  function dropNote(siteId) {
    if (ed.notes) delete ed.notes[siteId];
    if (ed.coords) delete ed.coords[siteId];
  }

  // The plant is keyed by SECTOR, so it goes when the sector does — otherwise
  // a removed sector leaves an antenna behind that nothing can reach and the
  // file only grows.
  function dropPlant(secId) {
    if (ed.ant) delete ed.ant[secId];
    if (ed.pwr) delete ed.pwr[secId];
    if (ed.crs) delete ed.crs[secId];
  }

  function addSectorTo(siteId) {
    $('edAdd').classList.remove('hidden');
    $('edSiteId').value = siteId;
    $('edSiteName').value = ed.sites[siteId] || '';
    $('edSectorId').value = '';
    $('edSector').value = '';
    ed.open.add(siteId);
    renderEditor();
    $('edSectorId').focus();
    $('edAdd').scrollIntoView({ block: 'nearest' });
  }

  function removeSector(secId) {
    if (!ed.sectors[secId]) return;
    const siteId = ed.sectors[secId][0];
    delete ed.sectors[secId];
    dropPlant(secId);
    // A site with no sectors left is unreachable by any lookup, so drop it
    // rather than leave an orphan name in the file.
    if (!Object.keys(ed.sectors).some(k => ed.sectors[k][0] === siteId)) {
      delete ed.sites[siteId];
      dropNote(siteId);
      ed.open.delete(siteId);
    }
    ed.dirty++;
    toast(T('ed.rmDone', { id: secId }));
    renderEditor();
  }

  function removeSite(siteId) {
    for (const secId in ed.sectors) {
      if (ed.sectors[secId][0] === siteId) {
        delete ed.sectors[secId];
        dropPlant(secId);
      }
    }
    delete ed.sites[siteId];
    dropNote(siteId);
    ed.open.delete(siteId);
    ed.dirty++;
    toast(T('ed.rmDone', { id: siteId }));
    renderEditor();
  }

  $('edSearch').addEventListener('input', e => { ed.q = e.target.value; renderEditor(); });
  $('edClose').onclick = () => closeEditor();
  $('edCancel').onclick = () => closeEditor();
  $('dbEditor').onclick = e => { if (e.target === $('dbEditor')) closeEditor(); };

  $('edAddToggle').onclick = () => {
    const f = $('edAdd');
    f.classList.toggle('hidden');
    if (!f.classList.contains('hidden')) $('edSectorId').focus();
  };
  $('edAddCancel').onclick = () => $('edAdd').classList.add('hidden');

  $('edAdd').onsubmit = e => {
    e.preventDefault();
    const secId = $('edSectorId').value.trim();
    const siteId = $('edSiteId').value.trim();
    if (!secId || !siteId) { toast(T('ed.needIds'), true); return; }
    if (ed.sectors[secId]) toast(T('ed.dup', { id: secId }), true);

    const name = $('edSiteName').value.trim();
    ed.sites[siteId] = name || ed.sites[siteId] || siteId;
    ed.sectors[secId] = [
      siteId,
      $('edSector').value.trim() || null,
      // The importer's own number reader, reached through dbparse.js rather
      // than copied, so a hand-added sector holds exactly what an imported one
      // holds — the same rule mhzOf() follows for EARFCN_BANDS.
      self.TableXNum($('edFreq').value.trim()),
      self.TableXNum($('edBw').value.trim()),
    ];
    ed.dirty++;
    ed.open.add(siteId);
    ed.q = '';
    $('edSearch').value = '';
    // Keep the site id and name. Adding sectors 2 and 3 straight after 1 is the
    // common case, and retyping the site code is how you accidentally fork one
    // site into two. Clearing them was fine when this form only added sites.
    ['edSectorId', 'edSector'].forEach(id => { $(id).value = ''; });
    $('edSectorId').focus();
    toast(T('ed.added', { id: secId }));
    renderEditor();
  };

  $('edSave').onclick = async () => {
    const btn = $('edSave');
    btn.disabled = true;
    const payload = {
      network: ed.net,
      label: label(ed.net),
      source: (DB[ed.net] && DB[ed.net].source) || null,
      built: new Date().toISOString().slice(0, 10),
      sites: ed.sites,
      sectors: ed.sectors,
      ...OPTIONAL.reduce((o, k) => {
        if (ed[k] && Object.keys(ed[k]).length) o[k] = ed[k];
        return o;
      }, {}),
    };
    try {
      const res = await fetch('api/db/' + ed.net, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.text()) || res.status);
      DB[ed.net] = indexDb(payload);
      renderDbCards();
      updateChip();
      toast(T('ed.saved', {
        sites: fmt(Object.keys(ed.sites).length),
        sectors: fmt(Object.keys(ed.sectors).length),
      }));
      closeEditor(true);
    } catch (ex) {
      toast(T('ed.saveFail', { e: ex.message }), true);
      btn.disabled = false;
    }
  };

  /* ── settings: theme + language ──────────────────────────────────── */
  const THEME_KEY = 'tablex_theme';
  const setPop = $('setPop'), btnSet = $('btnSettings');

  function markActive() {
    const theme = document.documentElement.dataset.theme;
    setPop.querySelectorAll('[data-set-theme]').forEach(b =>
      b.classList.toggle('on', b.dataset.setTheme === theme));
    setPop.querySelectorAll('[data-set-lang]').forEach(b =>
      b.classList.toggle('on', b.dataset.setLang === I18N.lang));
    setPop.querySelectorAll('[data-set-scene]').forEach(b =>
      b.classList.toggle('on', (b.dataset.setScene === '1') === SCENE.enabled));
  }

  // A view transition where the browser has one and motion is allowed —
  // Electron 33 has it, and anything without it simply swaps at once.
  const canSweep = () => !!document.startViewTransition &&
    !matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setTheme(next) {
    const root = document.documentElement;
    const apply = () => {
      root.dataset.theme = next;
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* private mode */ }
      markActive();
    };
    // The new theme sweeps out from the button that asked for it: motion.js
    // records the press point, main.css (MOTION) draws the circle.
    if (next === root.dataset.theme || !canSweep()) return apply();
    root.classList.add('vt-theme');
    document.startViewTransition(apply).finished
      .finally(() => root.classList.remove('vt-theme'));
  }

  // Everything rendered from JS has to be rebuilt on a language switch —
  // I18N.apply() only refreshes the static data-i18n nodes in the markup.
  function relocalize() {
    I18N.apply();
    renderFacts();
    renderDbCards();
    updateChip();
    updateHint();
    if (lastRows) renderTable(lastRows);
    if (ed) renderEditor();
    if (!$('dbInspect').classList.contains('hidden')) renderInspect();
    if (!$('viewLookup').classList.contains('hidden')) renderLookup();
    if (!$('viewSite').classList.contains('hidden')) renderSite();
    if (global.TableXDeck) global.TableXDeck.render();
    if (global.TableXQuest) global.TableXQuest.relocalize();
    markActive();
  }

  function renderFacts() {
    const ul = $('abFacts');
    if (ul) ul.innerHTML = I18N.facts().map(f => `<li>${f}</li>`).join('');
  }

  setPop.querySelectorAll('[data-set-theme]').forEach(b =>
    b.onclick = () => setTheme(b.dataset.setTheme));
  setPop.querySelectorAll('[data-set-lang]').forEach(b =>
    b.onclick = () => {
      if (b.dataset.setLang === I18N.lang) return;
      const swap = () => { I18N.set(b.dataset.setLang); relocalize(); };
      // The whole page mirrors on a language switch; a cross-fade hides the
      // one frame where half of it has flipped and half has not.
      if (canSweep()) document.startViewTransition(swap); else swap();
    });
  setPop.querySelectorAll('[data-set-scene]').forEach(b =>
    b.onclick = () => { SCENE.setEnabled(b.dataset.setScene === '1'); markActive(); });

  function toggleSettings(open) {
    const show = open === undefined ? setPop.classList.contains('hidden') : open;
    setPop.classList.toggle('hidden', !show);
    btnSet.setAttribute('aria-expanded', String(show));
  }
  btnSet.onclick = e => { e.stopPropagation(); toggleSettings(); };
  addEventListener('click', e => {
    if (!setPop.classList.contains('hidden') && !setPop.contains(e.target)) toggleSettings(false);
  });
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // The confirm sits on top of everything, so it answers Escape first —
    // otherwise Escape would close the editor out from under its own
    // "discard unsaved changes?" prompt.
    if (askDone) closeAsk(false);
    else if (!setPop.classList.contains('hidden')) toggleSettings(false);
    else if (!$('dbInspect').classList.contains('hidden')) closeInspect();
    else if (!$('dbEditor').classList.contains('hidden')) closeEditor();
    else if (global.TableXDeck && global.TableXDeck.isEditorOpen()) global.TableXDeck.closeEditor();
  });

  // Before markActive(), which reads SCENE.enabled — init() is where the
  // stored preference is read back off localStorage.
  SCENE.init();
  I18N.apply();
  renderFacts();
  markActive();
  loadAll();
})(window);

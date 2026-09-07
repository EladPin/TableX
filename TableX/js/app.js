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
    return db;
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
  const bandList = sectors => {
    const seen = new Set();
    for (const k in sectors) if (sectors[k][2] != null) seen.add(sectors[k][2]);
    return [...seen].sort((a, b) => a - b).join(', ') || '—';
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
  function parseWorkbookAsync(buf, onStage) {
    return new Promise((resolve, reject) => {
      const inline = () => {
        try { resolve(self.TableXParse(buf)); } catch (ex) { reject(ex); }
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
      w.postMessage(buf);
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
        parsed = await parseWorkbookAsync(ev.target.result, stage => toast(T('toast.' + stage)));
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

      // The bands are the cheapest possible check that the import read the
      // workbook correctly, and the only one available on a machine whose
      // files can never be sent out: "700, 1800, 2600" is obviously right,
      // "1400, 2850, 9360" is obviously an EARFCN column read as MHz.
      await persistDb(net, payload, T('toast.dbSaved', {
        label: label(net),
        n: fmt(Object.keys(parsed.sectors).length),
        f: bandList(parsed.sectors),
      }));
      if (card) card.classList.remove('busy');
    };
    reader.readAsArrayBuffer(file);
  };

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

  function lookup(code, mhz) {
    if (!code) return null;
    for (const net of NETWORKS) {
      const db = DB[net]; if (!db) continue;
      const sec = db.sectors[code];
      if (sec) {
        return { net, site: db.sites[sec[0]] || sec[0], siteId: sec[0],
                 sector: sectorLabel(net, code, sec),
                 freq: sec[2] == null ? '-' : sec[2],
                 bw: sec[3] == null ? '-' : sec[3], exact: true };
      }
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
  const netTag = net => (LABELS[net] || net).toUpperCase();

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
        // Annotations are app-only: .tag is display:none in print and is never
        // read by the PPTX builder, so the deliverable stays seven clean columns.
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
        const ec = (f, v, extra) =>
          `<td class="${extra || ''} td-ed${r.edited && r.edited[f] ? ' td-edited' : ''}` +
          `${f === 'site' && isLtrText(v) ? ' td-ltr' : ''}"` +
          ` data-e="${nk}:${ri}:${f}" tabindex="0">${esc(v)}`;

        h += `<tr class="${cls}" style="--i:${Math.min(i++, 18)}">`;
        if (ri === 0) h += `<td class="nk-cell" rowspan="${rows.length}">נק' ${nk}</td>`;
        h += `
          <td>${r.rank}</td>
          ${ec('site', r.site, 'td-site')}${tag}</td>
          ${ec('sector', r.sector)}</td>
          ${ec('freq', r.freq)}</td>
          ${ec('bw', r.bw)}</td>
          ${ec('power', r.power)}</td>
        </tr>`;
      });
    });

    // The stagger belongs to the arrival of a NEW table. Re-running it on
    // every cell commit would make the whole table flicker on each edit.
    if (!tableAnim) h = h.replace('class="data-table"', 'class="data-table no-anim"');
    $('docPage').innerHTML = h + `</tbody></table>`;
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

  /* ── views ───────────────────────────────────────────────────────── */
  function show(which) {
    const table = which === 'table', lk = which === 'lookup', dk = which === 'decks';
    $('viewHome').classList.toggle('hidden', table || lk || dk);
    $('viewLookup').classList.toggle('hidden', !lk);
    $('viewDecks').classList.toggle('hidden', !dk);
    $('viewTable').classList.toggle('hidden', !table);
    // The nav hides for the TABLE view only — that one is the deliverable
    // and carries its own toolbar. The others are places you leave again, so
    // they keep the nav.
    $('nav').classList.toggle('hidden', table);
    const at = lk ? 'lookup' : dk ? 'decks' : 'home';
    document.querySelectorAll('.nav-link[data-goto]').forEach(b =>
      b.classList.toggle('active', b.dataset.goto === at));
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (lk) { renderLookup(); setTimeout(() => $('lkSearch').focus(), 60); }
    // Templates live on the server, so another copy of the app may have
    // added one since this tab loaded.
    if (dk && global.TableXDeck) global.TableXDeck.reload();
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

  document.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => {
    if (b.dataset.goto === 'lookup') return show('lookup');
    if (b.dataset.goto === 'decks') return show('decks');
    show('home');
    if (b.dataset.goto === 'db') $('sectionDb').scrollIntoView({ behavior: 'smooth' });
  });

  $('lkSearch').addEventListener('input', renderLookup);
  $('viewLookup').addEventListener('click', e => {
    const c = e.target.closest('[data-copy]');
    if (c) copyText(c.dataset.copy);
  });

  $('dbChip').onclick = () => { show('home'); $('sectionDb').scrollIntoView({ behavior: 'smooth' }); };

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
     preview of a PowerPoint slide, not app chrome (DESIGN.md deviation 3). */
  const TBL = {
    colW: [1.3, 1.2, 1.2, 0.85, 4.5, 0.85, 0.8],   // inches
    border: { color: 'BBB5E0', pt: 0.5 },
    head: '4A3F8C', group: '6B5FB5', rowA: 'F0EEFF', rowB: 'FAF9FF',
    rowH: 0.36, size: 10,
  };
  TBL.frac = TBL.colW.map(w => w / TBL.colW.reduce((a, b) => a + b, 0));

  // [[{t, fill, color, bold, align}, ...], ...] — align uses the OOXML
  // spelling ('ctr' / 'r'); the PptxGenJS writer maps it.
  function tableMatrix(groups) {
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
          { ...c(r.site), align: 'r', ltr: isLtrText(r.site) }, c(r.rank),
          { t: i === 0 ? `נק' ${nk}` : '', fill: TBL.group,
            color: 'FFFFFF', bold: true, align: 'ctr' },
        ]);
      });
    });
    return out;
  }

  $('btnPptx').onclick = async () => {
    if (!lastRows) return;
    if (typeof PptxGenJS === 'undefined') {
      toast(T('toast.pptxMissing'), true);
      return;
    }
    const btn = $('btnPptx');
    btn.disabled = true;
    try {
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_WIDE';
      const slide = pptx.addSlide();
      slide.background = { color: 'FFFFFF' };

      slide.addText('טבלת נתונים', {
        x: 0.4, y: 0.12, w: 12.5, h: 0.7,
        fontSize: 28, bold: true, color: '1a1a2e',
        align: 'center', rtlMode: true, fontFace: 'Arial',
      });

      const BD = { type: 'solid', pt: TBL.border.pt, color: TBL.border.color };
      const rows = tableMatrix(lastRows).map(row => row.map(c => ({
        text: c.t,
        options: {
          fill: { color: c.fill }, color: c.color, bold: !!c.bold,
          align: c.align === 'r' ? 'right' : 'center', valign: 'middle',
          rtlMode: !c.ltr, border: BD, fontSize: TBL.size, fontFace: 'Arial',
        },
      })));

      slide.addTable(rows, {
        x: 0.3, y: 1.0, w: 12.7, colW: TBL.colW, rowH: TBL.rowH,
      });

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
    return (net || (ed && ed.net)) === 'idf' ? 'EARFCN ' + v : v + ' MHz';
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
    // A site with no sectors left is unreachable by any lookup, so drop it
    // rather than leave an orphan name in the file.
    if (!Object.keys(ed.sectors).some(k => ed.sectors[k][0] === siteId)) {
      delete ed.sites[siteId];
      ed.open.delete(siteId);
    }
    ed.dirty++;
    toast(T('ed.rmDone', { id: secId }));
    renderEditor();
  }

  function removeSite(siteId) {
    for (const secId in ed.sectors) {
      if (ed.sectors[secId][0] === siteId) delete ed.sectors[secId];
    }
    delete ed.sites[siteId];
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
      num($('edFreq').value.trim()),
      num($('edBw').value.trim()),
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

  function setTheme(next) {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* private mode */ }
    markActive();
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
    if (!$('viewLookup').classList.contains('hidden')) renderLookup();
    if (global.TableXDeck) global.TableXDeck.render();
    markActive();
  }

  function renderFacts() {
    const ul = $('abFacts');
    if (ul) ul.innerHTML = I18N.facts().map(f => `<li>${f}</li>`).join('');
  }

  setPop.querySelectorAll('[data-set-theme]').forEach(b =>
    b.onclick = () => setTheme(b.dataset.setTheme));
  setPop.querySelectorAll('[data-set-lang]').forEach(b =>
    b.onclick = () => { I18N.set(b.dataset.setLang); relocalize(); });
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

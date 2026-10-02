/* ═══════════════════════════════════════════════════════════════════
   QUEST — אתרים חדשים: a new Planet site, without copying one by hand.

   The first of the Planet quests. The RF team is handed a נ.צ and a plant
   for a site that will be built, and today the job is: copy an existing
   site in Planet, change its every field to the new one's, repeat 13+ times
   a round. Every repetition is a chance to get one field wrong.

   This view does the copying. js/sitegen.js is the engine and carries the
   format contract; this is only the form around it.

   THE SHAPE OF THE WORK, and why the form looks like this:

   1. LOAD A GROUP EXPORT. The clone needs the WORKBOOK, not the database —
      partner.json carries names, carriers and plant, but not Propagation
      Model, TAC, Carrier Name or the other forty columns a Planet row has.
      Only the export has those, which is the whole reason a new site is
      cloned from a real row rather than written from nothing.
   2. PICK A TEMPLATE SITE. Its sectors SEED the form, so the fields open
      holding real values to adjust rather than empty boxes to fill. That is
      the job restated: copy a site, change its data.
   3. NAME THE GROUP. Created in Planet FIRST, and the file is named after
      it — see sitegen.js, that is how Planet decides where the sites land.
   4. EDIT AND GENERATE.

   The workbook stays in the Worker; see the bottom of sitegen.js.
   Prompts and toasts go through TableXUI so this speaks in the app's voice.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const UI = () => global.TableXUI;
  const T = (k, v) => (UI() ? UI().T(k, v) : k);
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // A site id that is already in the export cannot be generated — an import
  // that reuses one overwrites a real site for the whole team.
  let worker = null, loaded = null, taken = new Set(), sites = [], bands = [];
  let tmpl = null;                 // {id, name, sectors:[...]}
  let rows = [];                   // the new sites being built
  let seq = 0;

  const RESULT_CAP = 40;           // the picker lists this many, like the lookup

  /* ── the worker ──────────────────────────────────────────────────── */

  function ask(op, payload, transfer) {
    return new Promise((resolve, reject) => {
      if (!worker) {
        try { worker = new Worker('js/sitegen.js'); } catch (e) { worker = null; }
      }
      if (!worker) return reject(new Error(T('q.noWorker')));
      const w = worker;
      w.onmessage = ev => {
        const m = ev.data || {};
        if (m.error) reject(new Error(m.error));
        else resolve(m.result);
      };
      w.onerror = () => reject(new Error(T('q.noWorker')));
      w.postMessage(Object.assign({ op }, payload), transfer || []);
    });
  }

  /* ── loading the export ──────────────────────────────────────────── */

  function onFile(file) {
    if (!file) return;
    setBusy(true, T('q.reading', { f: file.name }));
    const fr = new FileReader();
    fr.onload = async ev => {
      try {
        const r = await ask('load', { buf: ev.target.result });
        loaded = file.name;
        sites = r.sites || [];
        bands = r.bands || [];
        taken = new Set((r.taken || []).map(s => String(s).toLowerCase()));
        tmpl = null; rows = []; seq = 0;
        render();
        UI().toast(T('q.loaded', { f: file.name, n: sites.length, b: bands.length }));
      } catch (e) {
        UI().toast(T('q.loadFail', { e: e.message }), true);
      } finally {
        setBusy(false);
      }
    };
    fr.onerror = () => { setBusy(false); UI().toast(T('q.loadFail', { e: 'read' }), true); };
    fr.readAsArrayBuffer(file);
  }

  function setBusy(on, msg) {
    const b = $('qBusy');
    if (!b) return;
    b.classList.toggle('hidden', !on);
    if (msg) b.textContent = msg;
  }

  /* ── picking the template ────────────────────────────────────────── */

  function matches(q) {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const out = [];
    for (const site of sites) {
      if (site.id.toLowerCase().includes(s)
        || (site.name && site.name.toLowerCase().includes(s))) {
        out.push(site);
        if (out.length >= RESULT_CAP) break;
      }
    }
    return out;
  }

  function renderPicker() {
    const box = $('qPickResults');
    if (!box) return;
    const q = $('qPick').value;
    if (!q.trim()) { box.innerHTML = ''; return; }
    const hits = matches(q);
    if (!hits.length) {
      box.innerHTML = `<p class="lk-empty">${esc(T('q.noSite'))}</p>`;
      return;
    }
    box.innerHTML = hits.map(h => `
      <button class="ed-row sd-hit" data-pick="${esc(h.id)}">
        <span class="ed-name">${esc(h.name || h.id)}</span>
        <span class="ed-id mono">${esc(h.id)}</span>
      </button>`).join('');
  }

  async function pick(id) {
    setBusy(true, T('q.readingSite'));
    try {
      const d = await ask('site', { siteId: id });
      const s = sites.find(x => x.id === id) || { id, name: '' };
      tmpl = { id, name: s.name, lon: s.lon, lat: s.lat, sectors: d.sectors || [] };
      if (!rows.length) addRow();
      $('qPick').value = '';
      render();
    } catch (e) {
      UI().toast(T('q.loadFail', { e: e.message }), true);
    } finally {
      setBusy(false);
    }
  }

  /* ── the new sites ───────────────────────────────────────────────── */

  // A new site opens holding the TEMPLATE's plant, because the job is to
  // adjust a copy rather than to type a site from nothing. Only the identity
  // is blank: the id and the name are the two things that must be new.
  function addRow() {
    if (!tmpl) return;
    rows.push({
      uid: ++seq,
      siteId: '',
      name: '',
      lon: tmpl.lon,
      lat: tmpl.lat,
      sectors: tmpl.sectors.map(s => Object.assign({}, s, { sectorId: '' })),
    });
  }

  // Partner's own naming, offered as a prefill and never applied silently —
  // the user can type anything, and sitegen.js only ever writes what is here.
  function autoSectorIds(row) {
    const SG = global.TableXSiteGen;
    if (!SG || !row.siteId) return;
    row.sectors.forEach((s, i) => {
      if (s.sectorId) return;
      const from = tmpl.sectors[i] && tmpl.sectors[i].sectorId;
      // take the template sector's own trailing code (Da, Ia, …) so the
      // carrier layout of the copy matches the site it was copied from
      const code = from ? (from.match(/[A-Za-z]{1,3}$/) || [''])[0] : '';
      const sug = SG.suggestSectorId(row.siteId, code);
      if (sug) s.sectorId = sug;
    });
  }

  function problems() {
    const out = [];
    const seen = new Set();
    if (!$('qGroup').value.trim()) out.push(T('q.errGroup'));
    rows.forEach((r, i) => {
      const n = i + 1;
      if (!r.siteId.trim()) out.push(T('q.errId', { n }));
      else if (taken.has(r.siteId.trim().toLowerCase())) out.push(T('q.errTaken', { id: r.siteId }));
      else if (seen.has(r.siteId.trim().toLowerCase())) out.push(T('q.errDup', { id: r.siteId }));
      else seen.add(r.siteId.trim().toLowerCase());
      if (!r.name.trim()) out.push(T('q.errName', { n }));
      if (r.lon === '' || r.lat === '' || r.lon == null || r.lat == null) {
        out.push(T('q.errCoord', { n }));
      }
      r.sectors.forEach((s, j) => {
        if (!s.sectorId || !String(s.sectorId).trim()) {
          out.push(T('q.errSector', { n, j: j + 1 }));
        }
      });
    });
    return out;
  }

  /* ── render ──────────────────────────────────────────────────────── */

  function render() {
    const hasFile = !!loaded;
    $('qStep1').classList.toggle('q-done', hasFile);
    $('qSource').textContent = hasFile
      ? T('q.source', { f: loaded, n: sites.length })
      : T('q.noSource');

    $('qStep2').classList.toggle('hidden', !hasFile);
    $('qTmpl').innerHTML = tmpl
      ? `<div class="q-tmpl">
           <span class="ed-name">${esc(tmpl.name || tmpl.id)}</span>
           <span class="ed-id mono">${esc(tmpl.id)}</span>
           <span class="q-tmpl-n">${esc(T('q.tmplSectors', { n: tmpl.sectors.length }))}</span>
         </div>`
      : '';

    const ready = hasFile && !!tmpl;
    $('qStep3').classList.toggle('hidden', !ready);
    $('qStep4').classList.toggle('hidden', !ready);
    $('qGo').disabled = !ready || rows.length === 0;

    $('qRows').innerHTML = rows.map(renderRow).join('');
    $('qCount').textContent = rows.length
      ? T('q.count', { n: rows.length, s: rows.reduce((a, r) => a + r.sectors.length, 0) })
      : '';
    renderPicker();
  }

  function renderRow(r, i) {
    const bandOpts = b => bands.map(x =>
      `<option value="${esc(x)}"${x === b ? ' selected' : ''}>${esc(x)}</option>`).join('');
    return `
    <div class="q-site" data-uid="${r.uid}">
      <div class="q-site-head">
        <span class="q-site-n">${i + 1}</span>
        <input class="q-in q-id mono" data-f="siteId" value="${esc(r.siteId)}"
               placeholder="${esc(T('q.phId'))}" spellcheck="false"/>
        <input class="q-in q-name" data-f="name" value="${esc(r.name)}"
               placeholder="${esc(T('q.phName'))}"/>
        <input class="q-in q-co mono" data-f="lon" value="${esc(r.lon)}"
               placeholder="${esc(T('q.phLon'))}" spellcheck="false"/>
        <input class="q-in q-co mono" data-f="lat" value="${esc(r.lat)}"
               placeholder="${esc(T('q.phLat'))}" spellcheck="false"/>
        <button class="btn btn-ghost btn-sm q-del" data-del="${r.uid}"
                title="${esc(T('q.remove'))}">−</button>
      </div>
      <div class="q-secs">
        <div class="q-sec q-sec-head">
          <span>${esc(T('q.cSector'))}</span><span>${esc(T('q.cBand'))}</span>
          <span>${esc(T('q.cAz'))}</span><span>${esc(T('q.cH'))}</span>
          <span>${esc(T('q.cTilt'))}</span><span>${esc(T('q.cEtilt'))}</span>
          <span>${esc(T('q.cModel'))}</span><span>${esc(T('q.cPwr'))}</span>
        </div>
        ${r.sectors.map((s, j) => `
        <div class="q-sec" data-sec="${j}">
          <input class="q-in mono" data-s="sectorId" value="${esc(s.sectorId)}"
                 placeholder="${esc(T('q.phSector'))}" spellcheck="false"/>
          <select class="q-in" data-s="band">${bandOpts(s.band)}</select>
          <input class="q-in mono" data-s="az" value="${esc(s.az)}"/>
          <input class="q-in mono" data-s="height" value="${esc(s.height)}"/>
          <input class="q-in mono" data-s="tilt" value="${esc(s.tilt)}"/>
          <input class="q-in mono" data-s="etilt" value="${esc(s.etilt)}"/>
          <input class="q-in mono q-model" data-s="model" value="${esc(s.model)}" spellcheck="false"/>
          <input class="q-in mono" data-s="pwr" value="${esc(s.pwr)}"/>
        </div>`).join('')}
      </div>
    </div>`;
  }

  /* ── generate ────────────────────────────────────────────────────── */

  async function generate() {
    const bad = problems();
    if (bad.length) {
      UI().toast(bad[0] + (bad.length > 1 ? T('q.andMore', { n: bad.length - 1 }) : ''), true);
      return;
    }
    const groupName = $('qGroup').value.trim();
    const specs = rows.map(r => ({
      siteId: r.siteId.trim(),
      name: r.name.trim(),
      lon: num(r.lon), lat: num(r.lat),
      templateSite: tmpl.id,
      sectors: r.sectors.map(s => ({
        sectorId: String(s.sectorId).trim(),
        band: s.band,
        az: num(s.az), height: num(s.height), tilt: num(s.tilt),
        etilt: num(s.etilt), pwr: num(s.pwr),
        model: String(s.model || '').trim(),
      })),
    }));

    setBusy(true, T('q.building'));
    try {
      const r = await ask('build', { specs, groupName });
      (r.warnings || []).forEach(w => UI().toast(w, true));
      const name = global.TableXSiteGen.groupFileName(groupName);
      const url = URL.createObjectURL(new Blob([r.file],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      // The one manual step, stated every time rather than buried in a doc:
      // Planet refuses the file until Excel has re-saved it. See sitegen.js.
      UI().toast(T('q.done', { f: name, n: specs.length }));
      $('qAfter').classList.remove('hidden');
    } catch (e) {
      UI().toast(T('q.buildFail', { e: e.message }), true);
    } finally {
      setBusy(false);
    }
  }

  const num = v => {
    const s = String(v == null ? '' : v).trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : s;      // a model name stays a string
  };

  /* ── wiring ──────────────────────────────────────────────────────── */

  function init() {
    const file = $('qFile');
    if (!file) return;
    file.onchange = e => { onFile(e.target.files[0]); e.target.value = ''; };
    $('qLoad').onclick = () => file.click();
    $('qPick').oninput = renderPicker;
    $('qAdd').onclick = () => { addRow(); render(); };
    $('qGo').onclick = generate;

    $('qPickResults').onclick = e => {
      const b = e.target.closest('[data-pick]');
      if (b) pick(b.dataset.pick);
    };

    // One delegated listener for the whole form: the rows are rebuilt on
    // every structural change, so a per-input handler would be re-bound
    // constantly and would not survive a re-render.
    $('qRows').addEventListener('input', e => {
      const el = e.target;
      const site = el.closest('.q-site');
      if (!site) return;
      const row = rows.find(r => r.uid === +site.dataset.uid);
      if (!row) return;
      if (el.dataset.f) {
        row[el.dataset.f] = el.value;
        if (el.dataset.f === 'siteId') autoSectorIds(row);
      } else if (el.dataset.s) {
        const sec = row.sectors[+el.closest('.q-sec').dataset.sec];
        if (sec) sec[el.dataset.s] = el.value;
      }
      $('qCount').textContent = T('q.count',
        { n: rows.length, s: rows.reduce((a, r) => a + r.sectors.length, 0) });
    });

    // A site id typed, then focus out, fills the sector ids that are blank.
    $('qRows').addEventListener('focusout', e => {
      if (e.target.dataset && e.target.dataset.f === 'siteId') render();
    });

    $('qRows').addEventListener('click', e => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      rows = rows.filter(r => r.uid !== +b.dataset.del);
      render();
    });
  }

  global.TableXQuest = {
    init,
    render,
    // app.js calls this on a language switch, like every other JS-rendered view
    relocalize: () => { if (loaded || rows.length) render(); },
    // the e2e suite reaches in rather than driving 40 inputs by hand
    _state: () => ({ loaded, sites: sites.length, bands, tmpl, rows }),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);

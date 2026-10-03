/* ═══════════════════════════════════════════════════════════════════
   PEEK — the ghost, sneaking a look from behind a card.

   Asked for by Elad, 2026-10-03: on every box, "something sort of peeking,
   in a sneaking vibe, from behind the box, then going back in". The
   something is the mark itself — scene.js GH, the same 14x14 grid as the
   nav, the .ico, the loader and the floor — so it is the logo that peeks,
   not a lookalike. It is read from SCENE.GH, not copied.

   HOW "BEHIND" IS DONE. Nothing is slid under a card: what is behind what
   depends on every stacking context between a card and the page, and the
   cards here sit in several. Instead the ghost lives in a WINDOW — a
   clipping box laid against the card's edge on the OUTSIDE — and slides
   into it across that edge. Whatever has not come out yet is clipped, so it
   reads as coming from behind the card whatever the card's stacking is. The
   window follows the card every frame while it is out, so a page that
   scrolls or reflows under it does not leave it floating.

   WHERE. Only in empty page. Every spot is hit-tested with elementFromPoint
   on an 8 px grid before it is used, and only page furniture may lie under
   it (OPEN) — never a word, a control, a rail or another card. In practice
   that is the side gutters on a wide screen, and on a narrow one it simply
   does not happen.

   WHEN. Rarely: a few seconds after the page settles or a view opens, then
   every 20-40 s. Never in a background tab, under an open dialog, within two
   seconds of a keystroke, under prefers-reduced-motion, or with the scenery
   switched off in settings — it is decoration, and that is the decoration
   switch. A pointer that comes close startles it back in.

   It never touches a card, never takes a pointer event, never prints.

   THREE MORE MOMENTS of the same ghost live here, since they are the same
   mark and the same grid (Elad, 2026-10-03):
   - the CHEER — when something is finished (a table generated; a deck, a
     site sheet or a new-site workbook written) it pops out beside the
     result with happy eyes, hops and transmits. It replaces the first idea,
     the floor's ghost running to the flag: the floor is not on screen at
     either moment, since Generate leaves the home page.
   - the LOST ghost — the markup a search with no results shows, shrugging
     under a "?" (lostSvg; main.css "NOT FOUND" moves it).
   - the nav's MARK — a click makes it blink and hop.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const CELL = 4;                      // px per cell — the floor's own grid
  const N = 14;                        // the mark is 14 x 14 cells
  const PX = CELL * N;                 // 56
  const PAD = 10;                      // room beside it for the head's lean
  const TOP = 9 * CELL;                // a peek over a top edge shows 9 rows
  const TRIES = 4;                     // random spots tried along each edge
  const HOP = CELL;                    // headroom for the cheer's hop: one cell

  // The boxes it peeks from behind — one list, like motion.js QUIET.
  const BOXES = ['.paste-card', '.db-ledger', '.lk-bar', '.sd-bar', '.lk-direct', '.lk-empty',
                 '.doc-page', '.dk-card', '.dk-drop', '.dk-out', '.q-tmpl', '.q-site', '.card'].join(',');

  // What may lie under the ghost: the page itself, nothing on it.
  const OPEN = 'html, body, .view, .section, .bridge, .doc-wrap, .doc-shell';

  const SNEAK = 'cubic-bezier(0.45, 0, 0.25, 1)';   // slow out of the corner
  const DUCK = 'cubic-bezier(0.5, 0, 0.75, 0)';     // and fast back in

  let layer = null, active = null, timer = 0, lastKey = 0;

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── the mark ────────────────────────────────────────────────────── */

  // The happy eyes — ^ ^ — shown instead of the open ones when it cheers.
  const JOY = [[3, 5, 2], [2, 6, 1], [5, 6, 1], [9, 5, 2], [8, 6, 1], [11, 6, 1]];

  // The "?" over its head when a search finds nothing, up and to the right:
  // 4 x 6 cells on rows -8..-3, so that ghost's viewBox starts at -9 — one
  // row of headroom, or the bob would lift the glyph's top out of the frame.
  const ASK = [[11, -8, 2], [10, -7, 1], [13, -7, 1], [13, -6, 1], [12, -5, 1], [12, -3, 1]];

  // The mark with its eyes lifted out onto a layer of their own, so they can
  // look around: rows 5-6 of the body are filled solid underneath them.
  // The head is split by rows too — 0-3 and 4-7 — so the ghost can LEAN on
  // the pixel grid, a cell at a time, instead of being rotated: a rotation
  // smears the cells, and the pixel is this system's one unit of ornament.
  // o.cls / o.top / o.extra: another class, room above the head, and what
  // goes in it — the not-found ghost uses all three.
  function ghostSvg(o) {
    const G = global.SCENE && global.SCENE.GH;
    if (!G) return '';
    const opt = o || {}, top = opt.top || 0;
    const r = q => '<rect x="' + q[0] + '" y="' + q[1] + '" width="' + q[2] + '" height="1"/>';
    const eyeRow = q => q[1] === 5 || q[1] === 6;
    const rows = (list, a, b) => list.filter(q => q[1] >= a && q[1] <= b).map(r).join('');
    const body = G.body.filter(q => !eyeRow(q)).concat([[1, 5, 12], [0, 6, 14]]);
    return '<svg class="' + (opt.cls || 'pk-ghost') + '" viewBox="0 ' + (-top) + ' ' + N + ' ' + (N + top) +
      '" shape-rendering="crispEdges" aria-hidden="true">' + (opt.extra || '') +
      '<g class="pk-body pk-l2">' + rows(body, 0, 3) + '</g>' +
      '<g class="pk-l1"><g class="pk-body">' + rows(body, 4, 7) + '</g>' +
        '<g class="pk-face pk-eyes">' + G.face.filter(eyeRow).map(q =>
          '<rect class="pk-row' + q[1] + '" x="' + q[0] + '" y="' + q[1] + '" width="' + q[2] + '" height="1"/>').join('') +
        '</g>' +
        '<g class="pk-face pk-joy">' + JOY.map(r).join('') + '</g>' +
      '</g>' +
      '<g class="pk-body">' + rows(body, 8, N - 1) + '</g>' +
      '<g class="pk-face">' + G.face.filter(q => !eyeRow(q)).map(r).join('') + '</g>' +
      '<g class="pk-body pk-s0">' + G.skirt[0].map(r).join('') + '</g>' +
      '<g class="pk-body pk-s1">' + G.skirt[1].map(r).join('') + '</g>' +
      '</svg>';
  }

  // The ghost a search shows when it finds nothing: shrugging, looking up at
  // a "?" over its head. Markup only — main.css "NOT FOUND" moves it, and the
  // scenery switch hides it. Used by app.js (Find a site, Site spec) and
  // quest.js (New sites).
  function lostSvg() {
    const q = '<g class="nf-q">' + ASK.map(a =>
      '<rect x="' + a[0] + '" y="' + a[1] + '" width="' + a[2] + '" height="1"/>').join('') + '</g>';
    return ghostSvg({ cls: 'nf-ghost', top: 9, extra: q });
  }

  /* ── where ───────────────────────────────────────────────────────── */

  // The bottom of whatever is stuck to the top of the screen — the nav, or
  // the table view's toolbar — which the ghost must not slip under.
  function ceiling() {
    let y = 0;
    for (const el of document.querySelectorAll('#nav, .view:not(.hidden) .toolbar')) {
      const r = el.getBoundingClientRect();
      if (r.height && r.top <= 1) y = Math.max(y, r.bottom);
    }
    return y;
  }

  // True when a viewport rectangle is empty page: every point of an 8 px grid
  // over it lands on page furniture, inside the window.
  function free(x, y, w, h) {
    if (x < 4 || y < 4 || x + w > innerWidth - 4 || y + h > innerHeight - 4) return false;
    for (let py = y + 2; py <= y + h - 2; py += 8) {
      for (let px = x + 2; px <= x + w - 2; px += 8) {
        const el = document.elementFromPoint(px, py);
        if (!el || !el.matches(OPEN)) return false;
      }
    }
    return true;
  }

  // Candidate spots along a card's edges, in viewport coordinates. Each one
  // remembers its offset ALONG the edge, so the window can follow the card.
  function spotsOf(card, only) {
    const r = card.getBoundingClientRect();
    if (!r.width || !r.height) return [];
    const top = ceiling() + 8, bottom = innerHeight - 8;
    const out = [];
    // the lean is sideways, a cell at a time, so the window needs room
    // beside the ghost — and one cell above it, for the cheer's hop
    const sideH = PX + HOP;
    const y0 = Math.max(r.top + 14, top), y1 = Math.min(r.bottom - 14 - sideH, bottom - sideH);
    for (const side of ['left', 'right']) {
      if (only && only !== side) continue;
      if (y1 < y0) break;
      for (let i = 0; i < TRIES; i++) {
        const y = Math.round(y0 + Math.random() * (y1 - y0));
        out.push({ card, side, w: PX + PAD, h: sideH, along: y - r.top });
      }
    }
    if (!only || only === 'top') {
      const x0 = r.left + 28, x1 = r.right - 28 - PX;
      if (x1 >= x0 && r.top - TOP - 4 >= top) {
        for (let i = 0; i < TRIES; i++) {
          out.push({ card, side: 'top', w: PX, h: TOP + 4, along: Math.round(x0 + Math.random() * (x1 - x0)) - r.left });
        }
      }
    }
    return out;
  }

  // Where a spot's window sits, in viewport coordinates, for the card as it is now.
  function place(s) {
    const r = s.card.getBoundingClientRect();
    if (s.side === 'left') return { x: r.left - s.w, y: r.top + s.along };
    if (s.side === 'right') return { x: r.right, y: r.top + s.along };
    return { x: r.left + s.along, y: r.top - s.h };
  }

  function pickSpot(opts) {
    const o = opts || {};
    const view = document.querySelector('.view:not(.hidden)');
    if (!view) return null;
    const boxes = o.box ? [typeof o.box === 'string' ? document.querySelector(o.box) : o.box]
      : [...view.querySelectorAll(BOXES)];
    const ok = [];
    for (const card of boxes) {
      if (!card) continue;
      for (const s of spotsOf(card, o.side)) {
        const p = place(s);
        if (free(p.x, p.y, s.w, s.h)) ok.push(s);
      }
    }
    if (!ok.length) return null;
    // The sides are where it reads best — "around the corner" — so they
    // are three times as likely as the top.
    const weighted = ok.flatMap(s => (s.side === 'top' ? [s] : [s, s, s]));
    return weighted[Math.floor(Math.random() * weighted.length)];
  }

  /* ── the peek ────────────────────────────────────────────────────── */

  // The ghost's transform for a reveal r in 0..1: how much of it is out from
  // behind the edge.
  function tf(side, r) {
    if (side === 'left') return 'translateX(' + ((1 - r) * PX).toFixed(1) + 'px)';
    if (side === 'right') return 'translateX(' + (-(1 - r) * PX).toFixed(1) + 'px)';
    return 'translateY(' + ((1 - r) * (TOP + 4)).toFixed(1) + 'px)';
  }

  function mount(s) {
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'pk-layer';
      layer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(layer);
    }
    const win = document.createElement('div');
    win.className = 'pk-win pk-' + s.side;
    win.style.width = s.w + 'px';
    win.style.height = s.h + 'px';
    win.innerHTML = ghostSvg();
    const g = win.firstElementChild;
    if (!g) return null;
    if (s.side === 'left') { g.style.left = PAD + 'px'; g.style.top = HOP + 'px'; }
    else if (s.side === 'right') { g.style.left = '0px'; g.style.top = HOP + 'px'; }
    else { g.style.left = '0px'; g.style.top = '4px'; }
    g.style.transform = tf(s.side, 0);
    layer.appendChild(win);
    return { s, win, g, eyes: g.querySelector('.pk-eyes'), l1: g.querySelector('.pk-l1'),
             l2: g.querySelector('.pk-l2'), anim: null, dead: false, scared: false, raf: 0 };
  }

  function follow(p) {
    if (p.dead) return;
    if (!p.s.card.isConnected || !p.s.card.getClientRects().length) return end(p);
    const at = place(p.s);
    // a card that has moved the window off the screen ends it, rather than
    // letting it widen the page
    if (at.x < 0 || at.x + p.s.w > innerWidth) return end(p);
    p.win.style.left = (at.x + scrollX) + 'px';
    p.win.style.top = (at.y + scrollY) + 'px';
    p.raf = requestAnimationFrame(() => follow(p));
  }

  function move(p, r, ms, ease) {
    if (p.dead) return Promise.resolve();
    const from = getComputedStyle(p.g).transform;
    const prev = p.anim;
    p.anim = p.g.animate([{ transform: from === 'none' ? tf(p.s.side, 0) : from },
                          { transform: tf(p.s.side, r) }],
                         { duration: ms, easing: ease, fill: 'forwards' });
    if (prev) prev.cancel();
    return p.anim.finished.catch(() => {});
  }

  // The head k cells toward d (-1 left, 1 right): rows 0-3 go k, rows 4-7
  // go k-1, so two steps read as a lean and one as a tilt of the head.
  function tilt(p, d, k) {
    if (!p.l1 || p.dead) return;
    p.l2.setAttribute('transform', 'translate(' + d * k + ' 0)');
    p.l1.setAttribute('transform', 'translate(' + d * Math.max(0, k - 1) + ' 0)');
  }

  // Leaning out is two steps a beat apart, so it is seen to happen.
  async function lean(p, d) {
    tilt(p, d, 1);
    await wait(90);
    if (on(p)) tilt(p, d, 2);
  }

  // Eyes are moved a whole cell at a time, like everything else on this grid.
  // A peek that has been cut short keeps the look it was startled with.
  function look(p, dx, dy, force) {
    if (!p.eyes || (!force && !on(p))) return;
    p.eyes.setAttribute('transform', 'translate(' + dx + ' ' + (dy || 0) + ')');
  }

  async function blink(p) {
    if (!p.eyes || !on(p)) return;
    p.eyes.classList.add('shut');
    await wait(120);
    p.eyes.classList.remove('shut');
  }

  // false once the peek has been cut short, so the script stops there.
  const on = p => !p.dead && !p.scared;

  async function play(p) {
    const side = p.s.side;
    if (side === 'top') {
      look(p, 0, -1);
      await move(p, 0.45, 950, SNEAK);              // the crown of its head
      if (!on(p)) return;
      await wait(450);
      await move(p, 1, 420, SNEAK);                 // and the eyes
      if (!on(p)) return;
      look(p, -1, 0); tilt(p, -1, 1); await wait(650);   // head cocked, one way
      look(p, 1, 0); tilt(p, 1, 1); await wait(650);     // and the other
      if (!on(p)) return;
      await blink(p); look(p, 0, 0); tilt(p, 0, 0); await wait(380);
    } else {
      const out = side === 'left' ? -1 : 1;         // eyes toward the open page
      look(p, out, 0);
      await move(p, 0.38, 1000, SNEAK);             // one eye round the corner
      if (!on(p)) return;
      await wait(600);
      look(p, 0, 0); await wait(260);               // a nervous glance
      look(p, out, 0); await wait(420);
      if (!on(p)) return;
      await move(p, 0.86, 560, SNEAK);              // further out
      if (!on(p)) return;
      await lean(p, out);                           // and leans round the corner
      await wait(520);
      look(p, -out, 0); await wait(700);            // a look at what is on the card
      if (!on(p)) return;
      await blink(p); look(p, -out, -1); await wait(420);
      look(p, 0, 0); tilt(p, out, 1); await wait(300);
      tilt(p, 0, 0);
    }
    if (!on(p)) return;
    await move(p, 0, 210, DUCK);
    end(p);
  }

  // Caught: eyes up, straight back in.
  function startle(p) {
    if (!on(p)) return;
    p.scared = true;
    look(p, 0, -1, true);
    move(p, 0, 150, DUCK).then(() => end(p));
  }

  /* ── the cheer ───────────────────────────────────────────────────── */

  // Something was just finished — a table generated, a deck or a workbook
  // written — and it comes out to see. Not sneaking this time: it pops out
  // with happy eyes, hops twice and transmits from where it stands (the
  // rings every press sends, from motion.js), takes a look at what was made,
  // and goes back in.
  const POP = 'cubic-bezier(0.34, 1.56, 0.64, 1)';   // the system's --spring

  function hop(p) {
    if (!on(p)) return Promise.resolve();
    return p.g.animate([
      { transform: 'translateY(0)', easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
      { transform: 'translateY(-' + HOP + 'px)', offset: 0.45, easing: 'cubic-bezier(0.5, 0, 0.7, 1)' },
      { transform: 'translateY(0)' },
    ], { duration: 300, composite: 'add' }).finished.catch(() => {});
  }

  function transmit(p) {
    const M = global.TableXMotion;
    if (!M || !M.rings) return;
    const r = p.g.getBoundingClientRect(), w = p.win.getBoundingClientRect();
    const L = Math.max(r.left, w.left), R = Math.min(r.right, w.right);
    if (R > L) M.rings(p.win, (L + R) / 2, r.top + r.height * 0.4);
  }

  async function cheerPlay(p) {
    const side = p.s.side, out = side === 'left' ? -1 : side === 'right' ? 1 : 0;
    p.g.classList.add('joy');
    await move(p, side === 'top' ? 1 : 0.86, 460, POP);
    if (!on(p)) return;
    transmit(p);
    await hop(p);
    await hop(p);
    if (!on(p)) return;
    await wait(420);
    p.g.classList.remove('joy');
    if (out) look(p, -out, 0); else look(p, 0, 1);    // a look at what was made
    await wait(700);
    if (!on(p)) return;
    await blink(p); look(p, 0, 0); await wait(220);
    if (!on(p)) return;
    await move(p, 0, 210, DUCK);
    end(p);
  }

  function near(e) {
    const p = active;
    if (!p || p.scared) return;
    const r = p.g.getBoundingClientRect(), w = p.win.getBoundingClientRect();
    // only the part that is out from behind the card can be seen, so only
    // that part can be "caught"
    const L = Math.max(r.left, w.left), R = Math.min(r.right, w.right);
    const T = Math.max(r.top, w.top), B = Math.min(r.bottom, w.bottom);
    if (R <= L || B <= T) return;
    const dx = Math.max(L - e.clientX, 0, e.clientX - R), dy = Math.max(T - e.clientY, 0, e.clientY - B);
    if (dx * dx + dy * dy < 70 * 70) startle(p);
  }

  function end(p) {
    if (!p || p.dead) return;
    p.dead = true;
    cancelAnimationFrame(p.raf);
    if (p.anim) p.anim.cancel();
    p.win.remove();
    if (active === p) {
      active = null;
      document.removeEventListener('pointermove', near);
      schedule(rand(20000, 40000));
    }
  }

  function launch(s, script) {
    const p = mount(s);
    if (!p) return false;
    active = p;
    follow(p);
    document.addEventListener('pointermove', near, { passive: true });
    script(p);
    return true;
  }

  /**
   * One peek, now. opts: { box: element or selector, side: 'left' | 'right'
   * | 'top' } to choose where; otherwise anywhere free in the open view.
   * Returns false when there is nowhere free to peek from.
   */
  function peek(opts) {
    if (active) return false;
    const s = pickSpot(opts);
    return s ? launch(s, play) : false;
  }

  /**
   * The cheer, now — called by whatever just finished something. Takes over
   * from a peek in progress. Beside opts.box if it can, anywhere free in
   * the open view if not. Still never under a dialog, in a background tab,
   * under reduced motion, or with the scenery switched off.
   */
  function cheer(opts) {
    if (calm()) return false;
    if (active) stop();
    const s = pickSpot(opts) || (opts && opts.box ? pickSpot({}) : null);
    return s ? launch(s, cheerPlay) : false;
  }

  /* ── the nav's mark ──────────────────────────────────────────────── */

  // The mark in the nav answers a click with a blink and a hop — its own
  // reply, on top of the rings motion.js sends from every press.
  function markHop() {
    const svg = document.querySelector('#brandHome .brand-mark');
    if (!svg) return;
    svg.classList.add('blink');
    setTimeout(() => svg.classList.remove('blink'), 140);
    if (reduced()) return;
    svg.animate([
      { transform: 'translateY(0)', easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
      { transform: 'translateY(-5px)', offset: 0.4, easing: 'cubic-bezier(0.5, 0, 0.6, 1.5)' },
      { transform: 'translateY(0)' },
    ], { duration: 460, composite: 'add' });
  }

  /* ── when ────────────────────────────────────────────────────────── */

  // What keeps it in, whatever would have brought it out.
  function calm() {
    if (document.hidden || reduced()) return true;
    if (global.SCENE && global.SCENE.enabled === false) return true;
    return !!document.querySelector('.ed-overlay:not(.hidden), .ab-overlay:not(.hidden)');
  }

  // ...and, for a peek nobody asked for, typing and the loader too.
  function quiet() {
    if (calm()) return true;
    if (Date.now() - lastKey < 2000) return true;
    const loader = document.getElementById('loader');
    return !!(loader && !loader.classList.contains('done'));
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(tick, ms);
  }

  function tick() {
    if (active) return;
    if (quiet()) return schedule(rand(5000, 9000));
    if (!peek()) schedule(rand(9000, 15000));      // nowhere free here, for now
  }

  function stop() {
    if (active) {
      const p = active;
      active = null;                                // end() then schedules nothing extra
      document.removeEventListener('pointermove', near);
      end(p);
    }
    schedule(rand(20000, 40000));
  }

  function init() {
    document.addEventListener('keydown', () => { lastKey = Date.now(); }, true);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (active) stop(); clearTimeout(timer); }
      else schedule(rand(4000, 8000));
    });
    addEventListener('resize', () => { if (active) stop(); });
    // A view change takes the card away; a fresh view gets a first look soon.
    const views = document.querySelectorAll('.view');
    const mo = new MutationObserver(() => {
      if (active) stop();
      schedule(rand(6000, 11000));
    });
    views.forEach(v => mo.observe(v, { attributes: true, attributeFilter: ['class'] }));
    const brand = document.getElementById('brandHome');
    if (brand) brand.addEventListener('click', markHop);
    schedule(rand(3500, 6000));
  }

  global.TableXPeek = {
    peek,
    cheer,
    stop,
    lostSvg,
    // for the e2e suite
    _free: free,
    _active: () => (active ? { side: active.s.side, box: active.s.card, win: active.win, ghost: active.g } : null),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);

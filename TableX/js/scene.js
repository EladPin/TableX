/* ═══════════════════════════════════════════════════════════════════
   SCENE — the hero's pixel landscape, and the ghost that lives in it.

   Adapted from UbiPlus's header lobby (D:\projects\UbiPlus, js/lobby.js),
   which draws a pixel living room and a wandering cat. Same technique —
   inline SVG rects on one integer grid, no assets, nothing from a CDN —
   but a living room is the wrong subject here, so it changed: a night
   ridge of CELL SITES, which is what TableX is actually about. The cat is
   replaced by the product's own mark, the pixel ghost.

   WHY THIS IS IN THE HERO AND NOWHERE ELSE. DESIGN.md deviation 4 says
   illustration must not leak into the working UI — the old TableX read as
   childish and that is what the redesign fixed. But the Mintlify spec also
   says the hero IS the illustration slot ("a hand-illustrated cloud
   landscape ... with the documentation product floating in the foreground
   as living proof"), and TableX's hero was a bare gradient. So the scene
   is the hero's illustration and stops at its bottom edge. Everything
   below stays austere white. Not licence to decorate the rest.

   THE LAYOUT TRICK. `.bridge` pulls the paste card 84px up into the hero.
   The horizon is placed at exactly that 84px, so the card's top edge IS
   the ground line: every prop stands ABOVE it and is therefore fully
   visible at any width, and only bare ground is ever hidden behind the
   card. That is what lets the scene span the full width instead of packing
   into the margins the way UbiPlus's furniture does. If the -84px in
   `.bridge` changes, GROUND_PX here has to change with it.

   Palette: the hero band is dark in BOTH themes (the same reason
   --hero-fg is not overridden), so one palette serves both with a small
   dark-theme nudge. Colours live in main.css as custom properties and
   reach the rects through CLASSES, never a fill="" attribute — that keeps
   a theme switch a pure token swap with no re-render, and keeps colour in
   the stylesheet where the rest of the system keeps it.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const STORE = 'tablex_scene';

  const SCENE = {
    S: 4,             // px per cell — the whole scene is on this one grid
    HZ: 24,           // ground surface row; props stand with their base at HZ-1
    GROUND_PX: 84,    // must equal the -84px overlap in `.bridge` (see header)
    MIN_W: 560,       // below this the band is too short to compose — hide it

    el: null, svg: null,
    enabled: true, visible: true, reduced: false,
    _t: 0, _timer: null, _cells: 0, _x: 0, _cx: 0, _dur: 2,
    _sites: [], _lamps: [], _stars: [], _stations: [], _at: -1,
    _ghost: null, _bob: null, _skirt: null,

    // +1 row so the lit horizon rim clears the card's top edge and reads
    // as one unbroken line across the full width, with the card planted
    // in front of it. Without it the rim lands exactly under the card.
    get ROWS() { return this.HZ + Math.round(this.GROUND_PX / this.S) + 1; },

    /* ── boot ──────────────────────────────────────────────────────── */
    init() {
      if (this.el) return;
      const hero = document.querySelector('.hero');
      if (!hero) return;

      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      try { this.enabled = localStorage.getItem(STORE) !== '0'; } catch (e) { /* private mode */ }

      this.el = document.createElement('div');
      this.el.id = 'scene';
      this.el.setAttribute('aria-hidden', 'true');
      const haze = document.createElement('div');
      haze.className = 'sc-haze';
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttribute('shape-rendering', 'crispEdges');
      this.svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
      this.el.append(haze, this.svg);

      // BEFORE .hero-inner: positioned siblings paint in DOM order, so a
      // scene appended last would sit on top of the headline.
      hero.insertBefore(this.el, hero.querySelector('.hero-inner'));

      this._apply();
      this._render();
      new ResizeObserver(() => this._render()).observe(this.el);

      // A decorative loop has no business running off-screen or in a
      // background tab; both paths park it.
      if ('IntersectionObserver' in global) {
        new IntersectionObserver(e => { this.visible = e[0].isIntersecting; this._pump(); })
          .observe(this.el);
      }
      document.addEventListener('visibilitychange', () => this._pump());
      this._pump();
    },

    /* The settings popover calls this; it persists and is read on next boot. */
    setEnabled(on) {
      this.enabled = !!on;
      try { localStorage.setItem(STORE, on ? '1' : '0'); } catch (e) { /* private mode */ }
      this._apply();
      // On the way OFF, leave the drawing where it is: the CSS opacity
      // transition is what should be seen, and clearing the SVG under it
      // makes the landscape vanish in a single frame instead of fading.
      if (on) this._render(); else this._pump();
    },

    _apply() { if (this.el) this.el.classList.toggle('off', !this.enabled); },

    _pump() {
      const run = this.enabled && this.visible && !document.hidden &&
                  !this.reduced && this._cells > 0;
      if (run && !this._timer) this._timer = setInterval(() => this._tick(), 250);
      if (!run && this._timer) { clearInterval(this._timer); this._timer = null; }
    },

    /* ── drawing helpers ───────────────────────────────────────────── */

    // One rect. Everything in the scene is one of these, on the integer grid.
    r(x, y, w, h, c) { return `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${c}"/>`; },

    // Deterministic noise. Stars and scatter must NOT reshuffle on every
    // resize — a sky that rearranges itself while you drag the window reads
    // as a bug — so position is a pure function of the index.
    n(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); },

    /* A ridge line, drawn as merged column runs rather than one rect per
       column — the same silhouette at a twentieth of the DOM. `top(x)`
       returns the crest row for column x; `rim` paints a 1px lit edge along
       the crest, which is what separates the layers from one another in a
       dark scene (atmospheric depth, not outlines). */
    _ridge(out, cells, top, fill, rim) {
      let x0 = 0, y0 = top(0);
      for (let x = 1; x <= cells; x++) {
        const y = x < cells ? top(x) : -999;
        if (y === y0) continue;
        out.push(this.r(x0, y0, x - x0, this.HZ - y0, fill));
        if (rim) out.push(this.r(x0, y0, x - x0, 1, rim));
        x0 = x; y0 = y;
      }
    },

    // A cypress — the tree that actually stands on these hills. Narrow
    // silhouettes read at 4px far better than round canopies do, and a
    // tall one breaks the near ridge's edge, which is what stops that
    // edge reading as a drawn line.
    _cypress(out, x, base, h) {
      const R = this.r, c = 'sc-solid';
      h = h || 9;
      out.push(R(x + 1, base - h, 1, 3, c),
               R(x, base - h + 2, 3, h - 4, c),
               R(x + 1, base - 2, 1, 3, c));
    },

    // A boulder, for the gaps between the big props.
    _rock(out, x, base) {
      const R = this.r, c = 'sc-solid';
      out.push(R(x + 1, base - 2, 3, 1, c), R(x, base - 1, 5, 2, c));
    },

    /* THE LATTICE TOWER — the scene's main prop and the app's subject.
       Three sector panels, because three servers per point is the
       deliverable; two read side-on and the third edge-on, which is what a
       3-sector head actually looks like from the ground. Returns the
       antenna cell so the caller can hang coverage arcs off it. */
    _lattice(out, cx, top, base) {
      const R = this.r;
      out.push(R(cx, top, 1, 1, 'sc-lamp'), R(cx, top + 1, 1, 3, 'sc-mast'));

      // The head is deliberately WIDE — 11 cells against an 84px tower. A
      // narrower one read as a small table rather than a sector head.
      const ay = top + 4;
      out.push(R(cx - 5, ay, 11, 1, 'sc-mast'));
      out.push(R(cx - 5, ay + 1, 2, 4, 'sc-mast'), R(cx - 5, ay + 1, 1, 4, 'sc-mint'));
      out.push(R(cx + 4, ay + 1, 2, 4, 'sc-mast'), R(cx + 5, ay + 1, 1, 4, 'sc-mint'));
      out.push(R(cx - 1, ay + 1, 3, 4, 'sc-mast'), R(cx, ay + 1, 1, 4, 'sc-mint'));
      out.push(R(cx - 5, ay + 5, 11, 1, 'sc-brace'));
      out.push(R(cx - 4, ay, 1, 1, 'sc-hi'), R(cx + 4, ay, 1, 1, 'sc-hi'));

      // Two legs, ties every third row, and a third leg appearing low down
      // where a real lattice's back leg separates. The old version drew a
      // diagonal on every free row, which at 4px read as noise, not steel.
      const mt = ay + 6;
      for (let y = mt; y <= base; y++) {
        const f = (y - mt) / Math.max(1, base - mt);
        const hw = 1 + Math.round(f * 3);                   // taper 1 -> 4
        out.push(R(cx - hw, y, 1, 1, 'sc-mast'), R(cx + hw, y, 1, 1, 'sc-mast'));
        if ((y - mt) % 3 === 1) out.push(R(cx - hw, y, hw * 2 + 1, 1, 'sc-brace'));
        else if (f > 0.4) out.push(R(cx, y, 1, 1, 'sc-brace'));
      }
      out.push(R(cx - 5, base, 11, 1, 'sc-solid'));
      out.push(R(cx + 7, base - 3, 7, 4, 'sc-solid'), R(cx + 12, base - 2, 1, 1, 'sc-win'));
      return { hy: ay + 3 };
    },

    /* A guyed mast — thinner, taller, held by wires. Variety in the
       skyline, and guy wires are the one detail that says "mast" at a
       glance even at three cells wide. */
    _mast(out, cx, top, base) {
      const R = this.r;
      // The shaft steps back to the brace tone below the head. Drawn in
      // full mast tone it was the brightest vertical in the scene and the
      // whole thing read as a lamppost.
      out.push(R(cx, top, 1, 1, 'sc-lamp'), R(cx, top + 1, 1, 7, 'sc-mast'));
      out.push(R(cx, top + 8, 1, base - top - 7, 'sc-brace'));
      out.push(R(cx - 3, top + 3, 7, 1, 'sc-mast'));                        // arm
      out.push(R(cx - 3, top + 4, 2, 3, 'sc-mint'), R(cx + 2, top + 4, 2, 3, 'sc-mint'));
      out.push(R(cx, top + 4, 1, 3, 'sc-mint'));                            // third, edge-on
      out.push(R(cx - 3, top + 11, 1, 4, 'sc-mast'), R(cx - 2, top + 12, 1, 2, 'sc-hi'));
      for (let i = 1; (top + 8) + i * 2 <= base; i++) {
        out.push(R(cx - i, top + 8 + i * 2, 1, 1, 'sc-wire'),
                 R(cx + i, top + 8 + i * 2, 1, 1, 'sc-wire'));
      }
      out.push(R(cx - 3, base, 7, 1, 'sc-solid'));
      return { hy: top + 5 };
    },

    /* A ROOFTOP SITE. Much of this database is a mast on somebody's roof —
       the example in CLAUDE.md is a community-centre roof in Dishon — so a
       skyline of nothing but hilltop towers would misrepresent the data.
       Lit windows are the cheapest life in the whole scene. */
    _roof(out, x, base) {
      const R = this.r, w = 15, y = base - 10;
      out.push(R(x, y + 3, w, 8, 'sc-solid'));            // main block
      out.push(R(x + 10, y, 5, 4, 'sc-solid'));           // lift housing — a
      out.push(R(x, y + 3, w, 1, 'sc-brace'));            // flat-topped box
      out.push(R(x + 10, y, 5, 1, 'sc-brace'));           // read as a cassette
      for (let i = 0; i < 8; i++) {
        const wx = x + 1 + (i % 4) * 3, wy = y + 5 + (((i / 4) | 0) * 3);
        if (this.n(i * 7 + x) > 0.3) out.push(R(wx, wy, 2, 2, 'sc-win'));
      }
      const cx = x + 4;                                   // the mast on the roof
      out.push(R(cx, y - 7, 1, 10, 'sc-mast'), R(cx, y - 8, 1, 1, 'sc-lamp'));
      out.push(R(cx - 3, y - 6, 7, 1, 'sc-mast'));
      out.push(R(cx - 3, y - 5, 2, 3, 'sc-mint'), R(cx + 2, y - 5, 2, 3, 'sc-mint'));
      out.push(R(cx, y - 5, 1, 3, 'sc-mint'));
      return { hy: y - 4 };
    },

    /* The analysis point — the one the whole table is about. A survey pin,
       so the scene reads as "a point, and the sites that serve it" rather
       than a generic skyline. */
    _pin(out, x, base) {
      const R = this.r;
      out.push(R(x, base - 9, 1, 11, 'sc-pin'));                 // pole
      out.push(R(x + 1, base - 9, 4, 3, 'sc-pin'));              // pennant
      out.push(R(x + 2, base - 8, 2, 1, 'sc-mint'));
      out.push(R(x - 3, base + 1, 7, 1, 'sc-pin'));              // the point itself
      out.push(R(x - 1, base, 3, 1, 'sc-mint'));
    },

    /* Coverage arcs — a fan of three, the classic signal glyph, aimed away
       from the mast. Cells are deduped: two angles rounding to the same
       cell would otherwise stack rects and double the opacity. */
    _fan(ax, ay, dir) {
      const g = [];
      for (let k = 0; k < 3; k++) {
        const rad = 3 + k * 3, seen = new Set();
        for (let a = -58; a <= 58; a += 4) {
          const t = a * Math.PI / 180;
          seen.add((ax + Math.round(dir * rad * Math.cos(t))) + ',' +
                   (ay - Math.round(rad * Math.sin(t))));
        }
        // opacity as an ATTRIBUTE, not CSS: the tick rewrites it, and a
        // CSS property would win and freeze the pulse. The resting value
        // is high enough that the whole fan reads as one shape — a single
        // lit arc travelling through darkness read as three loose specks.
        g.push('<g class="sc-arc" opacity=".34">' + [...seen].map(s => {
          const p = s.split(',');
          return this.r(+p[0], +p[1], 1, 1, 'sc-mint');
        }).join('') + '</g>');
      }
      return g.join('');
    },

    /* ── the ghost ─────────────────────────────────────────────────── */

    /* The mark itself, cell for cell — the same 14x14 grid as the nav SVG,
       the .ico and the loader, so the mascot IS the logo rather than a
       lookalike that drifts from it. The two skirt phases are the loader's
       f1-on / f0-on frames read off its CSS grid areas; keep them in step
       with index.html if that flicker ever changes. */
    GH: {
      body: [[5, 0, 4], [3, 1, 8], [2, 2, 10], [1, 3, 12], [1, 4, 12],
             [1, 5, 2], [5, 5, 4], [11, 5, 2], [0, 6, 3], [5, 6, 4], [11, 6, 3],
             [0, 7, 14], [0, 8, 14],
             [0, 9, 2], [4, 9, 2], [8, 9, 2], [12, 9, 2],
             [0, 10, 1], [2, 10, 2], [6, 10, 2], [10, 10, 2], [13, 10, 1],
             [0, 11, 14]],
      face: [[3, 5, 2], [9, 5, 2], [3, 6, 2], [9, 6, 2],
             [2, 9, 2], [6, 9, 2], [10, 9, 2],
             [1, 10, 1], [4, 10, 2], [8, 10, 2], [12, 10, 1]],
      skirt: [
        [[0, 12, 4], [5, 12, 4], [10, 12, 4], [1, 13, 3], [6, 13, 2], [10, 13, 3]],
        [[0, 12, 2], [3, 12, 3], [8, 12, 3], [12, 12, 2],
         [0, 13, 1], [4, 13, 2], [8, 13, 2], [13, 13, 1]],
      ],
      W: 14, H: 14,
    },

    _paint(a, c) { return a.map(q => this.r(q[0], q[1], q[2], 1, c)).join(''); },

    _ghostSvg() {
      const G = this.GH;
      return '<g class="sc-ghost">' +
             this.r(2, G.H, 10, 1, 'sc-shadow') +
             '<g class="sc-bob">' + this._paint(G.body, 'sc-mint') +
             this._paint(G.face, 'sc-face') +
             '<g class="sc-skirt">' + this._paint(G.skirt[0], 'sc-mint') + '</g>' +
             '</g></g>';
    },

    /* ── compose ───────────────────────────────────────────────────── */
    _render() {
      if (!this.el) return;
      const wpx = this.el.clientWidth;
      const cells = Math.floor(wpx / this.S);
      this._cells = (!this.enabled || wpx < this.MIN_W) ? 0 : cells;
      this._sites = []; this._lamps = []; this._stars = []; this._stations = [];
      this._ghost = this._bob = this._skirt = null;
      if (!this._cells) { this.svg.innerHTML = ''; this._pump(); return; }

      const R = this.r.bind(this), n = this.n.bind(this);
      const HZ = this.HZ, ROWS = this.ROWS, base = HZ - 1;
      const out = [];

      const at = f => Math.round(cells * f);

      // sky — stars only; the band itself is the hero gradient showing
      // through. They stay in the top rows, clear of every crest: a star
      // sitting inside a hill is the tell that a scene was assembled
      // rather than composed.
      const nStars = Math.max(8, Math.round(cells / 11));
      for (let i = 0; i < nStars; i++) {
        const sx = 1 + Math.round(n(i * 3.7) * (cells - 3));
        const sy = 1 + Math.round(n(i * 9.1 + 4) * 7);
        out.push(`<g class="sc-star${n(i * 5 + 2) > 0.55 ? ' tw' : ''}">${
          R(sx, sy, 1, 1, 'sc-starc')}</g>`);
      }

      /* FOUR ranges, distant to near. Three read as stacked bands; the
         fourth is what turns them into distance. Two things carry it:
         VALUE (each nearer layer steps darker, the most distant sitting
         lightest in the horizon haze) and CREST SHAPE — the wavelengths
         below are 220-870px, so peaks and saddles actually land inside
         the viewport. The first attempt used 0.02 rad/cell, whose period
         is wider than the screen, and every ridge came out a flat slab.
         The last term in each is a ~70px ripple: without it round() holds
         one row for fifty columns and the lit rim reads as a ruled line
         rather than a crest. */
      const sin = Math.sin;
      const cDist = x => HZ - 13 - Math.round(2.6 * sin(x * 0.045) + 1.4 * sin(x * 0.109 + 2.1) +
                                              0.9 * sin(x * 0.023 + 4.4) + 0.7 * sin(x * 0.290 + 1.1));
      const cFar  = x => HZ -  9 - Math.round(2.4 * sin(x * 0.065 + 1.4) + 1.5 * sin(x * 0.148 + 0.3) +
                                              0.9 * sin(x * 0.028 + 2.7) + 0.7 * sin(x * 0.330 + 3.4));
      const cMid  = x => HZ -  5 - Math.round(1.9 * sin(x * 0.038 + 3.2) + 1.2 * sin(x * 0.121 + 1.9) +
                                              0.7 * sin(x * 0.270 + 0.5));
      const cNear = x => HZ -  2 - Math.round(1.2 * sin(x * 0.090 + 0.7) + 0.7 * sin(x * 0.205 + 2.6) +
                                              0.5 * sin(x * 0.410 + 1.8));
      this._ridge(out, cells, cDist, 'sc-dist', 'sc-rim1');

      // Sites we will never reach, on the range behind everything — a mast
      // is two cells there. Cheapest depth in the scene, and it says the
      // network carries on past the frame.
      for (let i = 0; i < 5; i++) {
        const x = at(0.08 + i * 0.19) + ((n(i * 17) * 20) | 0) - 10;
        if (x > 2 && x < cells - 2) out.push(R(x, cDist(x) - 3, 1, 3, 'sc-rim1'));
      }

      this._ridge(out, cells, cFar, 'sc-far', 'sc-rim2');
      this._ridge(out, cells, cMid, 'sc-mid', 'sc-rim3');
      this._ridge(out, cells, cNear, 'sc-near', null);

      // ground: solid to the hero's bottom edge, under a lit rim on the
      // horizon row — the one ground row the paste card never covers, so
      // it reads as one unbroken line with the card planted in front of it.
      out.push(R(0, HZ, cells, ROWS - HZ, 'sc-ground'));
      out.push(R(0, HZ, cells, 1, 'sc-rim'), R(0, HZ + 1, cells, 1, 'sc-near'));

      /* Props, placed by fraction of width and dropped when the band is too
         narrow to hold them — the same "pack and drop" idea as UbiPlus's
         furniture, expressed as a panorama rather than a wall. Sites are
         spread so no two crowd, and the ghost's stations are computed to
         stand BESIDE a site, never on top of one. */
      const put = (min, f, fn) => { if (cells >= min) fn(at(f)); };
      const sites = [];
      const site = (x, dir, made) => sites.push({ cx: x, dir, hy: made.hy });

      for (const [f, kind] of [[0.035, 1], [0.20, 1], [0.235, 0], [0.40, 1],
                               [0.50, 0], [0.565, 1], [0.74, 0], [0.775, 1],
                               [0.945, 1], [0.98, 0]]) {
        const x = at(f) + ((n(f * 100) * 6) | 0) - 3;
        if (kind) this._cypress(out, x, base, 7 + ((n(f * 41) * 4) | 0));
        else this._rock(out, x, base);
      }

      put(0, 0.095, x => site(x + 4, 1, this._roof(out, x, base)));
      put(0, 0.325, x => site(x, 1, this._lattice(out, x, 2, base)));
      put(190, 0.475, x => { this._pin(out, x, base); this._stations.push(x - 20); });
      put(150, 0.655, x => site(x, -1, this._mast(out, x, 3, base)));
      put(250, 0.875, x => site(x, -1, this._lattice(out, x, 6, base)));

      // data-st is where the ghost stands to visit this site: on the side
      // the arcs do NOT face, and far enough out that a 14-cell sprite
      // clears the mast. Standing on top of a tower hides both.
      for (const s of sites) {
        out.push(`<g class="sc-site" data-cx="${s.cx}" data-st="${
          s.dir > 0 ? s.cx - 25 : s.cx + 11}">${
          this._fan(s.cx + s.dir * 7, s.hy, s.dir)}</g>`);
      }
      out.push(this._ghostSvg());

      this.svg.setAttribute('viewBox', `0 0 ${cells} ${ROWS}`);
      this.svg.setAttribute('width', cells * this.S);
      this.svg.setAttribute('height', ROWS * this.S);
      this.svg.innerHTML = out.join('');

      this._stars = [...this.svg.querySelectorAll('.sc-star.tw')];
      this._lamps = [...this.svg.querySelectorAll('.sc-lamp')];
      this._ghost = this.svg.querySelector('.sc-ghost');
      this._bob = this.svg.querySelector('.sc-bob');
      this._skirt = this.svg.querySelector('.sc-skirt');
      this._sites = [...this.svg.querySelectorAll('.sc-site')].map(g => ({
        cx: +g.dataset.cx, g, arcs: [...g.querySelectorAll('.sc-arc')],
      }));

      // Where the ghost may stand: beside every site, at the pin, and one
      // open stretch so it is not always glued to a mast.
      for (const g of this.svg.querySelectorAll('.sc-site')) this._stations.push(+g.dataset.st);
      this._stations.push(at(0.56));
      this._stations = this._stations
        .map(x => Math.max(1, Math.min(cells - this.GH.W - 1, x)))
        .sort((a, b) => a - b);

      // Start mid-panorama, not at station 0 — that one is the leftmost,
      // which parks the mascot half in the corner on first paint.
      this._at = Math.min(1, this._stations.length - 1);
      this._place(this._stations[this._at], true);

      // With motion reduced the tick never runs, so no site would ever be
      // switched on and the coverage arcs — the point of the picture —
      // would simply be missing. Pin one clean frame instead, the same
      // rule the loader's ghost follows for its skirt.
      if (this.reduced && this._sites.length) {
        const s = this._sites[this._sites.length > 1 ? 1 : 0];
        s.g.classList.add('on');
        s.arcs.forEach((a, i) => a.setAttribute('opacity', i ? '.22' : '.7'));
      }
      this._pump();
    },

    /* ── life ──────────────────────────────────────────────────────── */

    // CSS transform lengths on an SVG child are in the element's own user
    // units, which is why this can talk in grid cells and not pixels.
    _place(x, snap) {
      if (!this._ghost) return;
      this._ghost.style.transition = snap ? 'none' : `transform ${this._dur}s linear`;
      this._ghost.style.transform = `translate(${x}px, ${this.HZ - 15}px)`;
      this._x = x; this._cx = x + 7;
      if (snap) void this._ghost.getBoundingClientRect();  // flush, so the next move animates
    },

    _wander() {
      const st = this._stations;
      if (st.length < 2) return;
      let i = (Math.random() * st.length) | 0;
      if (i === this._at) i = (i + 1) % st.length;
      this._at = i;
      this._dur = Math.max(1.4, Math.abs(st[i] - this._x) / 9);
      this._place(st[i], false);
    },

    _tick() {
      const t = ++this._t;

      // bob + skirt, on the loader's own 500 ms rhythm, so the mark moves
      // the same way in both places
      if (t % 2 === 0) {
        const p = (t >> 1) & 1;
        this._bob.setAttribute('transform', p ? 'translate(0,-1)' : 'translate(0,0)');
        this._skirt.innerHTML = this._paint(this.GH.skirt[p], 'sc-mint');
      }
      if (t % 4 === 0) {                                   // aviation lights
        for (let i = 0; i < this._lamps.length; i++) {
          this._lamps[i].setAttribute('opacity', ((t >> 2) + i * 2) % 6 < 2 ? '1' : '.22');
        }
      }
      if (t % 3 === 0) {                                   // slow twinkle
        for (let i = 0; i < this._stars.length; i++) {
          this._stars[i].setAttribute('opacity', (((t / 3) | 0) + i) % 4 ? '1' : '.3');
        }
      }

      // Only the site the ghost is standing at answers, and its arcs roll
      // outward from the panel — the point being measured, which is the one
      // thing this app does.
      const near = this._sites.reduce((b, s) =>
        (!b || Math.abs(s.cx - this._cx) < Math.abs(b.cx - this._cx)) ? s : b, null);
      for (const s of this._sites) s.g.classList.toggle('on', s === near);
      if (near) {
        // a bright band travelling outward through the fan, with a rest
        // beat on the fourth step so it reads as a pulse, not a spinner
        for (let i = 0; i < near.arcs.length; i++) {
          near.arcs[i].setAttribute('opacity', ((t >> 1) % 4) === i ? '.95' : '.34');
        }
      }

      if (t % 24 === 0) this._wander();                    // ~6 s between moves
    },
  };

  global.SCENE = SCENE;
})(window);

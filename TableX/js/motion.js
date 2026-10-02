/* TableX — motion.js: the interaction layer every button shares.
 *
 * Three things, all delegated from the document so nothing here has to know
 * which view rendered which button, and nothing is ever inserted INTO a
 * button (app.js and i18n.js rewrite button text freely; a child span of
 * ours would be wiped, or would leak into a textContent read):
 *
 *   PRESS   anything pressable gives under the pointer and springs back.
 *   RINGS   a click transmits: two thin rings go out from where you pressed,
 *           the same coverage arcs the floor's sites emit. Drawn in one fixed
 *           layer above everything, never inside the button.
 *   SLIDE   the nav's active bar and every segmented control's thumb glide
 *           to the new selection (main.css reads --ind-x / --ind-w).
 *
 * The press is a Web Animation with composite:'add', so it stacks on
 * whatever transform, translate or rotate a component already carries
 * instead of replacing it — that is what lets one rule cover twenty kinds
 * of button without touching twenty transition lists.
 *
 * Reduced motion: no press, no rings, and the indicators jump instead of
 * sliding (the global reduced-motion rule in main.css zeroes the transition).
 */
(function () {
  'use strict';

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PRESS = 'button, .db-chip, .dk-act, .dk-x, .dk-move, .brand, [data-copy]';
  // List rows and the tiny on-thumbnail controls press, but do not transmit:
  // rings off every row of a search result would be noise, not an answer.
  const QUIET = '.sd-hit, .ins-head, .tr-ops button, .dk-x, .dk-move, [data-copy], .tpl-stage *';
  const DANGER = '.btn-danger, .danger, .ed-rm, .sd-chip-x, .dk-x, .q-x';
  const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

  const pressable = t => {
    const el = t && t.closest && t.closest(PRESS);
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return null;
    return el;
  };

  /* ── PRESS ─────────────────────────────────────────────────────────── */
  // A fixed ~5px of give in the larger dimension, so a 30px icon and a
  // 900px result row both read as pressed without the row visibly shrinking.
  const depth = el => 1 - Math.min(0.06, 5 / Math.max(el.offsetWidth, el.offsetHeight, 1));

  let held = null;

  function pressDown(el) {
    release();
    if (reduced()) return;
    held = {
      el, s: depth(el),
      anim: el.animate({ transform: ['scale(1)', 'scale(' + depth(el) + ')'] },
                       { duration: 110, easing: 'ease-out', fill: 'forwards', composite: 'add' }),
    };
  }

  function release() {
    if (!held) return;
    const { el, s, anim } = held;
    held = null;
    const back = el.animate({ transform: ['scale(' + s + ')', 'scale(1)'] },
                            { duration: 420, easing: SPRING, composite: 'add' });
    anim.cancel();
    back.onfinish = () => back.cancel();
  }

  document.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const el = pressable(e.target);
    if (el) pressDown(el);
    // Where the theme will sweep from, if this press changes it (see app.js
    // setTheme and the view-transition rules at the bottom of main.css).
    if (e.target.closest('[data-set-theme]')) {
      const r = document.documentElement.style;
      r.setProperty('--vt-x', e.clientX + 'px');
      r.setProperty('--vt-y', e.clientY + 'px');
    }
  }, { passive: true });
  ['pointerup', 'pointercancel', 'dragstart'].forEach(t =>
    document.addEventListener(t, release, { passive: true }));
  document.addEventListener('pointerout', e => {
    if (held && e.target === held.el && !held.el.contains(e.relatedTarget)) release();
  }, { passive: true });

  // Keyboard presses get the same give, so Enter on a focused button is
  // answered the way a click is.
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
      const el = pressable(document.activeElement);
      if (el && el === e.target) pressDown(el);
    }
  });
  document.addEventListener('keyup', e => {
    if (e.key === 'Enter' || e.key === ' ') release();
  });

  /* ── RINGS ─────────────────────────────────────────────────────────── */
  let layer = null;
  let live = 0;

  function rings(el, x, y) {
    if (reduced() || live > 8) return;
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'fx-layer';
      layer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(layer);
    }
    const r = Math.max(22, Math.min(56, Math.max(el.offsetWidth, el.offsetHeight) * 0.42));
    const color = el.matches(DANGER) ? 'var(--err)' : 'var(--mint)';
    [0, 1].forEach(i => {
      const ring = document.createElement('i');
      ring.className = 'fx-ring';
      const d = (r + i * r * 0.7) * 2;
      ring.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + d + 'px;height:' + d +
        'px;border-color:' + color + ';animation-delay:' + (i * 90) + 'ms';
      live++;
      let gone = false;
      const done = () => { if (gone) return; gone = true; ring.remove(); live--; };
      ring.addEventListener('animationend', done, { once: true });
      setTimeout(done, 1400);           // in case the animation never runs
      layer.appendChild(ring);
    });
  }

  document.addEventListener('click', e => {
    const el = pressable(e.target);
    if (!el) return;
    if (el.matches('[data-copy]')) {
      el.classList.remove('copied');
      void el.offsetWidth;               // restart the flash on a second click
      el.classList.add('copied');
      setTimeout(() => el.classList.remove('copied'), 700);
    }
    if (el.matches(QUIET)) return;
    let x = e.clientX, y = e.clientY;
    // A keyboard click has no pointer position (detail 0): transmit from
    // the centre of the button instead of from the page corner.
    if (!e.detail || (x === 0 && y === 0)) {
      const b = el.getBoundingClientRect();
      x = b.left + b.width / 2;
      y = b.top + b.height / 2;
    }
    rings(el, x, y);
  }, true);

  /* ── SLIDE ─────────────────────────────────────────────────────────── */
  // [container, the selected item inside it, inset of the drawn marker]
  const TRACKS = [
    ['.nav-links', '.nav-link.active', 10],
    ['.seg', '.seg-btn.on', 0],
  ];

  function place(box, sel, inset) {
    const it = box.querySelector(sel);
    // Hidden (settings closed, nav hidden under the table view, mobile):
    // nothing to measure. Drop the transition too, so that when it shows
    // again the marker is simply THERE rather than sliding in from 0.
    if (!it || !box.offsetWidth || !it.offsetWidth) {
      // Guarded: classList.remove() of an absent class still writes the
      // attribute and queues a mutation record, which would re-trigger the
      // observer below every frame for as long as the control stays hidden.
      if (box.classList.contains('ind-ready')) box.classList.remove('ind-ready', 'ind-move');
      return;
    }
    box.style.setProperty('--ind-x', (it.offsetLeft + inset) + 'px');
    box.style.setProperty('--ind-w', (it.offsetWidth - inset * 2) + 'px');
    if (!box.classList.contains('ind-ready')) {
      box.classList.add('ind-ready');
      // Only once it has been painted in place does moving it animate.
      requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('ind-move')));
    }
  }

  function initTracks() {
    TRACKS.forEach(([boxSel, sel, inset]) => {
      document.querySelectorAll(boxSel).forEach(box => {
        let queued = false;
        const run = () => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(() => { queued = false; place(box, sel, inset); });
        };
        // The selection moves by a class change (app.js owns which one is
        // on); the geometry moves by resize — a language switch, the fonts
        // landing, the settings popover opening from display:none.
        new MutationObserver(run).observe(box, { subtree: true, attributes: true, attributeFilter: ['class'] });
        const ro = new ResizeObserver(run);
        ro.observe(box);
        box.querySelectorAll('button').forEach(b => ro.observe(b));
        run();
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTracks);
  else initTracks();
})();

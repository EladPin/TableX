/* ═══════════════════════════════════════════════════════════════════
   GEO — WGS84 degrees <-> UTM metres, for the new-site form

   Planet writes WGS84 degrees in one project and UTM 36N metres in another,
   under the SAME `Longitude` / `Latitude` headers (the May-26 Partner export
   holds 34.957250 / 32.051722, the IDF one 622321.5 / 3452921), and it reads
   either back. So the form lets the user type whichever the נ.צ arrived in
   and shows the other beside it — which is what makes a swapped pair or a
   mistyped digit visible before it reaches a shared project.

   Published mathematics rather than anything fitted to a sample: the Krüger
   series of the transverse Mercator to third order in n, the formulation
   UTM itself is defined by. Within a zone it agrees with the full projection
   to well under a millimetre — far below the 0.1 m the form prints. Checked
   against published reference points; see CLAUDE.md "Planet quests".

   Israel lies entirely in zone 36 (30°E–36°E), so 36N is the default, but
   the zone is a parameter rather than a constant.

   Loaded as a plain <script> by index.html (self.TableXGeo) and requirable
   from Node, so the reference points can be checked without a browser.
   ═══════════════════════════════════════════════════════════════════ */
(function (scope) {
  'use strict';

  const A = 6378137;                    // WGS84 semi-major axis, metres
  const F = 1 / 298.257223563;          // WGS84 flattening
  const K0 = 0.9996;                    // UTM scale on the central meridian
  const E0 = 500000;                    // false easting
  const ZONE = 36;

  const n = F / (2 - F);
  const n2 = n * n, n3 = n2 * n;
  const AA = A / (1 + n) * (1 + n2 / 4 + n2 * n2 / 64);
  const ALPHA = [n / 2 - 2 * n2 / 3 + 5 * n3 / 16, 13 * n2 / 48 - 3 * n3 / 5, 61 * n3 / 240];
  const BETA = [n / 2 - 2 * n2 / 3 + 37 * n3 / 96, n2 / 48 + n3 / 15, 17 * n3 / 480];
  const DELTA = [2 * n - 2 * n2 / 3 - 2 * n3, 7 * n2 / 3 - 8 * n3 / 5, 56 * n3 / 15];
  const C = 2 * Math.sqrt(n) / (1 + n);
  const RAD = Math.PI / 180;

  const meridian = zone => (zone * 6 - 183) * RAD;

  /** [lon, lat] in degrees -> [easting, northing] in metres (northern hemisphere). */
  function toUtm(lon, lat, zone) {
    const z = zone || ZONE;
    const phi = lat * RAD, dl = lon * RAD - meridian(z);
    const s = Math.sin(phi);
    const t = Math.sinh(Math.atanh(s) - C * Math.atanh(C * s));
    const xi = Math.atan2(t, Math.cos(dl));
    const eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
    let e = eta, nn = xi;
    for (let j = 1; j <= 3; j++) {
      e += ALPHA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
      nn += ALPHA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    }
    return [E0 + K0 * AA * e, K0 * AA * nn];
  }

  /** [easting, northing] in metres -> [lon, lat] in degrees (northern hemisphere). */
  function fromUtm(east, north, zone) {
    const z = zone || ZONE;
    const xi = north / (K0 * AA), eta = (east - E0) / (K0 * AA);
    let xp = xi, ep = eta;
    for (let j = 1; j <= 3; j++) {
      xp -= BETA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
      ep -= BETA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    }
    const chi = Math.asin(Math.sin(xp) / Math.cosh(ep));
    let phi = chi;
    for (let j = 1; j <= 3; j++) phi += DELTA[j - 1] * Math.sin(2 * j * chi);
    const lon = meridian(z) + Math.atan2(Math.sinh(ep), Math.cos(xp));
    return [lon / RAD, phi / RAD];
  }

  // What each format accepts. Loose on purpose — these catch a swapped pair
  // or a pasted degree in a metre field, not a site that is merely far away.
  const inGeo = (lon, lat) => Math.abs(lon) <= 180 && Math.abs(lat) <= 90;
  const inUtm = (e, nn) => e >= 100000 && e <= 900000 && nn >= 0 && nn <= 9330000;

  const API = { toUtm, fromUtm, inGeo, inUtm, ZONE };
  scope.TableXGeo = API;
  if (typeof module === 'object' && module.exports) module.exports = API;
})(typeof self !== 'undefined' ? self : globalThis);

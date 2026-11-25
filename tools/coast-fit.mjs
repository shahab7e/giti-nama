// Coast-fit historical borders: node tools/coast-fit.mjs [--dry]
// Historical rings are coarse (1–2° edges) and stop short of the coastline, so the map showed
// empty land between a country and its coast. For every pre-1914 snapshot this densifies each
// ring edge, pushes every sample outward along the edge normal across empty land until it reaches
// the sea (+ a small margin, never onto another landmass or another polity), then simplifies.
// The map clips polygons to land, so the sea overshoot is invisible and coastal border lines vanish.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const DRY = process.argv.includes('--dry');
const RES = 0.05, W = 7200, H = 3600;           // raster grid (degrees)
const REACH = 1.2, MARGIN = 0.25, STEP = 0.1;   // max push, sea overshoot, densify spacing
const REACH_IR = 2.5;                           // Iranian dynasties are hand-drawn smooth shapes, often 1–2° short of the coast
const TOL = 0.1;                                // simplification tolerance (< MARGIN, so edges stay at sea)
const LAST_SY = 1913;                           // 1914+ are already surveyed to the coast
const ANGLES = [0, 30, -30, 60, -60].map(d => d * Math.PI / 180);

const ctx = { window: {}, console }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/core.js', 'data/world-map.js', 'data/hist-borders.js'])
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const { MAP, HIST } = ctx.TL;

const decode = (arr, sc) => { const o = new Float64Array(arr.length); let x = arr[0], y = arr[1]; o[0] = x / sc; o[1] = y / sc; for (let i = 2; i < arr.length; i += 2) { x += arr[i]; y += arr[i + 1]; o[i] = x / sc; o[i + 1] = y / sc; } return o; };
const encode = (ring, q) => { const o = []; let px = 0, py = 0; for (let i = 0; i < ring.length; i += 2) { const x = Math.round(ring[i] * q), y = Math.round(ring[i + 1] * q); if (i && x === px && y === py) continue; o.push(i ? x - px : x, i ? y - py : y); px = x; py = y; } return o; };
const col = (lon) => Math.floor((lon + 180) / RES), row = (lat) => Math.floor((90 - lat) / RES);
const cell = (lon, lat) => { const c = col(lon), r = row(lat); return c < 0 || c >= W || r < 0 || r >= H ? -1 : r * W + c; };

// Nonzero-winding scanline fill of a ring set (same rule as canvas fill()), calling put(index) per covered cell.
function raster(rings, put) {
  const rowsX = new Map();
  for (const rg of rings) for (let i = 0, n = rg.length; i < n; i += 2) {
    const x0 = rg[i], y0 = rg[i + 1], x1 = rg[(i + 2) % n], y1 = rg[(i + 3) % n];
    if (y0 === y1) continue;
    const r0 = Math.max(0, Math.ceil((90 - Math.max(y0, y1)) / RES - 0.5)), r1 = Math.min(H - 1, Math.floor((90 - Math.min(y0, y1)) / RES - 0.5));
    for (let r = r0; r <= r1; r++) {
      const yc = 90 - (r + 0.5) * RES; if ((y0 > yc) === (y1 > yc)) continue;
      (rowsX.get(r) || rowsX.set(r, []).get(r)).push([x0 + (yc - y0) * (x1 - x0) / (y1 - y0), y1 > y0 ? 1 : -1]);
    }
  }
  for (const [r, xs] of rowsX) {
    xs.sort((a, b) => a[0] - b[0]);
    for (let k = 0, w = 0; k + 1 < xs.length; k++) {
      w += xs[k][1]; if (!w) continue;
      const c0 = Math.max(0, Math.ceil((xs[k][0] + 180) / RES - 0.5)), c1 = Math.min(W - 1, Math.floor((xs[k + 1][0] + 180) / RES - 0.5));
      for (let c = c0; c <= c1; c++) put(r * W + c);
    }
  }
}

const land = new Uint8Array(W * H);
raster(MAP.land.map(r => decode(r, 10)), i => { land[i] = 1; });
raster([...MAP.lakes.map(r => decode(r, 10)), ...(MAP.caspian ? [decode(MAP.caspian, 50)] : [])], i => { land[i] = 0; });
const isLand = (lon, lat) => { const i = cell(lon, lat); return i >= 0 && land[i] === 1; };

const owner = new Int16Array(W * H);
function paintOwners(ents) { owner.fill(0); ents.forEach((e, k) => raster(e.rings, i => { owner[i] = k + 1; })); }

// Uncovered coastal land (within 0.25° of sea and 1° of some polity) — the visible gaps.
function dilate(src, r) {
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) { let run = 0; const b = y * W;
    for (let x = 0; x < W + r; x++) { if (x < W && src[b + x]) run++; if (x - 2 * r - 1 >= 0 && src[b + x - 2 * r - 1]) run--; const t = x - r; if (t >= 0 && t < W && run) tmp[b + t] = 1; } }
  for (let x = 0; x < W; x++) { let run = 0;
    for (let y = 0; y < H + r; y++) { if (y < H && tmp[y * W + x]) run++; if (y - 2 * r - 1 >= 0 && tmp[(y - 2 * r - 1) * W + x]) run--; const t = y - r; if (t >= 0 && t < H && run) out[t * W + x] = 1; } }
  return out;
}
const seaMask = Uint8Array.from(land, v => 1 - v), nearSea = dilate(seaMask, 5);
const coastBand = dilate(seaMask, 15);           // pushes may only cross land within 0.75° of the sea
const coastBandIr = dilate(seaMask, 35);         // (1.75° for Iranian dynasties)
function gapCells() {
  const cov = Uint8Array.from(owner, v => (v ? 1 : 0)), nearCov = dilate(cov, 20);
  let n = 0; for (let i = 0; i < land.length; i++) if (land[i] && !cov[i] && nearSea[i] && nearCov[i]) n++;
  return n;
}

// Push one sample outward; returns travelled distance or 0.
function pushDist(x, y, nx, ny, self, ir) {
  const reach = ir ? REACH_IR : REACH, band = ir ? coastBandIr : coastBand;
  for (let t = RES; t <= reach; t += RES / 2) {
    const px = x + nx * t, py = y + ny * t, i = cell(px, py);
    if (i < 0) return 0;
    if (land[i]) { if (owner[i] === self) continue; if (owner[i] || !band[i]) return 0; continue; }
    let end = t;                                   // reached the sea: overshoot while it stays sea
    for (let u = t; u <= t + MARGIN; u += RES / 2) { if (isLand(x + nx * u, y + ny * u)) break; end = u; }
    return end;
  }
  return 0;
}

// Douglas–Peucker on an open chain, keeping `keep[i]` points.
function simplify(pts, keep) {
  const n = pts.length / 2, mark = new Uint8Array(n); mark[0] = mark[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let best = -1, bd = TOL;
    const ax = pts[a * 2], ay = pts[a * 2 + 1], dx = pts[b * 2] - ax, dy = pts[b * 2 + 1] - ay, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      if (keep[i]) { best = i; break; }
      const d = Math.abs((pts[i * 2] - ax) * dy - (pts[i * 2 + 1] - ay) * dx) / L;
      if (d > bd) { bd = d; best = i; }
    }
    if (best > 0) { mark[best] = 1; stack.push([a, best], [best, b]); }
  }
  const out = []; for (let i = 0; i < n; i++) if (mark[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

// Nonzero winding number of a point against an entity's rings.
function winding(rings, x, y) {
  let w = 0;
  for (const r of rings) for (let i = 0, n = r.length; i < n; i += 2) {
    const x0 = r[i], y0 = r[i + 1], x1 = r[(i + 2) % n], y1 = r[(i + 3) % n];
    if ((y0 <= y) !== (y1 <= y)) { const cx = x0 + (y - y0) * (x1 - x0) / (y1 - y0); if (cx > x) w += y1 > y0 ? 1 : -1; }
  }
  return w;
}

function fitRing(ring, self, allRings, ir) {
  const n = ring.length / 2;
  const pts = [], keep = []; let moved = 0;
  for (let i = 0; i < n; i++) {
    const ax = ring[i * 2], ay = ring[i * 2 + 1], bx = ring[((i + 1) % n) * 2], by = ring[((i + 1) % n) * 2 + 1];
    const L = Math.hypot(bx - ax, by - ay); if (L < 1e-9) continue;
    const ex = (by - ay) / L, ey = -(bx - ax) / L;
    const k = Math.max(1, Math.ceil(L / STEP));
    for (let j = 0; j < k; j++) {
      const f = j / k, x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
      // Outward is whichever side of the edge lies outside the entity (rings may twist locally).
      const o = 0.04, outR = !winding(allRings, x + ex * o, y + ey * o), outL = !winding(allRings, x - ex * o, y - ey * o);
      const s = outR && !outL ? 1 : (outL && !outR ? -1 : 0), nx = s * ex, ny = s * ey;
      let d = 0, ux = nx, uy = ny;
      if (s && isLand(x, y)) for (const a of ANGLES) {     // straight out first, then fan sideways
        const c = Math.cos(a), sn = Math.sin(a);
        ux = nx * c - ny * sn; uy = nx * sn + ny * c;
        if ((d = pushDist(x, y, ux, uy, self, ir))) break;
      }
      if (d) moved++;
      pts.push(x + ux * d, y + uy * d); keep.push(j === 0 && !d ? 1 : 0);
    }
  }
  if (!moved) return null;
  pts.push(pts[0], pts[1]); keep.push(1);
  const out = simplify(pts, keep); out.length -= 2;
  return out;
}

const pointIn = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const yi = r[i + 1], yj = r[j + 1]; if ((yi > y) !== (yj > y) && x < (r[j] - r[i]) * (y - yi) / (yj - yi) + r[i]) c = !c; } return c; };

let before = 0, after = 0, vb = 0, va = 0;
for (const snap of HIST.k) {
  const [sy, items] = snap; if (sy > LAST_SY) continue;
  const q = (HIST.q && HIST.q[sy]) || 10;
  const ents = items.map(row => ({ row, rings: row[7].map(r => decode(r, q)) }));
  paintOwners(ents); const g0 = gapCells();
  const fitted = ents.map((e, k) => e.rings.map((r, ri) => {
    vb += r.length / 2;
    const hole = e.rings.some((o, oi) => oi !== ri && pointIn(r[0], r[1], o));
    return hole ? null : fitRing(r, k + 1, e.rings, !!(e.row[3] & 4));
  }));
  ents.forEach((e, k) => e.rings.forEach((r, ri) => { const f = fitted[k][ri]; if (f) { e.rings[ri] = f; e.row[7][ri] = encode(f, q); } va += e.rings[ri].length / 2; }));
  paintOwners(ents); const g1 = gapCells();
  before += g0; after += g1;
  console.log(`${String(sy).padStart(6)}  gap cells ${String(g0).padStart(6)} -> ${String(g1).padStart(6)}`);
}
console.log(`total gap cells ${before} -> ${after} (${(100 * (1 - after / before)).toFixed(1)}% filled), vertices ${vb} -> ${va}`);

if (!DRY) {
  const file = path.join(root, 'data/hist-borders.js'), src = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, src.slice(0, src.indexOf('TL.HIST=')) + 'TL.HIST=' + JSON.stringify(HIST) + ';\r\n');
  console.log('wrote data/hist-borders.js');
}

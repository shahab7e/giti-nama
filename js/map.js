/* Real Time-Varying Historical World Map engine (window.M).
   - Borderless Natural Earth 50m physical landmass, lakes, and rivers (ZERO modern borders).
   - 50 historically-audited world border snapshots (10,000 BC – 2010 AD) from TL.HIST.
   - Era changes bleed in like ink in water: the old and new maps are both drawn exactly and the new one
     seeps through swirling soft-edged blots, so only the territory that actually changes moves.
   - Smooth quadratic midpoint spline borders with soft layered editorial strokes.
   - Exact geographic coordinates for all ~255 historical figures (birthplaces) & 474 battles/events. */
(function () {
  const M = {}; window.M = M;
  const UI = '"Vazirmatn", Tahoma, "Segoe UI", sans-serif';
  const DISPLAY = '"Gulzar", "Vazirmatn", serif';
  let cv, ctx, paperPatLight = null, paperPatDark = null;

  const MS = M.S = {
    W: 0, H: 0, dpr: 1,
    lon: 50, lat: 33, zoom: 1.45,
    tLon: 50, tLat: 33, tZoom: 1.45,
    year: -480, tYear: -480,
    snapYear: -500,
    blend: null, // { f, t, hitsA, hitsB } while two eras are blended
    layers: { routes: true, campaigns: true, rivers: true, domArcs: true, events: true, people: true, labels: true },
    hover: null,
    polyHits: [],
    pinHits: [],
    t: 0,
    dark: true
  };

  const THEME = {
    dark: {
      ocean1: '#101621', ocean2: '#080c13',
      landEmpty: '#1b1e26', landStroke: 'rgba(222,204,170,.28)',
      ripple1: 'rgba(136,168,204,.07)', ripple2: 'rgba(156,184,216,.13)',
      river: 'rgba(126,164,204,.26)', grat: 'rgba(216,180,108,.055)', tropic: 'rgba(216,180,108,.11)',
      seaInk: 'rgba(166,186,208,.36)', frame: 'rgba(216,180,108,.20)', vig: 'rgba(4,6,10,.36)',
      ink: '#f3efe6', sub: 'rgba(214,208,196,.74)', accent: '#5a8dee', gold: '#d8b46c',
      fillAlpha: 0.44, iranAlpha: 0.62, borderAlpha: 0.56, dimAlpha: 0.16
    },
    light: {
      ocean1: '#e0dac7', ocean2: '#cdc4ab',
      landEmpty: '#f2ead6', landStroke: 'rgba(58,42,26,.46)',
      ripple1: 'rgba(72,58,40,.08)', ripple2: 'rgba(68,54,36,.15)',
      river: 'rgba(68,98,120,.42)', grat: 'rgba(92,70,44,.11)', tropic: 'rgba(130,86,44,.20)',
      seaInk: 'rgba(66,56,42,.44)', frame: 'rgba(74,54,32,.32)', vig: 'rgba(94,72,42,.20)',
      ink: '#221a12', sub: 'rgba(66,52,38,.78)', accent: '#1d4496', gold: '#9e4228',
      fillAlpha: 0.46, iranAlpha: 0.58, borderAlpha: 0.56, dimAlpha: 0.16
    }
  };

  const SNAP_CUTS = [
    [-7000, -10000], [-4500, -5000], [-3500, -4000], [-2400, -3000], [-1700, -2000],
    [-1200, -1500], [-745, -1000], [-612, -700], [-550, -600], [-404, -500],
    [-330, -400], [-312, -323], [-238, -300], [-141, -200], [-44, -100],
    [50, -1], [150, 100], [224, 200], [360, 300], [460, 400],
    [560, 500], [651, 600], [750, 700], [861, 800], [945, 900],
    [1040, 1000], [1157, 1100], [1220, 1200], [1295, 1279], [1370, 1300],
    [1468, 1400], [1501, 1500], [1590, 1530], [1603, 1600], [1644, 1615],
    [1700, 1650], [1736, 1715], [1750, 1740], [1796, 1783], [1813, 1800],
    [1857, 1815], [1895, 1880], [1910, 1900], [1919, 1914], [1925, 1920],
    [1945, 1938], [1952, 1945], [1991, 1960], [2005, 1994], [9999, 2010]
  ];

  // Restrained Swiss-editorial muted hues (distinct yet harmonious)
  const SWISS_HUES = [214, 34, 158, 350, 22, 248, 184, 42, 140, 332, 198, 14];
  const INK_DS = 2;         // owner ids + ink mask at 1/2 resolution (upscaling softens the wet edge)
  const INK_SOFT = 0.12;    // width of the wet ink edge, in flood-distance units
  const INK_ANIM = 1.1;     // seconds for one transfer of land to flood over once time passes its date

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smooth01 = (t) => t * t * (3 - 2 * t);

  // Seamless 256x256 procedural antique rag-paper texture (laid fibers + organic mottling + mineral flecks)
  function makePaperPattern(dark) {
    const sz = 256;
    const g = document.createElement('canvas'); g.width = sz; g.height = sz;
    const gx = g.getContext('2d');
    const img = gx.createImageData(sz, sz);
    let seed = dark ? 1337 : 4242;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

    for (let y = 0; y < sz; y++) {
      // Authentic handmade laid-paper horizontal rib cadence
      const rib = Math.sin((y / 3.0) * Math.PI * 2) * (dark ? 2.2 : 3.2);
      for (let x = 0; x < sz; x++) {
        const i = (y * sz + x) * 4;
        // Subtle vertical chain-line every 32px + low-frequency cloud mottling
        const chain = (x % 32 === 0) ? (dark ? 3 : -4) : 0;
        const mottle = (Math.sin(x * 0.049 + y * 0.024) + Math.cos(y * 0.049 - x * 0.024)) * (dark ? 3.5 : 5.5);
        const grain = (rnd() - 0.5) * (dark ? 18 : 22);
        const speck = rnd() > 0.9965 ? (dark ? 18 : -28) : 0;
        const delta = rib + chain + mottle + grain + speck;
        if (dark) {
          img.data[i] = clamp(128 + delta + 4, 0, 255);
          img.data[i + 1] = clamp(126 + delta + 1, 0, 255);
          img.data[i + 2] = clamp(120 + delta - 4, 0, 255);
          img.data[i + 3] = 24;
        } else {
          // Warm cotton-rag vellum tone for multiply blending
          img.data[i] = clamp(246 + delta * 0.65, 200, 255);
          img.data[i + 1] = clamp(240 + delta * 0.68, 192, 252);
          img.data[i + 2] = clamp(226 + delta * 0.72, 174, 244);
          img.data[i + 3] = 155;
        }
      }
    }
    gx.putImageData(img, 0, 0);
    // Faint organic paper fibers
    gx.strokeStyle = dark ? 'rgba(218,200,168,.03)' : 'rgba(118,90,54,.045)';
    gx.lineWidth = 0.7;
    for (let k = 0; k < 48; k++) {
      const fx = rnd() * sz, fy = rnd() * sz, fl = 6 + rnd() * 14, fa = rnd() * Math.PI * 2;
      gx.beginPath(); gx.moveTo(fx, fy); gx.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl); gx.stroke();
    }
    return ctx.createPattern(g, 'repeat');
  }

  // Minimalist antique 8-point engraved compass rose in open bottom-right corner
  function drawCompassRose(cx, cy, r, T, dark) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = dark ? 0.42 : 0.56;
    const ink = dark ? '#d8b46c' : '#4a3620';
    const inkSoft = dark ? 'rgba(216,180,108,.45)' : 'rgba(74,54,32,.42)';
    // Outer engraved double circle
    ctx.strokeStyle = inkSoft; ctx.lineWidth = 0.75;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r - 2.6, 0, Math.PI * 2); ctx.stroke();
    // Minor intercardinal points
    for (let k = 0; k < 4; k++) {
      ctx.save(); ctx.rotate((k * Math.PI) / 2 + Math.PI / 4);
      ctx.beginPath(); ctx.moveTo(0, -r * 0.62); ctx.lineTo(2.4, 0); ctx.lineTo(0, 0); ctx.closePath();
      ctx.fillStyle = inkSoft; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -r * 0.62); ctx.lineTo(-2.4, 0); ctx.lineTo(0, 0); ctx.closePath();
      ctx.strokeStyle = inkSoft; ctx.lineWidth = 0.5; ctx.stroke();
      ctx.restore();
    }
    // Major cardinal points (half-shaded antique engraving)
    for (let k = 0; k < 4; k++) {
      ctx.save(); ctx.rotate((k * Math.PI) / 2);
      const len = k === 0 ? r * 0.96 : r * 0.82;
      ctx.beginPath(); ctx.moveTo(0, -len); ctx.lineTo(3.4, 0); ctx.lineTo(0, 0); ctx.closePath();
      ctx.fillStyle = ink; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -len); ctx.lineTo(-3.4, 0); ctx.lineTo(0, 0); ctx.closePath();
      ctx.fillStyle = dark ? '#0e131d' : '#f2ead6'; ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 0.65; ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fillStyle = ink; ctx.fill();
    ctx.font = `700 8.5px ${UI}`; ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('ش', 0, -r - 3);
    ctx.restore();
  }

  // Historical cartographic border precision:
  //   Pre-1815: organic frontier zones (1.0 quadratic spline + watercolor wash)
  //   1815–1913: treaty-demarcated imperial borders (0.32 subtly eased corners)
  //   1914–Present: exact surveyed modern international borders (0.0 crisp straight segments!)
  const borderSmooth = (sy) => (sy >= 1914 ? 0 : (sy >= 1815 ? 0.32 : 1));

  function decodeDeltaRing(arr, scale = 10) {
    const n = arr.length, out = new Float32Array(n);
    let x = arr[0], y = arr[1];
    out[0] = x / scale; out[1] = y / scale;
    for (let i = 2; i < n; i += 2) {
      x += arr[i]; y += arr[i + 1];
      out[i] = x / scale; out[i + 1] = y / scale;
    }
    return out;
  }

  let landDecoded = null, lakesDecoded = null, caspianDecoded = null;
  const snapByYear = new Map();
  const decodedSnaps = new Map();

  function ensureBaseDecoded() {
    if (!TL.MAP) return;
    if (!landDecoded) landDecoded = TL.MAP.land.map(r => decodeDeltaRing(r, 10));
    if (!lakesDecoded) lakesDecoded = TL.MAP.lakes.map(r => decodeDeltaRing(r, 10));
    if (!caspianDecoded && TL.MAP.caspian) caspianDecoded = decodeDeltaRing(TL.MAP.caspian, 50);
    if (TL.HIST && !snapByYear.size) {
      TL.HIST.k.forEach(([sy, items]) => snapByYear.set(sy, items));
    }
  }


  function loadSnapshot(sy) {
    ensureBaseDecoded();
    if (decodedSnaps.has(sy)) return decodedSnaps.get(sy);
    const raw = snapByYear.get(sy) || [];
    const S_STR = TL.HIST.s;
    const q = (TL.HIST.q && TL.HIST.q[sy]) || 10;
    const list = raw.map(row => {
      const [faI, enI, pidI, flags, cx10, cy10, area10, rings] = row;
      const fa = S_STR[faI] || '';
      const en = enI >= 0 ? S_STR[enI] : fa;
      const pid = pidI >= 0 ? S_STR[pidI] : '';
      return {
        fa, en, pid, isIr: !!(flags & 4), prec: flags & 3, uid: sy + ':' + faI + ':' + cx10 + ':' + cy10,
        cx: cx10 / 10, cy: cy10 / 10, area: area10 / 10,
        rings: rings.map(r => decodeDeltaRing(r, q))
      };
    });
    // Draw broadest/background polities first, smaller specific states & enclaves later, and Iran ALWAYS on top!
    list.sort((a, b) => (a.isIr ? 1 : 0) - (b.isIr ? 1 : 0) || b.area - a.area);
    decodedSnaps.set(sy, list);
    return list;
  }


  // ---------- LIVE ERA BLENDING ----------
  // The year drives the borders. Between two snapshots (years a < b) every transfer of land, i.e. one
  // (new owner, old owner) pair such as Byzantium → Ottomans, is a single event with its own date: the real one when
  // the data has it (the loser's fall or the winner's founding inside the interval), otherwise staggered around the
  // hand-tuned SNAP_CUTS year. A paused map is therefore always definite: each transfer has happened or not, drawn
  // pixel-exact from both eras. Only while time crosses an event does its land flood over like ink in water, from the
  // winner's side (a new state spreads from its core; land that falls to nobody dissolves from its edges).
  const GRID = 0.5, GW = 720, GH = 360;
  const SNAP_YEARS = [...new Set(SNAP_CUTS.map(c => c[1]))].sort((a, b) => a - b);

  function eraAt(y) {
    const Y = SNAP_YEARS;
    if (y <= Y[0]) return { a: Y[0], b: Y[0], t: 0 };
    for (let i = 0; i < Y.length - 1; i++) if (y < Y[i + 1]) return { a: Y[i], b: Y[i + 1], t: (y - Y[i]) / (Y[i + 1] - Y[i]) };
    const L = Y[Y.length - 1];
    return { a: L, b: L, t: 0 };
  }
  M.eraAt = eraAt;

  // Domain-warped value noise on the geo grid: makes flood fronts swirl like ink instead of growing as polygons
  let geoNoise = null;
  function noiseGrid() {
    if (geoNoise) return geoNoise;
    let s = 7919;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const lat = new Float32Array(4096);
    for (let i = 0; i < 4096; i++) lat[i] = rnd();
    const vn = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi;
      const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
      const i0 = (yi & 63) * 64, i1 = ((yi + 1) & 63) * 64, x0 = xi & 63, x1 = (xi + 1) & 63;
      const a = lat[i0 + x0], b = lat[i0 + x1], c = lat[i1 + x0], d = lat[i1 + x1];
      return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
    };
    const fbm = (x, y) => vn(x, y) * 0.55 + vn(x * 2.1 + 5.2, y * 2.1 + 1.3) * 0.28 + vn(x * 4.3 + 9.1, y * 4.3 + 7.7) * 0.17;
    geoNoise = new Float32Array(GW * GH);
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        const x = gx / 14, y = gy / 14;
        const wx = fbm(x + 3.7, y + 1.9) * 2.4, wy = fbm(x + 8.3, y + 2.8) * 2.4;
        geoNoise[gy * GW + gx] = fbm(x + wx, y + wy) - 0.5;
      }
    }
    return geoNoise;
  }

  // Which polity of snapshot sy owns each 0.5° cell (nonzero winding like ctx.fill; later entries win like the carve-out)
  const ownerCache = new Map();
  function ownerGrid(sy) {
    if (ownerCache.has(sy)) return ownerCache.get(sy);
    const snap = loadSnapshot(sy), own = new Int16Array(GW * GH).fill(-1), cr = [];
    snap.forEach((ent, idx) => {
      let minY = 90, maxY = -90;
      for (const r of ent.rings) for (let i = 1; i < r.length; i += 2) { if (r[i] < minY) minY = r[i]; if (r[i] > maxY) maxY = r[i]; }
      const gy0 = Math.max(0, Math.floor((90 - maxY) / GRID)), gy1 = Math.min(GH - 1, Math.floor((90 - minY) / GRID));
      for (let gy = gy0; gy <= gy1; gy++) {
        const L = 90 - (gy + 0.5) * GRID;
        cr.length = 0;
        for (const r of ent.rings) {
          const n = r.length;
          for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
            const y1 = r[j + 1], y2 = r[i + 1];
            if ((y1 <= L) !== (y2 <= L)) cr.push([r[j] + (L - y1) * (r[i] - r[j]) / (y2 - y1), y2 > y1 ? 1 : -1]);
          }
        }
        cr.sort((p, q) => p[0] - q[0]);
        let w = 0;
        for (let k = 0; k < cr.length - 1; k++) {
          w += cr[k][1];
          if (!w) continue;
          const gx0 = Math.max(0, Math.ceil((cr[k][0] + 180) / GRID - 0.5));
          const gx1 = Math.min(GW - 1, Math.floor((cr[k + 1][0] + 180) / GRID - 0.5));
          for (let gx = gx0; gx <= gx1; gx++) own[gy * GW + gx] = idx;
        }
      }
    });
    if (ownerCache.size > 6) ownerCache.delete(ownerCache.keys().next().value);
    ownerCache.set(sy, own);
    return own;
  }

  const nameKey = (e) => e.en || e.fa;
  const fieldCache = new Map();
  let polByName = null;
  function eraField(a, b) {
    const key = a + '|' + b;
    if (fieldCache.has(key)) return fieldCache.get(key);
    const A = loadSnapshot(a), B = loadSnapshot(b), oA = ownerGrid(a), oB = ownerGrid(b), nz = noiseGrid();
    const N = GW * GH, NA = A.length, NB = B.length, W1 = NA + 1, K = 2048;
    const pidCnt = (list) => { const c = {}; list.forEach(e => { if (e.pid) c[e.pid] = (c[e.pid] || 0) + 1; }); return c; };
    const cA = pidCnt(A), cB = pidCnt(B);

    // 1. Identity: which a-polity does each b-polity continue? (name, then a unique pid, then >=40% of its land)
    const cellsA = new Int32Array(NA), cellsB = new Int32Array(NB), ov = new Map();
    for (let x = 0; x < N; x++) {
      const j = oB[x], i = oA[x];
      if (i >= 0) cellsA[i]++;
      if (j < 0) continue;
      cellsB[j]++;
      if (i >= 0) ov.set(j * K + i, (ov.get(j * K + i) || 0) + 1);
    }
    const match = new Int32Array(NB).fill(-1);
    B.forEach((eb, j) => {
      let best = -1, bs = -1;
      A.forEach((ea, i) => {
        if (nameKey(ea) !== nameKey(eb) && ea.fa !== eb.fa) return;
        const sc = (ov.get(j * K + i) || 0) + 1;
        if (sc > bs) { bs = sc; best = i; }
      });
      if (best < 0 && eb.pid && cB[eb.pid] === 1 && cA[eb.pid] === 1) best = A.findIndex(ea => ea.pid === eb.pid);
      if (best < 0 && cellsB[j]) {
        A.forEach((ea, i) => { const sc = ov.get(j * K + i) || 0; if (sc > bs) { bs = sc; best = i; } });
        if (bs < cellsB[j] * 0.4) best = -1;
      }
      match[j] = best;
    });

    // 2. Transfer events, one per (new owner j, old owner i) whose land looks different, each with its date
    const span = b - a, modern = a >= 1914;
    const cut = SNAP_CUTS.find(c => c[1] === a), cutF = cut ? clamp((cut[0] - a) / span, 0, 1) : 0.5;
    const frac = (yr) => (yr > a && yr < b ? (yr - a) / span : null);
    // The timeline polity behind a map entity: its own unique pid, else a unique same-named polity alive in this interval
    if (!polByName) {
      polByName = new Map();
      TL.polities.forEach(p => [p.n, p.en].forEach(n => { if (n) (polByName.get(n) || polByName.set(n, []).get(n)).push(p); }));
    }
    const polOf = (e, cnt) => {
      if (e.pid && cnt[e.pid] === 1) return TL.polityById[e.pid];
      const c = [...new Set([...(polByName.get(e.fa) || []), ...(polByName.get(e.en) || [])])].filter(p => p.s <= b + 30 && p.e >= a - 30);
      return c.length === 1 ? c[0] : null;
    };
    // Where a state starts from: its first listed capital, else its centroid
    const cities = TL.MAP.cities || {};
    const originOf = (p, e) => {
      if (p && p.cap) for (const part of p.cap.split(/[،,]/)) for (const k in cities) if (part.includes(k)) return cities[k];
      return [e.cx, e.cy];
    };
    const f = {
      a, b, A, B, NA, oA, oB, match, cellsA, cellsB,
      pair: new Int32Array((NB + 1) * W1).fill(-3), // -3 not seen yet, -1 looks the same in both eras, else event id
      gB: [], gA: [], gTau: [], gCells: [], prog: [], evB: Array.from({ length: NB }, () => []), evA: Array.from({ length: NA }, () => []),
      dn: new Float32Array(N), clock: null
    };
    f.pair[0] = -1; // nobody's land stays nobody's
    B.forEach((eb, j) => { const i = match[j]; if (i >= 0 && nameKey(A[i]) === nameKey(eb)) f.pair[(j + 1) * W1 + i + 1] = -1; });
    // Date of the transfer j <- i as a fraction of the interval. rank (0..1) orders a founding state's transfers by
    // distance from its first capital, so it spreads outward from where it began.
    const tauOf = (j, i, rank) => {
      const q = i >= 0 ? polOf(A[i], cA) : null, fe = q ? frac(q.e) : null;
      const p = j >= 0 ? polOf(B[j], cB) : null, fs = p ? frac(p.s) : null;
      const h = (TL.hash((j >= 0 ? nameKey(B[j]) : '-') + '>' + (i >= 0 ? nameKey(A[i]) : '-')) % 1000) / 1000;
      const r = rank == null ? h : rank;
      let tau;
      if (fs != null && fe != null) {                         // e.g. Seljuks (1037) take Buyid land before the Buyids fall (1062)
        const lo = Math.min(fs, fe), hi = Math.max(fs, fe);
        tau = lo + (hi - lo) * (0.03 + 0.9 * r);
      } else if (fs != null) tau = fs + Math.min(0.3, 0.98 - fs) * r;  // a new state spreads from its founding
      else if (fe != null) tau = fe - Math.min(0.2, fe) * h;          // the old owner's land is gone by its fall
      else tau = cutF + (h - 0.5) * (modern ? 0.06 : 0.5);           // undated: around the tuned cut year, staggered
      return clamp(tau, 0.01, 0.99);
    };
    f.event = (j, i) => {
      const g = f.gTau.length;
      f.gB.push(j); f.gA.push(i); f.gTau.push(tauOf(j, i, null)); f.gCells.push(0); f.prog.push(-1);
      if (j >= 0) f.evB[j].push(g);
      if (i >= 0) f.evA[i].push(g);
      f.pair[(j + 1) * W1 + i + 1] = g;
      return g;
    };
    const grp = new Int32Array(N).fill(-1);
    for (let x = 0; x < N; x++) {
      let g = f.pair[(oB[x] + 1) * W1 + oA[x] + 1];
      if (g === -1) continue;
      if (g === -3) g = f.event(oB[x], oA[x]);
      grp[x] = g; f.gCells[g]++;
    }
    // Re-date each founding state's transfers in order of distance from its first capital
    {
      const csx = new Float64Array(f.gTau.length), csy = new Float64Array(f.gTau.length);
      for (let x = 0; x < N; x++) { const g = grp[x]; if (g >= 0) { csx[g] += -180 + (x % GW + 0.5) * GRID; csy[g] += 90 - (((x / GW) | 0) + 0.5) * GRID; } }
      f.evB.forEach((ev, j) => {
        if (!ev.length) return;
        const o = originOf(polOf(B[j], cB), B[j]);
        const dist = (g) => (f.gCells[g] ? Math.hypot(csx[g] / f.gCells[g] - o[0], csy[g] / f.gCells[g] - o[1]) : 1e9);
        const order = [...ev].sort((p, q) => dist(p) - dist(q));
        order.forEach((g, k) => { f.gTau[g] = tauOf(j, f.gA[g], order.length > 1 ? k / (order.length - 1) : 0); });
      });
    }

    // 3. Shape of each flood: chamfer distance (2/3, wraps the date line) from where it starts, inside its own land
    const G = f.gTau.length, INF = 1 << 30, d = new Int32Array(N).fill(INF), buckets = [];
    const push = (x, dv) => { d[x] = dv; (buckets[dv] || (buckets[dv] = [])).push(x); };
    const NBR = [[1, 0, 2], [-1, 0, 2], [0, 1, 2], [0, -1, 2], [1, 1, 3], [1, -1, 3], [-1, 1, 3], [-1, -1, 3]];
    const seeded = new Uint8Array(G), sx = new Float64Array(G), sy = new Float64Array(G);
    for (let x = 0; x < N; x++) {
      const g = grp[x];
      if (g < 0) continue;
      const gx = x % GW, gy = (x / GW) | 0, j = f.gB[g];
      sx[g] += gx; sy[g] += gy;
      for (const [dx, dy] of NBR) {
        const ny = gy + dy;
        if (ny < 0 || ny >= GH) continue;
        const n = ny * GW + (gx + dx + GW) % GW;
        // from the winner's other land (a conquest front), or from the edges for land that falls to nobody
        if (grp[n] !== g && (j < 0 || oB[n] === j)) { push(x, 0); seeded[g] = 1; break; }
      }
    }
    const core = new Int32Array(G).fill(-1), coreD = new Float64Array(G).fill(Infinity);
    for (let x = 0; x < N; x++) {
      const g = grp[x];
      if (g < 0 || seeded[g]) continue;
      const dd = (x % GW - sx[g] / f.gCells[g]) ** 2 + (((x / GW) | 0) - sy[g] / f.gCells[g]) ** 2;
      if (dd < coreD[g]) { coreD[g] = dd; core[g] = x; }
    }
    for (let g = 0; g < G; g++) if (core[g] >= 0) push(core[g], 0); // a brand-new state grows from its core
    for (let dv = 0; dv < buckets.length; dv++) {
      const bk = buckets[dv];
      if (!bk) continue;
      for (let k = 0; k < bk.length; k++) {
        const x = bk[k];
        if (d[x] !== dv) continue;
        const gx = x % GW, gy = (x / GW) | 0, g = grp[x];
        for (const [dx, dy, c] of NBR) {
          const ny = gy + dy;
          if (ny < 0 || ny >= GH) continue;
          const n = ny * GW + (gx + dx + GW) % GW;
          if (grp[n] === g && d[n] > dv + c) push(n, dv + c);
        }
      }
      buckets[dv] = null;
    }
    const maxD = new Int32Array(G);
    for (let x = 0; x < N; x++) { const g = grp[x]; if (g >= 0 && d[x] < INF && d[x] > maxD[g]) maxD[g] = d[x]; }
    for (let x = 0; x < N; x++) {
      const g = grp[x];
      if (g < 0) continue;
      f.dn[x] = clamp((d[x] < INF && maxD[g] ? d[x] / maxD[g] : 0.5) + nz[x] * 0.45, 0, 1);
    }
    if (fieldCache.size > 4) fieldCache.delete(fieldCache.keys().next().value);
    fieldCache.set(key, f);
    return f;
  }

  // Advance every event toward its state at year-fraction t (done once t passes its date); a running event floods over
  // INK_ANIM seconds. Returns whether any is mid-flood plus a signature of which are done (to reuse a settled frame).
  function inkStep(f, t) {
    const dt = f.clock == null ? Infinity : MS.t - f.clock;
    f.clock = MS.t;
    let moving = false, sig = 0, any = false, all = true;
    for (let g = 0; g < f.prog.length; g++) {
      const target = t >= f.gTau[g] ? 1 : 0;
      let p = f.prog[g];
      if (p < 0 || dt > 0.5) p = target; // first sight, or the map was not being drawn: no replay
      else if (p < target) p = Math.min(1, p + dt / INK_ANIM);
      else if (p > target) p = Math.max(0, p - dt / INK_ANIM);
      f.prog[g] = p;
      if (p > 0 && p < 1) moving = true;
      if (p > 0) any = true;
      if (p < 1) all = false;
      if (p === 1) sig = (sig * 31 + g + 1) | 0;
    }
    return { moving, sig, any, all };
  }

  // Share of an entity's land currently drawn from its own era (for labels)
  function shareB(f, j) {
    const ev = f.evB[j];
    if (!f.cellsB[j]) return ev.length ? Math.max(0, ...ev.map(g => f.prog[g])) : 1;
    let s = f.cellsB[j];
    for (const g of ev) s -= f.gCells[g] * (1 - Math.max(0, f.prog[g]));
    return s / f.cellsB[j];
  }
  function shareA(f, i) {
    const ev = f.evA[i];
    if (!f.cellsA[i]) return ev.length ? 1 - Math.max(0, ...ev.map(g => f.prog[g])) : 1;
    let s = f.cellsA[i];
    for (const g of ev) s -= f.gCells[g] * Math.max(0, f.prog[g]);
    return s / f.cellsA[i];
  }

  // Pixel-exact owner ids of an era for the current view (same paths, fill order and smoothing as its border layer)
  // at 1/INK_DS resolution; anti-aliased edge pixels fail the checksum and fall back to the 0.5° grid.
  // Cached by view geometry only, so hovering never repaints them.
  const idCache = new Map();
  let idCv = null, idG = null;
  function idsFor(sy, geoKey) {
    const key = geoKey + '|' + sy;
    if (idCache.has(key)) return idCache.get(key);
    const w = Math.ceil(MS.W / INK_DS), h = Math.ceil(MS.H / INK_DS), snap = loadSnapshot(sy), smooth = borderSmooth(sy);
    if (!idCv) { idCv = document.createElement('canvas'); idG = idCv.getContext('2d', { willReadFrequently: true }); }
    if (idCv.width !== w || idCv.height !== h) { idCv.width = w; idCv.height = h; }
    const g = idG;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.setTransform(1 / INK_DS, 0, 0, 1 / INK_DS, 0, 0);
    snap.forEach((ent, idx) => {
      const v = idx + 1, r = v & 255, gr = v >> 8;
      g.beginPath();
      for (const ring of ent.rings) traceEraRing(g, ring, M.proj, smooth, false);
      g.fillStyle = `rgb(${r},${gr},${(r * 89 + gr * 31 + 7) & 255})`;
      g.fill();
    });
    const px = g.getImageData(0, 0, w, h).data, ids = new Int16Array(w * h);
    for (let k = 0; k < w * h; k++) {
      const r = px[k * 4], gr = px[k * 4 + 1], bl = px[k * 4 + 2], al = px[k * 4 + 3];
      ids[k] = al === 0 ? -1 : (al === 255 && bl === ((r * 89 + gr * 31 + 7) & 255) && (r || gr) ? r + (gr << 8) - 1 : -2);
    }
    const out = { ids, w, h };
    if (idCache.size > 3) idCache.delete(idCache.keys().next().value);
    idCache.set(key, out);
    return out;
  }

  // Ink mask (1 = draw the b-era) and rim mask for the current view, per pixel of the id buffers
  let maskCv = null, maskG = null, rimCv = null, rimG = null, maskImg = null, rimImg = null;
  function buildMasks(f, IA, IB, t) {
    const mw = IA.w, mh = IA.h;
    if (!maskCv) {
      maskCv = document.createElement('canvas'); maskG = maskCv.getContext('2d');
      rimCv = document.createElement('canvas'); rimG = rimCv.getContext('2d');
    }
    if (maskCv.width !== mw || maskCv.height !== mh) {
      maskCv.width = rimCv.width = mw; maskCv.height = rimCv.height = mh;
      maskImg = maskG.createImageData(mw, mh); rimImg = rimG.createImageData(mw, mh);
    }
    const md = maskImg.data, rd = rimImg.data, iA = IA.ids, iB = IB.ids, pair = f.pair, W1 = f.NA + 1, nz = noiseGrid();
    const sc = M.scale(), lon0 = MS.lon - MS.W * 0.5 / sc, lat0 = MS.lat + MS.H * 0.52 / (sc * 1.22);
    for (let py = 0; py < mh; py++) {
      const lat = lat0 - (py * INK_DS + INK_DS / 2) / (sc * 1.22);
      const fy = clamp((90 - lat) / GRID - 0.5, 0, GH - 1.001), y0 = fy | 0, ty = fy - y0;
      const r0 = y0 * GW, r1 = Math.min(GH - 1, y0 + 1) * GW, rn = Math.round(fy) * GW, fr = (((fy * 5) | 0) % GH) * GW;
      for (let px = 0; px < mw; px++) {
        const k = py * mw + px;
        let ia = iA[k], ib = iB[k];
        let fx = (lon0 + (px * INK_DS + INK_DS / 2) / sc + 180) / GRID - 0.5;
        fx = ((fx % GW) + GW) % GW;
        if (ia === -2 || ib === -2) { // anti-aliased edge: take the owner from the 0.5° grid
          const c = rn + (Math.round(fx) % GW);
          if (ia === -2) ia = f.oA[c];
          if (ib === -2) ib = f.oB[c];
        }
        let g = pair[(ib + 1) * W1 + ia + 1];
        if (g === -3) { g = f.event(ib, ia); f.prog[g] = t >= f.gTau[g] ? 1 : 0; } // too small for the grid
        let m = 0;
        if (g >= 0) {
          const p = f.prog[g];
          if (p >= 1) m = 1;
          else if (p > 0) {
            const x0 = fx | 0, tx = fx - x0, x1 = (x0 + 1) % GW, dn = f.dn;
            const dv = (dn[r0 + x0] * (1 - tx) + dn[r0 + x1] * tx) * (1 - ty) + (dn[r1 + x0] * (1 - tx) + dn[r1 + x1] * tx) * ty
              + nz[fr + ((fx * 5) | 0) % GW] * 0.06; // fine geo-anchored jitter feathers the wet edge
            m = smooth01(clamp((p * (1 + INK_SOFT) - dv) / INK_SOFT, 0, 1));
          }
        }
        md[k * 4 + 3] = m * 255;
        rd[k * 4 + 3] = 4 * m * (1 - m) * 255;
      }
    }
    maskG.putImageData(maskImg, 0, 0);
    rimG.putImageData(rimImg, 0, 0);
  }

  // Two cached full-res border layers (repainted only when the view, hover, focus, filter or theme changes)
  const layerSlots = [{ cv: null, g: null, key: '', hits: [] }, { cv: null, g: null, key: '', hits: [] }];
  let compCv = null, compG = null, tmpCv = null, tmpG = null, fadeCv = null, fadeG = null, compKey = '';
  const fullCanvas = (o) => {
    if (!o.cv) { o.cv = document.createElement('canvas'); o.g = o.cv.getContext('2d'); }
    if (o.cv.width !== cv.width || o.cv.height !== cv.height) { o.cv.width = cv.width; o.cv.height = cv.height; o.key = ''; }
    return o;
  };

  // Projection
  M.scale = () => (Math.min(MS.W, MS.H * 1.92) / 136) * MS.zoom;
  M.proj = (lon, lat) => {
    const sc = M.scale();
    return [
      MS.W * 0.5 + (lon - MS.lon) * sc,
      MS.H * 0.52 - (lat - MS.lat) * sc * 1.22
    ];
  };
  M.unproj = (x, y) => {
    const sc = M.scale();
    return [
      MS.lon + (x - MS.W * 0.5) / sc,
      MS.lat - (y - MS.H * 0.52) / (sc * 1.22)
    ];
  };

  const polByReg = {};
  M.indexData = function () {
    Object.keys(polByReg).forEach(k => delete polByReg[k]);
    TL.polities.forEach(p => { (polByReg[p.r] = polByReg[p.r] || []).push(p); });
  };
  M.primaryPolity = function (rid, y) {
    const list = polByReg[rid]; if (!list) return null;
    let best = null, score = -1e9;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (y < p.s || y > p.e) continue;
      const isState = p.k === 'culture' ? 0 : 1;
      const area = p.prof ? R.areaAt(p, y) : 0.2;
      const sc = (4 - (p.lv || 2)) * 100 + isState * 40 + Math.min(area, 25) + (p.ir && rid === 'iran' ? 8 : 0);
      if (sc > score) { score = sc; best = p; }
    }
    return best;
  };
  M.activeRulers = (pid, y) => TL.rulers.filter(r => r.pid === pid && y >= r.s && y <= r.e);

  const capCache = new Map();
  function resolveCapital(p) {
    if (!p || !p.cap || !TL.MAP) return null;
    if (capCache.has(p.id)) return capCache.get(p.id);
    const keys = Object.keys(TL.MAP.cities || {});
    let found = null;
    for (const k of keys) {
      if (p.cap.includes(k)) { found = { name: k, pt: TL.MAP.cities[k] }; break; }
    }
    capCache.set(p.id, found);
    return found;
  }

  function pointInFlatPoly(px, py, flat) {
    let inside = false; const n = flat.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const xi = flat[i], yi = flat[i + 1], xj = flat[j], yj = flat[j + 1];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-6) + xi)) inside = !inside;
    }
    return inside;
  }

  function traceCoastRing(ring, proj) {
    const n = ring.length; if (n < 6) return;
    let [sx, sy] = proj(ring[0], ring[1]);
    ctx.moveTo(sx, sy);
    for (let i = 2; i < n; i += 2) { [sx, sy] = proj(ring[i], ring[i + 1]); ctx.lineTo(sx, sy); }
    ctx.closePath();
  }

  // Trace a ring with continuous era-adaptive smoothness:
  //   smooth = 0   -> exact straight vertex-to-vertex polyline (modern surveyed borders, ZERO curving!)
  //   smooth = 1   -> full quadratic midpoint spline (organic pre-modern frontiers)
  //   0 < s < 1    -> straight segments with gently eased corners (19th-c. treaty era)
  function traceScreenPoly(c, sp, smooth) {
    const n = sp.length;
    if (smooth <= 0.01) {
      c.moveTo(sp[0], sp[1]);
      for (let i = 2; i < n; i += 2) c.lineTo(sp[i], sp[i + 1]);
      c.closePath();
      return;
    }
    if (smooth >= 0.99) {
      const lastX = sp[n - 2], lastY = sp[n - 1];
      c.moveTo((lastX + sp[0]) * 0.5, (lastY + sp[1]) * 0.5);
      for (let i = 0; i < n; i += 2) {
        const nx = sp[(i + 2) % n], ny = sp[(i + 3) % n];
        c.quadraticCurveTo(sp[i], sp[i + 1], (sp[i] + nx) * 0.5, (sp[i + 1] + ny) * 0.5);
      }
      c.closePath();
      return;
    }
    const f = smooth * 0.5;
    const x0 = sp[0], y0 = sp[1], px0 = sp[n - 2], py0 = sp[n - 1];
    c.moveTo(x0 + (px0 - x0) * f, y0 + (py0 - y0) * f);
    for (let i = 0; i < n; i += 2) {
      const vx = sp[i], vy = sp[i + 1];
      const px = sp[(i - 2 + n) % n], py = sp[(i - 1 + n) % n];
      const nx = sp[(i + 2) % n], ny = sp[(i + 3) % n];
      if (i > 0) c.lineTo(vx + (px - vx) * f, vy + (py - vy) * f);
      c.quadraticCurveTo(vx, vy, vx + (nx - vx) * f, vy + (ny - vy) * f);
    }
    c.closePath();
  }

  function traceEraRing(c, ring, proj, smooth, collectScreen) {
    const n = ring.length; if (n < 6) return null;
    const sp = new Float32Array(n);
    for (let i = 0; i < n; i += 2) {
      const [sx, sy] = proj(ring[i], ring[i + 1]);
      sp[i] = sx; sp[i + 1] = sy;
    }
    traceScreenPoly(c, sp, smooth);
    return collectScreen ? sp : null;
  }

  function traceOpenPts(pts, proj, isTenths) {
    if (pts.length < (isTenths ? 4 : 2)) return;
    if (isTenths) {
      let [x0, y0] = proj(pts[0] / 10, pts[1] / 10);
      ctx.moveTo(x0, y0);
      for (let i = 2; i < pts.length; i += 2) { const [x, y] = proj(pts[i] / 10, pts[i + 1] / 10); ctx.lineTo(x, y); }
    } else {
      const s = pts.map(p => proj(p[0], p[1]));
      ctx.moveTo(s[0][0], s[0][1]);
      for (let i = 1; i < s.length - 1; i++) ctx.quadraticCurveTo(s[i][0], s[i][1], (s[i][0] + s[i + 1][0]) / 2, (s[i][1] + s[i + 1][1]) / 2);
      ctx.lineTo(s[s.length - 1][0], s[s.length - 1][1]);
    }
  }

  function entColor(ent, dark) {
    if (ent.pid && TL.polityById[ent.pid] && TL.polityById[ent.pid].base) return TL.polityById[ent.pid].base;
    if (ent.isIr) return dark ? '#2f65d4' : '#1d4496';
    const hash = TL.hash(ent.en || ent.fa);
    const h = SWISS_HUES[hash % SWISS_HUES.length];
    const s = 28 + (hash % 12);
    const l = dark ? (39 + ((hash >> 4) % 10)) : (45 + ((hash >> 4) % 10));
    return `hsl(${h} ${s}% ${l}%)`;
  }

  function nearestRegion(lon, lat, excludeIran) {
    const anc = TL.MAP && TL.MAP.anchors; if (!anc) return null;
    let best = null, bd = 1e9;
    for (const rid of Object.keys(anc)) {
      if (excludeIran && rid === 'iran') continue;
      const a = anc[rid], d = Math.hypot(lon - a[0], (lat - a[1]) * 1.2);
      if (d < bd) { bd = d; best = rid; }
    }
    return best;
  }

  // ---------- camera presets ----------
  M.flyTo = function (lon, lat, zoom) {
    MS.tLon = clamp(lon, -145, 155);
    MS.tLat = clamp(lat, -35, 62);
    MS.tZoom = clamp(zoom, 0.22, 4.8);
  };
  M.flyToRegion = function (rid, zoom) {
    const a = TL.MAP && TL.MAP.anchors && TL.MAP.anchors[rid];
    if (!a) return;
    M.flyTo(a[0], a[1], zoom || (rid === 'iran' ? 1.85 : 1.45));
  };
  M.presetIran = () => M.flyTo(51, 33, 1.85);
  M.presetEurasia = () => M.flyTo(54, 34, 1.12);
  M.presetWorld = () => {
    const baseSc = Math.min(MS.W, MS.H * 1.92) / 136;
    const zW = MS.W / (345 * baseSc);
    const zH = MS.H / (132 * baseSc * 1.22);
    M.flyTo(12, 16, Math.max(0.22, Math.min(zW, zH) * 0.94));
  };

  // ---------- draw frame ----------
  M.draw = function () {
    if (!ctx || !TL.MAP || !TL.HIST || MS.W < 20 || MS.H < 20) return;
    ensureBaseDecoded();
    const { W, H } = MS;
    const T = MS.dark ? THEME.dark : THEME.light;
    const y = MS.year;
    const S = R.S;
    const proj = M.proj;
    const mapData = TL.MAP;

    // Live era: the year picks two neighbouring snapshots and how far between them it is
    const era = eraAt(y);

    MS.polyHits = [];
    MS.pinHits = [];

    ctx.setTransform(MS.dpr, 0, 0, MS.dpr, 0, 0);

    // 1. Antique Parchment / Nocturnal Ocean Backdrop
    const bg = ctx.createRadialGradient(W * 0.5, H * 0.48, 30, W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
    bg.addColorStop(0, T.ocean1); bg.addColorStop(1, T.ocean2);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // 2. Engraved Graticule (with subtle dashed Equator & Tropics!)
    ctx.save();
    ctx.strokeStyle = T.grat; ctx.lineWidth = 0.75;
    for (let lon = -180; lon <= 180; lon += 20) {
      const [x] = proj(lon, 0); if (x >= 8 && x <= W - 8) { ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, H - 8); ctx.stroke(); }
    }
    for (let lat = -60; lat <= 75; lat += 15) {
      const [, gy] = proj(0, lat); if (gy >= 8 && gy <= H - 8) { ctx.beginPath(); ctx.moveTo(8, gy); ctx.lineTo(W - 8, gy); ctx.stroke(); }
    }
    ctx.strokeStyle = T.tropic; ctx.setLineDash([4, 5]); ctx.lineWidth = 0.8;
    [0, 23.44, -23.44].forEach(lat => {
      const [, gy] = proj(0, lat); if (gy >= 12 && gy <= H - 12) { ctx.beginPath(); ctx.moveTo(8, gy); ctx.lineTo(W - 8, gy); ctx.stroke(); }
    });
    ctx.setLineDash([]);
    ctx.restore();

    // 3. Engraved Copperplate Coastal Ripples (ocean-side water-lining) + Physical Landmass
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < landDecoded.length; i++) traceCoastRing(landDecoded[i], proj);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = T.ripple1; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = T.ripple2; ctx.lineWidth = 4.2; ctx.stroke();
    ctx.fillStyle = T.landEmpty; ctx.fill();
    ctx.clip();

    // Pre-tint land with subtle rag-paper fiber in Light mode so empires absorb into the paper via multiply!
    if (!MS.dark) {
      if (!paperPatLight) paperPatLight = makePaperPattern(false);
      ctx.save(); ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = paperPatLight; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // 4. HISTORICAL BORDERS — both neighbouring eras drawn exactly, blended live by the year (ink mask)
    const focusItem = S.focus ? S.focus.item : null;
    const focusPol = S.focus && S.focus.type === 'polity' ? focusItem
      : (S.focus && S.focus.type === 'ruler' ? TL.polityById[focusItem.pid] : null);
    const focusEmp = focusPol && (focusPol.dom ? focusPol : TL.overlord(focusPol, y, y));
    const focusIds = new Set();
    if (focusPol) focusIds.add(focusPol.id);
    if (focusEmp) { focusIds.add(focusEmp.id); if (focusEmp.dom) focusEmp.dom.forEach(d => focusIds.add(d.id)); }
    const hasFocus = focusIds.size > 0;

    // Unified region-filter check used identically by borders, labels and capitals!
    const isEntFilteredOut = (ent, effPid, lon, lat) => {
      if (!S.show || ent.isIr) return false;
      const pol = effPid ? TL.polityById[effPid] : null;
      if (pol && pol.r === 'iran') return false;
      const rid = pol ? pol.r : nearestRegion(lon, lat, true);
      return !!(rid && !S.show.has(rid));
    };

    const hoverEnt = MS.hover && MS.hover.type === 'hist' ? MS.hover.ent : null;
    const viewKey = [cv.width, cv.height, MS.lon.toFixed(5), MS.lat.toFixed(5), MS.zoom.toFixed(5), MS.dark,
      hoverEnt ? hoverEnt.uid : '', [...focusIds].join(','), S.show ? [...S.show].join(',') : '*', y >= 1979].join('|');

    // Carve-out painter: ZERO overlapping border seams, ZERO double-tinting, and clean enclaves!
    const paintSnap = (g, sy, hits) => {
      const snap = loadSnapshot(sy), curSmooth = borderSmooth(sy), isModern = curSmooth <= 0.01;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.clearRect(0, 0, g.canvas.width, g.canvas.height);
      g.setTransform(MS.dpr, 0, 0, MS.dpr, 0, 0);
      g.lineJoin = isModern ? 'miter' : 'round';
      g.miterLimit = 2.4;
      g.lineCap = isModern ? 'butt' : 'round';
      for (let idx = 0; idx < snap.length; idx++) {
        const ent = snap[idx];
        let effPid = ent.pid, effFa = ent.fa;
        if (ent.isIr && sy === 1960 && y >= 1979) { effPid = 'iri'; effFa = 'ایران (جمهوری اسلامی)'; }
        const pol = effPid ? TL.polityById[effPid] : null;
        const isFocus = !!(effPid && focusIds.has(effPid));
        const isHover = !!(MS.hover && MS.hover.type === 'hist' && MS.hover.ent === ent);
        const filterDim = isEntFilteredOut(ent, effPid, ent.cx, ent.cy);
        const dimmed = (hasFocus && !isFocus && !isHover) || filterDim;
        const col = entColor({ ...ent, pid: effPid }, MS.dark);

        const screenRings = [];
        g.save();
        g.beginPath();
        for (let r = 0; r < ent.rings.length; r++) {
          const sr = traceEraRing(g, ent.rings[r], proj, curSmooth, true);
          if (sr) screenRings.push(sr);
        }

        // Carve out any lower-priority territory or ghost frontier lines underneath this polygon!
        g.globalCompositeOperation = 'destination-out';
        g.globalAlpha = 1;
        g.fillStyle = '#000'; g.fill();

        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = (ent.isIr ? T.iranAlpha : T.fillAlpha) * (filterDim && !isHover ? 0.06 : (dimmed ? T.dimAlpha : (isFocus || isHover ? 1.28 : 1)));
        g.fillStyle = col; g.fill();

        const bAlpha = T.borderAlpha * (filterDim && !isHover ? 0.08 : (dimmed ? 0.20 : 1));
        if (!dimmed && curSmooth > 0.05) {
          g.globalAlpha = bAlpha * (ent.isIr ? 0.34 : 0.22) * curSmooth;
          g.strokeStyle = ent.isIr ? (MS.dark ? '#d8b46c' : '#1d4496') : col;
          g.lineWidth = ent.isIr ? 4.0 : 2.6;
          g.stroke();
        }
        g.globalAlpha = bAlpha * (isHover ? 1.55 : (isFocus ? 1.4 : (isModern ? 1.05 : 0.85)));
        if (ent.prec === 1 && !isModern && !isFocus && !isHover) g.setLineDash([4, 4]);
        g.strokeStyle = isHover ? (MS.dark ? '#ffffff' : '#111113')
          : (isFocus ? T.gold : (ent.isIr ? (MS.dark ? '#e4c47a' : '#1d4496') : (MS.dark ? (isModern ? 'rgba(255,255,255,.46)' : 'rgba(255,255,255,.36)') : (isModern ? 'rgba(20,20,24,.38)' : 'rgba(20,20,24,.30)'))));
        g.lineWidth = isHover ? 1.9 : (isFocus ? 1.7 : (ent.isIr ? (isModern ? 1.45 : 1.35) : (isModern ? 0.82 : 0.72)));
        if ((isFocus || isHover) && MS.dark) { g.shadowColor = ent.isIr ? '#d8b46c' : col; g.shadowBlur = 12; }
        g.stroke();
        g.setLineDash([]);
        g.restore();

        hits.push({ ent, effPid, effFa, pol, screenRings, sy });
      }
    };
    const layerFor = (sy, avoid) => {
      const key = viewKey + '|' + sy;
      let L = layerSlots.find(o => o.key === key && o.cv && o.cv.width === cv.width && o.cv.height === cv.height);
      if (!L) {
        L = fullCanvas(layerSlots.find(o => o !== avoid));
        L.hits = [];
        paintSnap(L.g, sy, L.hits);
        L.key = key;
      }
      return L;
    };
    const geoKey = [cv.width, cv.height, MS.lon.toFixed(5), MS.lat.toFixed(5), MS.zoom.toFixed(5)].join('|');

    // Prepare the neighbouring intervals' fields while the browser is idle (each takes ~50 ms) so playback never hitches
    if (!MS.prefetching && window.requestIdleCallback) {
      const ys = SNAP_YEARS, k = ys.indexOf(era.a), todo = [[ys[k + 1], ys[k + 2]], [ys[k - 1], ys[k]]]
        .filter(([p, q]) => p != null && q != null && !fieldCache.has(p + '|' + q));
      if (todo.length) { MS.prefetching = true; requestIdleCallback(() => { eraField(todo[0][0], todo[0][1]); MS.prefetching = false; }); }
    }

    // Moving to another interval (or jumping far): cross-fade from the last frame's territory, never a hard cut
    const eraKey = era.a + '|' + era.b;
    if (MS.lastEra && MS.lastEra !== eraKey && MS.lastTop) {
      if (!fadeCv) { fadeCv = document.createElement('canvas'); fadeG = fadeCv.getContext('2d'); }
      if (fadeCv.width !== cv.width || fadeCv.height !== cv.height) { fadeCv.width = cv.width; fadeCv.height = cv.height; }
      fadeG.setTransform(1, 0, 0, 1, 0, 0); fadeG.globalCompositeOperation = 'copy'; fadeG.globalAlpha = 1;
      fadeG.drawImage(MS.lastTop, 0, 0);
      MS.fadeStart = MS.t;
    }
    MS.lastEra = eraKey;

    let topCv;
    const LA = layerFor(era.a, null);
    MS.blend = null;
    MS.polyHits = LA.hits;
    MS.snapYear = era.a; // the era on screen (labels, tooltips)
    topCv = LA.cv;
    if (era.a !== era.b && era.t > 0) {
      const f = eraField(era.a, era.b), st = inkStep(f, era.t);
      MS.blend = { f, t: era.t, hitsA: LA.hits, hitsB: null, md: null, mw: 0 };
      if (st.any) {
        const LB = layerFor(era.b, LA);
        MS.blend.hitsB = LB.hits;
        if (st.all) { topCv = LB.cv; MS.polyHits = LB.hits; MS.snapYear = era.b; MS.blend = null; }
        else {
          if (!compCv) {
            compCv = document.createElement('canvas'); compG = compCv.getContext('2d');
            tmpCv = document.createElement('canvas'); tmpG = tmpCv.getContext('2d');
          }
          for (const c of [compCv, tmpCv]) if (c.width !== cv.width || c.height !== cv.height) { c.width = cv.width; c.height = cv.height; compKey = ''; }
          const key = LA.key + '#' + LB.key + '#' + st.sig;
          if (st.moving || key !== compKey) { // a settled, unchanged frame is reused as is
            buildMasks(f, idsFor(era.a, geoKey), idsFor(era.b, geoKey), era.t);
            const fw = cv.width, fh = cv.height;
            for (const g of [compG, tmpG]) { g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.globalAlpha = 1; }
            // the old era where the ink hasn't reached …
            compG.globalCompositeOperation = 'source-over'; compG.clearRect(0, 0, fw, fh); compG.drawImage(LA.cv, 0, 0);
            compG.globalCompositeOperation = 'destination-out'; compG.drawImage(maskCv, 0, 0, fw, fh);
            // … plus the new era where it has ('lighter' adds premultiplied colour: an exact lerp, so unchanged land never flickers)
            tmpG.globalCompositeOperation = 'source-over'; tmpG.clearRect(0, 0, fw, fh); tmpG.drawImage(LB.cv, 0, 0);
            tmpG.globalCompositeOperation = 'destination-in'; tmpG.drawImage(maskCv, 0, 0, fw, fh);
            compG.globalCompositeOperation = 'lighter'; compG.drawImage(tmpCv, 0, 0);
            if (st.moving) { // a denser ink rim on a flood front that is still moving
              tmpG.globalCompositeOperation = 'source-over'; tmpG.clearRect(0, 0, fw, fh); tmpG.drawImage(LB.cv, 0, 0);
              tmpG.globalCompositeOperation = 'destination-in'; tmpG.drawImage(rimCv, 0, 0, fw, fh);
              compG.globalCompositeOperation = 'source-over'; compG.globalAlpha = 0.55; compG.drawImage(tmpCv, 0, 0);
              compG.globalAlpha = 1;
            }
            compKey = st.moving ? '' : key;
          }
          MS.blend.md = maskImg.data; MS.blend.mw = maskCv.width;
          topCv = compCv;
          MS.snapYear = era.t < 0.5 ? era.a : era.b;
        }
      }
    }
    MS.lastTop = topCv;

    // Cross-fade still running after an interval change
    const fadeE = MS.fadeStart != null ? (MS.t - MS.fadeStart) / 0.6 : 1;
    if (fadeE < 1 && fadeCv) {
      if (!tmpCv) { tmpCv = document.createElement('canvas'); tmpG = tmpCv.getContext('2d'); compCv = document.createElement('canvas'); compG = compCv.getContext('2d'); }
      if (tmpCv.width !== cv.width || tmpCv.height !== cv.height) { tmpCv.width = cv.width; tmpCv.height = cv.height; }
      const e = smooth01(clamp(fadeE, 0, 1));
      tmpG.setTransform(1, 0, 0, 1, 0, 0);
      tmpG.globalCompositeOperation = 'copy'; tmpG.globalAlpha = 1 - e; tmpG.drawImage(fadeCv, 0, 0);
      tmpG.globalCompositeOperation = 'lighter'; tmpG.globalAlpha = e; tmpG.drawImage(topCv, 0, 0);
      tmpG.globalAlpha = 1; tmpG.globalCompositeOperation = 'source-over';
      topCv = tmpCv;
    } else MS.fadeStart = null;

    // Composite the territory layer onto the landmass (multiply on Light parchment!)
    ctx.save();
    if (!MS.dark) ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(topCv, 0, 0, W, H);
    ctx.restore();

    // 5. Real Natural Earth 50m Rivers
    if (MS.layers.rivers && mapData.rivers) {
      ctx.save();
      ctx.strokeStyle = T.river; ctx.lineWidth = clamp(0.8 * Math.sqrt(MS.zoom), 0.65, 1.6); ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < mapData.rivers.length; i++) traceOpenPts(mapData.rivers[i], proj, true);
      ctx.stroke();
      ctx.restore();
    }

    // 6. Real Natural Earth 50m Caspian Sea + Inland Lakes — EXACT SAME OCEAN COLOR & ENGRAVED RIPPLE!
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < lakesDecoded.length; i++) traceCoastRing(lakesDecoded[i], proj);
    if (caspianDecoded) traceCoastRing(caspianDecoded, proj);
    ctx.fillStyle = bg; ctx.fill();
    if (caspianDecoded) {
      ctx.save();
      ctx.beginPath();
      traceCoastRing(caspianDecoded, proj);
      ctx.clip();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = T.ripple1; ctx.lineWidth = 8.5; ctx.stroke();
      ctx.strokeStyle = T.ripple2; ctx.lineWidth = 3.5; ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    for (let i = 0; i < lakesDecoded.length; i++) traceCoastRing(lakesDecoded[i], proj);
    if (caspianDecoded) traceCoastRing(caspianDecoded, proj);
    ctx.strokeStyle = T.landStroke; ctx.lineWidth = 0.78; ctx.stroke();
    ctx.restore();

    ctx.restore(); // END physical landmass clip

    // 7. Outer coastline hairline
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < landDecoded.length; i++) traceCoastRing(landDecoded[i], proj);
    ctx.strokeStyle = T.landStroke; ctx.lineWidth = 0.85; ctx.stroke();
    ctx.restore();

    // 7b. Subtle Antique Persian Sea Labels (دریای خزر، خلیج فارس، دریای سیاه، مدیترانه، ...)
    if (MS.layers.labels && mapData.seas) {
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
      ctx.fillStyle = T.seaInk;
      for (const [sn, slon, slat, minZ] of mapData.seas) {
        if (MS.zoom < minZ) continue;
        const [sx, sy] = proj(slon, slat);
        if (sx < 36 || sx > W - 36 || sy < 44 || sy > H - 46) continue;
        const isOcean = sn.startsWith('اقیانوس');
        const fs = isOcean ? (MS.zoom < 0.6 ? 11.5 : 13) : (MS.zoom >= 1.5 ? 10.5 : 9.2);
        ctx.font = `italic 500 ${fs}px ${DISPLAY}`;
        ctx.fillText(sn, sx, sy);
      }
      ctx.restore();
    }

    // 8. Dominion Arcs
    if (MS.layers.domArcs) {
      TL.regions.forEach(reg => {
        const p = M.primaryPolity(reg.id, y);
        const lord = p ? TL.overlord(p, y, y) : null;
        if (!lord || lord.r === reg.id) return;
        if (S.show && reg.id !== 'iran' && !S.show.has(reg.id) && lord.r !== 'iran' && !S.show.has(lord.r)) return;
        const aFrom = mapData.anchors[lord.r], aTo = mapData.anchors[reg.id];
        if (!aFrom || !aTo) return;
        const isFoc = focusIds.has(lord.id) || focusIds.has(p.id);
        const [x1, y1] = proj(aFrom[0], aFrom[1]), [x2, y2] = proj(aTo[0], aTo[1]);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.22;
        ctx.save();
        ctx.globalAlpha = hasFocus && !isFoc ? 0.07 : (isFoc ? 0.80 : 0.28);
        ctx.strokeStyle = TL.isIranian(lord) ? T.gold : (lord.base || T.gold);
        ctx.lineWidth = isFoc ? 1.8 : 1.0;
        ctx.setLineDash([4, 4]); ctx.lineDashOffset = -MS.t * 14;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      });
    }

    // 9. Trade Routes
    if (MS.layers.routes && mapData.routes) {
      for (const tr of mapData.routes) {
        if (y < tr.s || y > tr.e) continue;
        ctx.save();
        ctx.beginPath(); traceOpenPts(tr.pts, proj, false);
        ctx.strokeStyle = MS.dark ? 'rgba(216,180,108,.44)' : 'rgba(184,74,50,.44)';
        ctx.lineWidth = 1.35; ctx.setLineDash([5, 7]); ctx.lineDashOffset = -MS.t * 18;
        ctx.stroke(); ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // 10. Animated Historical Campaigns
    if (MS.layers.campaigns && mapData.campaigns) {
      for (const cmp of mapData.campaigns) {
        if (y < cmp.s - 8 || y > cmp.e + 12) continue;
        const prog = clamp((y - cmp.s) / ((cmp.e - cmp.s) || 1), 0.15, 1);
        const fade = y < cmp.s ? 1 - (cmp.s - y) / 8 : (y > cmp.e ? 1 - (y - cmp.e) / 12 : 1);
        const pts = cmp.pts.map(p => proj(p[0], p[1]));
        ctx.save();
        ctx.globalAlpha = fade; ctx.strokeStyle = cmp.col; ctx.lineWidth = 2.2;
        if (MS.dark) { ctx.shadowColor = cmp.col; ctx.shadowBlur = 10; }
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        const segCount = pts.length - 1, totalPos = prog * segCount;
        let hx = pts[0][0], hy = pts[0][1], ang = 0;
        for (let i = 0; i < segCount; i++) {
          const sp = clamp(totalPos - i, 0, 1); if (sp <= 0) break;
          const a = pts[i], b = pts[i + 1];
          const px = lerp(a[0], b[0], sp), py = lerp(a[1], b[1], sp);
          ctx.lineTo(px, py); hx = px; hy = py; ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        }
        ctx.stroke();
        const wave = 5 + ((MS.t * 24) % 20);
        ctx.beginPath(); ctx.arc(hx, hy, wave, 0, Math.PI * 2);
        ctx.globalAlpha = fade * (1 - wave / 28); ctx.lineWidth = 1.1; ctx.stroke();
        ctx.globalAlpha = fade;
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
        ctx.fillStyle = cmp.col;
        ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -4); ctx.lineTo(-3, 0); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.shadowBlur = 0;
        ctx.font = `700 10.5px ${UI}`; ctx.fillStyle = cmp.col; ctx.textAlign = 'center';
        if (MS.dark) { ctx.shadowColor = '#000'; ctx.shadowBlur = 6; }
        ctx.fillText('⚔ ' + cmp.n, hx, hy - 12);
        ctx.restore();
      }
    }

    // Shared 2D collision registry
    const placed = [];
    const tryPlace = (x, y, w, h, force) => {
      const box = [x - w / 2 - 5, y - h / 2 - 3, x + w / 2 + 5, y + h / 2 + 3];
      if (!force && placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) return false;
      placed.push(box);
      return true;
    };

    // 11. Empire Labels — follow the live era: a continuing state's label glides from its old centre to its new one
    //     as its own change happens (renamed: old name fades out, new fades in); new states fade in, fallen ones out
    if (MS.layers.labels) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
      const effOf = (ent, sy) => (ent.isIr && sy === 1960 && y >= 1979 ? { effPid: 'iri', effFa: 'ایران (جمهوری اسلامی)' } : { effPid: ent.pid, effFa: ent.fa });
      const item = (ent, sy, extra) => ({ ent, ...effOf(ent, sy), lon: ent.cx, lat: ent.cy, alpha: 1, ...extra });
      let queue;
      if (!MS.blend) queue = loadSnapshot(MS.snapYear).map(e => item(e, MS.snapYear));
      else {
        // Labels follow how much of each state's land is currently drawn from its own era (definite when paused)
        const { f } = MS.blend, used = new Set(), show = (v) => smooth01(clamp((v - 0.3) / 0.4, 0, 1));
        queue = f.B.map((eb, j) => {
          const p = shareB(f, j), i = f.match[j];
          if (i < 0) return item(eb, f.b, { alpha: show(p) });
          used.add(i);
          const ea = f.A[i], renamed = effOf(ea, f.a).effFa !== effOf(eb, f.b).effFa;
          return item(p < 0.5 ? ea : eb, p < 0.5 ? f.a : f.b,
            { lon: lerp(ea.cx, eb.cx, p), lat: lerp(ea.cy, eb.cy, p), alpha: renamed ? clamp(Math.abs(2 * p - 1) * 3, 0, 1) : 1 });
        });
        f.A.forEach((ea, i) => { if (!used.has(i)) queue.push(item(ea, f.a, { alpha: show(shareA(f, i)) })); });
        queue = queue.filter(q => q.alpha > 0.03);
      }
      queue.sort((a, b) => (b.ent.isIr ? 1 : 0) - (a.ent.isIr ? 1 : 0) || b.ent.area - a.ent.area);

      const seenNames = new Set();
      for (const item of queue) {
        const { ent, effPid, effFa, lon, lat, alpha } = item;
        if (!effFa || seenNames.has(effFa)) continue;
        const minArea = MS.zoom < 0.68 ? 42 : (MS.zoom < 1.0 ? 12 : (MS.zoom < 1.8 ? 4 : 0));
        if (ent.area < minArea && !ent.isIr) continue;
        const [lx, ly] = proj(lon, lat);
        if (lx < 24 || lx > W - 24 || ly < 42 || ly > H - 46) continue;
        const isFoc = !!(effPid && focusIds.has(effPid));
        const isHov = !!(MS.hover && MS.hover.type === 'hist' && MS.hover.ent === ent);
        if (isEntFilteredOut(ent, effPid, lon, lat) && !isFoc && !isHov) continue;
        const fs = ent.isIr ? (MS.zoom < 0.68 ? 12 : 14) : (ent.area > 120 ? 11.8 : (ent.area > 30 ? 10.5 : 9.4));
        ctx.font = `${ent.isIr || isFoc ? 800 : 700} ${fs}px ${UI}`;
        const tw = ctx.measureText(effFa).width;
        const ruls = effPid ? M.activeRulers(effPid, y) : [];
        const showRul = MS.zoom >= 0.85 && (ent.isIr || isFoc || MS.zoom >= 1.5) && ruls.length > 0;
        if (!tryPlace(lx, ly + (showRul ? 2 : -2), tw, showRul ? 24 : 15, ent.isIr || isFoc || isHov)) continue;
        seenNames.add(effFa);

        ctx.save();
        ctx.globalAlpha = (hasFocus && !isFoc && !isHov ? 0.28 : 1) * alpha;
        ctx.fillStyle = ent.isIr ? (MS.dark ? '#f5dca0' : '#163578') : T.ink;
        if (MS.dark) { ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 8; }
        else { ctx.shadowColor = 'rgba(255,255,255,.92)'; ctx.shadowBlur = 5; }
        ctx.fillText(effFa, lx, ly - (showRul ? 5 : 0));
        if (showRul) {
          ctx.font = `500 9.5px ${UI}`; ctx.fillStyle = T.gold;
          ctx.fillText(ruls[0].n, lx, ly + 10);
        }
        ctx.restore();
      }
    }

    // 12. Active Historical Capitals
    const drawnCaps = new Set();
    TL.regions.forEach(reg => {
      if (S.show && reg.id !== 'iran' && !S.show.has(reg.id)) return;
      const p = M.primaryPolity(reg.id, y); if (!p) return;
      const cap = resolveCapital(p); if (!cap || drawnCaps.has(cap.name)) return;
      drawnCaps.add(cap.name);
      const [cx, cy] = proj(cap.pt[0], cap.pt[1]);
      if (cx < -20 || cx > W + 20 || cy < 20 || cy > H - 40) return;
      const isIr = reg.id === 'iran';
      if (!isIr && MS.zoom < 0.85 && p.lv > 1) return;
      ctx.save();
      TL.drawGlyph(ctx, 'capital', cx, cy, isIr ? 3.8 : 2.9, isIr ? T.gold : T.ink, null, MS.dark);
      if (MS.zoom >= 1.1 || isIr) {
        ctx.font = `${isIr ? 700 : 500} 9.5px ${UI}`;
        const tw = ctx.measureText(cap.name).width;
        if (tryPlace(cx, cy + 12, tw, 12, false)) {
          ctx.fillStyle = isIr ? T.gold : T.sub; ctx.textAlign = 'center';
          if (MS.dark) { ctx.shadowColor = '#000'; ctx.shadowBlur = 5; }
          else { ctx.shadowColor = 'rgba(250,246,235,.92)'; ctx.shadowBlur = 4; }
          ctx.fillText(cap.name, cx, cy + 12);
        }
      }
      ctx.restore();
    });

    // 13. Live Events AT THEIR EXACT BATTLEFIELD / CITY COORDINATES (TL.eventGeo)!
    if (MS.layers.events && S.layers.events) {
      const win = y < -1000 ? 75 : (y < 500 ? 22 : (y < 1800 ? 12 : 4));
      const nearEvs = TL.events.filter(e => {
        const shown = e.r === 'iran' || !S.show || S.show.has(e.r);
        return shown && y >= e.y - win && y <= (e.y2 || e.y) + win;
      }).sort((a, b) => b.w - a.w);
      const seenLoc = {};
      nearEvs.forEach(e => {
        const geo = TL.eventGeo ? TL.eventGeo(e) : null;
        if (!geo) return;
        const key = Math.round(geo[0] * 2) + ',' + Math.round(geo[1] * 2);
        const dup = (seenLoc[key] = (seenLoc[key] || 0) + 1) - 1;
        const [bx, by] = proj(geo[0], geo[1]);
        const ex = bx + (dup ? Math.cos(dup * 2.1) * 11 : 0);
        const ey = by + (dup ? Math.sin(dup * 2.1) * 11 : 0);
        if (ex < 12 || ex > W - 12 || ey < 48 || ey > H - 46) return;
        const col = (TL.KIND[e.k] || TL.KIND.pol).c;
        const dist = Math.min(Math.abs(y - e.y), Math.abs(y - (e.y2 || e.y)));
        const alpha = clamp(1 - dist / (win + 1), 0.38, 1);
        const isHov = MS.hover && MS.hover.type === 'event' && MS.hover.item === e;
        const isFoc = S.focus && S.focus.type === 'event' && S.focus.item === e;

        ctx.save();
        ctx.globalAlpha = alpha;
        if (dist < win * 0.45 || isFoc) {
          const wr = 5 + ((MS.t * 22 + dup * 7) % 18);
          ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.globalAlpha = alpha * (1 - wr / 24);
          ctx.beginPath(); ctx.arc(ex, ey, wr, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = alpha;
        }
        if (MS.dark && (isHov || isFoc)) { ctx.shadowColor = col; ctx.shadowBlur = 12; }
        const evR = isHov || isFoc ? 5.6 : (e.w >= 3 ? 4.6 : 3.9);
        TL.drawGlyph(ctx, e.k || 'pol', ex, ey, evR, col, null, MS.dark);
        ctx.shadowBlur = 0;
        if (e.w >= 3 || isHov || isFoc || (e.r === 'iran' && MS.zoom >= 1.35)) {
          ctx.font = `${isFoc ? 800 : 600} 9.5px ${UI}`;
          const tw = ctx.measureText(e.n).width;
          let ly = null;
          if (tryPlace(ex, ey - 13, tw, 13, false)) ly = ey - 13;
          else if ((isHov || isFoc) && tryPlace(ex, ey + 15, tw, 13, true)) ly = ey + 15;
          if (ly != null) {
            ctx.fillStyle = MS.dark ? '#fff' : '#221a12'; ctx.textAlign = 'center';
            if (MS.dark) { ctx.shadowColor = '#000'; ctx.shadowBlur = 5; }
            else { ctx.shadowColor = 'rgba(250,246,235,.94)'; ctx.shadowBlur = 4; }
            ctx.fillText(e.n, ex, ly);
          }
        }
        ctx.restore();
        MS.pinHits.push({ type: 'event', item: e, x: ex, y: ey, r: 12 });
      });
    }

    // 14. Living Historical Figures AT THEIR EXACT BIRTHPLACE COORDINATES (TL.personGeo)!
    if (MS.layers.people && S.layers.people) {
      const alive = TL.people.filter(p => {
        const shown = p.r === 'iran' || !S.show || S.show.has(p.r);
        return shown && y >= p.s && y <= p.e;
      });
      const seenCity = {};
      alive.forEach(p => {
        const geo = TL.personGeo ? TL.personGeo(p) : null;
        if (!geo) return;
        const key = Math.round(geo[0] * 2) + ',' + Math.round(geo[1] * 2);
        const dup = (seenCity[key] = (seenCity[key] || 0) + 1) - 1;
        const [bx, by] = proj(geo[0], geo[1]);
        // Micro-spiral only when multiple figures were born in the exact same city (e.g. Shiraz / Athens / Tehran)
        const px = bx + (dup ? Math.cos(dup * 2.2) * (9 + dup * 2.5) : 0);
        const py = by + (dup ? Math.sin(dup * 2.2) * (9 + dup * 2.5) : 0);
        if (px < 12 || px > W - 12 || py < 48 || py > H - 46) return;
        const isHov = MS.hover && MS.hover.type === 'person' && MS.hover.item === p;
        const isFoc = S.focus && S.focus.type === 'person' && S.focus.item === p;
        const col = (TL.KIND[TL.PKINDK[p.k]] || TL.KIND.cul).c;
        // Life journey so far (birthplace -> each place lived), only for the hovered or selected figure
        const path = (isHov || isFoc) && TL.personPath ? TL.personPath(p, y) : [];
        if (path.length > 1) {
          const pts = path.map(q => proj(q[0], q[1]));
          ctx.save();
          ctx.strokeStyle = p.r === 'iran' || isFoc ? T.gold : col; ctx.fillStyle = ctx.strokeStyle;
          ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -MS.t * 16;
          if (MS.dark) { ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 8; }
          ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) {
            const [ax, ay] = pts[i - 1], [qx, qy] = pts[i];
            ctx.quadraticCurveTo((ax + qx) / 2 - (qy - ay) * 0.15, (ay + qy) / 2 + (qx - ax) * 0.15, qx, qy);
          }
          ctx.stroke(); ctx.setLineDash([]);
          pts.slice(0, -1).forEach(([sx, sy2]) => { ctx.beginPath(); ctx.arc(sx, sy2, 2.4, 0, Math.PI * 2); ctx.fill(); });
          ctx.restore();
        }

        ctx.save();
        const pCol = p.r === 'iran' || isFoc ? T.gold : col;
        if (MS.dark && (isHov || isFoc)) { ctx.shadowColor = pCol; ctx.shadowBlur = 12; }
        TL.drawGlyph(ctx, 'person', px, py, isHov || isFoc ? 6.0 : 4.5, pCol, null, MS.dark);
        ctx.shadowBlur = 0;
        if (isFoc || isHov || (p.r === 'iran' && MS.zoom >= 1.2) || MS.zoom >= 1.45) {
          const lbl = p.n;
          ctx.font = `${isFoc ? 800 : 600} 9.5px ${UI}`;
          const tw = ctx.measureText(lbl).width;
          let ly = null;
          if (tryPlace(px, py - 12, tw, 13, false)) ly = py - 12;
          else if ((isHov || isFoc) && tryPlace(px, py + 14, tw, 13, true)) ly = py + 14;
          if (ly != null) {
            ctx.fillStyle = MS.dark ? (p.r === 'iran' || isFoc ? T.gold : T.ink) : '#1e160e'; ctx.textAlign = 'center';
            if (MS.dark) { ctx.shadowColor = '#000'; ctx.shadowBlur = 5; }
            else { ctx.shadowColor = 'rgba(250,246,235,.94)'; ctx.shadowBlur = 4; }
            ctx.fillText(lbl, px, ly);
          }
        }
        ctx.restore();
        MS.pinHits.push({ type: 'person', item: p, x: px, y: py, r: 12 });
      });
    }

    // 15. Continuous Antique Paper Grain + Aged Edge Vignette + Engraved Cartographic Frame & Compass Rose
    ctx.save();
    if (MS.dark) {
      if (!paperPatDark) paperPatDark = makePaperPattern(true);
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = paperPatDark; ctx.fillRect(0, 0, W, H);
    } else {
      if (!paperPatLight) paperPatLight = makePaperPattern(false);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = paperPatLight; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    // Subtle aged-paper radial edge vignette
    ctx.save();
    const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.34, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, T.vig);
    ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Delicate double-hairline engraved atlas border frame
    ctx.save();
    ctx.strokeStyle = T.frame; ctx.lineWidth = 0.85;
    ctx.strokeRect(5.5, 5.5, W - 11, H - 11);
    ctx.lineWidth = 0.5;
    ctx.strokeRect(8.5, 8.5, W - 17, H - 17);
    ctx.restore();

    // Minimalist antique compass rose in open bottom-right corner
    if (W > 420 && H > 220) drawCompassRose(W - 36, H - 36, 17, T, MS.dark);
  };

  // ---------- hit testing ----------
  M.hitTest = function (x, y) {
    for (let i = MS.pinHits.length - 1; i >= 0; i--) {
      const p = MS.pinHits[i];
      if (Math.hypot(x - p.x, y - p.y) <= p.r) return { type: p.type, item: p.item };
    }
    // While two eras are blended, test the one actually visible under the pointer
    let hits = MS.polyHits;
    const bl = MS.blend;
    if (bl && bl.md && bl.hitsB) {
      const k = (clamp(Math.floor(y / INK_DS), 0, bl.md.length / 4 / bl.mw - 1) * bl.mw + clamp(Math.floor(x / INK_DS), 0, bl.mw - 1)) * 4 + 3;
      hits = bl.md[k] >= 128 ? bl.hitsB : bl.hitsA;
    }
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      for (let j = 0; j < h.screenRings.length; j++) {
        if (pointInFlatPoly(x, y, h.screenRings[j])) {
          return { type: 'hist', ent: h.ent, effFa: h.effFa, effPid: h.effPid, item: h.pol, sy: h.sy };
        }
      }
    }
    return null;
  };

  // ---------- lifecycle ----------
  M.init = function (canvas) { cv = canvas; ctx = cv.getContext('2d'); M.indexData(); };
  M.resize = function () {
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    MS.dpr = Math.min(window.devicePixelRatio || 1, 2);
    MS.W = Math.max(0, r.width); MS.H = Math.max(0, r.height);
    cv.width = Math.round(MS.W * MS.dpr); cv.height = Math.round(MS.H * MS.dpr);
  };
  M.step = function (dt) {
    MS.t += dt;
    // Ease toward targets, then land exactly (a settled camera lets the border layers stay cached)
    const ease = (v, to, k, eps) => (Math.abs(to - v) < eps ? to : lerp(v, to, k));
    MS.lon = ease(MS.lon, MS.tLon, 0.14, 1e-4);
    MS.lat = ease(MS.lat, MS.tLat, 0.14, 1e-4);
    MS.zoom = ease(MS.zoom, MS.tZoom, 0.14, 1e-5);
    MS.year = ease(MS.year, MS.tYear, 0.25, 1e-3);
  };
})();

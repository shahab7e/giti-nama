/* Real Time-Varying Historical World Map engine (window.M) with TRUE POLYGON MORPHING.
   - Borderless Natural Earth 50m physical landmass, lakes, and rivers (ZERO modern borders).
   - 45 historically-audited world border snapshots (10,000 BC – 2010 AD) from TL.HIST.
   - True vertex-to-vertex geometric polygon morphing (CCW resampled + optimal cyclic alignment)
     between consecutive historical epochs — borders physically stretch, flow, and reshape!
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
    // Geometric morph state
    morphPlan: null, // array of { ringA, ringB, colA, colB, cxA, cyA, cxB, cyB, isIr, prec, effFa, effPid, ent }
    trans: 1,
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
    [-7000, -10000], [-3600, -5000], [-2400, -3000], [-1700, -2000], [-1200, -1500],
    [-678, -1000], [-550, -600], [-404, -500], [-330, -400], [-312, -323],
    [-238, -300], [-141, -200], [50, -1], [150, 100], [224, 200],
    [360, 300], [460, 400], [560, 500], [642, 600], [750, 700],
    [861, 800], [945, 900], [1040, 1000], [1157, 1100], [1220, 1200],
    [1370, 1279], [1468, 1400], [1501, 1500], [1588, 1530], [1603, 1600], [1644, 1615],
    [1736, 1715], [1750, 1740], [1796, 1783], [1813, 1800], [1857, 1815],
    [1895, 1880], [1910, 1900], [1919, 1914], [1925, 1920], [1945, 1938],
    [1952, 1945], [1991, 1960], [2005, 1994], [9999, 2010]
  ];

  // Restrained Swiss-editorial muted hues (distinct yet harmonious)
  const SWISS_HUES = [214, 34, 158, 350, 22, 248, 184, 42, 140, 332, 198, 14];
  const MORPH_N = 64;

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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

  // ---------- TRUE GEOMETRIC POLYGON MORPHING MATH ----------
  function signedRingArea(ring) {
    let a = 0; const n = ring.length;
    for (let i = 0; i < n; i += 2) {
      const nx = ring[(i + 2) % n], ny = ring[(i + 3) % n];
      a += ring[i] * ny - nx * ring[i + 1];
    }
    return a * 0.5;
  }

  // Resample any Float32Array ring into N evenly-spaced CCW perimeter vertices
  function resampleRing(ring, N) {
    let n = ring.length, src = ring;
    // Enforce consistent CCW winding so morphs NEVER turn inside-out!
    if (signedRingArea(ring) < 0) {
      src = new Float32Array(n);
      for (let i = 0; i < n; i += 2) { src[i] = ring[n - 2 - i]; src[i + 1] = ring[n - 1 - i]; }
    }
    const pts = n / 2, cum = new Float32Array(pts + 1);
    for (let i = 0; i < pts; i++) {
      const x0 = src[i * 2], y0 = src[i * 2 + 1];
      const x1 = src[((i + 1) % pts) * 2], y1 = src[((i + 1) % pts) * 2 + 1];
      cum[i + 1] = cum[i] + Math.hypot(x1 - x0, y1 - y0);
    }
    const total = cum[pts] || 1, out = new Float32Array(N * 2);
    let seg = 0;
    for (let k = 0; k < N; k++) {
      const target = (k / N) * total;
      while (seg < pts - 1 && cum[seg + 1] < target) seg++;
      const len = (cum[seg + 1] - cum[seg]) || 1, f = (target - cum[seg]) / len;
      const x0 = src[seg * 2], y0 = src[seg * 2 + 1];
      const x1 = src[((seg + 1) % pts) * 2], y1 = src[((seg + 1) % pts) * 2 + 1];
      out[k * 2] = x0 + (x1 - x0) * f;
      out[k * 2 + 1] = y0 + (y1 - y0) * f;
    }
    return out;
  }

  // Gently contracted version of a ring around its own centroid (clean in-place unfold/dissolve, no flying bubbles!)
  function scaleRing(ring, cx, cy, f) {
    const out = new Float32Array(ring.length);
    for (let i = 0; i < ring.length; i += 2) {
      out[i] = cx + (ring[i] - cx) * f;
      out[i + 1] = cy + (ring[i + 1] - cy) * f;
    }
    return out;
  }

  // Find exact cyclic vertex rotation of ringB minimizing squared distance to ringA (prevents any twist!)
  function alignRing(ringA, ringB) {
    const N = ringA.length / 2;
    let bestShift = 0, bestCost = 1e18;
    for (let sh = 0; sh < N; sh++) {
      let cost = 0;
      for (let i = 0; i < N; i += 2) {
        const bi = ((i + sh) % N) * 2;
        const dx = ringA[i * 2] - ringB[bi], dy = ringA[i * 2 + 1] - ringB[bi + 1];
        cost += dx * dx + dy * dy;
      }
      if (cost < bestCost) { bestCost = cost; bestShift = sh; }
    }
    if (bestShift === 0) return ringB;
    const out = new Float32Array(ringB.length);
    for (let i = 0; i < N; i++) {
      const bi = ((i + bestShift) % N) * 2;
      out[i * 2] = ringB[bi]; out[i * 2 + 1] = ringB[bi + 1];
    }
    return out;
  }

  // Cache primary ring + its own exact bounding box, centroid & area (prevents colonial/multi-ring jumps!)
  function ringMetaOf(ent) {
    if (ent._rm) return ent._rm;
    let best = ent.rings[0], ba = -1;
    for (let i = 0; i < ent.rings.length; i++) {
      const a = Math.abs(signedRingArea(ent.rings[i]));
      if (a > ba) { ba = a; best = ent.rings[i]; }
    }
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, sx = 0, sy = 0;
    const n = best.length;
    for (let i = 0; i < n; i += 2) {
      const x = best[i], y = best[i + 1];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      sx += x; sy += y;
    }
    const pts = (n / 2) || 1;
    ent._rm = {
      ring: resampleRing(best, MORPH_N),
      box: [minX, minY, maxX, maxY],
      rcx: sx / pts, rcy: sy / pts,
      rArea: Math.max(0.05, ba)
    };
    return ent._rm;
  }

  function boxOverlapMetrics(a, b) {
    const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
    const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
    const inter = ix * iy;
    if (inter <= 0) return { ratio: 0, iou: 0 };
    const areaA = Math.max(1e-4, (a[2] - a[0]) * (a[3] - a[1]));
    const areaB = Math.max(1e-4, (b[2] - b[0]) * (b[3] - b[1]));
    return { ratio: inter / Math.min(areaA, areaB), iou: inter / (areaA + areaB - inter) };
  }

  function canMorphPair(ma, mb, minOverlap, maxDist) {
    const ov = boxOverlapMetrics(ma.box, mb.box);
    if (ov.ratio < minOverlap) return null;
    const d = Math.hypot(ma.rcx - mb.rcx, ma.rcy - mb.rcy);
    const sizeCap = Math.max(4.5, Math.min(maxDist, (Math.sqrt(ma.rArea) + Math.sqrt(mb.rArea)) * 0.72));
    if (d > sizeCap) return null;
    return { d, ratio: ov.ratio, iou: ov.iou };
  }

  // Color parsing to RGB for smooth color morphing
  const rgbCache = new Map();
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  function parseColorRgb(str) {
    if (rgbCache.has(str)) return rgbCache.get(str);
    let out = [80, 120, 180];
    if (str[0] === '#') {
      const v = parseInt(str.slice(1), 16);
      out = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    } else {
      const m = str.match(/hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
      if (m) out = hslToRgb(+m[1], +m[2], +m[3]);
    }
    rgbCache.set(str, out);
    return out;
  }
  function blendRgb(a, b, t) {
    return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
  }

  // Build spatially-verified geometric morph plan: ZERO cross-continent jumps, static lock for unchanged countries!
  function buildMorphPlan(prevSnap, prevSy, curSnap, curSy, y) {
    const usedPrev = new Set(), usedCur = new Set();
    const pairs = [];
    const metaA = prevSnap.map(ringMetaOf);
    const metaB = curSnap.map(ringMetaOf);

    const effOf = (ent, sy) => {
      if (ent.isIr && sy === 1960 && y >= 1979) return { pid: 'iri', fa: 'ایران (جمهوری اسلامی)' };
      return { pid: ent.pid, fa: ent.fa };
    };
    const addPair = (iA, iB, sameName) => {
      const pa = iA >= 0 ? prevSnap[iA] : null;
      const pb = iB >= 0 ? curSnap[iB] : null;
      const ma = iA >= 0 ? metaA[iA] : null;
      const mb = iB >= 0 ? metaB[iB] : null;
      const ea = pa ? effOf(pa, prevSy) : null, eb = pb ? effOf(pb, curSy) : null;
      const colA = parseColorRgb(pa ? entColor({ ...pa, pid: ea.pid }, MS.dark) : entColor({ ...pb, pid: eb.pid }, MS.dark));
      const colB = parseColorRgb(pb ? entColor({ ...pb, pid: eb.pid }, MS.dark) : entColor({ ...pa, pid: ea.pid }, MS.dark));

      // Lock unchanged states so they NEVER wobble, jump, or blink secondary islands!
      let mode = pa && pb ? 'morph' : (pb ? 'grow' : 'shrink');
      let rA = null, alignedB = null;
      if (pa && pb) {
        const ov = boxOverlapMetrics(ma.box, mb.box);
        const cd = Math.hypot(ma.rcx - mb.rcx, ma.rcy - mb.rcy);
        const areaDiff = Math.abs(ma.rArea - mb.rArea) / Math.max(ma.rArea, mb.rArea);
        const isUnchanged = sameName
          ? (ov.iou >= 0.72 && cd < 1.5 && areaDiff < 0.18)
          : (ov.iou >= 0.86 && cd < 0.85 && areaDiff < 0.12);
        if (isUnchanged) {
          mode = 'static';
        } else {
          rA = ma.ring;
          alignedB = alignRing(ma.ring, mb.ring);
        }
      } else if (pb) {
        rA = scaleRing(mb.ring, mb.rcx, mb.rcy, 0.72);
        alignedB = mb.ring;
      } else {
        rA = ma.ring;
        alignedB = scaleRing(ma.ring, ma.rcx, ma.rcy, 0.72);
      }

      pairs.push({
        ringA: rA, ringB: alignedB,
        staticRings: mode === 'static' ? pb.rings : null,
        colA, colB,
        cxA: ma ? ma.rcx : mb.rcx, cyA: ma ? ma.rcy : mb.rcy,
        cxB: mb ? mb.rcx : ma.rcx, cyB: mb ? mb.rcy : ma.rcy,
        isIr: !!((pb && pb.isIr) || (pa && pa.isIr)),
        prec: pb ? pb.prec : pa.prec,
        area: pb ? pb.area : pa.area,
        effFa: eb ? eb.fa : ea.fa,
        effPid: eb ? eb.pid : ea.pid,
        ent: pb || pa,
        mode
      });
    };

    // Count pid occurrences so grouped modern pids (africa_states, sa_states, ca_states, etc.) NEVER mismatch countries!
    const pidCntA = {}, pidCntB = {};
    prevSnap.forEach(e => { if (e.pid) pidCntA[e.pid] = (pidCntA[e.pid] || 0) + 1; });
    curSnap.forEach(e => { if (e.pid) pidCntB[e.pid] = (pidCntB[e.pid] || 0) + 1; });

    // Pass 1: Exact country/empire name match WITH strict geographic overlap check!
    for (let j = 0; j < curSnap.length; j++) {
      const b = curSnap[j];
      let bestI = -1, bestIou = -1;
      for (let i = 0; i < prevSnap.length; i++) {
        if (usedPrev.has(i)) continue;
        const a = prevSnap[i];
        const sameName = (a.en && b.en && a.en === b.en) || (a.fa && b.fa && a.fa === b.fa);
        if (!sameName) continue;
        const ok = canMorphPair(metaA[i], metaB[j], 0.18, 12);
        if (ok && ok.iou > bestIou) { bestIou = ok.iou; bestI = i; }
      }
      if (bestI >= 0) { usedPrev.add(bestI); usedCur.add(j); addPair(bestI, j, true); }
    }

    // Pass 2: Unique 1-to-1 polity ID continuity (e.g. Persia -> Iran, Siam -> Thailand), NEVER grouped pids!
    for (let j = 0; j < curSnap.length; j++) {
      if (usedCur.has(j)) continue;
      const b = curSnap[j];
      if (!b.pid || pidCntB[b.pid] !== 1 || pidCntA[b.pid] !== 1) continue;
      for (let i = 0; i < prevSnap.length; i++) {
        if (usedPrev.has(i) || prevSnap[i].pid !== b.pid) continue;
        if (canMorphPair(metaA[i], metaB[j], 0.22, 12)) {
          usedPrev.add(i); usedCur.add(j); addPair(i, j, true); break;
        }
      }
    }

    // Pass 3: Iranian historical dynasty continuity (Achaemenid -> Parthian -> Sasanian -> Safavid -> Qajar -> Pahlavi)
    // Runs ONLY if Iran was not already matched in Pass 1 or Pass 2!
    const irAlreadyA = prevSnap.some((e, i) => e.isIr && usedPrev.has(i));
    const irAlreadyB = curSnap.some((e, j) => e.isIr && usedCur.has(j));
    if (!irAlreadyA && !irAlreadyB) {
      const findIran = (arr, used) => {
        let best = -1, ba = -1;
        for (let i = 0; i < arr.length; i++) {
          if (used.has(i)) continue;
          const e = arr[i];
          if (e.isIr && e.area > ba) { ba = e.area; best = i; }
        }
        return best;
      };
      const irA = findIran(prevSnap, usedPrev), irB = findIran(curSnap, usedCur);
      if (irA >= 0 && irB >= 0 && boxOverlapMetrics(metaA[irA].box, metaB[irB].box).ratio >= 0.20) {
        usedPrev.add(irA); usedCur.add(irB); addPair(irA, irB);
      }
    }

    // Pass 4: Best-first spatial successor morphing sorted by highest IoU overlap (Rome->Byzantium->Ottoman, USSR->Russia, Ming->Qing)
    const cands = [];
    for (let j = 0; j < curSnap.length; j++) {
      if (usedCur.has(j) || curSnap[j].area < 6) continue;
      for (let i = 0; i < prevSnap.length; i++) {
        if (usedPrev.has(i) || prevSnap[i].area < 6) continue;
        const ratioArea = Math.max(metaA[i].rArea, metaB[j].rArea) / Math.min(metaA[i].rArea, metaB[j].rArea);
        if (ratioArea > 12) continue;
        const ok = canMorphPair(metaA[i], metaB[j], 0.36, 11);
        if (ok && ok.iou >= 0.22) cands.push({ i, j, iou: ok.iou });
      }
    }
    cands.sort((x, y) => y.iou - x.iou);
    for (const c of cands) {
      if (usedPrev.has(c.i) || usedCur.has(c.j)) continue;
      usedPrev.add(c.i); usedCur.add(c.j); addPair(c.i, c.j);
    }

    // Pass 5: Remaining genuinely emerging / vanishing states unfold or dissolve cleanly right in place!
    for (let j = 0; j < curSnap.length; j++) {
      if (!usedCur.has(j) && curSnap[j].area >= 1.0) addPair(-1, j);
    }
    for (let i = 0; i < prevSnap.length; i++) {
      if (!usedPrev.has(i) && prevSnap[i].area >= 1.2) addPair(i, -1);
    }

    pairs.sort((a, b) => (a.isIr ? 1 : 0) - (b.isIr ? 1 : 0) || b.area - a.area);
    return pairs;
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

  function pickSnapYear(y) {
    for (let i = 0; i < SNAP_CUTS.length; i++) if (y < SNAP_CUTS[i][0]) return SNAP_CUTS[i][1];
    return 2010;
  }
  M.snapYearFor = pickSnapYear;

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
        fa, en, pid, isIr: !!(flags & 4), prec: flags & 3,
        cx: cx10 / 10, cy: cy10 / 10, area: area10 / 10,
        rings: rings.map(r => decodeDeltaRing(r, q))
      };
    });
    list.sort((a, b) => (a.isIr ? 1 : 0) - (b.isIr ? 1 : 0));
    decodedSnaps.set(sy, list);
    return list;
  }

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
  //   0 < s < 1    -> straight segments with gently eased corners (19th-c. treaty era & morph transitions)
  function traceScreenPoly(sp, smooth) {
    const n = sp.length;
    if (smooth <= 0.01) {
      ctx.moveTo(sp[0], sp[1]);
      for (let i = 2; i < n; i += 2) ctx.lineTo(sp[i], sp[i + 1]);
      ctx.closePath();
      return;
    }
    if (smooth >= 0.99) {
      const lastX = sp[n - 2], lastY = sp[n - 1];
      ctx.moveTo((lastX + sp[0]) * 0.5, (lastY + sp[1]) * 0.5);
      for (let i = 0; i < n; i += 2) {
        const nx = sp[(i + 2) % n], ny = sp[(i + 3) % n];
        ctx.quadraticCurveTo(sp[i], sp[i + 1], (sp[i] + nx) * 0.5, (sp[i + 1] + ny) * 0.5);
      }
      ctx.closePath();
      return;
    }
    const f = smooth * 0.5;
    const x0 = sp[0], y0 = sp[1], px0 = sp[n - 2], py0 = sp[n - 1];
    ctx.moveTo(x0 + (px0 - x0) * f, y0 + (py0 - y0) * f);
    for (let i = 0; i < n; i += 2) {
      const vx = sp[i], vy = sp[i + 1];
      const px = sp[(i - 2 + n) % n], py = sp[(i - 1 + n) % n];
      const nx = sp[(i + 2) % n], ny = sp[(i + 3) % n];
      if (i > 0) ctx.lineTo(vx + (px - vx) * f, vy + (py - vy) * f);
      ctx.quadraticCurveTo(vx, vy, vx + (nx - vx) * f, vy + (ny - vy) * f);
    }
    ctx.closePath();
  }

  function traceEraRing(ring, proj, smooth, collectScreen) {
    const n = ring.length; if (n < 6) return null;
    const sp = new Float32Array(n);
    for (let i = 0; i < n; i += 2) {
      const [sx, sy] = proj(ring[i], ring[i + 1]);
      sp[i] = sx; sp[i + 1] = sy;
    }
    traceScreenPoly(sp, smooth);
    return collectScreen ? sp : null;
  }

  function traceMorphedRing(ringA, ringB, e, smooth, proj) {
    const n = ringA.length; if (n < 6) return;
    const sp = new Float32Array(n);
    for (let i = 0; i < n; i += 2) {
      const lon = ringA[i] + (ringB[i] - ringA[i]) * e;
      const lat = ringA[i + 1] + (ringB[i + 1] - ringA[i + 1]) * e;
      const [sx, sy] = proj(lon, lat);
      sp[i] = sx; sp[i + 1] = sy;
    }
    traceScreenPoly(sp, smooth);
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

    // Trigger TRUE GEOMETRIC POLYGON MORPH whenever historical snapshot changes!
    const nextSy = pickSnapYear(y);
    if (nextSy !== MS.snapYear) {
      const prevSnap = loadSnapshot(MS.snapYear);
      const nextSnap = loadSnapshot(nextSy);
      MS.morphPlan = buildMorphPlan(prevSnap, MS.snapYear, nextSnap, nextSy, y);
      MS.morphSmooth = [borderSmooth(MS.snapYear), borderSmooth(nextSy)];
      MS.snapYear = nextSy;
      MS.trans = 0;
    }

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

    // 4. HISTORICAL BORDERS — TRUE VERTEX MORPH DURING TRANSITIONS, FULL MULTI-RING AT REST!
    const curSnap = loadSnapshot(MS.snapYear);
    const focusItem = S.focus ? S.focus.item : null;
    const focusPol = S.focus && S.focus.type === 'polity' ? focusItem
      : (S.focus && S.focus.type === 'ruler' ? TL.polityById[focusItem.pid] : null);
    const focusEmp = focusPol && (focusPol.dom ? focusPol : TL.overlord(focusPol, y, y));
    const focusIds = new Set();
    if (focusPol) focusIds.add(focusPol.id);
    if (focusEmp) { focusIds.add(focusEmp.id); if (focusEmp.dom) focusEmp.dom.forEach(d => focusIds.add(d.id)); }
    const hasFocus = focusIds.size > 0;

    // Unified region-filter check used identically during morphing, at rest, and in labels/capitals!
    const isEntFilteredOut = (ent, effPid, lon, lat) => {
      if (!S.show || ent.isIr) return false;
      const pol = effPid ? TL.polityById[effPid] : null;
      if (pol && pol.r === 'iran') return false;
      const rid = pol ? pol.r : nearestRegion(lon, lat, true);
      return !!(rid && !S.show.has(rid));
    };

    const curSmooth = borderSmooth(MS.snapYear);
    const morphing = MS.trans < 0.995 && MS.morphPlan;

    if (morphing) {
      const e = easeInOutCubic(clamp(MS.trans, 0, 1));
      const shimmer = Math.sin(MS.trans * Math.PI);
      const smA = MS.morphSmooth ? MS.morphSmooth[0] : curSmooth;
      const smB = MS.morphSmooth ? MS.morphSmooth[1] : curSmooth;
      const mSmooth = lerp(smA, smB, e);
      ctx.lineJoin = mSmooth <= 0.05 ? 'miter' : 'round';
      ctx.miterLimit = 2.4;
      ctx.lineCap = mSmooth <= 0.05 ? 'butt' : 'round';

      for (let i = 0; i < MS.morphPlan.length; i++) {
        const mp = MS.morphPlan[i];
        const col = blendRgb(mp.colA, mp.colB, e);
        const modeAlpha = mp.mode === 'shrink' ? (1 - e) : (mp.mode === 'grow' ? e : 1);
        if (modeAlpha < 0.02) continue;

        const isFocus = !!(mp.effPid && focusIds.has(mp.effPid));
        const filterDim = isEntFilteredOut(mp.ent, mp.effPid, lerp(mp.cxA, mp.cxB, e), lerp(mp.cyA, mp.cyB, e));
        const dimmed = (hasFocus && !isFocus) || filterDim;

        ctx.save();
        ctx.beginPath();
        if (mp.mode === 'static' && mp.staticRings) {
          for (let r = 0; r < mp.staticRings.length; r++) traceEraRing(mp.staticRings[r], proj, mSmooth, false);
        } else {
          traceMorphedRing(mp.ringA, mp.ringB, e, mSmooth, proj);
        }

        ctx.globalAlpha = (mp.isIr ? T.iranAlpha : T.fillAlpha) * (filterDim ? 0.06 : (dimmed ? T.dimAlpha : 1)) * modeAlpha;
        if (!MS.dark) ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = col; ctx.fill();
        if (!MS.dark) ctx.globalCompositeOperation = 'source-over';

        const bAlpha = T.borderAlpha * (filterDim ? 0.08 : (dimmed ? 0.20 : 1)) * modeAlpha;
        // Soft watercolor wash ONLY for organic pre-modern eras and non-dimmed entities
        if (!dimmed && mSmooth > 0.05) {
          ctx.globalAlpha = bAlpha * 0.30 * mSmooth;
          ctx.strokeStyle = mp.isIr ? (MS.dark ? '#d8b46c' : '#1d4496') : col;
          ctx.lineWidth = (mp.isIr ? 4.2 : 2.6) + (mp.mode === 'static' ? 0 : shimmer * 2.2 * mSmooth);
          ctx.stroke();
        }

        ctx.globalAlpha = bAlpha * (mSmooth <= 0.05 ? 1.0 : 0.92);
        ctx.strokeStyle = mp.isIr ? (MS.dark ? '#f0d28b' : '#1d4496') : (MS.dark ? 'rgba(255,255,255,.42)' : 'rgba(20,20,24,.34)');
        ctx.lineWidth = mp.isIr ? 1.5 : 0.8;
        ctx.stroke();
        ctx.restore();
      }
    } else {
      const isModern = curSmooth <= 0.01;
      ctx.lineJoin = isModern ? 'miter' : 'round';
      ctx.miterLimit = 2.4;
      ctx.lineCap = isModern ? 'butt' : 'round';

      for (let idx = 0; idx < curSnap.length; idx++) {
        const ent = curSnap[idx];
        let effPid = ent.pid, effFa = ent.fa;
        if (ent.isIr && MS.snapYear === 1960 && y >= 1979) { effPid = 'iri'; effFa = 'ایران (جمهوری اسلامی)'; }
        const pol = effPid ? TL.polityById[effPid] : null;
        const isFocus = !!(effPid && focusIds.has(effPid));
        const isHover = !!(MS.hover && MS.hover.type === 'hist' && MS.hover.ent === ent);
        const filterDim = isEntFilteredOut(ent, effPid, ent.cx, ent.cy);
        const dimmed = (hasFocus && !isFocus && !isHover) || filterDim;
        const col = entColor({ ...ent, pid: effPid }, MS.dark);

        const screenRings = [];
        ctx.save();
        ctx.beginPath();
        for (let r = 0; r < ent.rings.length; r++) {
          const sr = traceEraRing(ent.rings[r], proj, curSmooth, true);
          if (sr) screenRings.push(sr);
        }

        ctx.globalAlpha = (ent.isIr ? T.iranAlpha : T.fillAlpha) * (filterDim && !isHover ? 0.06 : (dimmed ? T.dimAlpha : (isFocus || isHover ? 1.28 : 1)));
        if (!MS.dark) ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = col; ctx.fill();
        if (!MS.dark) ctx.globalCompositeOperation = 'source-over';

        const bAlpha = T.borderAlpha * (filterDim && !isHover ? 0.08 : (dimmed ? 0.20 : 1));
        // Watercolor frontier wash ONLY for pre-modern eras; modern surveyed borders stay razor-crisp!
        if (!dimmed && curSmooth > 0.05) {
          ctx.globalAlpha = bAlpha * (ent.isIr ? 0.34 : 0.22) * curSmooth;
          ctx.strokeStyle = ent.isIr ? (MS.dark ? '#d8b46c' : '#1d4496') : col;
          ctx.lineWidth = ent.isIr ? 4.0 : 2.6;
          ctx.stroke();
        }
        ctx.globalAlpha = bAlpha * (isHover ? 1.55 : (isFocus ? 1.4 : (isModern ? 1.05 : 0.85)));
        if (ent.prec === 1 && !isModern && !isFocus && !isHover) ctx.setLineDash([4, 4]);
        ctx.strokeStyle = isHover ? (MS.dark ? '#ffffff' : '#111113')
          : (isFocus ? T.gold : (ent.isIr ? (MS.dark ? '#e4c47a' : '#1d4496') : (MS.dark ? (isModern ? 'rgba(255,255,255,.46)' : 'rgba(255,255,255,.36)') : (isModern ? 'rgba(20,20,24,.38)' : 'rgba(20,20,24,.30)'))));
        ctx.lineWidth = isHover ? 1.9 : (isFocus ? 1.7 : (ent.isIr ? (isModern ? 1.45 : 1.35) : (isModern ? 0.82 : 0.72)));
        if ((isFocus || isHover) && MS.dark) { ctx.shadowColor = ent.isIr ? '#d8b46c' : col; ctx.shadowBlur = 12; }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        MS.polyHits.push({ ent, effPid, effFa, pol, screenRings });
      }
    }

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

    // 11. Empire Labels (smoothly glide along morphed centroids during morph!)
    if (MS.layers.labels) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
      const eMorph = morphing ? easeInOutCubic(clamp(MS.trans, 0, 1)) : 1;
      const queue = morphing
        ? MS.morphPlan.filter(m => m.mode !== 'shrink').map(m => ({
            ent: m.ent, effPid: m.effPid, effFa: m.effFa,
            lon: lerp(m.cxA, m.cxB, eMorph), lat: lerp(m.cyA, m.cyB, eMorph),
            alpha: m.mode === 'grow' ? eMorph : 1
          }))
        : MS.polyHits.slice().sort((a, b) => (b.ent.isIr ? 1 : 0) - (a.ent.isIr ? 1 : 0) || b.ent.area - a.ent.area).map(h => ({
            ent: h.ent, effPid: h.effPid, effFa: h.effFa, lon: h.ent.cx, lat: h.ent.cy, alpha: 1
          }));

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
      ctx.fillStyle = isIr ? T.gold : T.ink;
      ctx.beginPath(); ctx.arc(cx, cy, isIr ? 3.0 : 2.0, 0, Math.PI * 2); ctx.fill();
      if (MS.zoom >= 1.1 || isIr) {
        ctx.font = `${isIr ? 700 : 500} 9.5px ${UI}`;
        const tw = ctx.measureText(cap.name).width;
        if (tryPlace(cx, cy + 11, tw, 12, false)) {
          ctx.fillStyle = isIr ? T.gold : T.sub; ctx.textAlign = 'center';
          if (MS.dark) { ctx.shadowColor = '#000'; ctx.shadowBlur = 5; }
          ctx.fillText(cap.name, cx, cy + 11);
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
        ctx.fillStyle = col;
        if (MS.dark) { ctx.shadowColor = col; ctx.shadowBlur = isHov || isFoc ? 14 : 6; }
        if (e.k === 'war') {
          ctx.save(); ctx.translate(ex, ey); ctx.rotate(Math.PI / 4);
          const sz = isHov || isFoc ? 4.8 : 3.4; ctx.fillRect(-sz, -sz, sz * 2, sz * 2); ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(ex, ey, isHov || isFoc ? 5.2 : 3.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.shadowBlur = 0;
        if (e.w >= 3 || isHov || isFoc || (e.r === 'iran' && MS.zoom >= 1.35)) {
          ctx.font = `${isFoc ? 800 : 600} 9.5px ${UI}`;
          const tw = ctx.measureText(e.n).width;
          let ly = null;
          if (tryPlace(ex, ey - 11, tw, 13, false)) ly = ey - 11;
          else if ((isHov || isFoc) && tryPlace(ex, ey + 13, tw, 13, true)) ly = ey + 13;
          if (ly != null) {
            ctx.fillStyle = MS.dark ? '#fff' : '#141416'; ctx.textAlign = 'center';
            if (MS.dark) { ctx.shadowColor = '#000'; ctx.shadowBlur = 5; }
            else { ctx.shadowColor = 'rgba(255,255,255,.92)'; ctx.shadowBlur = 4; }
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

        ctx.save();
        ctx.fillStyle = p.r === 'iran' || isFoc ? T.gold : col;
        if (MS.dark) { ctx.shadowColor = p.r === 'iran' || isFoc ? T.gold : col; ctx.shadowBlur = isHov || isFoc ? 14 : 6; }
        ctx.beginPath(); ctx.arc(px, py, isHov || isFoc ? 5.0 : 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (isFoc || isHov || (p.r === 'iran' && MS.zoom >= 1.2) || MS.zoom >= 1.45) {
          const lbl = '★ ' + p.n;
          ctx.font = `${isFoc ? 800 : 600} 9.5px ${UI}`;
          const tw = ctx.measureText(lbl).width;
          let ly = null;
          if (tryPlace(px, py - 11, tw, 13, false)) ly = py - 11;
          else if ((isHov || isFoc) && tryPlace(px, py + 13, tw, 13, true)) ly = py + 13;
          if (ly != null) {
            ctx.fillStyle = p.r === 'iran' || isFoc ? T.gold : T.ink; ctx.textAlign = 'center';
            if (MS.dark) { ctx.shadowColor = '#000'; ctx.shadowBlur = 5; }
            else { ctx.shadowColor = 'rgba(255,255,255,.92)'; ctx.shadowBlur = 4; }
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
    for (let i = MS.polyHits.length - 1; i >= 0; i--) {
      const h = MS.polyHits[i];
      for (let j = 0; j < h.screenRings.length; j++) {
        if (pointInFlatPoly(x, y, h.screenRings[j])) {
          return { type: 'hist', ent: h.ent, effFa: h.effFa, effPid: h.effPid, item: h.pol };
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
    // Silky 850ms vertex-to-vertex geometric polygon morph!
    if (MS.trans < 1) {
      MS.trans = Math.min(1, MS.trans + dt / 0.85);
      if (MS.trans >= 1) MS.morphPlan = null;
    }
    MS.lon = lerp(MS.lon, MS.tLon, 0.14);
    MS.lat = lerp(MS.lat, MS.tLat, 0.14);
    MS.zoom = lerp(MS.zoom, MS.tZoom, 0.14);
    MS.year = lerp(MS.year, MS.tYear, 0.25);
  };
})();

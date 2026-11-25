/* Real Natural Earth 50m Space-Time Map engine (window.M).
   Renders all 27 TL.regions from TL.MAP, colored dynamically by TL.polities + TL.dominion at year Y,
   with capitals, trade routes, campaigns, live events, and living historical figures. */
(function () {
  const M = {}; window.M = M;
  const UI = '"Vazirmatn", Tahoma, "Segoe UI", sans-serif';
  let cv, ctx, grainPat = null;

  const MS = M.S = {
    W: 0, H: 0, dpr: 1,
    lon: 50, lat: 33, zoom: 1.45,
    tLon: 50, tLat: 33, tZoom: 1.45,
    year: -480, tYear: -480,
    layers: { routes: true, campaigns: true, rivers: true, domArcs: true, events: true, people: true, labels: true },
    hover: null, // { type:'region'|'event'|'person', item, regId, polity }
    regHits: [], // [{ rid, screenPolys, polity, lord }]
    pinHits: [], // [{ type, item, x, y, r }]
    t: 0,
    dark: true
  };

  const THEME = {
    dark: {
      ocean1: '#0c162b', ocean2: '#050812',
      landEmpty: '#12192b', landStroke: 'rgba(232,190,102,.22)', coastGlow: 'rgba(85,145,255,.08)',
      sea: '#070d1c', river: 'rgba(110,170,255,.28)', grat: 'rgba(232,190,102,.045)',
      ink: '#f6f3eb', sub: 'rgba(218,226,242,.74)', gold: '#e8be66',
      fillAlpha: 0.50, iranAlpha: 0.64, borderAlpha: 0.90, dimAlpha: 0.17
    },
    light: {
      ocean1: '#d8e4e7', ocean2: '#c5d4db',
      landEmpty: '#ede4d2', landStroke: 'rgba(95,70,38,.34)', coastGlow: 'rgba(80,120,145,.10)',
      sea: '#cbd9df', river: 'rgba(55,115,158,.38)', grat: 'rgba(95,70,38,.08)',
      ink: '#1f1810', sub: 'rgba(54,42,26,.78)', gold: '#9c6a12',
      fillAlpha: 0.42, iranAlpha: 0.54, borderAlpha: 0.86, dimAlpha: 0.18
    }
  };

  // ---------- helpers ----------
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function makeGrain() {
    const g = document.createElement('canvas'); g.width = 96; g.height = 96;
    const gx = g.getContext('2d'), img = gx.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 120 + Math.random() * 45;
      img.data[i] = v; img.data[i + 1] = v - 6; img.data[i + 2] = v - 16; img.data[i + 3] = 10;
    }
    gx.putImageData(img, 0, 0);
    return ctx.createPattern(g, 'repeat');
  }

  // Natural-looking equirectangular projection with cos(32°) proportion & smooth zoom
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

  // Primary polity ruling region `rid` at year `y`
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
      // Prefer lv=1 over lv=2 over lv=3; prefer states over cultures; prefer non-foreign in Iran if coexisting
      const isState = p.k === 'culture' ? 0 : 1;
      const area = p.prof ? R.areaAt(p, y) : 0.2;
      const sc = (4 - (p.lv || 2)) * 100 + isState * 40 + Math.min(area, 25) + (p.ir && rid === 'iran' ? 8 : 0);
      if (sc > score) { score = sc; best = p; }
    }
    return best;
  };

  M.activeRulers = function (pid, y) {
    return TL.rulers.filter(r => r.pid === pid && y >= r.s && y <= r.e);
  };

  // Match polity.cap string to real coordinates in TL.MAP.cities
  const cityKeys = () => Object.keys((TL.MAP && TL.MAP.cities) || {});
  const capCache = new Map();
  function resolveCapital(p) {
    if (!p || !p.cap || !TL.MAP) return null;
    if (capCache.has(p.id)) return capCache.get(p.id);
    const keys = cityKeys();
    let found = null;
    for (const k of keys) {
      if (p.cap.includes(k)) { found = { name: k, pt: TL.MAP.cities[k] }; break; }
    }
    capCache.set(p.id, found);
    return found;
  }

  function pointInFlatPoly(px, py, flat) {
    let inside = false;
    const n = flat.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const xi = flat[i], yi = flat[i + 1], xj = flat[j], yj = flat[j + 1];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-6) + xi)) inside = !inside;
    }
    return inside;
  }

  function traceFlatPoly(flat, proj) {
    const n = flat.length;
    if (n < 6) return null;
    const sp = new Array(n);
    for (let i = 0; i < n; i += 2) {
      const [sx, sy] = proj(flat[i] / 10, flat[i + 1] / 10);
      sp[i] = sx; sp[i + 1] = sy;
    }
    ctx.moveTo(sp[0], sp[1]);
    for (let i = 2; i < n; i += 2) ctx.lineTo(sp[i], sp[i + 1]);
    ctx.closePath();
    return sp;
  }

  function traceOpenPts(pts, proj, isTenths) {
    if (pts.length < (isTenths ? 4 : 2)) return;
    if (isTenths) {
      let [x0, y0] = proj(pts[0] / 10, pts[1] / 10);
      ctx.moveTo(x0, y0);
      for (let i = 2; i < pts.length; i += 2) {
        const [x, y] = proj(pts[i] / 10, pts[i + 1] / 10);
        ctx.lineTo(x, y);
      }
    } else {
      const s = pts.map(p => proj(p[0], p[1]));
      ctx.moveTo(s[0][0], s[0][1]);
      for (let i = 1; i < s.length - 1; i++) {
        ctx.quadraticCurveTo(s[i][0], s[i][1], (s[i][0] + s[i + 1][0]) / 2, (s[i][1] + s[i + 1][1]) / 2);
      }
      ctx.lineTo(s[s.length - 1][0], s[s.length - 1][1]);
    }
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
    M.flyTo(a[0], a[1], zoom || (rid === 'iran' ? 1.85 : 1.55));
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
    if (!ctx || !TL.MAP || MS.W < 20 || MS.H < 20) return;
    const { W, H } = MS;
    const T = MS.dark ? THEME.dark : THEME.light;
    const y = MS.year;
    const S = R.S;
    const proj = M.proj;
    const mapData = TL.MAP;

    MS.regHits = [];
    MS.pinHits = [];

    ctx.setTransform(MS.dpr, 0, 0, MS.dpr, 0, 0);

    // 1. Deep Ocean Gradient Backdrop
    const bg = ctx.createRadialGradient(W * 0.5, H * 0.5, 40, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
    bg.addColorStop(0, T.ocean1); bg.addColorStop(1, T.ocean2);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // 2. Cartographic Lat/Lon Graticule
    ctx.strokeStyle = T.grat; ctx.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 20) {
      const [x] = proj(lon, 0);
      if (x < -10 || x > W + 10) continue;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let lat = -60; lat <= 75; lat += 15) {
      const [, gy] = proj(0, lat);
      if (gy < -10 || gy > H + 10) continue;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    // 3. Determine active polity & overlord empire for every one of the 27 regions
    const regState = {};
    const focusItem = S.focus ? S.focus.item : null;
    const focusPol = S.focus && S.focus.type === 'polity' ? focusItem
      : (S.focus && S.focus.type === 'ruler' ? TL.polityById[focusItem.pid] : null);
    const focusEmp = focusPol && (focusPol.dom ? focusPol : TL.overlord(focusPol, y, y));
    const focusSet = focusEmp && focusEmp.dom ? new Set([focusEmp, ...focusEmp.dom]) : (focusPol ? new Set([focusPol]) : null);

    TL.regions.forEach(reg => {
      const shown = reg.id === 'iran' || !S.show || S.show.has(reg.id);
      const p = shown ? M.primaryPolity(reg.id, y) : null;
      const lord = p ? TL.overlord(p, y, y) : null;
      const eff = lord || p;
      const isIranian = eff ? TL.isIranian(eff) : false;
      const isFocused = !!(p && focusSet && (focusSet.has(p) || (lord && focusSet.has(lord))));
      const isHovered = !!(MS.hover && MS.hover.regId === reg.id);
      regState[reg.id] = { reg, shown, p, lord, eff, isIranian, isFocused, isHovered };
    });

    // 4. Draw Base Landmasses (with soft bathymetric aura)
    ctx.save();
    ctx.beginPath();
    for (const rid of Object.keys(mapData.regs)) {
      const polys = mapData.regs[rid];
      for (let i = 0; i < polys.length; i++) traceFlatPoly(polys[i], proj);
    }
    ctx.shadowColor = T.coastGlow; ctx.shadowBlur = 18;
    ctx.fillStyle = T.landEmpty; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = T.landStroke; ctx.lineWidth = 0.85; ctx.stroke();
    ctx.restore();

    // 5. Fill & Border Every Active Region (27 real Natural Earth regions!)
    const drawOrder = TL.regions.slice().sort((a, b) => (a.id === 'iran' ? 1 : 0) - (b.id === 'iran' ? 1 : 0));
    const hasFocus = !!focusSet;

    for (const reg of drawOrder) {
      const st = regState[reg.id];
      const polys = mapData.regs[reg.id];
      if (!polys) continue;
      const screenPolys = [];

      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < polys.length; i++) {
        const sp = traceFlatPoly(polys[i], proj);
        if (sp) screenPolys.push(sp);
      }

      if (st.eff) {
        const col = st.eff.base || '#5c78b8';
        const isIr = reg.id === 'iran' || st.isIranian;
        const dimmed = hasFocus && !st.isFocused && !st.isHovered;
        const fade = clamp(Math.min(y - st.p.s, st.p.e - y) / 6, 0.25, 1);

        ctx.globalAlpha = (isIr ? T.iranAlpha : T.fillAlpha) * fade * (dimmed ? T.dimAlpha : (st.isFocused || st.isHovered ? 1.32 : 1));
        ctx.fillStyle = col;
        ctx.fill();

        // Crisp border: Iran & Iranian dominions glow in royal gold!
        ctx.globalAlpha = T.borderAlpha * fade * (dimmed ? 0.25 : 1);
        ctx.strokeStyle = st.isHovered ? '#ffffff'
          : (st.isFocused ? T.gold : (isIr ? (MS.dark ? '#f2cc78' : '#1b3e8c') : col));
        ctx.lineWidth = st.isHovered ? 2.2 : (st.isFocused ? 2.0 : (reg.id === 'iran' ? 1.8 : 0.95));
        if ((st.isFocused || st.isHovered || reg.id === 'iran') && MS.dark) {
          ctx.shadowColor = isIr ? '#e8be66' : col;
          ctx.shadowBlur = st.isFocused || st.isHovered ? 14 : 7;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (st.isHovered) {
        ctx.strokeStyle = T.gold; ctx.lineWidth = 1.4; ctx.stroke();
      }
      ctx.restore();

      MS.regHits.push({ rid: reg.id, screenPolys, st });
    }

    // 6. Real Natural Earth 50m Rivers
    if (MS.layers.rivers && mapData.rivers) {
      ctx.save();
      ctx.strokeStyle = T.river;
      ctx.lineWidth = clamp(0.85 * Math.sqrt(MS.zoom), 0.7, 1.8);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < mapData.rivers.length; i++) traceOpenPts(mapData.rivers[i], proj, true);
      ctx.stroke();
      ctx.restore();
    }

    // 7. Carve Real Natural Earth 50m Lakes (Caspian, Aral, Urmia, Van, Great Lakes, Victoria, Baikal!)
    if (mapData.lakes) {
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < mapData.lakes.length; i++) traceFlatPoly(mapData.lakes[i], proj);
      ctx.fillStyle = T.sea; ctx.fill();
      ctx.strokeStyle = T.landStroke; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.restore();
    }

    // 8. Dominion Unification Arcs (curved glowing arcs from conquering empire's heartland to ruled regions!)
    if (MS.layers.domArcs) {
      TL.regions.forEach(reg => {
        const st = regState[reg.id];
        if (!st.lord || st.lord.r === reg.id) return;
        const aFrom = mapData.anchors[st.lord.r], aTo = mapData.anchors[reg.id];
        if (!aFrom || !aTo) return;
        const dimmed = hasFocus && !st.isFocused;
        const [x1, y1] = proj(aFrom[0], aFrom[1]), [x2, y2] = proj(aTo[0], aTo[1]);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - Math.hypot(x2 - x1, y2 - y1) * 0.22;
        ctx.save();
        ctx.globalAlpha = dimmed ? 0.1 : (st.isFocused ? 0.85 : 0.45);
        ctx.strokeStyle = st.isIranian ? T.gold : (st.lord.base || T.gold);
        ctx.lineWidth = st.isFocused ? 2.0 : 1.2;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -MS.t * 14;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      });
    }

    // 9. Animated Trade Routes (Royal Road, Silk Road, Maritime Spice, Trans-Saharan)
    if (MS.layers.routes && mapData.routes) {
      for (const tr of mapData.routes) {
        if (y < tr.s || y > tr.e) continue;
        ctx.save();
        ctx.beginPath(); traceOpenPts(tr.pts, proj, false);
        ctx.strokeStyle = MS.dark ? 'rgba(232,190,102,.48)' : 'rgba(156,106,18,.52)';
        ctx.lineWidth = 1.45;
        ctx.setLineDash([5, 7]);
        ctx.lineDashOffset = -MS.t * 20;
        ctx.stroke();
        ctx.setLineDash([]);
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
        ctx.globalAlpha = fade;
        ctx.strokeStyle = cmp.col; ctx.lineWidth = 2.4;
        if (MS.dark) { ctx.shadowColor = cmp.col; ctx.shadowBlur = 12; }
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        const segCount = pts.length - 1, totalPos = prog * segCount;
        let hx = pts[0][0], hy = pts[0][1], ang = 0;
        for (let i = 0; i < segCount; i++) {
          const sp = clamp(totalPos - i, 0, 1);
          if (sp <= 0) break;
          const a = pts[i], b = pts[i + 1];
          const px = lerp(a[0], b[0], sp), py = lerp(a[1], b[1], sp);
          ctx.lineTo(px, py); hx = px; hy = py; ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        }
        ctx.stroke();
        const wave = 5 + ((MS.t * 24) % 20);
        ctx.beginPath(); ctx.arc(hx, hy, wave, 0, Math.PI * 2);
        ctx.globalAlpha = fade * (1 - wave / 28); ctx.lineWidth = 1.2; ctx.stroke();
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

    // Shared 2D collision box registry so region names, capitals, events & people NEVER pile up!
    const placed = [];
    const tryPlace = (x, y, w, h, force) => {
      const box = [x - w / 2 - 4, y - h / 2 - 2, x + w / 2 + 4, y + h / 2 + 2];
      if (!force && placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) return false;
      placed.push(box);
      return true;
    };

    // 11. Region / Active Polity Labels FIRST (highest priority so every active realm is readable!)
    if (MS.layers.labels) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
      const labelOrder = TL.regions.slice().sort((a, b) => (a.id === 'iran' ? -1 : b.id === 'iran' ? 1 : a.order - b.order));
      for (const reg of labelOrder) {
        const st = regState[reg.id];
        if (!st.p) continue;
        const anc = mapData.anchors[reg.id]; if (!anc) continue;
        const [lx, ly] = proj(anc[0], anc[1]);
        if (lx < 20 || lx > W - 20 || ly < 42 || ly > H - 36) continue;
        const isIr = reg.id === 'iran';
        const title = st.lord ? st.lord.n : st.p.n;
        const fs = isIr ? 13.5 : (MS.zoom > 1.3 ? 11.5 : 10.2);
        ctx.font = `${isIr || st.isFocused ? 800 : 700} ${fs}px ${UI}`;
        const tw = ctx.measureText(title).width;
        const showSub = isIr || MS.zoom >= 1.35 || st.isFocused;
        if (!tryPlace(lx, ly + (showSub ? 2 : -4), tw, showSub ? 24 : 15, isIr || st.isFocused || st.isHovered)) continue;

        ctx.save();
        ctx.globalAlpha = hasFocus && !st.isFocused && !st.isHovered ? 0.30 : 1;
        ctx.fillStyle = isIr ? (MS.dark ? '#ffe6a3' : '#163578') : (st.lord && st.isIranian ? (MS.dark ? '#ffe6a3' : '#1c3d8f') : T.ink);
        if (MS.dark) { ctx.shadowColor = 'rgba(0,0,0,.92)'; ctx.shadowBlur = 9; }
        else { ctx.shadowColor = 'rgba(255,252,245,.95)'; ctx.shadowBlur = 6; }
        ctx.fillText(title, lx, ly - 4);
        if (showSub) {
          const ruls = M.activeRulers(st.p.id, y);
          const sub = st.lord ? ('زیر فرمان ' + st.lord.n) : (ruls[0] ? ruls[0].n : reg.n);
          ctx.font = `500 9.5px ${UI}`;
          ctx.fillStyle = st.lord ? T.gold : T.sub;
          ctx.fillText(sub, lx, ly + 10);
        }
        ctx.restore();
      }
    }

    // 12. Active Historical Capitals (dots always crisp; labels collision-checked!)
    const drawnCaps = new Set();
    TL.regions.forEach(reg => {
      const st = regState[reg.id];
      if (!st.p) return;
      const cap = resolveCapital(st.p);
      if (!cap || drawnCaps.has(cap.name)) return;
      drawnCaps.add(cap.name);
      const [cx, cy] = proj(cap.pt[0], cap.pt[1]);
      if (cx < -30 || cx > W + 30 || cy < 20 || cy > H - 28) return;
      const isIr = reg.id === 'iran';
      if (!isIr && MS.zoom < 0.78 && st.p.lv > 1) return;
      ctx.save();
      ctx.globalAlpha = hasFocus && !st.isFocused ? 0.25 : 0.9;
      ctx.fillStyle = isIr ? T.gold : T.ink;
      ctx.beginPath(); ctx.arc(cx, cy, isIr ? 3.2 : 2.2, 0, Math.PI * 2); ctx.fill();
      if (MS.zoom >= 1.05 || isIr) {
        ctx.font = `${isIr ? 700 : 500} 9.5px ${UI}`;
        const tw = ctx.measureText(cap.name).width;
        if (tryPlace(cx, cy + 11, tw, 12, false)) {
          ctx.fillStyle = isIr ? T.gold : T.sub;
          ctx.textAlign = 'center';
          if (MS.dark) { ctx.shadowColor = '#000'; ctx.shadowBlur = 5; }
          ctx.fillText(cap.name, cx, cy + 11);
        }
      }
      ctx.restore();
    });

    // 13. Live Events on the Map (dots always clickable/hoverable; labels collision-checked!)
    if (MS.layers.events && S.layers.events) {
      const win = y < -1000 ? 75 : (y < 500 ? 22 : (y < 1800 ? 12 : 4));
      const nearEvs = TL.events.filter(e => {
        const shown = e.r === 'iran' || !S.show || S.show.has(e.r);
        if (!shown) return false;
        return y >= e.y - win && y <= (e.y2 || e.y) + win;
      }).sort((a, b) => b.w - a.w);
      const perReg = {};
      nearEvs.forEach(e => {
        const anc = mapData.anchors[e.r]; if (!anc) return;
        const idx = (perReg[e.r] = (perReg[e.r] || 0) + 1) - 1;
        if (idx > 2) return;
        const [bx, by] = proj(anc[0], anc[1]);
        const ex = bx + (idx - 0.5) * 22, ey = by - 26 - (idx % 2) * 12;
        if (ex < 12 || ex > W - 12 || ey < 48 || ey > H - 34) return;
        const col = (TL.KIND[e.k] || TL.KIND.pol).c;
        const dist = Math.min(Math.abs(y - e.y), Math.abs(y - (e.y2 || e.y)));
        const alpha = clamp(1 - dist / (win + 1), 0.35, 1);
        const isHov = MS.hover && MS.hover.type === 'event' && MS.hover.item === e;

        ctx.save();
        ctx.globalAlpha = alpha;
        if (dist < win * 0.45) {
          const wr = 5 + ((MS.t * 22 + idx * 7) % 18);
          ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.globalAlpha = alpha * (1 - wr / 24);
          ctx.beginPath(); ctx.arc(ex, ey, wr, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = alpha;
        }
        ctx.fillStyle = col;
        if (MS.dark) { ctx.shadowColor = col; ctx.shadowBlur = isHov ? 14 : 7; }
        if (e.k === 'war') {
          ctx.save(); ctx.translate(ex, ey); ctx.rotate(Math.PI / 4);
          const sz = isHov ? 4.8 : 3.5; ctx.fillRect(-sz, -sz, sz * 2, sz * 2); ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(ex, ey, isHov ? 5.2 : 3.8, 0, Math.PI * 2); ctx.fill();
        }
        ctx.shadowBlur = 0;
        if (e.w >= 3 || isHov || (e.r === 'iran' && MS.zoom >= 1.35)) {
          ctx.font = `600 9.5px ${UI}`;
          const tw = ctx.measureText(e.n).width;
          if (tryPlace(ex, ey - 10, tw, 12, isHov)) {
            ctx.fillStyle = MS.dark ? '#fff' : '#1f1810';
            ctx.textAlign = 'center';
            if (MS.dark) { ctx.shadowColor = '#000'; ctx.shadowBlur = 5; }
            else { ctx.shadowColor = 'rgba(255,252,245,.95)'; ctx.shadowBlur = 4; }
            ctx.fillText(e.n, ex, ey - 10);
          }
        }
        ctx.restore();
        MS.pinHits.push({ type: 'event', item: e, x: ex, y: ey, r: 12 });
      });
    }

    // 14. Living Historical Figures (stars always clickable/hoverable; labels collision-checked!)
    if (MS.layers.people && S.layers.people) {
      const alive = TL.people.filter(p => {
        const shown = p.r === 'iran' || !S.show || S.show.has(p.r);
        return shown && y >= p.s && y <= p.e;
      });
      const perReg = {};
      alive.forEach(p => {
        const anc = mapData.anchors[p.r]; if (!anc) return;
        const idx = (perReg[p.r] = (perReg[p.r] || 0) + 1) - 1;
        if (idx > (p.r === 'iran' ? 3 : 1)) return;
        const [bx, by] = proj(anc[0], anc[1]);
        const ang = (idx * 2.15) + 0.65, rad = p.r === 'iran' ? 28 + idx * 10 : 24;
        const px = bx + Math.cos(ang) * rad, py = by + Math.sin(ang) * rad * 0.75;
        if (px < 12 || px > W - 12 || py < 48 || py > H - 34) return;
        const isHov = MS.hover && MS.hover.type === 'person' && MS.hover.item === p;
        const isFoc = S.focus && S.focus.type === 'person' && S.focus.item === p;
        const col = (TL.KIND[TL.PKINDK[p.k]] || TL.KIND.cul).c;

        ctx.save();
        ctx.fillStyle = p.r === 'iran' || isFoc ? '#ffe599' : col;
        if (MS.dark) { ctx.shadowColor = p.r === 'iran' || isFoc ? '#e8be66' : col; ctx.shadowBlur = isHov || isFoc ? 16 : 7; }
        ctx.beginPath(); ctx.arc(px, py, isHov || isFoc ? 5 : 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (isFoc || isHov || (p.r === 'iran' && MS.zoom >= 1.25) || MS.zoom >= 1.55) {
          const lbl = '★ ' + p.n;
          ctx.font = `${isFoc ? 800 : 600} 9.5px ${UI}`;
          const tw = ctx.measureText(lbl).width;
          if (tryPlace(px, py - 10, tw, 12, isHov || isFoc)) {
            ctx.fillStyle = p.r === 'iran' || isFoc ? T.gold : T.ink;
            ctx.textAlign = 'center';
            if (MS.dark) { ctx.shadowColor = '#000'; ctx.shadowBlur = 5; }
            else { ctx.shadowColor = 'rgba(255,252,245,.95)'; ctx.shadowBlur = 4; }
            ctx.fillText(lbl, px, py - 10);
          }
        }
        ctx.restore();
        MS.pinHits.push({ type: 'person', item: p, x: px, y: py, r: 12 });
      });
    }

    // Subtle paper grain in Parchment theme
    if (!MS.dark) {
      if (!grainPat) grainPat = makeGrain();
      ctx.fillStyle = grainPat; ctx.fillRect(0, 0, W, H);
    }
  };

  // ---------- hit testing ----------
  M.hitTest = function (x, y) {
    for (let i = MS.pinHits.length - 1; i >= 0; i--) {
      const p = MS.pinHits[i];
      if (Math.hypot(x - p.x, y - p.y) <= p.r) return { type: p.type, item: p.item, regId: p.item.r };
    }
    for (let i = MS.regHits.length - 1; i >= 0; i--) {
      const rh = MS.regHits[i];
      for (let j = 0; j < rh.screenPolys.length; j++) {
        if (pointInFlatPoly(x, y, rh.screenPolys[j])) {
          return { type: 'region', regId: rh.rid, item: rh.st.p, lord: rh.st.lord, reg: rh.st.reg };
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
    const moving = Math.abs(MS.lon - MS.tLon) > 0.02 || Math.abs(MS.lat - MS.tLat) > 0.02 ||
      Math.abs(MS.zoom - MS.tZoom) > 0.002 || Math.abs(MS.year - MS.tYear) > 0.04;
    MS.lon = lerp(MS.lon, MS.tLon, 0.14);
    MS.lat = lerp(MS.lat, MS.tLat, 0.14);
    MS.zoom = lerp(MS.zoom, MS.tZoom, 0.14);
    MS.year = lerp(MS.year, MS.tYear, 0.22);
    return moving;
  };
})();

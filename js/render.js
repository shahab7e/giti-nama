/* Canvas Histomap Timeline engine (window.R) — visually harmonized with the Space-Time Atlas.
   Obsidian-Gold (dark) & Illuminated Parchment (light) aesthetics; smooth Bezier territory curves;
   hover & focus spotlight dimming; Iran pinned on top with soft elevation shadow. */
(function () {
  const R = {}; window.R = R;
  const S = R.S = {
    dir: 'ltr', k: 1, u0: 0, scrollY: 0, hoverX: null, hoverY: null, hoverItem: null,
    pinYear: -480, focus: null,
    layers: { rulers: true, events: true, people: true, links: false }, show: null, focusSet: null,
    W: 0, H: 0, dpr: 1, C: {}, hits: [], lanes: [], iran: null, worldTop: 0, worldH: 0, maxScroll: 0,
    LW: 132, AX: 38, CAL: 24, PW: 0, dark: true
  };
  let cv, ctx;
  const mcache = new Map();
  const UI = '"Vazirmatn", Tahoma, "Segoe UI", sans-serif';
  const DISPLAY = '"Gulzar", "Vazirmatn", serif';
  const F = (w, px) => `${w} ${px}px ${UI}`;
  function tw(text, font) { const key = font + '|' + text; let v = mcache.get(key); if (v === undefined) { ctx.font = font; v = ctx.measureText(text).width; mcache.set(key, v); } return v; }

  // Foreign rule over Iran (muted inside Iran band) and Iranian rule abroad (colored in Iranian dynasty's hue)
  TL.FOREIGN = new Set(['argead', 'seleucid_ir', 'rashidun_ir', 'umayyad_ir', 'abbasid_ir', 'mongol_gov']);
  Object.entries(TL.dominion || {}).forEach(([cid, pids]) => {
    const p = TL.polityById[cid]; if (!p) return;
    p.of = [].concat(pids).map(id => TL.polityById[id]).filter(Boolean);
    p.of.forEach(q => (q.dom = q.dom || []).push(p));
  });
  TL.overlord = (p, a = -1e9, b = 1e9) => {
    const b2 = Math.max(b, a + 0.01); let best = null, bv = 0;
    (p.of || []).forEach(q => { const v = Math.min(p.e, q.e, b2) - Math.max(p.s, q.s, a); if (v > bv) { bv = v; best = q; } });
    return best;
  };
  TL.isIranian = (p) => (p.r === 'iran' ? !TL.FOREIGN.has(p.id) : !!(p.of && p.of.some(q => q.r === 'iran' && !TL.FOREIGN.has(q.id))));

  const GRP = {
    'ایران': { h: 218, s: 52, strong: '#3d72d6', gold: '#d8b46c' },
    'خاور نزدیک': { h: 34, s: 32, strong: '#b5843c' },
    'آسیا': { h: 158, s: 25, strong: '#3b8c70' },
    'اروپا': { h: 350, s: 30, strong: '#a84a5c' },
    'آفریقا': { h: 22, s: 28, strong: '#9e6240' },
    'قارهٔ آمریکا و اقیانوسیه': { h: 248, s: 22, strong: '#6c5fa3' }
  };
  R.GRP = GRP;

  // ---------- coordinates ----------
  R.xOfU = (u) => (S.dir === 'ltr' ? (u - S.u0) * S.k : S.PW - (u - S.u0) * S.k);
  R.x = (y) => R.xOfU(TL.u(y));
  R.yearAt = (x) => TL.yOfU(S.dir === 'ltr' ? S.u0 + x / S.k : S.u0 + (S.PW - x) / S.k);
  R.visRange = () => { const a = R.yearAt(0), b = R.yearAt(S.PW); return a < b ? [a, b] : [b, a]; };
  R.kMin = () => (S.PW * 0.98) / (TL.U1() - TL.U0());
  R.kMax = () => 140;
  R.clampView = function () {
    S.k = Math.min(R.kMax(), Math.max(R.kMin(), S.k));
    const span = S.PW / S.k, lo = TL.U0() - span * 0.02, hi = TL.U1() + span * 0.02;
    if (span >= hi - lo) S.u0 = lo - (span - (hi - lo)) / 2; else S.u0 = Math.min(hi - span, Math.max(lo, S.u0));
    S.scrollY = Math.max(0, Math.min(S.maxScroll, S.scrollY));
  };
  R.fit = function (y0, y1, pad = 0.04) {
    const u0 = TL.u(y0), u1 = TL.u(y1), w = (u1 - u0) || 1;
    S.k = S.PW / (w * (1 + pad * 2)); S.k = Math.min(R.kMax(), Math.max(R.kMin(), S.k));
    S.u0 = (u0 + u1) / 2 - S.PW / S.k / 2; R.clampView();
  };

  // ---------- theme + mineral/jewel colours ----------
  R.readTheme = function () {
    const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
    ['--bg', '--surface', '--sunk', '--ink', '--ink2', '--muted', '--line', '--line2', '--accent', '--accent-ink', '--gold', '--tint', '--tint2'].forEach(n => {
      S.C[n.slice(2).replace('-', '_')] = g(n);
    });
    S.dark = document.documentElement.getAttribute('data-theme') !== 'light';
    mcache.clear(); R.colorize();
  };
  const hsl = (h, s, l, a) => (a == null ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`);
  // ---------- Swiss Editorial minimal palette: restrained matte saturation WITH distinct hues per dynasty! ----------
  R.colorize = function () {
    const byReg = {};
    TL.polities.forEach(p => { (byReg[p.r] = byReg[p.r] || []).push(p); });
    // 8 curated restrained Swiss/Bauhaus mineral hues for Iranian dynasties so consecutive dynasties are unmistakably distinct!
    const IRAN_HUES = [216, 178, 348, 34, 244, 152, 282, 16];
    // Crisp hue steps inside each world continent so consecutive dynasties never blend together!
    const WORLD_SHIFT = [0, 32, -28, 54, -46, 18, -18, 40];
    const L_STEP = [0, -4, 3, -2, 4, -5];

    const pass = () => Object.keys(byReg).forEach(rid => {
      const reg = TL.regionById[rid];
      const grp = GRP[reg.grp] || { h: 210, s: 28 };
      const regShift = ((reg.order % 5) - 2) * 10;
      let irIdx = 0;
      byReg[rid].sort((a, b) => a.s - b.s).forEach((p, i) => {
        p.ir = TL.isIranian(p);
        const foreignInIran = rid === 'iran' && !p.ir;
        const lord = p.of ? TL.overlord(p) : null;
        let hue, s, l;
        if (foreignInIran) {
          hue = 220; s = 10; l = S.dark ? 36 : 55;
        } else if (p.ir) {
          // If this is an Iranian dominion abroad, inherit its exact Iranian overlord's hue!
          hue = lord && lord.ir ? lord.hue : IRAN_HUES[(irIdx++) % IRAN_HUES.length];
          s = S.dark ? 44 : 46; // Restrained Swiss matte saturation, never neon!
          l = (S.dark ? 44 : 42) + L_STEP[i % L_STEP.length];
        } else if (lord && lord.hue != null) {
          hue = lord.hue;
          s = S.dark ? 36 : 38;
          l = (S.dark ? 41 : 45) + L_STEP[i % L_STEP.length];
        } else {
          hue = (grp.h + regShift + WORLD_SHIFT[i % WORLD_SHIFT.length] + 360) % 360;
          s = Math.min(40, grp.s + 6);
          l = (S.dark ? 40 : 46) + L_STEP[i % L_STEP.length];
        }
        if (p.k === 'culture') { s = Math.max(14, s - 12); l += S.dark ? 3 : 8; }
        if (p.lv === 3) { s = Math.max(16, s - 8); l += S.dark ? 1 : 6; }
        p.hue = hue;
        p.base = hsl(hue, s, l);
        p.g = [p.base, p.base, p.base];
        p.light = l >= 62;
        p.txt = p.light ? '#141416' : '#f7f7f5';
      });
    });
    pass();
    // Second pass so dominions abroad inherit their overlord's exact Swiss hue!
    pass();
  };

  // ---------- territory profiles ----------
  function defaultArea(p) { if (p.k === 'culture') return 0.06; if (p.r !== 'iran' && TL.isIranian(p)) return 0.8; return p.lv === 1 ? 0.5 : p.lv === 2 ? 0.25 : 0.06; }
  function buildProfile(p) {
    const ex = TL.extent[p.id], e = Math.min(p.e, TL.NOW);
    let pts;
    if (Array.isArray(ex)) pts = ex.slice().sort((a, b) => a[0] - b[0]);
    else {
      const A = typeof ex === 'number' ? ex : defaultArea(p), pk = p.p != null ? p.p : (p.s + e) / 2;
      pts = (p.k === 'culture' || ex === undefined)
        ? [[p.s, A * 0.85], [(p.s + e) / 2, A], [e, A * 0.85]]
        : [[p.s, A * 0.35], [p.s + (pk - p.s) * 0.45, A * 0.82], [pk, A], [pk + (e - pk) * 0.55, A * 0.8], [e, A * 0.4]];
    }
    if (pts[0][0] > p.s) pts.unshift([p.s, pts[0][1] * 0.7]);
    if (pts[pts.length - 1][0] < e) pts.push([e, pts[pts.length - 1][1]]);
    p.prof = pts; p.maxA = Math.max(...pts.map(q => q[1]));
  }
  function areaAt(pts, y) {
    if (y <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (y <= pts[i][0]) { const [y0, a0] = pts[i - 1], [y1, a1] = pts[i]; let t = (y - y0) / ((y1 - y0) || 1); t = (1 - Math.cos(Math.PI * t)) / 2; return a0 + (a1 - a0) * t; }
    }
    return pts[pts.length - 1][1];
  }
  const thick = (a, big) => (big ? 9 : 7) + (big ? 7.8 : 6.4) * Math.sqrt(Math.max(a, 0));
  R.areaAt = (p, y) => areaAt(p.prof, y);

  // ---------- layout ----------
  function pack(items, maxRows) {
    const rows = [];
    items.forEach(it => {
      let placed = false;
      for (let r = 0; r < rows.length && !placed; r++) {
        if (rows[r].every(o => o.pE <= it.pS || o.pS >= it.pE)) { rows[r].push(it); it.row = r; placed = true; }
      }
      if (!placed) { if (rows.length < maxRows) { rows.push([it]); it.row = rows.length - 1; } else { rows[maxRows - 1].push(it); it.row = maxRows - 1; it.over = true; } }
    });
    return rows;
  }
  const rowHeights = (rows, big, minH) => rows.map(row => Math.max(minH, ...row.map(p => thick(p.maxA, big))) + 4);
  R.layout = function () {
    const mobile = S.W < 640, compact = S.H < 340;
    S.LW = mobile ? 84 : 130; S.AX = compact ? 32 : 38; S.CAL = 22; S.PW = Math.max(100, S.W - S.LW);
    const polByReg = {}, rulByReg = {}, evByReg = {};
    TL.polities.forEach(p => { buildProfile(p); p.pS = p.s; p.pE = Math.max(p.e, p.s + 1); (polByReg[p.r] = polByReg[p.r] || []).push(p); });
    TL.rulers.forEach(r => { const p = TL.polityById[r.pid]; if (!p) return; r.r = p.r; r.pS = r.s; r.pE = Math.max(r.e, r.s + 0.6); (rulByReg[p.r] = rulByReg[p.r] || []).push(r); });
    TL.events.forEach(e => { (evByReg[e.r] = evByReg[e.r] || []).push(e); });
    TL.people.forEach(p => { p.pS = p.s; p.pE = p.e + 4; });
    const sorter = (a, b) => (a.lv || 2) - (b.lv || 2) || a.s - b.s || (b.e - b.s) - (a.e - a.s);
    // Iran (pinned)
    const ir = { reg: TL.regionById.iran };
    const ipAll = (polByReg.iran || []).slice().sort(sorter);
    ir.rows = pack(ipAll.filter(p => p.lv < 3), compact ? 3 : 6);
    const ipLocal = ipAll.filter(p => p.lv >= 3);
    ir.rulRows = pack((rulByReg.iran || []).slice().sort((a, b) => a.s - b.s), compact ? 2 : 3);
    ir.events = (evByReg.iran || []).slice().sort((a, b) => a.y - b.y);
    let y = S.AX; ir.top = y; y += 3;
    ir.eraY = y; y += compact ? 14 : 16;
    ir.evY = y; y += S.layers.events ? (compact ? 20 : 25) : 0;
    ir.rowH = rowHeights(ir.rows, !compact, compact ? 15 : 17); ir.rowY = [];
    ir.rowH.forEach(h => { ir.rowY.push(y); y += h; });
    ir.rulY = y + 1; y += S.layers.rulers ? ir.rulRows.length * (compact ? 14 : 16) + 4 : 0;
    y += 5; ir.bottom = y; S.iran = ir;

    // scrolling world lanes
    S.worldTop = y;
    let wy = 0; const lanes = []; let li = 0;
    const lane = (L, pols, ruls, evs) => {
      if (L.grpHead) { L.grpY = wy; wy += 24; }
      L.rows = pack(pols, 12); L.rowH = rowHeights(L.rows, false, L.iranX ? 12 : 13);
      L.rulRows = pack(ruls, 3); L.events = evs; L.idx = li++;
      L.dom = pols.filter(p => p.of).flatMap(p => p.of.map(q => ({ p, q, s: Math.max(p.s, q.s), e: Math.min(p.e, q.e) }))).filter(d => d.e > d.s);
      L.top = wy; let ly = wy + 4;
      L.domY = ly; ly += L.dom.length ? 14 : 0;
      L.evY = ly; ly += S.layers.events && L.events.length ? 15 : 0;
      L.rowY = []; L.rowH.forEach(h => { L.rowY.push(ly); ly += h; });
      if (!L.rows.length) ly += 8;
      L.rulY = ly + 1; ly += S.layers.rulers && L.rulRows.length ? L.rulRows.length * 12 + 3 : 0;
      ly += 4; L.h = ly - wy; wy = ly; lanes.push(L);
    };
    const shown = (id) => !S.show || S.show.has(id);
    if (shown('iran_local')) lane({ reg: { id: 'iran_local', n: 'دودمان‌های محلی ایران', en: 'Local dynasties of Iran', hue: 220, grp: 'ایران' }, grpHead: 'ایران از نزدیک', iranX: true }, ipLocal, [], []);
    if (S.layers.people && shown('iran_people')) {
      const ipp = TL.people.filter(p => p.r === 'iran').sort((a, b) => a.s - b.s);
      const PL = { reg: { id: 'iran_people', n: 'چهره‌های ایران', en: 'Iranian figures', hue: 220, grp: 'ایران' }, people: true, iranX: true, idx: li++ };
      PL.top = wy; PL.pplRows = pack(ipp, mobile ? 8 : 14); PL.pplY = wy + 6; PL.h = PL.pplRows.length * 15 + 14; wy += PL.h; lanes.push(PL);
    }
    let lastGrp = 'ایران';
    TL.regions.forEach(reg => {
      if (reg.id === 'iran' || !shown(reg.id)) return;
      const L = { reg, grpHead: reg.grp !== lastGrp ? reg.grp : null }; lastGrp = reg.grp;
      lane(L, (polByReg[reg.id] || []).slice().sort(sorter), (rulByReg[reg.id] || []).slice().sort((a, b) => a.s - b.s),
        (evByReg[reg.id] || []).slice().sort((a, b) => a.y - b.y));
    });
    if (S.layers.people && shown('people')) {
      const wp = TL.people.filter(p => p.r !== 'iran' && (!S.show || S.show.has(p.r))).sort((a, b) => a.s - b.s);
      const PL = { reg: { id: 'people', n: 'چهره‌های جهان', en: 'World figures', hue: 30, grp: '' }, people: true, grpHead: 'چهره‌های ماندگار جهان', idx: li++ };
      PL.grpY = wy; wy += 24; PL.top = wy; PL.pplRows = pack(wp, mobile ? 10 : 16); PL.pplY = wy + 6;
      PL.h = PL.pplRows.length * 15 + 14; wy += PL.h; lanes.push(PL);
    }
    S.lanes = lanes; S.worldH = wy + 24;
    S.maxScroll = Math.max(0, S.worldH - Math.max(0, S.H - S.CAL - S.worldTop));
  };

  // ---------- primitives ----------
  function rr(x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function hit(x0, y0, x1, y1, item, type) { S.hits.push({ x0: Math.min(x0, x1), y0, x1: Math.max(x0, x1), y1, item, type }); }
  function text(t, x, y, font, color, shadow) {
    ctx.font = font; ctx.fillStyle = color;
    if (shadow) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 0.5; }
    ctx.fillText(t, x, y);
    if (shadow) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
  }
  const span = (s, e) => { let a = R.x(s), b = R.x(Math.min(e, TL.NOW)); if (a > b) [a, b] = [b, a]; return [a, b]; };

  // ---------- sculpted Bezier polity ribbons (no plastic sheen!) ----------
  function shapePath(p, xa, xb, yc, big) {
    const v0 = Math.max(xa, -30), v1 = Math.min(xb, S.PW + 30), w = v1 - v0;
    const N = Math.max(3, Math.min(160, Math.ceil(w / 9)));
    const top = [], bot = [];
    for (let i = 0; i <= N; i++) {
      const x = v0 + (w * i) / N, yr = R.yearAt(x);
      let th = thick(areaAt(p.prof, yr), big) / 2;
      const dEnd = Math.min(x - xa, xb - x);
      th *= 0.45 + 0.55 * Math.min(1, dEnd / 12);
      top.push([x, yc - th]); bot.push([x, yc + th]);
    }
    ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]);
    for (let i = 1; i < N; i++) {
      const mx = (top[i - 1][0] + top[i][0]) / 2, my = (top[i - 1][1] + top[i][1]) / 2;
      ctx.quadraticCurveTo(top[i - 1][0], top[i - 1][1], mx, my);
    }
    ctx.lineTo(top[N][0], top[N][1]);
    if (xb <= S.PW + 30) ctx.quadraticCurveTo(xb + 2.5, yc, bot[N][0], bot[N][1]); else ctx.lineTo(bot[N][0], bot[N][1]);
    for (let i = N - 1; i > 0; i--) {
      const mx = (bot[i + 1][0] + bot[i][0]) / 2, my = (bot[i + 1][1] + bot[i][1]) / 2;
      ctx.quadraticCurveTo(bot[i + 1][0], bot[i + 1][1], mx, my);
    }
    ctx.lineTo(bot[0][0], bot[0][1]);
    if (xa >= -30) ctx.quadraticCurveTo(xa - 2.5, yc, top[0][0], top[0][1]); else ctx.lineTo(top[0][0], top[0][1]);
    ctx.closePath();
    return { top, bot };
  }

  function drawPolity(p, yc, big, clipTop, clipBot) {
    const [xa, xb] = span(p.s, p.e);
    if (xb < -20 || xa > S.PW + 20) return;
    const w = Math.max(xb - xa, 1.5);
    const focused = S.focus && (S.focus.item === p || (S.focusSet && S.focusSet.has(p)));
    const hovered = S.hoverItem === p;
    const dimmed = S.focus && S.focus.type === 'polity' && !focused && !hovered;

    ctx.save();
    if (dimmed) ctx.globalAlpha = S.dark ? 0.24 : 0.28;

    if (w < 5) {
      const th = thick(p.maxA, big); rr(xa, yc - th / 2, w, th, w / 2); ctx.fillStyle = p.base; ctx.fill();
      ctx.restore();
      if (yc > clipTop && yc < clipBot) hit(xa - 2, yc - th / 2, xb + 2, yc + th / 2, p, 'polity');
      return;
    }

    const sh = shapePath(p, xa, xb, yc, big);
    // Clean Swiss flat matte fill (crisp architectural aesthetic)
    if (S.dark && (focused || hovered)) { ctx.shadowColor = p.base; ctx.shadowBlur = hovered ? 14 : 9; }
    ctx.fillStyle = p.base; ctx.fill();
    ctx.shadowBlur = 0;

    // Minimal hairline stroke
    ctx.lineWidth = hovered ? 1.8 : (focused ? 1.5 : 0.65);
    ctx.strokeStyle = hovered ? (S.dark ? '#ffffff' : '#111113')
      : (focused ? (S.dark ? '#d8b46c' : '#111113')
      : (S.dark ? 'rgba(255,255,255,.14)' : 'rgba(17,17,19,.12)'));
    ctx.stroke();

    if (p.a && w > 30) {
      const fw = Math.min(22, w * 0.18), left = S.dir === 'ltr';
      ctx.save(); ctx.clip();
      const fade = (x, toR) => {
        const gg = ctx.createLinearGradient(x, 0, x + (toR ? fw : -fw), 0);
        gg.addColorStop(0, S.C.bg); gg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gg; ctx.globalAlpha = 0.72;
        ctx.fillRect(toR ? x - 1 : x - fw, yc - 60, fw + 1, 120);
      };
      if (p.a === true || p.a === 's') fade(left ? xa : xb, left);
      if (p.a === true || p.a === 'e') fade(left ? xb : xa, !left);
      ctx.restore();
    }

    const v0 = Math.max(xa, 0), v1 = Math.min(xb, S.PW);
    let bx = (v0 + v1) / 2, bt = 0;
    for (let i = 0; i < sh.top.length; i += 2) { const t = sh.bot[i][1] - sh.top[i][1], x = sh.top[i][0]; if (x >= v0 && x <= v1 && t > bt + 0.5) { bt = t; bx = x; } }
    const fs = big ? (bt > 24 ? 13.5 : 11.5) : (bt > 20 ? 12 : 10.5), font = F(big || bt > 20 ? 700 : 600, fs), tw0 = tw(p.n, font);
    if (v1 - v0 > tw0 + 10 && bt >= 10) {
      const cx = Math.min(v1 - tw0 / 2 - 5, Math.max(v0 + tw0 / 2 + 5, bx));
      text(p.n, cx, yc + 0.5, font, p.txt, !p.light);
    }
    ctx.restore();
    const hh = thick(p.maxA, big) / 2;
    if (yc > clipTop && yc < clipBot) hit(xa, yc - hh, xb, yc + hh, p, 'polity');
  }

  // ---------- dominion ribbon ----------
  function drawRibbon(d, top, h, y) {
    const [xa, xb] = span(d.s, d.e); if (xb < 0 || xa > S.PW) return;
    const q = d.q, hot = S.focusSet && S.focusSet.has(d.p), w = Math.max(xb - xa, 2);
    const dimmed = S.focus && S.focus.type === 'polity' && !hot;
    ctx.save();
    if (dimmed) ctx.globalAlpha = 0.2;
    ctx.fillStyle = hsl(q.hue, 68, S.dark ? 45 : 52, hot ? 0.16 : 0.06); ctx.fillRect(xa, top, w, h);
    ctx.fillStyle = hsl(q.hue, 64, S.dark ? 36 : 44, hot ? 0.98 : 0.82); rr(xa, y, w, 12, 3); ctx.fill();
    const label = 'زیر فرمان ' + q.n, font = F(700, 9.5), v0 = Math.max(xa, 0), v1 = Math.min(xb, S.PW);
    const t = tw(label, font) + 8 <= v1 - v0 ? label : (tw(q.n, font) + 8 <= v1 - v0 ? q.n : '');
    if (t) text(t, (v0 + v1) / 2, y + 6.5, font, '#ffffff');
    ctx.restore();
    if (y > S.worldTop && y < S.H - S.CAL) hit(xa, y, xa + w, y + 12, q, 'polity');
  }

  // ---------- rulers ----------
  function drawRuler(r, y, h, iran, idx) {
    const [xa, xb] = span(r.s, r.e);
    if (xb < -10 || xa > S.PW + 10) return;
    const p = TL.polityById[r.pid], w = Math.max(xb - xa, 1), focused = S.focus && S.focus.item === r, hovered = S.hoverItem === r;
    const hue = p ? p.hue : 220, sat = p && p.ir ? 52 : 28;
    if (w >= 22) {
      rr(xa + 0.8, y, w - 1.6, h, 4);
      ctx.fillStyle = hsl(hue, sat, (S.dark ? 22 : 84) - (idx % 2) * 4); ctx.fill();
      const font = F(600, iran ? 10.5 : 9.5), v0 = Math.max(xa, 0), v1 = Math.min(xb, S.PW);
      if (v1 - v0 > tw(r.n, font) + 8) text(r.n, (v0 + v1) / 2, y + h / 2 + 0.5, font, S.dark ? hsl(hue, 32, 86) : hsl(hue, 45, 22));
    } else {
      ctx.fillStyle = hsl(hue, sat + 10, S.dark ? 52 : 48 + (idx % 2) * 12);
      ctx.fillRect(xa + 0.4, y + h / 2 - 1.5, Math.max(w - 0.8, 1), 3);
    }
    if (focused || hovered) { rr(xa - 1, y - 1, Math.max(w, 3) + 2, h + 2, 4); ctx.lineWidth = 1.8; ctx.strokeStyle = S.dark ? '#e8be66' : '#111'; ctx.stroke(); }
    hit(xa, y - 2, xa + Math.max(w, 4), y + h + 2, r, 'ruler');
  }

  // ---------- events (micro-glyphs: diamond for war, glowing circles for other kinds) ----------
  function drawEvents(evs, yMid, iran, clipTop, clipBot) {
    const placed = [];
    evs.slice().sort((a, b) => b.w - a.w || a.y - b.y).forEach(e => {
      const x = R.x(e.y); if (x < -8 || x > S.PW + 8) return;
      const r = iran ? (e.w >= 3 ? 4.4 : e.w === 2 ? 3.5 : 2.8) : (e.w >= 3 ? 3.8 : e.w === 2 ? 3.1 : 2.5);
      const col = (TL.KIND[e.k] || TL.KIND.pol).c, focused = S.focus && S.focus.item === e, hovered = S.hoverItem === e;
      let x2 = x;
      if (e.y2 && e.y2 > e.y) { x2 = R.x(e.y2); ctx.fillStyle = col; ctx.globalAlpha = 0.28; rr(Math.min(x, x2), yMid - 2, Math.abs(x2 - x), 4, 2); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.save();
      ctx.fillStyle = col;
      if (e.k === 'war') {
        ctx.translate(x, yMid); ctx.rotate(Math.PI / 4);
        const s = r + (focused || hovered ? 1.4 : 0);
        ctx.fillRect(-s, -s, s * 2, s * 2);
        ctx.lineWidth = focused || hovered ? 1.8 : 1; ctx.strokeStyle = focused || hovered ? '#fff' : (S.dark ? '#090c14' : '#faf5eb'); ctx.strokeRect(-s, -s, s * 2, s * 2);
      } else {
        ctx.beginPath(); ctx.arc(x, yMid, r + (focused || hovered ? 1.4 : 0), 0, 7); ctx.fill();
        ctx.lineWidth = focused || hovered ? 1.8 : 1.1; ctx.strokeStyle = focused || hovered ? '#fff' : (S.dark ? '#090c14' : '#faf5eb'); ctx.stroke();
      }
      ctx.restore();
      if (yMid > clipTop && yMid < clipBot) hit(Math.min(x, x2) - r - 3, yMid - r - 4, Math.max(x, x2) + r + 3, yMid + r + 4, e, 'event');
      if (e.w < (iran ? 2 : 3) && !(S.k > 12 && e.w >= 2)) return;
      const font = F(e.w >= 3 ? 700 : 500, iran ? 10 : 9.5), w = tw(e.n, font);
      if (iran) {
        const x0 = x - w / 2 - 5, x1 = x + w / 2 + 5;
        if (x1 > 0 && x0 < S.PW && placed.every(([a, b]) => x1 < a || x0 > b)) { placed.push([x0, x1]); text(e.n, x, yMid - r - 7, font, e.w >= 3 ? S.C.ink : S.C.ink2); }
      } else {
        const x0 = x + r + 3, x1 = x0 + w + 8;
        if (x1 > 0 && x0 < S.PW && placed.every(([a, b]) => x1 < a || x0 > b)) { placed.push([x - r - 2, x1]); ctx.textAlign = 'left'; text(e.n, x0, yMid + 0.5, font, S.C.ink2); ctx.textAlign = 'center'; }
      }
    });
  }

  // ---------- people ----------
  function drawPeople(rows, y0, iran) {
    rows.forEach((row, ri) => {
      const y = y0 + ri * 15 + 7;
      row.forEach(p => {
        const [xa, xb] = span(p.s, p.e);
        if (xb < -10 || xa > S.PW + 10) return;
        const col = (TL.KIND[TL.PKINDK[p.k]] || TL.KIND.pol).c, focused = S.focus && S.focus.item === p, hovered = S.hoverItem === p;
        ctx.fillStyle = col; ctx.globalAlpha = focused || hovered ? 1 : 0.78;
        rr(xa, y - (focused || hovered ? 2 : 1.5), Math.max(xb - xa, 3), focused || hovered ? 4 : 3, 1.5); ctx.fill(); ctx.globalAlpha = 1;
        const font = F(iran ? 600 : 500, 10), w = tw(p.n, font), v0 = Math.max(xa, 0), v1 = Math.min(xb, S.PW);
        if (v1 - v0 > w + 10) {
          const cx = (v0 + v1) / 2;
          ctx.fillStyle = S.dark ? 'rgba(13,18,30,.92)' : 'rgba(250,245,235,.92)';
          rr(cx - w / 2 - 5, y - 6.5, w + 10, 13, 6.5); ctx.fill();
          text(p.n, cx, y + 0.5, font, S.C.ink);
        }
        hit(xa - 2, y - 7, xb + 2, y + 7, p, 'person');
      });
    });
  }

  // ---------- axis + calendar bands (sleek obsidian / antique ink — no purple gradient!) ----------
  const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  function localStep(y) { const d = Math.abs(R.x(y + 1) - R.x(y)); for (const s of STEPS) if (s * d >= 80) return s; return 5000; }
  R.ticks = function () {
    const [a, b] = R.visRange(), out = []; let y = a, guard = 0;
    while (y <= b && guard++ < 400) {
      const st = localStep(y), t = Math.ceil(y / st) * st;
      if (t > b) break;
      if (!out.length || t > out[out.length - 1].y) out.push({ y: t, st });
      y = t + st;
    }
    return out;
  };
  const yearTxt = (y) => (y < 0 ? TL.fa(-y) + ' پ.م' : (y === 0 ? '۱ م' : TL.fa(y)));
  function drawAxis(ticks) {
    ctx.fillStyle = S.dark ? '#0f1219' : '#fafaf8';
    ctx.fillRect(0, 0, S.W, S.AX);
    ctx.fillStyle = S.dark ? 'rgba(255,255,255,.10)' : 'rgba(17,17,19,.12)';
    ctx.fillRect(0, S.AX - 1, S.W, 1);
    TL.eras.forEach(er => {
      const [xa, xb] = span(er.s, er.e); if (xb < 0 || xa > S.PW) return;
      const v0 = Math.max(xa, 0), v1 = Math.min(xb, S.PW), font = F(500, 9.5), w = tw(er.n, font);
      if (xa > 0) { ctx.fillStyle = S.dark ? 'rgba(255,255,255,.14)' : 'rgba(17,17,19,.14)'; ctx.fillRect(xa, 3, 1, 10); }
      if (v1 - v0 > w + 12) text(er.n, (v0 + v1) / 2, 9, font, S.C.muted);
    });
    ticks.forEach(t => {
      const x = R.x(t.y), major = t.y % (t.st * 5) === 0 || t.st >= 1000;
      ctx.fillStyle = S.dark ? 'rgba(255,255,255,.24)' : 'rgba(17,17,19,.24)'; ctx.fillRect(x, S.AX - 5, 1, 5);
      text(yearTxt(t.y), x, S.AX - 12, F(major ? 800 : 500, major ? 12 : 10.5), S.C.ink);
    });
  }
  function drawCalendar(ticks) {
    const y0 = S.H - S.CAL;
    ctx.fillStyle = S.dark ? '#0f1219' : '#f4f4f0'; ctx.fillRect(0, y0, S.W, S.CAL);
    ctx.fillStyle = S.C.line; ctx.fillRect(0, y0, S.W, 1);
    ticks.forEach(t => {
      if (t.y < 623) return; const c = TL.calendars(t.y); if (!c) return;
      text(c.sh.split('–').pop() + ' ش', R.x(t.y), y0 + 8, F(600, 9.5), S.C.ink2);
      text(c.ah.split('–')[0] + ' ق', R.x(t.y), y0 + 17.5, F(400, 8.5), S.C.muted);
    });
  }
  function laneBg(L) {
    if (S.dark) return L.idx % 2 ? '#0e1118' : '#0a0d13';
    return L.idx % 2 ? '#f6f6f3' : '#fbfbfa';
  }

  // ---------- frame ----------
  R.draw = function () {
    if (!ctx || S.W < 20 || S.H < 20) return;
    const { W, H, PW } = S; S.hits = [];
    const fi = S.focus && S.focus.type === 'polity' ? S.focus.item : null;
    const emp = fi && (fi.dom ? fi : TL.overlord(fi));
    S.focusSet = emp && emp.dom ? new Set([emp, ...emp.dom]) : null;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    ctx.fillStyle = S.dark ? '#0a0d13' : '#fafaf8'; ctx.fillRect(0, 0, W, H);
    const ticks = R.ticks(), ir = S.iran, wTop = S.worldTop, wBot = H - S.CAL;
    const grid = (y0, y1) => ticks.forEach(t => {
      ctx.fillStyle = S.dark ? 'rgba(255,255,255,.05)' : 'rgba(60,42,20,.07)';
      ctx.fillRect(R.x(t.y), y0, 1, y1 - y0);
    });

    // scrolling world lanes
    ctx.save(); ctx.beginPath(); ctx.rect(0, wTop, W, Math.max(0, wBot - wTop)); ctx.clip();
    const oy = wTop - S.scrollY;
    S.lanes.forEach(L => {
      const top = oy + L.top;
      if (L.grpHead) {
        const gy = oy + L.grpY;
        if (gy < wBot && gy + 24 > wTop) {
          const grp = GRP[L.reg.grp] || { strong: S.C.ink2 };
          ctx.fillStyle = S.dark ? '#121620' : '#f0f0ec'; ctx.fillRect(0, gy, W, 24);
          ctx.textAlign = 'right'; text(L.grpHead, PW - 12, gy + 12.5, F(800, 11.5), grp.strong); ctx.textAlign = 'center';
          ctx.fillStyle = grp.strong; ctx.globalAlpha = 0.35; ctx.fillRect(0, gy + 23, W, 1); ctx.globalAlpha = 1;
        }
      }
      if (top > wBot || top + L.h < wTop) return;
      ctx.fillStyle = laneBg(L); ctx.fillRect(0, top, PW, L.h);
      ctx.fillStyle = S.C.line; ctx.fillRect(0, top + L.h - 1, PW, 1);
      if (L.dom) L.dom.forEach(d => drawRibbon(d, top, L.h, oy + L.domY));
    });
    grid(wTop, wBot);
    S.lanes.forEach(L => {
      const top = oy + L.top; if (top > wBot || top + L.h < wTop) return;
      if (L.people) { drawPeople(L.pplRows, oy + L.pplY, !!L.iranX); return; }
      L.rows.forEach((row, ri) => row.forEach(p => drawPolity(p, oy + L.rowY[ri] + L.rowH[ri] / 2, false, wTop, wBot)));
      if (S.layers.rulers) L.rulRows.forEach((row, ri) => row.forEach((r, i) => drawRuler(r, oy + L.rulY + ri * 12, 10, false, i)));
      if (S.layers.events && L.events.length) drawEvents(L.events, oy + L.evY + 7, false, wTop, wBot);
    });
    // Soft elevation shadow cast from pinned Iran band onto scrolling world
    const sh = ctx.createLinearGradient(0, wTop, 0, wTop + 14);
    sh.addColorStop(0, S.dark ? 'rgba(0,0,0,.55)' : 'rgba(40,28,12,.14)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh; ctx.fillRect(0, wTop, PW, 14);
    ctx.restore();

    // Iran (pinned on top — crisp Swiss Prussian tint)
    ctx.save(); ctx.beginPath(); ctx.rect(0, ir.top, W, Math.max(0, ir.bottom - ir.top)); ctx.clip();
    ctx.fillStyle = S.dark ? '#111622' : '#f0f3f9';
    ctx.fillRect(0, ir.top, W, ir.bottom - ir.top);
    grid(ir.top, ir.bottom);
    TL.iranEras.forEach((er, i) => {
      const [xa, xb] = span(er.s, er.e); if (xb < 0 || xa > PW) return;
      ctx.fillStyle = S.dark ? (i % 2 ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.015)') : (i % 2 ? 'rgba(29,68,150,.06)' : 'rgba(29,68,150,.02)');
      ctx.fillRect(xa, ir.eraY, xb - xa, 14);
      const v0 = Math.max(xa, 0), v1 = Math.min(xb, PW), font = F(700, 9.5), w = tw(er.n, font);
      if (v1 - v0 > w + 12) text(er.n, (v0 + v1) / 2, ir.eraY + 7.5, font, S.dark ? '#a9bede' : '#1d4496');
    });
    if (S.layers.links) drawLinks(ir);
    ir.rows.forEach((row, ri) => row.forEach(p => drawPolity(p, ir.rowY[ri] + ir.rowH[ri] / 2, true, ir.top, ir.bottom)));
    if (S.layers.rulers) ir.rulRows.forEach((row, ri) => row.forEach((r, i) => drawRuler(r, ir.rulY + ri * (S.H < 340 ? 14 : 16), S.H < 340 ? 12 : 14, true, i)));
    if (S.layers.events) drawEvents(ir.events, ir.evY + (S.H < 340 ? 13 : 16), true, ir.top, ir.bottom);
    ctx.restore();
    ctx.fillStyle = S.dark ? 'rgba(216,180,108,.65)' : '#1d4496'; ctx.fillRect(0, ir.bottom - 1.5, W, 1.5);

    // focus time column
    if (S.focus) {
      const [xa, xb] = span(S.focus.s, S.focus.e);
      ctx.fillStyle = S.dark ? 'rgba(232,190,102,.06)' : 'rgba(30,63,122,.06)';
      ctx.fillRect(xa, S.AX, Math.max(xb - xa, 2), H - S.AX - S.CAL);
      ctx.fillStyle = S.dark ? 'rgba(232,190,102,.45)' : 'rgba(30,63,122,.35)';
      ctx.fillRect(xa, S.AX, 1, H - S.AX - S.CAL); ctx.fillRect(xb, S.AX, 1, H - S.AX - S.CAL);
    }

    drawAxis(ticks); drawCalendar(ticks); drawLabels(oy);
    if (S.pinYear != null) cursor(R.x(S.pinYear), S.dark ? '#d8b46c' : '#b84a32', TL.yearLabel(Math.floor(S.pinYear)), false);
    if (S.hoverX != null && S.hoverX < PW) cursor(S.hoverX, S.dark ? '#ffffff' : '#141416', TL.yearLabel(Math.floor(R.yearAt(S.hoverX))), true);
  };

  function cursor(x, col, label, faint) {
    if (x < 0 || x > S.PW) return;
    ctx.save();
    ctx.fillStyle = col; ctx.globalAlpha = faint ? 0.32 : 0.90;
    if (!faint && S.dark) { ctx.shadowColor = col; ctx.shadowBlur = 10; }
    ctx.fillRect(x - 0.8, S.AX, faint ? 1 : 1.8, S.H - S.AX - S.CAL);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    const font = F(800, 10.5), w = tw(label, font) + 14, bx = Math.min(S.PW - w / 2 - 2, Math.max(w / 2 + 2, x));
    rr(bx - w / 2, S.AX + 3, w, 18, 9); ctx.fillStyle = col; ctx.fill();
    text(label, bx, S.AX + 12.5, font, (col === '#ffffff' || col === '#d8b46c') ? '#0a0d13' : '#ffffff');
    ctx.restore();
  }

  function drawLinks(ir) {
    TL.links.forEach(chain => {
      for (let i = 0; i < chain.length - 1; i++) {
        const a = TL.polityById[chain[i]], b = TL.polityById[chain[i + 1]]; if (!a || !b || a.row == null || b.row == null) continue;
        if (a.lv >= 3 || b.lv >= 3 || ir.rowY[a.row] == null || ir.rowY[b.row] == null) continue;
        const xa = R.x(Math.min(a.e, b.s)), xb = R.x(b.s), ya = ir.rowY[a.row] + ir.rowH[a.row] / 2, yb = ir.rowY[b.row] + ir.rowH[b.row] / 2;
        if (Math.max(xa, xb) < 0 || Math.min(xa, xb) > S.PW) continue;
        ctx.strokeStyle = S.dark ? '#e8be66' : '#1e3f7a'; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(xa, ya); const mx = (xa + xb) / 2;
        if (Math.abs(xb - xa) < 3) ctx.lineTo(xb, yb); else ctx.bezierCurveTo(mx, ya, mx, yb, xb, yb);
        ctx.stroke(); ctx.globalAlpha = 1;
      }
    });
  }

  function drawLabels(oy) {
    const x0 = S.PW, W = S.W, ir = S.iran;
    ctx.fillStyle = S.dark ? '#0f1219' : '#fafaf8'; ctx.fillRect(x0, 0, S.LW, S.H);
    ctx.fillStyle = S.C.line; ctx.fillRect(x0, S.AX, 1, S.H - S.AX);

    // Clean Swiss Iran track header
    ctx.fillStyle = S.dark ? '#171f31' : '#1d4496'; ctx.fillRect(x0, ir.top, S.LW, ir.bottom - ir.top);
    ctx.fillStyle = S.dark ? '#d8b46c' : '#b84a32'; ctx.fillRect(W - 3.5, ir.top, 3.5, ir.bottom - ir.top);
    ctx.textAlign = 'right';
    text('ایران', W - 14, ir.top + Math.min(26, (ir.bottom - ir.top) * 0.35), `700 ${S.W < 640 ? 18 : 22}px ${DISPLAY}`, '#ffffff');
    if (ir.bottom - ir.top > 56) text('محور نقشه', W - 14, ir.top + 48, F(400, 10.5), 'rgba(255,255,255,.72)');
    [['رویدادها', ir.evY + 14, S.layers.events], ['دودمان‌ها', ir.rowY[0] + ir.rowH[0] / 2, true], ['فرمانروایان', ir.rulY + 7, S.layers.rulers && ir.rulRows.length]].forEach(([t, y, on]) => {
      if (on && y > ir.top + 60 && y < ir.bottom - 6) text(t, W - 14, y, F(500, 9.5), 'rgba(255,255,255,.70)');
    });

    ctx.save(); ctx.beginPath(); ctx.rect(x0, S.worldTop, S.LW, Math.max(0, S.H - S.CAL - S.worldTop)); ctx.clip();
    S.lanes.forEach(L => {
      const top = oy + L.top; if (top > S.H || top + L.h < S.worldTop) return;
      const grp = GRP[L.reg.grp] || { strong: S.C.muted };
      ctx.fillStyle = grp.strong; ctx.fillRect(W - 3.5, top + 3, 3.5, Math.max(0, L.h - 6));
      const cy = top + Math.min(L.h / 2, 15);
      const font = F(L.iranX ? 700 : 600, S.W < 640 ? 10 : 11.5);
      let name = L.reg.n; while (tw(name, font) > S.LW - 22 && name.length > 4) name = name.slice(0, -2);
      if (name !== L.reg.n) name += '…';
      text(name, W - 12, cy, font, L.iranX ? (S.dark ? '#8bb0ec' : '#1d4496') : S.C.ink);
      if (L.h > 38 && S.W >= 640) { ctx.direction = 'ltr'; text(L.reg.en, W - 12, cy + 14, F(400, 9), S.C.muted); ctx.direction = 'rtl'; }
      ctx.fillStyle = S.C.line; ctx.fillRect(x0, top + L.h - 1, S.LW, 1);
      hit(x0, top, W, top + L.h, L.reg, 'region');
    });
    ctx.restore();

    ctx.fillStyle = S.dark ? '#0f1219' : '#fafaf8'; ctx.fillRect(x0, 0, S.LW, S.AX);
    ctx.fillStyle = S.dark ? '#0f1219' : '#f4f4f0'; ctx.fillRect(x0, S.H - S.CAL, S.LW, S.CAL);
    text('سال میلادی', W - 12, S.AX - 12, F(700, 10.5), S.C.ink);
    text('خورشیدی · قمری', W - 12, S.H - S.CAL + 11, F(600, 9.5), S.C.ink2);
    ctx.textAlign = 'center';
  }

  // ---------- setup + hit test ----------
  R.init = function (canvas) { cv = canvas; ctx = cv.getContext('2d'); };
  R.resize = function () {
    if (!cv) return;
    const r = cv.getBoundingClientRect(); S.dpr = Math.min(window.devicePixelRatio || 1, 2);
    S.W = Math.max(0, r.width); S.H = Math.max(0, r.height);
    cv.width = Math.round(S.W * S.dpr); cv.height = Math.round(S.H * S.dpr);
  };
  R.hitTest = function (x, y) { for (let i = S.hits.length - 1; i >= 0; i--) { const h = S.hits[i]; if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return h; } return null; };
  R.clearCache = () => mcache.clear();
})();

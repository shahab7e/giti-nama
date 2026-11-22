/* Canvas engine. Visual model borrowed from printed "rise and fall of nations" charts:
   region bands in pastel continent colours; each state drawn as a flowing shape whose thickness follows its territory (√ of area) year by year;
   multi-hue gradient fills; Iran pinned on top. Exposes window.R. */
(function () {
  const R = {}; window.R = R;
  const S = R.S = {
    dir: 'ltr', k: 1, u0: 0, scrollY: 0, hoverX: null, hoverY: null, pinYear: null, focus: null,
    layers: { rulers: true, events: true, people: true, links: false }, show: null, focusSet: null,
    W: 0, H: 0, dpr: 1, C: {}, hits: [], lanes: [], iran: null, worldTop: 0, worldH: 0, maxScroll: 0,
    LW: 132, AX: 44, CAL: 26, PW: 0, dark: false
  };
  let cv, ctx;
  const mcache = new Map();
  const UI = '"Vazirmatn", Tahoma, "Segoe UI", sans-serif';
  const F = (w, px) => `${w} ${px}px ${UI}`;
  function tw(text, font) { const key = font + '|' + text; let v = mcache.get(key); if (v === undefined) { ctx.font = font; v = ctx.measureText(text).width; mcache.set(key, v); } return v; }

  // foreign rule over Iran (muted inside the Iran band) and Iranian rule abroad (drawn in the Iranian dynasty's own colour)
  TL.FOREIGN = new Set(['argead', 'seleucid_ir', 'rashidun_ir', 'umayyad_ir', 'abbasid_ir', 'mongol_gov']);
  // dominion links (data/dominion.js): p.of = the empires ruling this land, emp.dom = the lands it ruled
  Object.entries(TL.dominion || {}).forEach(([cid, pids]) => {
    const p = TL.polityById[cid]; if (!p) return;
    p.of = [].concat(pids).map(id => TL.polityById[id]).filter(Boolean);
    p.of.forEach(q => (q.dom = q.dom || []).push(p));
  });
  // the empire ruling p for most of [a,b] (a single year counts as [a, a+0.01]; touching at an end year does not count)
  TL.overlord = (p, a = -1e9, b = 1e9) => {
    const b2 = Math.max(b, a + 0.01); let best = null, bv = 0;
    (p.of || []).forEach(q => { const v = Math.min(p.e, q.e, b2) - Math.max(p.s, q.s, a); if (v > bv) { bv = v; best = q; } });
    return best;
  };
  TL.isIranian = (p) => (p.r === 'iran' ? !TL.FOREIGN.has(p.id) : !!(p.of && p.of.some(q => q.r === 'iran' && !TL.FOREIGN.has(q.id))));
  // continent groups: band tint + strong colour for the label column
  const GRP = {
    'ایران': { h: 220, strong: '#2c5bd0' }, 'خاور نزدیک': { h: 40, strong: '#c47f12' }, 'آسیا': { h: 150, strong: '#1f9466' },
    'اروپا': { h: 348, strong: '#c4385a' }, 'آفریقا': { h: 28, strong: '#a35a22' }, 'قارهٔ آمریکا و اقیانوسیه': { h: 268, strong: '#6c48b8' }
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

  // ---------- theme + colours ----------
  R.readTheme = function () {
    const cs = getComputedStyle(document.documentElement), g = (n) => cs.getPropertyValue(n).trim();
    ['--bg', '--surface', '--sunk', '--ink', '--ink2', '--muted', '--line', '--line2', '--accent', '--accent-ink', '--tint', '--tint2'].forEach(n => { S.C[n.slice(2).replace('-', '_')] = g(n); });
    S.dark = document.documentElement.getAttribute('data-theme') === 'dark';
    mcache.clear(); R.colorize();
  };
  const hsl = (h, s, l, a) => (a == null ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`);
  R.colorize = function () {
    const byReg = {};
    TL.polities.forEach(p => { (byReg[p.r] = byReg[p.r] || []).push(p); });
    const OFF = [0, 14, -12, 24, -22, 7, -5, 18];
    const pass = () => Object.keys(byReg).forEach(rid => {
      const reg = TL.regionById[rid];
      byReg[rid].sort((a, b) => a.s - b.s).forEach((p, i) => {
        p.ir = TL.isIranian(p);
        const foreignInIran = rid === 'iran' && !p.ir;
        const hue = typeof p.c === 'number' ? p.c : reg.hue + OFF[i % OFF.length];
        let s = p.ir ? 70 : 56, l = p.ir ? 50 : 55 - (i % 2) * 6;
        if (foreignInIran) { s = 12; l = 62; }
        if (p.k === 'culture') { s -= 14; l += 10; }
        if (p.lv === 3) { s -= 10; l += 8; }
        if (S.dark) { l -= 8; }
        p.hue = hue; p.base = hsl(hue, s, l);
        p.g = [hsl(hue - 16, s - 4, l + 9), hsl(hue, s + 6, l), hsl(hue + 18, s, l - 7)];
        p.light = l >= 60;
        p.txt = p.light ? hsl(hue, 40, 20) : '#ffffff';
      });
    });
    pass();
    // an empire keeps one colour in every land it ruled
    let again = false;
    TL.polities.forEach(p => { if (p.of && typeof p.c !== 'number') { p.c = TL.overlord(p).hue; again = true; } });
    if (again) pass();
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
  const thick = (a, big) => (big ? 9 : 7) + (big ? 8.5 : 7) * Math.sqrt(Math.max(a, 0));
  R.areaAt = (p, y) => areaAt(p.prof, y);

  // ---------- layout ----------
  function pack(items, maxRows, keyH) {
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
  const rowHeights = (rows, big, minH) => rows.map(row => Math.max(minH, ...row.map(p => thick(p.maxA, big))) + 5);
  R.layout = function () {
    const mobile = S.W < 640;
    S.LW = mobile ? 86 : 134; S.AX = 44; S.CAL = 26; S.PW = S.W - S.LW;
    const polByReg = {}, rulByReg = {}, evByReg = {};
    TL.polities.forEach(p => { buildProfile(p); p.pS = p.s; p.pE = Math.max(p.e, p.s + 1); (polByReg[p.r] = polByReg[p.r] || []).push(p); });
    TL.rulers.forEach(r => { const p = TL.polityById[r.pid]; if (!p) return; r.r = p.r; r.pS = r.s; r.pE = Math.max(r.e, r.s + 0.6); (rulByReg[p.r] = rulByReg[p.r] || []).push(r); });
    TL.events.forEach(e => { (evByReg[e.r] = evByReg[e.r] || []).push(e); });
    TL.people.forEach(p => { p.pS = p.s; p.pE = p.e + 4; });
    const sorter = (a, b) => (a.lv || 2) - (b.lv || 2) || a.s - b.s || (b.e - b.s) - (a.e - a.s);
    // Iran (pinned)
    const ir = { reg: TL.regionById.iran };
    const ipAll = (polByReg.iran || []).slice().sort(sorter);
    ir.rows = pack(ipAll.filter(p => p.lv < 3), 6);
    const ipLocal = ipAll.filter(p => p.lv >= 3);
    ir.rulRows = pack((rulByReg.iran || []).slice().sort((a, b) => a.s - b.s), 3);
    ir.events = (evByReg.iran || []).slice().sort((a, b) => a.y - b.y);
    let y = S.AX; ir.top = y; y += 4;
    ir.eraY = y; y += 18;
    ir.evY = y; y += S.layers.events ? 28 : 0;
    ir.rowH = rowHeights(ir.rows, true, 18); ir.rowY = [];
    ir.rowH.forEach(h => { ir.rowY.push(y); y += h; });
    ir.rulY = y + 2; y += S.layers.rulers ? ir.rulRows.length * 18 + 6 : 0;
    y += 6; ir.bottom = y; S.iran = ir;
    // scrolling lanes
    S.worldTop = y;
    let wy = 0; const lanes = []; let li = 0;
    const lane = (L, pols, ruls, evs) => {
      if (L.grpHead) { L.grpY = wy; wy += 28; }
      L.rows = pack(pols, 12); L.rowH = rowHeights(L.rows, false, L.iranX ? 12 : 14);
      L.rulRows = pack(ruls, 3); L.events = evs; L.idx = li++;
      // ribbons "زیر فرمان …": one per (local polity, empire) overlap
      L.dom = pols.filter(p => p.of).flatMap(p => p.of.map(q => ({ p, q, s: Math.max(p.s, q.s), e: Math.min(p.e, q.e) }))).filter(d => d.e > d.s);
      L.top = wy; let ly = wy + 4;
      L.domY = ly; ly += L.dom.length ? 15 : 0;
      L.evY = ly; ly += S.layers.events && L.events.length ? 16 : 0;
      L.rowY = []; L.rowH.forEach(h => { L.rowY.push(ly); ly += h; });
      if (!L.rows.length) ly += 8;
      L.rulY = ly + 1; ly += S.layers.rulers && L.rulRows.length ? L.rulRows.length * 13 + 3 : 0;
      ly += 5; L.h = ly - wy; wy = ly; lanes.push(L);
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
      PL.grpY = wy; wy += 28; PL.top = wy; PL.pplRows = pack(wp, mobile ? 10 : 16); PL.pplY = wy + 6;
      PL.h = PL.pplRows.length * 15 + 14; wy += PL.h; lanes.push(PL);
    }
    S.lanes = lanes; S.worldH = wy + 24;
    S.maxScroll = Math.max(0, S.worldH - (S.H - S.CAL - S.worldTop));
  };

  // ---------- primitives ----------
  function rr(x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function hit(x0, y0, x1, y1, item, type) { S.hits.push({ x0: Math.min(x0, x1), y0, x1: Math.max(x0, x1), y1, item, type }); }
  function text(t, x, y, font, color, shadow) {
    ctx.font = font; ctx.fillStyle = color;
    if (shadow) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 0.5; }
    ctx.fillText(t, x, y);
    if (shadow) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
  }
  const span = (s, e) => { let a = R.x(s), b = R.x(Math.min(e, TL.NOW)); if (a > b) [a, b] = [b, a]; return [a, b]; };

  // ---------- a state: flowing shape, thickness = territory ----------
  function shapePath(p, xa, xb, yc, big) {
    const v0 = Math.max(xa, -30), v1 = Math.min(xb, S.PW + 30), w = v1 - v0;
    const N = Math.max(2, Math.min(220, Math.ceil(w / 5)));
    const top = [], bot = [];
    for (let i = 0; i <= N; i++) {
      const x = v0 + (w * i) / N, yr = R.yearAt(x);
      let th = thick(areaAt(p.prof, yr), big) / 2;
      const dEnd = Math.min(x - xa, xb - x);
      th *= 0.55 + 0.45 * Math.min(1, dEnd / 10);
      top.push([x, yc - th]); bot.push([x, yc + th]);
    }
    ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]);
    for (let i = 1; i <= N; i++) ctx.lineTo(top[i][0], top[i][1]);
    if (xb <= S.PW + 30) ctx.quadraticCurveTo(xb + 3, yc, bot[N][0], bot[N][1]); else ctx.lineTo(bot[N][0], bot[N][1]);
    for (let i = N - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    if (xa >= -30) ctx.quadraticCurveTo(xa - 3, yc, top[0][0], top[0][1]); else ctx.lineTo(top[0][0], top[0][1]);
    ctx.closePath();
    return { top, bot };
  }
  function drawPolity(p, yc, big, clipTop, clipBot) {
    const [xa, xb] = span(p.s, p.e);
    if (xb < -20 || xa > S.PW + 20) return;
    const w = Math.max(xb - xa, 1.5), focused = S.focus && (S.focus.item === p || (S.focusSet && S.focusSet.has(p)));
    if (w < 5) { const th = thick(p.maxA, big); rr(xa, yc - th / 2, w, th, w / 2); ctx.fillStyle = p.base; ctx.fill(); hit(xa - 2, yc - th / 2, xb + 2, yc + th / 2, p, 'polity'); return; }
    const sh = shapePath(p, xa, xb, yc, big);
    const g = ctx.createLinearGradient(xa, 0, xb, 0);
    g.addColorStop(0, p.g[0]); g.addColorStop(0.5, p.g[1]); g.addColorStop(1, p.g[2]);
    ctx.fillStyle = g; ctx.fill();
    // a soft sheen on the upper half gives the shapes some body without textures
    if (!S.dark) { const hl = ctx.createLinearGradient(0, yc - thick(p.maxA, big) / 2, 0, yc); hl.addColorStop(0, 'rgba(255,255,255,.28)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hl; ctx.fill(); }
    if (p.a && w > 30) {
      const fw = Math.min(24, w * 0.2), left = S.dir === 'ltr';
      ctx.save(); ctx.clip();
      const fade = (x, toR) => { const gg = ctx.createLinearGradient(x, 0, x + (toR ? fw : -fw), 0); gg.addColorStop(0, S.C.bg); gg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gg; ctx.globalAlpha = 0.8; ctx.fillRect(toR ? x - 1 : x - fw, yc - 60, fw + 1, 120); ctx.globalAlpha = 1; };
      if (p.a === true || p.a === 's') fade(left ? xa : xb, left);
      if (p.a === true || p.a === 'e') fade(left ? xb : xa, !left);
      ctx.restore();
    }
    if (focused) { shapePath(p, xa, xb, yc, big); ctx.lineWidth = 2.2; ctx.strokeStyle = S.dark ? '#ffffff' : '#111111'; ctx.stroke(); }
    // label at the widest visible point
    const v0 = Math.max(xa, 0), v1 = Math.min(xb, S.PW);
    let bx = (v0 + v1) / 2, bt = 0;
    for (let i = 0; i < sh.top.length; i += 2) { const t = sh.bot[i][1] - sh.top[i][1], x = sh.top[i][0]; if (x >= v0 && x <= v1 && t > bt + 0.5) { bt = t; bx = x; } }
    const fs = big ? (bt > 26 ? 15 : 12.5) : (bt > 22 ? 13 : 11), font = F(big || bt > 22 ? 800 : 600, fs), tw0 = tw(p.n, font);
    if (v1 - v0 > tw0 + 12 && bt >= 10) {
      const cx = Math.min(v1 - tw0 / 2 - 6, Math.max(v0 + tw0 / 2 + 6, bx));
      text(p.n, cx, yc + 0.5, font, p.txt, !p.light);
    }
    const hh = thick(p.maxA, big) / 2;
    if (yc > clipTop && yc < clipBot) hit(xa, yc - hh, xb, yc + hh, p, 'polity');
  }

  // ---------- dominion: faint column over the lane + a labelled ribbon in the empire's colour ----------
  function drawRibbon(d, top, h, y) {
    const [xa, xb] = span(d.s, d.e); if (xb < 0 || xa > S.PW) return;
    const q = d.q, hot = S.focusSet && S.focusSet.has(d.p), w = Math.max(xb - xa, 2);
    ctx.fillStyle = hsl(q.hue, 70, S.dark ? 45 : 55, hot ? 0.2 : 0.09); ctx.fillRect(xa, top, w, h);
    ctx.fillStyle = hsl(q.hue, 65, S.dark ? 38 : 46, hot ? 1 : 0.85); rr(xa, y, w, 13, 3); ctx.fill();
    const label = 'زیر فرمان ' + q.n, font = F(700, 10), v0 = Math.max(xa, 0), v1 = Math.min(xb, S.PW);
    const t = tw(label, font) + 10 <= v1 - v0 ? label : (tw(q.n, font) + 10 <= v1 - v0 ? q.n : '');
    if (t) text(t, (v0 + v1) / 2, y + 7, font, '#ffffff');
    if (y > S.worldTop && y < S.H - S.CAL) hit(xa, y, xa + w, y + 13, q, 'polity');
  }

  // ---------- rulers ----------
  function drawRuler(r, y, h, iran, idx) {
    const [xa, xb] = span(r.s, r.e);
    if (xb < -10 || xa > S.PW + 10) return;
    const p = TL.polityById[r.pid], w = Math.max(xb - xa, 1), focused = S.focus && S.focus.item === r;
    const hue = p ? p.hue : 220, sat = p && p.ir ? 55 : 30;
    if (w >= 24) {
      rr(xa + 0.8, y, w - 1.6, h, 4);
      ctx.fillStyle = hsl(hue, sat, (S.dark ? 30 : 86) - (idx % 2) * 5); ctx.fill();
      const font = F(600, iran ? 11 : 10), v0 = Math.max(xa, 0), v1 = Math.min(xb, S.PW);
      if (v1 - v0 > tw(r.n, font) + 8) text(r.n, (v0 + v1) / 2, y + h / 2 + 0.5, font, S.dark ? hsl(hue, 30, 88) : hsl(hue, 45, 22));
    } else {
      ctx.fillStyle = hsl(hue, sat + 10, S.dark ? 55 : 50 + (idx % 2) * 14);
      ctx.fillRect(xa + 0.4, y + h / 2 - 2, Math.max(w - 0.8, 1), 4);
    }
    if (focused) { rr(xa - 1, y - 1, Math.max(w, 3) + 2, h + 2, 4); ctx.lineWidth = 2; ctx.strokeStyle = S.dark ? '#fff' : '#111'; ctx.stroke(); }
    hit(xa, y - 2, xa + Math.max(w, 4), y + h + 2, r, 'ruler');
  }

  // ---------- events ----------
  function drawEvents(evs, yMid, iran, clipTop, clipBot) {
    const placed = [];
    evs.slice().sort((a, b) => b.w - a.w || a.y - b.y).forEach(e => {
      const x = R.x(e.y); if (x < -8 || x > S.PW + 8) return;
      const r = iran ? (e.w >= 3 ? 4.8 : e.w === 2 ? 3.8 : 3) : (e.w >= 3 ? 4.2 : e.w === 2 ? 3.3 : 2.7);
      const col = (TL.KIND[e.k] || TL.KIND.pol).c, focused = S.focus && S.focus.item === e;
      let x2 = x;
      if (e.y2 && e.y2 > e.y) { x2 = R.x(e.y2); ctx.fillStyle = col; ctx.globalAlpha = 0.3; rr(Math.min(x, x2), yMid - 2.5, Math.abs(x2 - x), 5, 2.5); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.beginPath(); ctx.arc(x, yMid, r + (focused ? 1.5 : 0), 0, 7); ctx.fillStyle = col; ctx.fill();
      ctx.lineWidth = focused ? 2 : 1.3; ctx.strokeStyle = focused ? (S.dark ? '#fff' : '#111') : (S.dark ? '#1a1a1d' : '#ffffff'); ctx.stroke();
      if (yMid > clipTop && yMid < clipBot) hit(Math.min(x, x2) - r - 3, yMid - r - 4, Math.max(x, x2) + r + 3, yMid + r + 4, e, 'event');
      if (e.w < (iran ? 2 : 3) && !(S.k > 12 && e.w >= 2)) return;
      const font = F(e.w >= 3 ? 700 : 500, iran ? 10.5 : 10), w = tw(e.n, font);
      if (iran) {
        const x0 = x - w / 2 - 6, x1 = x + w / 2 + 6;
        if (x1 > 0 && x0 < S.PW && placed.every(([a, b]) => x1 < a || x0 > b)) { placed.push([x0, x1]); text(e.n, x, yMid - r - 7, font, e.w >= 3 ? S.C.ink : S.C.ink2); }
      } else {
        const x0 = x + r + 3, x1 = x0 + w + 8;
        if (x1 > 0 && x0 < S.PW && placed.every(([a, b]) => x1 < a || x0 > b)) { placed.push([x - r - 2, x1]); ctx.textAlign = 'left'; text(e.n, x0, yMid + 0.5, font, S.C.ink); ctx.textAlign = 'center'; }
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
        const col = (TL.KIND[TL.PKINDK[p.k]] || TL.KIND.pol).c, focused = S.focus && S.focus.item === p;
        ctx.fillStyle = col; ctx.globalAlpha = focused ? 1 : 0.75; rr(xa, y - (focused ? 2 : 1.5), Math.max(xb - xa, 3), focused ? 4 : 3, 1.5); ctx.fill(); ctx.globalAlpha = 1;
        const font = F(iran ? 600 : 500, 10.5), w = tw(p.n, font), v0 = Math.max(xa, 0), v1 = Math.min(xb, S.PW);
        if (v1 - v0 > w + 10) { const cx = (v0 + v1) / 2; ctx.fillStyle = S.dark ? '#1a1a1d' : 'rgba(255,255,255,.92)'; rr(cx - w / 2 - 5, y - 7, w + 10, 14, 7); ctx.fill(); text(p.n, cx, y + 0.5, font, S.C.ink); }
        hit(xa - 2, y - 7, xb + 2, y + 7, p, 'person');
      });
    });
  }

  // ---------- axis + calendar bands ----------
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
    const g = ctx.createLinearGradient(0, 0, S.W, 0);
    g.addColorStop(0, '#5b2c9a'); g.addColorStop(0.55, '#3a3f9e'); g.addColorStop(1, '#2457b8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S.W, S.AX);
    TL.eras.forEach(er => {
      const [xa, xb] = span(er.s, er.e); if (xb < 0 || xa > S.PW) return;
      const v0 = Math.max(xa, 0), v1 = Math.min(xb, S.PW), font = F(500, 10.5), w = tw(er.n, font);
      if (xa > 0) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(xa, 4, 1, 12); }
      if (v1 - v0 > w + 14) text(er.n, (v0 + v1) / 2, 10.5, font, 'rgba(255,255,255,.72)');
    });
    ticks.forEach(t => {
      const x = R.x(t.y), major = t.y % (t.st * 5) === 0 || t.st >= 1000;
      ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(x, S.AX - 5, 1, 5);
      text(yearTxt(t.y), x, 29, F(major ? 800 : 600, major ? 14 : 12), '#ffffff');
    });
  }
  function drawCalendar(ticks) {
    const y0 = S.H - S.CAL; ctx.fillStyle = S.dark ? '#221b33' : '#efe9fa'; ctx.fillRect(0, y0, S.W, S.CAL);
    ctx.fillStyle = S.dark ? '#3a2f55' : '#d9cff0'; ctx.fillRect(0, y0, S.W, 1);
    ticks.forEach(t => {
      if (t.y < 623) return; const c = TL.calendars(t.y); if (!c) return;
      text(c.sh.split('–').pop() + ' ش', R.x(t.y), y0 + 9, F(600, 10), S.dark ? '#cbbcf2' : '#4a2f8f');
      text(c.ah.split('–')[0] + ' ق', R.x(t.y), y0 + 20, F(400, 9), S.dark ? '#9d93b8' : '#7d6aa8');
    });
  }
  function laneBg(L) {
    const grp = GRP[L.reg.grp] || { h: 30 };
    if (L.reg.id === 'people') return S.dark ? '#18181b' : '#f6f5f2';
    const alt = (L.idx % 2) * 1.6;
    return S.dark ? hsl(grp.h, 22, 13 + alt) : hsl(grp.h, L.iranX ? 70 : 62, 95.4 - alt);
  }

  // ---------- frame ----------
  R.draw = function () {
    if (!ctx) return;
    const { W, H, PW } = S; S.hits = [];
    // selecting an empire (or one of its lands) lights up every land it ruled
    const fi = S.focus && S.focus.type === 'polity' ? S.focus.item : null, emp = fi && (fi.dom ? fi : TL.overlord(fi));
    S.focusSet = emp && emp.dom ? new Set([emp, ...emp.dom]) : null;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
    ctx.fillStyle = S.C.bg; ctx.fillRect(0, 0, W, H);
    const ticks = R.ticks(), ir = S.iran, wTop = S.worldTop, wBot = H - S.CAL;
    const grid = (y0, y1) => ticks.forEach(t => { ctx.fillStyle = S.dark ? 'rgba(255,255,255,.06)' : 'rgba(40,30,80,.07)'; ctx.fillRect(R.x(t.y), y0, 1, y1 - y0); });
    // world lanes
    ctx.save(); ctx.beginPath(); ctx.rect(0, wTop, W, wBot - wTop); ctx.clip();
    const oy = wTop - S.scrollY;
    S.lanes.forEach(L => {
      const top = oy + L.top;
      if (L.grpHead) {
        const gy = oy + L.grpY;
        if (gy < wBot && gy + 28 > wTop) {
          const grp = GRP[L.reg.grp] || { strong: S.C.ink2 };
          ctx.fillStyle = S.C.surface; ctx.fillRect(0, gy, W, 28);
          ctx.textAlign = 'right'; text(L.grpHead, PW - 14, gy + 15, F(800, 13), grp.strong); ctx.textAlign = 'center';
          ctx.fillStyle = grp.strong; ctx.globalAlpha = 0.5; ctx.fillRect(0, gy + 27, W, 1); ctx.globalAlpha = 1;
        }
      }
      if (top > wBot || top + L.h < wTop) return;
      ctx.fillStyle = laneBg(L); ctx.fillRect(0, top, PW, L.h);
      if (L.dom) L.dom.forEach(d => drawRibbon(d, top, L.h, oy + L.domY));
    });
    grid(wTop, wBot);
    S.lanes.forEach(L => {
      const top = oy + L.top; if (top > wBot || top + L.h < wTop) return;
      if (L.people) { drawPeople(L.pplRows, oy + L.pplY, !!L.iranX); return; }
      L.rows.forEach((row, ri) => row.forEach(p => drawPolity(p, oy + L.rowY[ri] + L.rowH[ri] / 2, false, wTop, wBot)));
      if (S.layers.rulers) L.rulRows.forEach((row, ri) => row.forEach((r, i) => drawRuler(r, oy + L.rulY + ri * 13, 11, false, i)));
      if (S.layers.events && L.events.length) drawEvents(L.events, oy + L.evY + 7, false, wTop, wBot);
    });
    ctx.restore();
    // Iran (pinned)
    ctx.save(); ctx.beginPath(); ctx.rect(0, ir.top, W, ir.bottom - ir.top); ctx.clip();
    const ig = ctx.createLinearGradient(0, ir.top, 0, ir.bottom);
    ig.addColorStop(0, S.dark ? '#16203a' : '#eef3ff'); ig.addColorStop(1, S.dark ? '#121a30' : '#e4ecfd');
    ctx.fillStyle = ig; ctx.fillRect(0, ir.top, W, ir.bottom - ir.top);
    grid(ir.top, ir.bottom);
    TL.iranEras.forEach((er, i) => {
      const [xa, xb] = span(er.s, er.e); if (xb < 0 || xa > PW) return;
      ctx.fillStyle = i % 2 ? 'rgba(44,91,208,.10)' : 'rgba(44,91,208,.05)'; ctx.fillRect(xa, ir.eraY, xb - xa, 16);
      const v0 = Math.max(xa, 0), v1 = Math.min(xb, PW), font = F(700, 10.5), w = tw(er.n, font);
      if (v1 - v0 > w + 14) text(er.n, (v0 + v1) / 2, ir.eraY + 8.5, font, S.dark ? '#a9c0ff' : '#1c3d8f');
    });
    if (S.layers.links) drawLinks(ir);
    ir.rows.forEach((row, ri) => row.forEach(p => drawPolity(p, ir.rowY[ri] + ir.rowH[ri] / 2, true, ir.top, ir.bottom)));
    if (S.layers.rulers) ir.rulRows.forEach((row, ri) => row.forEach((r, i) => drawRuler(r, ir.rulY + ri * 18, 15, true, i)));
    if (S.layers.events) drawEvents(ir.events, ir.evY + 18, true, ir.top, ir.bottom);
    ctx.restore();
    ctx.fillStyle = '#2c5bd0'; ctx.fillRect(0, ir.bottom - 2, W, 2);
    // focus column
    if (S.focus) {
      const [xa, xb] = span(S.focus.s, S.focus.e);
      ctx.fillStyle = S.dark ? 'rgba(255,255,255,.07)' : 'rgba(20,20,60,.06)'; ctx.fillRect(xa, S.AX, Math.max(xb - xa, 2), H - S.AX - S.CAL);
      ctx.fillStyle = S.dark ? '#fff' : '#111'; ctx.globalAlpha = 0.45; ctx.fillRect(xa, S.AX, 1, H - S.AX - S.CAL); ctx.fillRect(xb, S.AX, 1, H - S.AX - S.CAL); ctx.globalAlpha = 1;
    }
    drawAxis(ticks); drawCalendar(ticks); drawLabels(oy);
    if (S.pinYear != null) cursor(R.x(S.pinYear), '#e0452e', TL.yearLabel(Math.floor(S.pinYear)));
    if (S.hoverX != null && S.hoverX < PW) cursor(S.hoverX, S.dark ? '#ffffff' : '#111111', TL.yearLabel(Math.floor(R.yearAt(S.hoverX))), true);
  };
  function cursor(x, col, label, faint) {
    if (x < 0 || x > S.PW) return;
    ctx.fillStyle = col; ctx.globalAlpha = faint ? 0.35 : 0.85; ctx.fillRect(x - 0.5, S.AX, 1.2, S.H - S.AX - S.CAL); ctx.globalAlpha = 1;
    const font = F(800, 11.5), w = tw(label, font) + 16, bx = Math.min(S.PW - w / 2 - 2, Math.max(w / 2 + 2, x));
    rr(bx - w / 2, S.AX + 4, w, 20, 10); ctx.fillStyle = col; ctx.fill();
    text(label, bx, S.AX + 14.5, font, col === '#ffffff' ? '#111' : '#ffffff');
  }
  function drawLinks(ir) {
    TL.links.forEach(chain => {
      for (let i = 0; i < chain.length - 1; i++) {
        const a = TL.polityById[chain[i]], b = TL.polityById[chain[i + 1]]; if (!a || !b || a.row == null || b.row == null) continue;
        if (a.lv >= 3 || b.lv >= 3 || ir.rowY[a.row] == null || ir.rowY[b.row] == null) continue;
        const xa = R.x(Math.min(a.e, b.s)), xb = R.x(b.s), ya = ir.rowY[a.row] + ir.rowH[a.row] / 2, yb = ir.rowY[b.row] + ir.rowH[b.row] / 2;
        if (Math.max(xa, xb) < 0 || Math.min(xa, xb) > S.PW) continue;
        ctx.strokeStyle = '#2c5bd0'; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(xa, ya); const mx = (xa + xb) / 2;
        if (Math.abs(xb - xa) < 3) ctx.lineTo(xb, yb); else ctx.bezierCurveTo(mx, ya, mx, yb, xb, yb);
        ctx.stroke(); ctx.globalAlpha = 1;
      }
    });
  }
  function drawLabels(oy) {
    const x0 = S.PW, W = S.W, ir = S.iran;
    ctx.fillStyle = S.C.surface; ctx.fillRect(x0, 0, S.LW, S.H);
    // Iran block label
    ctx.fillStyle = '#2c5bd0'; ctx.fillRect(x0, ir.top, S.LW, ir.bottom - ir.top);
    ctx.textAlign = 'right';
    text('ایران', W - 14, ir.top + 30, F(900, S.W < 640 ? 18 : 22), '#ffffff');
    text('محور نقشه', W - 14, ir.top + 54, F(400, 11), 'rgba(255,255,255,.75)');
    [['رویدادها', ir.evY + 18, S.layers.events], ['دودمان‌ها', ir.rowY[0] + ir.rowH[0] / 2, true], ['فرمانروایان', ir.rulY + 8, S.layers.rulers && ir.rulRows.length]].forEach(([t, y, on]) => {
      if (on && y > ir.top + 66 && y < ir.bottom - 6) text(t, W - 14, y, F(500, 10.5), 'rgba(255,255,255,.8)');
    });
    ctx.save(); ctx.beginPath(); ctx.rect(x0, S.worldTop, S.LW, S.H - S.CAL - S.worldTop); ctx.clip();
    S.lanes.forEach(L => {
      const top = oy + L.top; if (top > S.H || top + L.h < S.worldTop) return;
      const grp = GRP[L.reg.grp] || { strong: S.C.muted };
      ctx.fillStyle = grp.strong; ctx.fillRect(W - 6, top + 2, 4, L.h - 4);
      const cy = top + Math.min(L.h / 2, 16);
      const font = F(L.iranX ? 700 : 600, S.W < 640 ? 10.5 : 12);
      let name = L.reg.n; while (tw(name, font) > S.LW - 26 && name.length > 4) name = name.slice(0, -2);
      if (name !== L.reg.n) name += '…';
      text(name, W - 14, cy, font, L.iranX ? '#1c3d8f' : S.C.ink);
      if (L.h > 40 && S.W >= 640) { ctx.direction = 'ltr'; text(L.reg.en, W - 14, cy + 15, F(400, 9.5), S.C.muted); ctx.direction = 'rtl'; }
      ctx.fillStyle = S.C.line; ctx.fillRect(x0, top + L.h - 1, S.LW, 1);
      hit(x0, top, W, top + L.h, L.reg, 'region');
    });
    ctx.restore();
    ctx.fillStyle = '#2457b8'; ctx.fillRect(x0, 0, S.LW, S.AX);
    ctx.fillStyle = S.dark ? '#221b33' : '#efe9fa'; ctx.fillRect(x0, S.H - S.CAL, S.LW, S.CAL);
    text('سال میلادی', W - 14, 29, F(700, 11.5), '#ffffff');
    text('خورشیدی · قمری', W - 14, S.H - S.CAL + 13, F(600, 10), S.dark ? '#cbbcf2' : '#4a2f8f');
    ctx.textAlign = 'center';
  }

  // ---------- canvas setup + hit test ----------
  R.init = function (canvas) { cv = canvas; ctx = cv.getContext('2d'); };
  R.resize = function () {
    const r = cv.getBoundingClientRect(); S.dpr = Math.min(window.devicePixelRatio || 1, 2);
    S.W = Math.max(320, r.width); S.H = Math.max(300, r.height);
    cv.width = Math.round(S.W * S.dpr); cv.height = Math.round(S.H * S.dpr);
  };
  R.hitTest = function (x, y) { for (let i = S.hits.length - 1; i >= 0; i--) { const h = S.hits[i]; if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return h; } return null; };
  R.clearCache = () => mcache.clear();
})();

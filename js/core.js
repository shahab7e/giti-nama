/* گیتی‌نما — data registry + shared helpers. Data files call TL.add*(). Years: negative = BC (‎-550 = ۵۵۰ پ.م). */
(function () {
  const TL = {
    regions: [], regionById: {}, polities: [], polityById: {}, rulers: [], events: [], people: [],
    eras: [], iranEras: [], chips: [], links: [], errors: []
  };
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  TL.own = own;

  // ---------- "now": taken from today's date, so the site never goes stale ----------
  // Data marks anything still ongoing (a living person, a sitting ruler, an existing state) with end year 2027.
  const today = new Date();
  TL.NOW = Math.max(2026.9, today.getFullYear() + (today - new Date(today.getFullYear(), 0, 1)) / 31557600000);
  TL.ONGOING = 2027;
  const endOf = (e) => (e != null && e >= TL.ONGOING ? Math.max(e, TL.NOW + 0.1) : e);

  // ---------- registry ----------
  TL.addRegions = function (arr) {
    arr.forEach((r, i) => {
      const reg = Object.assign({ order: TL.regions.length, grp: '' }, r);
      TL.regions.push(reg); TL.regionById[reg.id] = reg;
    });
  };
  // row: [id, name, en, start, end, opts]  opts: {p:peak, a:approx(true|'s'|'e'), cap, d, k:kind, lv:1..3, c:color, sub:'iran-local'}
  TL.addPolities = function (regionId, rows) {
    rows.forEach(row => {
      const [id, n, en, s, e0, o = {}] = row, e = endOf(e0);
      if (own(TL.polityById, id)) TL.errors.push('duplicate polity id: ' + id);
      const p = { id, r: regionId, n, en, s, e, p: o.p, a: o.a || false, cap: o.cap || '', d: o.d || '',
        k: o.k || 'state', lv: o.lv || 2, c: o.c || null, idx: 0, rulers: [] };
      TL.polities.push(p); TL.polityById[id] = p;
    });
  };
  // row: [name, en, start, end, opts]  opts: {d, a}
  TL.addRulers = function (polityId, rows) {
    rows.forEach(row => {
      const [n, en, s, e0, o = {}] = row, e = endOf(e0);
      const r = { pid: polityId, n, en, s, e, d: o.d || '', a: o.a || false, t: o.t || '' };
      TL.rulers.push(r);
    });
  };
  // row: [year, name, opts]  opts: {y2, k:'pol'|'war'|'cul'|'sci'|'rel'|'dis'|'eco', d, w:1..3, a, en}
  TL.addEvents = function (regionId, rows) {
    rows.forEach(row => {
      const [y, n, o = {}] = row;
      TL.events.push({ r: regionId, y, y2: o.y2, n, en: o.en || '', k: o.k || 'pol', d: o.d || '', w: o.w || 2, a: o.a || false });
    });
  };
  // row: [name, en, born, died, kind, opts]  kind: poet|sci|phil|rel|art|pol|mil|exp ; opts: {d, a}
  TL.addPeople = function (regionId, rows) {
    rows.forEach(row => {
      const [n, en, b, dd, k, o = {}] = row;
      TL.people.push({ r: regionId, n, en, s: b, e: endOf(dd), k: k || 'pol', d: o.d || '', a: o.a || false });
    });
  };
  TL.extent = {};
  TL.setExtent = (m) => Object.assign(TL.extent, m);
  TL.addEras = (rows) => rows.forEach(([n, s, e, c]) => TL.eras.push({ n, s, e, c }));
  TL.addIranEras = (rows) => rows.forEach(([n, s, e, c]) => TL.iranEras.push({ n, s, e, c }));
  TL.addChips = (rows) => rows.forEach(([n, s, e, iran]) => TL.chips.push({ n, s, e, iran: !!iran }));
  TL.addLinks = (ids) => TL.links.push(ids);

  // ---------- number + date formatting ----------
  const FA = '۰۱۲۳۴۵۶۷۸۹';
  TL.fa = (v) => String(v).replace(/[0-9]/g, d => FA[d]);
  // fractional years mark a month inside the year (1882.7 = autumn 1882), so AD years floor.
  // There is no year zero: anything in (-1, 1) is shown as ۱ پ.م or ۱ م.
  const yr = (y) => (y < 0 ? Math.max(1, Math.round(-y)) : Math.max(1, Math.floor(y + 1e-9)));
  // the whole calendar year a point on the axis falls in (signed, never 0): -480.3 → -480, 0.4 → 1
  TL.yearInt = (y) => (y < 0 ? -yr(y) : yr(y));
  // move a year by n calendar years, skipping the missing year zero (30 پ.م + 50 = 21 م)
  TL.addYears = function (y, n) {
    const r = y + n;
    if (y < 0 && r >= 0) return r + 1;
    if (y >= 1 && r < 1) return r - 1;
    return r;
  };
  TL.yearLabel = function (y, approx) {
    const pre = approx ? 'حدود ' : '';
    if (y < 0) return pre + TL.fa(yr(y)) + ' پ.م';
    return pre + TL.fa(yr(y)) + ' م';
  };
  TL.yearShort = (y) => (y < 0 ? TL.fa(yr(y)) + ' پ.م' : TL.fa(yr(y)));
  TL.isNow = (e) => e >= TL.NOW - 1e-6;
  TL.spanLabel = function (s, e, a) {
    const as = a === true || a === 's', ae = a === true || a === 'e';
    if (s < 0 && e < 0) return (as ? 'حدود ' : '') + TL.fa(yr(s)) + ' تا ' + (ae ? 'حدود ' : '') + TL.fa(yr(e)) + ' پ.م';
    return TL.yearLabel(s, as) + ' تا ' + (TL.isNow(e) ? 'اکنون' : TL.yearLabel(e, ae));
  };
  // no year zero: 1 BC is followed by AD 1
  TL.duration = (s, e) => Math.round(e - s - (s < 0 && e > 0 ? 1 : 0));
  // Solar Hijri (Nowruz ≈ 21 March) and Lunar Hijri approximations; only from 622 CE
  TL.calendars = function (y) {
    y = Math.floor(y);
    if (y < 622) return null;
    const sh1 = y - 622, sh2 = y - 621;
    const ah1 = Math.max(1, Math.floor((y - 622) * 1.030684 + 0.46)), ah2 = Math.floor((y + 1 - 622) * 1.030684 + 0.46);
    return {
      sh: sh1 <= 0 ? TL.fa(Math.max(sh2, 1)) : TL.fa(sh1) + '–' + TL.fa(sh2),
      ah: ah1 >= ah2 ? TL.fa(ah1) : TL.fa(ah1) + '–' + TL.fa(ah2)
    };
  };

  // ---------- time scale: piecewise "compressed" warp (deep past gets less width) or linear ----------
  TL.T0 = -10000; TL.T1 = Math.max(2030, Math.ceil(TL.NOW) + 3);
  const WARP = [[-10000, 0], [-4000, 70], [-3000, 160], [-1000, 430], [0, 650], [1000, 870], [1500, 1075], [1800, 1240], [1900, 1325], [2030, 1425]];
  const LIN = [[-10000, 0], [2030, 1425]];
  TL.scaleMode = 'warp';
  const pts = () => (TL.scaleMode === 'warp' ? WARP : LIN);
  TL.u = function (y) {
    const P = pts();
    if (y <= P[0][0]) return P[0][1] + (y - P[0][0]) * (P[1][1] - P[0][1]) / (P[1][0] - P[0][0]);
    for (let i = 1; i < P.length; i++) {
      if (y <= P[i][0]) { const [y0, u0] = P[i - 1], [y1, u1] = P[i]; return u0 + (y - y0) * (u1 - u0) / (y1 - y0); }
    }
    const n = P.length - 1; return P[n][1] + (y - P[n][0]) * (P[n][1] - P[n - 1][1]) / (P[n][0] - P[n - 1][0]);
  };
  TL.yOfU = function (u) {
    const P = pts();
    for (let i = 1; i < P.length; i++) {
      if (u <= P[i][1] || i === P.length - 1) { const [y0, u0] = P[i - 1], [y1, u1] = P[i]; return y0 + (u - u0) * (y1 - y0) / (u1 - u0); }
    }
    return P[P.length - 1][0];
  };
  TL.U0 = () => TL.u(TL.T0); TL.U1 = () => TL.u(TL.T1);

  // ---------- small utils ----------
  TL.hash = function (str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  TL.norm = (s) => (s || '').toLowerCase().replace(/[ً-ٰٟ]/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌\s\-ـ]+/g, ' ').trim();
  TL.KIND = {
    pol: { n: 'سیاسی', c: '#d8ad55' }, war: { n: 'جنگ و نبرد', c: '#e0705f' }, cul: { n: 'فرهنگ و هنر', c: '#45bdb4' },
    sci: { n: 'علم و فناوری', c: '#6fa0ef' }, rel: { n: 'دین و اندیشه', c: '#c58be0' }, dis: { n: 'بلا و فاجعه', c: '#9aa3b5' },
    eco: { n: 'اقتصاد و کشف', c: '#7cc47a' }
  };
  TL.PKIND = { poet: 'شاعر و ادیب', sci: 'دانشمند', phil: 'فیلسوف و اندیشمند', rel: 'پیشوای دینی', art: 'هنرمند و معمار', pol: 'سیاستمدار', mil: 'فرمانده', exp: 'جهانگرد و کاشف' };
  TL.PKINDK = { poet: 'cul', sci: 'sci', phil: 'rel', rel: 'rel', art: 'cul', pol: 'pol', mil: 'war', exp: 'eco' };

  // Shared crisp cartographic vector markers (distinct shapes for wars, figures, capitals & every event kind!)
  // kind: 'capital' | 'person' | 'war' | 'pol' | 'cul' | 'sci' | 'rel' | 'dis' | 'eco'
  TL.drawGlyph = function (ctx, kind, x, y, r, fill, halo, dark) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const bg = halo || (dark ? '#0b0f17' : '#f7f1e2');

    if (kind === 'war') {
      // Classic antique atlas crossed blades inside a crisp crimson medallion
      const br = r + 2.0;
      ctx.beginPath(); ctx.arc(0, 0, br, 0, Math.PI * 2);
      ctx.fillStyle = dark ? 'rgba(26,12,12,.86)' : 'rgba(252,246,236,.92)';
      ctx.fill();
      ctx.lineWidth = 1.25; ctx.strokeStyle = fill; ctx.stroke();
      const b = r * 0.88, g = r * 0.42;
      ctx.strokeStyle = fill; ctx.lineWidth = Math.max(1.35, r * 0.30);
      ctx.beginPath();
      ctx.moveTo(-b, -b); ctx.lineTo(b, b);
      ctx.moveTo(b, -b); ctx.lineTo(-b, b);
      ctx.stroke();
      // Tiny sword crossguards near lower-left / lower-right hilts
      ctx.lineWidth = Math.max(1.0, r * 0.22);
      ctx.beginPath();
      ctx.moveTo(-g - 1.4, g - 1.4); ctx.lineTo(-g + 1.4, g + 1.4);
      ctx.moveTo(g + 1.4, g - 1.4); ctx.lineTo(g - 1.4, g + 1.4);
      ctx.stroke();
    } else if (kind === 'person') {
      // Crisp 5-point star for historical figures
      const outer = r * 1.28, inner = r * 0.54;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? outer : inner;
        if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
        else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.lineWidth = 2.2; ctx.strokeStyle = bg; ctx.stroke();
      ctx.fillStyle = fill; ctx.fill();
    } else if (kind === 'capital') {
      // Classic atlas concentric bullseye ring for capital cities
      ctx.beginPath(); ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2);
      ctx.fillStyle = bg; ctx.fill();
      ctx.lineWidth = 1.3; ctx.strokeStyle = fill; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, Math.max(1.4, r * 0.48), 0, Math.PI * 2);
      ctx.fillStyle = fill; ctx.fill();
    } else if (kind === 'pol') {
      // Upright diamond (political milestone / treaty)
      const d = r * 1.15;
      ctx.beginPath(); ctx.moveTo(0, -d); ctx.lineTo(d * 0.85, 0); ctx.lineTo(0, d); ctx.lineTo(-d * 0.85, 0); ctx.closePath();
      ctx.lineWidth = 2.0; ctx.strokeStyle = bg; ctx.stroke();
      ctx.fillStyle = fill; ctx.fill();
    } else if (kind === 'cul') {
      // 4-point quatrefoil star (culture, poetry, architecture)
      const o = r * 1.24, inn = r * 0.42;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 4;
        const rad = i % 2 === 0 ? o : inn;
        if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
        else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.lineWidth = 2.0; ctx.strokeStyle = bg; ctx.stroke();
      ctx.fillStyle = fill; ctx.fill();
    } else if (kind === 'sci') {
      // Crisp hexagon (science & technology)
      const h = r * 1.12;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        if (i === 0) ctx.moveTo(Math.cos(a) * h, Math.sin(a) * h);
        else ctx.lineTo(Math.cos(a) * h, Math.sin(a) * h);
      }
      ctx.closePath();
      ctx.lineWidth = 2.0; ctx.strokeStyle = bg; ctx.stroke();
      ctx.fillStyle = fill; ctx.fill();
    } else if (kind === 'dis') {
      // Crisp warning triangle (earthquake, plague, disaster)
      const t = r * 1.22;
      ctx.beginPath(); ctx.moveTo(0, -t); ctx.lineTo(t * 0.96, t * 0.78); ctx.lineTo(-t * 0.96, t * 0.78); ctx.closePath();
      ctx.lineWidth = 2.0; ctx.strokeStyle = bg; ctx.stroke();
      ctx.fillStyle = fill; ctx.fill();
    } else if (kind === 'rel') {
      // Sacred 4-arm rounded cross / rosette (religion & philosophy)
      const arm = r * 1.05, th = Math.max(1.5, r * 0.42);
      ctx.beginPath();
      ctx.moveTo(-th, -arm); ctx.lineTo(th, -arm); ctx.lineTo(th, -th);
      ctx.lineTo(arm, -th); ctx.lineTo(arm, th); ctx.lineTo(th, th);
      ctx.lineTo(th, arm); ctx.lineTo(-th, arm); ctx.lineTo(-th, th);
      ctx.lineTo(-arm, th); ctx.lineTo(-arm, -th); ctx.lineTo(-th, -th);
      ctx.closePath();
      ctx.lineWidth = 1.9; ctx.strokeStyle = bg; ctx.stroke();
      ctx.fillStyle = fill; ctx.fill();
    } else {
      // Rounded square (economy, trade, exploration)
      const s = r * 0.92;
      ctx.beginPath(); ctx.rect(-s, -s, s * 2, s * 2);
      ctx.lineWidth = 2.0; ctx.strokeStyle = bg; ctx.stroke();
      ctx.fillStyle = fill; ctx.fill();
    }
    ctx.restore();
  };

  window.TL = TL;
})();

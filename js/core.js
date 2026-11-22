/* جام جهان‌نما — data registry + shared helpers. Data files call TL.add*(). Years: negative = BC (‎-550 = ۵۵۰ پ.م). */
(function () {
  const TL = {
    regions: [], regionById: {}, polities: [], polityById: {}, rulers: [], events: [], people: [],
    eras: [], iranEras: [], chips: [], links: [], errors: []
  };
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

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
      const [id, n, en, s, e, o = {}] = row;
      if (own(TL.polityById, id)) TL.errors.push('duplicate polity id: ' + id);
      const p = { id, r: regionId, n, en, s, e, p: o.p, a: o.a || false, cap: o.cap || '', d: o.d || '',
        k: o.k || 'state', lv: o.lv || 2, c: o.c || null, idx: 0, rulers: [] };
      TL.polities.push(p); TL.polityById[id] = p;
    });
  };
  // row: [name, en, start, end, opts]  opts: {d, a}
  TL.addRulers = function (polityId, rows) {
    rows.forEach(row => {
      const [n, en, s, e, o = {}] = row;
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
      TL.people.push({ r: regionId, n, en, s: b, e: dd, k: k || 'pol', d: o.d || '', a: o.a || false });
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
  // fractional years mark a month inside the year (1882.7 = autumn 1882), so AD years floor
  const yr = (y) => (y < 0 ? Math.round(-y) : Math.floor(y + 1e-9));
  TL.yearLabel = function (y, approx) {
    const pre = approx ? 'حدود ' : '';
    if (y < 0) return pre + TL.fa(yr(y)) + ' پ.م';
    return pre + TL.fa(yr(y)) + ' م';
  };
  TL.yearShort = (y) => (y < 0 ? TL.fa(yr(y)) + ' پ.م' : TL.fa(yr(y)));
  TL.spanLabel = function (s, e, a) {
    const as = a === true || a === 's', ae = a === true || a === 'e';
    if (s < 0 && e < 0) return (as ? 'حدود ' : '') + TL.fa(-s) + ' تا ' + (ae ? 'حدود ' : '') + TL.fa(-e) + ' پ.م';
    return TL.yearLabel(s, as) + ' تا ' + (e >= 2026.5 ? 'اکنون' : TL.yearLabel(e, ae));
  };
  // no year zero: 1 BC is followed by AD 1
  TL.duration = (s, e) => Math.round(e - s - (s < 0 && e > 0 ? 1 : 0));
  // Solar Hijri (Nowruz ≈ 21 March) and Lunar Hijri approximations; only from 622 CE
  TL.calendars = function (y) {
    y = Math.floor(y);
    if (y < 622) return null;
    const sh1 = y - 622, sh2 = y - 621;
    const ah1 = Math.floor((y - 622) * 1.030684 + 0.46), ah2 = Math.floor((y + 1 - 622) * 1.030684 + 0.46);
    return {
      sh: sh1 <= 0 ? TL.fa(Math.max(sh2, 1)) : TL.fa(sh1) + '–' + TL.fa(sh2),
      ah: ah1 === ah2 ? TL.fa(Math.max(ah1, 1)) : TL.fa(Math.max(ah1, 1)) + '–' + TL.fa(ah2)
    };
  };

  // ---------- time scale: piecewise "compressed" warp (deep past gets less width) or linear ----------
  TL.T0 = -10000; TL.T1 = 2030; TL.NOW = 2026.9;
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

  window.TL = TL;
})();

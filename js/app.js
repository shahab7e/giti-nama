/* Interaction controller uniting the Real Natural Earth Space-Time Map (M),
   the Full Interactive Histomap Timeline (R), Live Playback, Resizable Split,
   Full Search (with year-jump), Region Filter, Sync-Slice Dossier, and URL Hash State. */
(function () {
  const S = R.S, MS = M.S, $ = (id) => document.getElementById(id);
  const cv = $('tl'), mcv = $('map'), tip = $('tip'), mm = $('minimap'), mctx = mm.getContext('2d');
  let playing = false, playSpeed = 1, lastFrameT = performance.now();
  let tlDirty = true;

  R.init(cv);
  M.init(mcv);
  if (TL.errors.length) console.warn('data errors', TL.errors);

  const redrawTL = () => { tlDirty = true; };

  // ---------- sizing ----------
  function relayout(keepCenter) {
    const c = keepCenter && S.PW > 40 ? R.yearAt(S.PW / 2) : null, oldK = S.k;
    M.resize();
    R.resize(); R.layout();
    if (c != null && S.PW > 40) { S.k = oldK; S.u0 = TL.u(c) - S.PW / S.k / 2; R.clampView(); }
    sizeMini(); redrawTL();
  }
  new ResizeObserver(() => relayout(true)).observe($('workspace'));

  // ---------- active map/slice year sync ----------
  function setActiveYear(y, panTimelineIfOffscreen, snapMap) {
    y = Math.max(TL.T0, Math.min(TL.NOW, y));
    S.pinYear = y;
    MS.tYear = y;
    if (snapMap || Math.abs(MS.year - y) > 120) MS.year = y;
    if (panTimelineIfOffscreen && S.PW > 40) {
      const [v0, v1] = R.visRange();
      if (y < v0 || y > v1) {
        S.u0 = TL.u(y) - S.PW / S.k / 2;
        R.clampView();
      }
    }
    updateMapYearHud();
    redrawTL();
  }

  function updateMapYearHud() {
    const y = Math.floor(MS.tYear);
    $('mapYearVal').textContent = TL.yearLabel(y);
    const ir = M.primaryPolity('iran', y);
    const rul = ir ? M.activeRulers(ir.id, y)[0] : null;
    const sy = M.snapYearFor ? M.snapYearFor(y) : MS.snapYear;
    const ep = sy != null ? (sy === 2010 && y >= 2005 ? ' · مرزهای دقیق کنونی' : ` · مرز تاریخی ${TL.yearLabel(sy)}`) : '';
    $('mapYearSub').textContent = (ir ? (ir.n + (rul ? ' · ' + rul.n : '')) : 'پیش از تاریخ') + ep;
  }

  // ---------- timeline zoom / pan ----------
  function zoomAt(px, factor) {
    const u = S.dir === 'ltr' ? S.u0 + px / S.k : S.u0 + (S.PW - px) / S.k;
    S.k *= factor; R.clampView();
    S.u0 = S.dir === 'ltr' ? u - px / S.k : u - (S.PW - px) / S.k; R.clampView(); redrawTL();
  }
  function panPx(dx) { S.u0 += (S.dir === 'ltr' ? -dx : dx) / S.k; R.clampView(); }
  function animateTo(y0, y1) {
    if (S.PW < 40) return;
    const fromU = S.u0, fromK = S.k; R.fit(y0, y1); const toU = S.u0, toK = S.k; S.u0 = fromU; S.k = fromK;
    const t0 = performance.now(), D = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 480;
    const step = (t) => {
      const a = Math.min(1, (t - t0) / D), e = a < 0.5 ? 4 * a * a * a : 1 - Math.pow(-2 * a + 2, 3) / 2;
      const lk = Math.log(fromK) + (Math.log(toK) - Math.log(fromK)) * e; S.k = Math.exp(lk);
      const cFrom = fromU + S.PW / fromK / 2, cTo = toU + S.PW / toK / 2, c = cFrom + (cTo - cFrom) * e;
      S.u0 = c - S.PW / S.k / 2; R.clampView(); redrawTL();
      if (a < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  R.animateTo = animateTo;

  // ---------- timeline pointer events ----------
  const pt = (el, ev) => { const r = el.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
  cv.addEventListener('wheel', (ev) => {
    ev.preventDefault(); hideHint();
    const [x] = pt(cv, ev);
    if (ev.shiftKey || x > S.PW) { S.scrollY += ev.deltaY; R.clampView(); redrawTL(); return; }
    if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) { panPx(-ev.deltaX); redrawTL(); return; }
    const d = ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY;
    zoomAt(x, Math.exp(-d * 0.0018));
  }, { passive: false });

  const ptrs = new Map(); let drag = null, pinch = null, moved = false;
  cv.addEventListener('pointerdown', (ev) => {
    cv.setPointerCapture(ev.pointerId); ptrs.set(ev.pointerId, pt(cv, ev)); moved = false; hideHint();
    if (ptrs.size === 1) { const [x, y] = pt(cv, ev); drag = { x, y, u0: S.u0, sy: S.scrollY }; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: S.k, mid: (a[0] + b[0]) / 2 }; drag = null; }
  });
  cv.addEventListener('pointermove', (ev) => {
    const [x, y] = pt(cv, ev);
    if (ptrs.has(ev.pointerId)) ptrs.set(ev.pointerId, [x, y]);
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt(pinch.mid, (pinch.k * d / pinch.d) / S.k); moved = true; return;
    }
    if (drag) {
      const dx = x - drag.x, dy = y - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; cv.classList.add('drag'); }
      if (moved) { S.u0 = drag.u0; panPx(dx); if (drag.y > S.worldTop) S.scrollY = drag.sy - dy; R.clampView(); hideTip(); redrawTL(); }
      return;
    }
    S.hoverX = x < S.PW ? x : null; S.hoverY = y;
    const h = R.hitTest(x, y);
    S.hoverItem = h && h.type !== 'region' ? h.item : null;
    if (h && h.type !== 'region') showTip(h, ev.clientX, ev.clientY); else hideTip();
    cv.style.cursor = h && h.type !== 'region' ? 'pointer' : 'grab';
    redrawTL();
  });
  const endTL = (ev) => {
    const wasDrag = drag && moved, [x, y] = pt(cv, ev);
    ptrs.delete(ev.pointerId); cv.classList.remove('drag');
    if (ptrs.size < 2) pinch = null;
    if (!ptrs.size) {
      if (drag && !wasDrag && ev.type === 'pointerup') clickTL(x, y);
      drag = null;
    }
  };
  cv.addEventListener('pointerup', endTL); cv.addEventListener('pointercancel', endTL);
  cv.addEventListener('pointerleave', () => { S.hoverX = null; S.hoverItem = null; hideTip(); redrawTL(); });

  function clickTL(x, y) {
    stopPlay();
    if (x > S.PW) {
      const h = R.hitTest(x, y);
      if (h && h.type === 'region' && h.item && h.item.id) M.flyToRegion(h.item.id);
      return;
    }
    const h = R.hitTest(x, y);
    if (h && h.type !== 'region') { select(h.item, h.type, false); return; }
    S.focus = null;
    setActiveYear(R.yearAt(x), false);
    updatePanel(); syncHash();
  }

  // ---------- map pointer events (pan, zoom, hover, click!) ----------
  let mDrag = null, mMoved = false;
  mcv.addEventListener('wheel', (ev) => {
    ev.preventDefault(); hideHint();
    const [x, y] = pt(mcv, ev);
    const [lonB, latB] = M.unproj(x, y);
    const factor = Math.exp(-ev.deltaY * 0.0014);
    MS.tZoom = Math.max(0.22, Math.min(4.8, MS.tZoom * factor));
    // Gentle zoom toward cursor
    MS.tLon = Math.max(-145, Math.min(155, MS.tLon + (lonB - MS.tLon) * (1 - 1 / factor) * 0.45));
    MS.tLat = Math.max(-35, Math.min(62, MS.tLat + (latB - MS.tLat) * (1 - 1 / factor) * 0.45));
  }, { passive: false });

  mcv.addEventListener('pointerdown', (ev) => {
    mcv.setPointerCapture(ev.pointerId); hideHint();
    mDrag = { x: ev.clientX, y: ev.clientY }; mMoved = false;
  });
  mcv.addEventListener('pointermove', (ev) => {
    if (mDrag) {
      const dx = ev.clientX - mDrag.x, dy = ev.clientY - mDrag.y;
      if (Math.hypot(dx, dy) > 3) { mMoved = true; mcv.classList.add('drag'); }
      if (mMoved) {
        const sc = M.scale();
        MS.tLon = Math.max(-150, Math.min(160, MS.tLon - dx / sc));
        MS.tLat = Math.max(-40, Math.min(66, MS.tLat + dy / (sc * 1.22)));
        mDrag.x = ev.clientX; mDrag.y = ev.clientY; hideTip();
      }
      return;
    }
    const [x, y] = pt(mcv, ev);
    const h = M.hitTest(x, y);
    MS.hover = h;
    mcv.style.cursor = h ? 'pointer' : 'grab';
    if (h) showMapTip(h, ev.clientX, ev.clientY); else hideTip();
  });
  const endMap = (ev) => {
    if (mDrag && !mMoved && ev.type === 'pointerup') {
      const [x, y] = pt(mcv, ev);
      const h = M.hitTest(x, y);
      if (h) {
        stopPlay();
        if (h.type === 'event' || h.type === 'person') {
          select(h.item, h.type, true);
        } else if (h.type === 'hist') {
          if (h.item) select(h.item, 'polity', true);
          else if (h.ent) M.flyTo(h.ent.cx, h.ent.cy, Math.max(1.4, MS.zoom));
        }
      } else {
        S.focus = null; updatePanel(); redrawTL();
      }
    }
    mDrag = null; mcv.classList.remove('drag');
  };
  mcv.addEventListener('pointerup', endMap); mcv.addEventListener('pointercancel', endMap);
  mcv.addEventListener('pointerleave', () => { MS.hover = null; hideTip(); });

  // ---------- unified select() across Map + Timeline + Panel ----------
  function select(item, type, zoom) {
    document.querySelectorAll('.chip.on').forEach(x => x.classList.remove('on'));
    const s = type === 'event' ? item.y : item.s, e = type === 'event' ? (item.y2 || item.y) : item.e;
    const endCap = Math.min(e, TL.NOW);
    S.focus = { item, type, s, e: endCap, dim: true };
    // Pick the best active map year: keep current year if inside span, else jump to peak/mid!
    let targetY = S.pinYear;
    if (type === 'event') targetY = item.y;
    else if (targetY == null || targetY < s || targetY > endCap) {
      targetY = (type === 'polity' && item.p != null) ? item.p : (s + endCap) / 2;
    }
    setActiveYear(targetY, false, true);
    // Fly map cleanly to the item's EXACT birthplace/battlefield (or region anchor)!
    if (type === 'person' && TL.personGeo) {
      const g = TL.personGeo(item); if (g) M.flyTo(g[0], g[1], 1.9);
    } else if (type === 'event' && TL.eventGeo) {
      const g = TL.eventGeo(item); if (g) M.flyTo(g[0], g[1], 1.9);
    } else {
      const rid = type === 'ruler' ? (TL.polityById[item.pid] || {}).r : item.r;
      if (rid) M.flyToRegion(rid, rid === 'iran' ? 1.65 : 1.35);
    }
    if (zoom) { const pad = Math.max(12, (endCap - s) * 0.6); animateTo(s - pad, endCap + pad); }
    updatePanel(); redrawTL(); openPanel(true); syncHash();
  }
  R.select = select;

  // ---------- resizable horizontal splitter + view modes ----------
  const ws = $('workspace'), splitter = $('splitter');
  let splitDrag = false;
  splitter.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.play-deck')) return;
    splitDrag = true; splitter.classList.add('drag'); splitter.setPointerCapture(ev.pointerId);
  });
  splitter.addEventListener('pointermove', (ev) => {
    if (!splitDrag) return;
    const r = ws.getBoundingClientRect();
    const pct = Math.max(22, Math.min(78, ((ev.clientY - r.top) / r.height) * 100));
    ws.style.setProperty('--map-pct', pct.toFixed(1) + '%');
    relayout(true);
  });
  splitter.addEventListener('pointerup', () => { splitDrag = false; splitter.classList.remove('drag'); });

  document.querySelectorAll('.vbtn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.vbtn').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    ws.setAttribute('data-view', b.dataset.view);
    setTimeout(() => relayout(true), 20);
  }));

  // ---------- playback deck ----------
  function stopPlay() { playing = false; $('btnPlay').textContent = '▶ پخش'; }
  function togglePlay() {
    playing = !playing;
    if (playing && MS.tYear >= TL.NOW - 10) { setActiveYear(-3200, true); }
    $('btnPlay').textContent = playing ? '❚❚ توقف' : '▶ پخش';
  }
  $('btnPlay').onclick = togglePlay;
  $('stepBack').onclick = () => { stopPlay(); setActiveYear((S.pinYear || 0) - 50, true); updatePanel(); };
  $('stepFwd').onclick = () => { stopPlay(); setActiveYear((S.pinYear || 0) + 50, true); updatePanel(); };
  document.querySelectorAll('.spd').forEach(b => b.onclick = () => {
    document.querySelectorAll('.spd').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); playSpeed = +b.dataset.spd;
  });

  // Map camera buttons
  $('mZoomIn').onclick = () => { MS.tZoom = Math.min(4.8, MS.tZoom * 1.35); };
  $('mZoomOut').onclick = () => { MS.tZoom = Math.max(0.22, MS.tZoom / 1.35); };
  $('mIran').onclick = () => M.presetIran();
  $('mEurasia').onclick = () => M.presetEurasia();
  $('mWorld').onclick = () => M.presetWorld();

  // ---------- keyboard ----------
  window.addEventListener('keydown', (ev) => {
    if (ev.target.tagName === 'INPUT') return;
    const k = ev.key;
    if (k === '/') { ev.preventDefault(); $('q').focus(); return; }
    if (ev.code === 'Space') { ev.preventDefault(); togglePlay(); return; }
    if (k === 'ArrowLeft' || k === 'ArrowRight') { panPx((k === 'ArrowLeft' ? 1 : -1) * S.PW * 0.15); redrawTL(); }
    else if (k === 'ArrowUp' || k === 'ArrowDown') { S.scrollY += k === 'ArrowDown' ? 80 : -80; R.clampView(); redrawTL(); }
    else if (k === '+' || k === '=') zoomAt(S.PW / 2, 1.35);
    else if (k === '-') zoomAt(S.PW / 2, 1 / 1.35);
    else if (k === 'Escape') { S.focus = null; updatePanel(); redrawTL(); $('about').hidden = true; $('layers').hidden = true; $('regions').hidden = true; $('moreEras').hidden = true; }
  });

  // ---------- tooltips ----------
  function itemYears(it, type) {
    if (type === 'event') return it.y2 ? TL.spanLabel(it.y, it.y2, it.a) : TL.yearLabel(it.y, it.a);
    return TL.spanLabel(it.s, it.e, it.a);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function tipHTML(h) {
    const it = h.item, t = h.type; let sub = '', extra = '';
    if (t === 'polity') { sub = TL.regionById[it.r].n; if (it.cap) extra += `<p>پایتخت: ${esc(it.cap)}</p>`; }
    if (t === 'ruler') { const p = TL.polityById[it.pid]; sub = p ? p.n : ''; if (it.t) sub = it.t + ' · ' + sub; }
    if (t === 'event') {
      const g = TL.eventGeo ? TL.eventGeo(it) : null;
      sub = (TL.KIND[it.k] || TL.KIND.pol).n + ' · ' + (g && g[2] ? g[2] : (TL.regionById[it.r] ? TL.regionById[it.r].n : ''));
    }
    if (t === 'person') {
      const g = TL.personGeo ? TL.personGeo(it) : null;
      const age = S.pinYear != null && S.pinYear >= it.s && S.pinYear <= it.e ? ` (${TL.fa(Math.floor(S.pinYear - it.s))} ساله در این سال)` : '';
      sub = (TL.PKIND[it.k] || '') + (g && g[2] ? ' · زادگاه: ' + g[2] : '') + age;
    }
    const dur = t !== 'event' ? ` · ${TL.fa(TL.duration(it.s, Math.min(it.e, 2026)))} سال` : '';
    return `<h4>${esc(it.n)}</h4>${it.en ? `<div class="en">${esc(it.en)}</div>` : ''}<div class="yr">${itemYears(it, t)}${dur}</div>` +
      `<p>${esc(sub)}</p>${extra}${it.d ? `<p>${esc(it.d)}</p>` : ''}`;
  }
  function placeTip(cx, cy) {
    const wr = ws.getBoundingClientRect();
    const x = cx - wr.left, y = cy - wr.top;
    const w = tip.offsetWidth, hh = tip.offsetHeight;
    let tx = x + 16, ty = y + 14;
    if (tx + w > wr.width - 8) tx = x - w - 16;
    if (ty + hh > wr.height - 8) ty = y - hh - 10;
    tip.style.left = Math.max(8, tx) + 'px'; tip.style.top = Math.max(8, ty) + 'px';
  }
  function showTip(h, cx, cy) { tip.innerHTML = tipHTML(h); tip.hidden = false; placeTip(cx, cy); }
  function showMapTip(h, cx, cy) {
    if (h.type === 'event' || h.type === 'person') { showTip(h, cx, cy); return; }
    const y = Math.floor(MS.year), p = h.item, ent = h.ent;
    if (p) {
      const ruls = M.activeRulers(p.id, y);
      const area = p.prof ? R.areaAt(p, y) : 0;
      const regN = TL.regionById[p.r] ? TL.regionById[p.r].n : '';
      tip.innerHTML = `<h4>${esc(h.effFa || p.n)}</h4><div class="en">${esc(ent.en || p.en || regN)}</div>` +
        `<div class="yr">${TL.spanLabel(p.s, p.e, p.a)}${area >= 0.4 ? ' · حدود ' + TL.fa(area.toFixed(1)) + ' م.ک²' : ''}</div>` +
        (ruls.length ? `<p>فرمانروا در این سال: <b>${esc(ruls.map(r => r.n).join('، '))}</b></p>` : '') +
        (p.cap ? `<p>مرکز: ${esc(p.cap)}</p>` : '') +
        (p.d ? `<p>${esc(p.d)}</p>` : '');
    } else if (ent) {
      const precTxt = MS.snapYear === 2010 && y >= 2005 ? 'مرز دقیق کنونی (Natural Earth 50m)' : (MS.snapYear >= 1914 ? 'مرز دقیق نقشه‌برداری‌شده' : (ent.prec === 1 ? 'مرز تقریبی تاریخی' : 'مرز تاریخی مستند'));
      tip.innerHTML = `<h4>${esc(h.effFa || ent.fa)}</h4>${ent.en && ent.en !== h.effFa ? `<div class="en">${esc(ent.en)}</div>` : ''}` +
        `<div class="yr">${MS.snapYear === 2010 && y >= 2005 ? precTxt : `نقشهٔ دورهٔ ${TL.yearLabel(MS.snapYear)} · ${precTxt}`}</div>`;
    }
    tip.hidden = false; placeTip(cx, cy);
  }
  function hideTip() { tip.hidden = true; }

  // ---------- sync-slice dossier panel ----------
  const over = (s, e, a, b) => s <= b && e >= a;
  const clip = (d, n = 92) => { if (!d) return ''; const t = d.split(/[.؛:]\s/)[0]; return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  let A = 0, B = 0;
  const reg = []; function register(it, type) { reg.push([it, type]); return reg.length - 1; }
  const closed = new Set();
  $('pBody').addEventListener('toggle', (ev) => { const d = ev.target; if (d.dataset.sec) d.open ? closed.delete(d.dataset.sec) : closed.add(d.dataset.sec); }, true);

  function rowHTML(it, type, label, yy) {
    const id = register(it, type);
    let dot, tag, tagC = '', sub;
    if (type === 'polity') {
      const q = TL.overlord(it, A, B); dot = it.base;
      tag = q ? 'زیر فرمان ' + q.n : it.dom ? 'امپراتوری' : it.k === 'culture' ? 'فرهنگ و تمدن' : 'حکومت';
      if (q) tagC = q.base;
      sub = clip(it.d) || (it.cap ? 'مرکز: ' + it.cap : '');
    } else if (type === 'ruler') {
      const p = TL.polityById[it.pid]; dot = p ? p.base : ''; tag = it.t || 'فرمانروا'; sub = clip(it.d, 70);
    } else if (type === 'event') {
      const k = TL.KIND[it.k] || TL.KIND.pol; dot = k.c; tag = k.n; sub = clip(it.d);
    } else {
      dot = (TL.KIND[TL.PKINDK[it.k]] || TL.KIND.pol).c;
      const age = S.pinYear != null && S.pinYear >= it.s && S.pinYear <= it.e ? ` · ${TL.fa(Math.floor(S.pinYear - it.s))} ساله` : '';
      tag = (TL.PKIND[it.k] || 'چهره') + age; sub = clip(it.d, 80);
    }
    return `<div class="it it-${type}" data-k="${id}"><i class="dot" style="background:${dot}"></i><div class="tx">` +
      `<div class="l1"><span class="nm">${esc(label)}</span><span class="yy">${yy}</span></div>` +
      `<div class="sub"><b class="tag"${tagC ? ` style="color:${tagC}"` : ''}>${esc(tag)}</b>${sub ? ' · ' + esc(sub) : ''}</div></div></div>`;
  }

  function featuredHTML() {
    if (!S.focus) return '';
    const { item: it, type } = S.focus;
    const col = type === 'polity' ? it.base : (type === 'ruler' ? (TL.polityById[it.pid] || {}).base : (TL.KIND[type === 'event' ? it.k : TL.PKINDK[it.k]] || TL.KIND.pol).c);
    const kindLbl = type === 'polity' ? (TL.regionById[it.r]?.n || '') : (type === 'ruler' ? ('فرمانروا · ' + (TL.polityById[it.pid]?.n || '')) : (type === 'event' ? (TL.KIND[it.k]?.n || 'رویداد') : (TL.PKIND[it.k] || 'چهره')));
    let meta = '';
    if (type === 'polity') {
      const maxA = it.maxA || 0;
      meta += it.cap ? `<span>مرکز: <b>${esc(it.cap)}</b></span>` : '';
      meta += maxA >= 0.4 ? `<span>بیشینهٔ قلمرو: <b>${TL.fa(maxA.toFixed(1))} م.ک²</b></span>` : '';
      meta += `<span>مدت: <b>${TL.fa(TL.duration(it.s, Math.min(it.e, 2026)))} سال</b></span>`;
    } else if (type === 'person' || type === 'ruler') {
      const g = type === 'person' && TL.personGeo ? TL.personGeo(it) : null;
      if (g && g[2]) meta += `<div class="feat-meta"><span>زادگاه: <b>${esc(g[2])}</b></span></div>`;
      const cont = TL.people.filter(p => p !== it && over(p.s, p.e, it.s, it.e)).slice(0, 6);
      if (cont.length) {
        meta += `<div class="feat-cont"><b>هم‌روزگاران نامدار:</b>${cont.map(p => esc(p.n)).join(' · ')}</div>`;
      }
    } else if (type === 'event' && TL.eventGeo) {
      const g = TL.eventGeo(it);
      if (g && g[2]) meta = `<div class="feat-meta"><span>مکان: <b>${esc(g[2])}</b></span></div>`;
    }
    return `<div class="feat-card" style="--c:${col || 'var(--gold)'}">
      <div class="feat-k"><span>${esc(kindLbl)}</span><button type="button" class="feat-x" id="clearFocus" title="پاک‌کردن انتخاب">×</button></div>
      <div class="feat-n"><span>${esc(it.n)}</span></div>
      ${it.en ? `<div class="feat-en">${esc(it.en)}</div>` : ''}
      <div class="feat-yr">${itemYears(it, type)}</div>
      ${it.d ? `<p class="feat-d">${esc(it.d)}</p>` : ''}
      ${meta ? (type === 'polity' ? `<div class="feat-meta">${meta}</div>` : meta) : ''}
    </div>`;
  }

  function topPowersHTML(y) {
    const active = TL.polities.filter(p => p.k !== 'culture' && !p.of && y >= p.s && y <= p.e && TL.extent[p.id] && (p.r === 'iran' || !S.show || S.show.has(p.r)));
    const ranked = active.map(p => ({ p, a: p.prof ? R.areaAt(p, y) : 0 })).filter(x => x.a >= 0.5).sort((a, b) => b.a - a.a).slice(0, 5);
    if (!ranked.length) return '';
    const maxA = ranked[0].a;
    return `<div class="pow-box"><div class="pow-h"><span>بزرگ‌ترین قدرت‌های ${TL.yearLabel(Math.floor(y))}</span><span>میلیون کیلومتر²</span></div>` +
      ranked.map(({ p, a }) => {
        const id = register(p, 'polity');
        return `<div class="pow-r it" data-k="${id}"><div class="pow-l"><span class="pow-nm"><i style="width:7px;height:7px;border-radius:50%;background:${p.base};flex:none"></i><span>${esc(p.n)}</span></span><span class="pow-v">${TL.fa(a.toFixed(1))}</span></div><div class="pow-tr"><div class="pow-f" style="width:${(a / maxA) * 100}%;background:${p.base}"></div></div></div>`;
      }).join('') + '</div>';
  }

  function domHTML(emp) {
    if (!emp || !emp.dom) return '';
    const rows = emp.dom.slice().sort((p, q) => p.s - q.s).map(p => {
      const id = register(p, 'polity');
      return `<div class="it" data-k="${id}"><i class="dot" style="background:${p.base}"></i><div class="tx"><div class="l1"><span class="nm">${esc(TL.regionById[p.r].n)}</span>` +
        `<span class="yy">${TL.spanLabel(Math.max(p.s, emp.s), Math.min(p.e, emp.e), p.a)}</span></div><div class="sub">${esc(p.n)}</div></div></div>`;
    }).join('');
    return `<div class="dom-box" style="--c:${emp.base}"><div class="dom-t">سرزمین‌های زیر فرمان «${esc(emp.n)}» (${TL.fa(emp.dom.length)} منطقه)</div>${rows}` +
      `<button type="button" class="dom-btn" data-emp="${emp.id}">فقط همین سرزمین‌ها را نشان بده</button></div>`;
  }

  function updatePanel() {
    reg.length = 0;
    const pY = $('pYear'), pC = $('pCal'), pF = $('pFocus'), body = $('pBody');
    let a, b;
    if (S.focus) { a = S.focus.s; b = S.focus.e; }
    else if (S.pinYear != null) { a = b = S.pinYear; }
    else { const [v0, v1] = R.visRange(); a = b = (v0 + v1) / 2; }
    const single = a === b, y = Math.floor(single ? a : (S.pinYear ?? a));
    pY.textContent = single ? TL.yearLabel(y) : TL.spanLabel(Math.floor(a), Math.floor(b));
    const c = TL.calendars(single ? y : Math.floor(a));
    pC.textContent = c ? `خورشیدی ${c.sh} · قمری ${c.ah}` + (single ? '' : ' (آغاز)') : (y < 0 ? 'پیش از میلاد' : 'پیش از هجرت');
    pF.textContent = S.focus ? `◈ هم‌زمان با «${S.focus.item.n}»` : '';

    const win = single ? Math.max(1, (R.visRange()[1] - R.visRange()[0]) * 0.014) : 0;
    A = a - win; B = b + win;

    let html = featuredHTML();
    const fi = S.focus && S.focus.type === 'polity' ? S.focus.item : null;
    html += domHTML(fi && (fi.dom ? fi : TL.overlord(fi)));
    if (single) html += topPowersHTML(y);

    const rOf = (it, type) => (type === 'ruler' ? (TL.polityById[it.pid] || {}).r : it.r);
    const inR = (r) => r && TL.regionById[r] && (r === 'iran' || !S.show || S.show.has(r));
    const span = (it) => TL.spanLabel(it.s, it.e, it.a);

    const rulBy = new Map();
    TL.rulers.filter(r => over(r.s, r.e, a, b)).sort((p, q) => p.s - q.s).forEach(r => { if (!rulBy.has(r.pid)) rulBy.set(r.pid, []); rulBy.get(r.pid).push(r); });

    [['حکومت‌ها و فرمانروایان', 'polity', TL.polities.filter(p => over(p.s, p.e, a, b)), span, (p, q) => (p.lv - q.lv) || p.s - q.s],
     ['رویدادها', 'event', TL.events.filter(e => over(e.y, e.y2 || e.y, A, B)), e => TL.yearShort(e.y), (p, q) => p.y - q.y],
     ['چهره‌ها', 'person', TL.people.filter(p => over(p.s, p.e, a, b)), span, (p, q) => p.s - q.s]
    ].forEach(([title, type, items, yy, sort]) => {
      const byReg = new Map();
      items.filter(it => inR(rOf(it, type))).sort((p, q) => TL.regionById[rOf(p, type)].order - TL.regionById[rOf(q, type)].order || sort(p, q))
        .forEach(it => { const r = rOf(it, type); if (!byReg.has(r)) byReg.set(r, []); byReg.get(r).push(it); });
      if (!byReg.size) return;
      const n = [...byReg.values()].reduce((s, l) => s + l.length, 0);
      html += `<details class="sec" data-sec="${type}"${closed.has(type) ? '' : ' open'}><summary>${title}<span class="n">${TL.fa(n)}</span></summary>`;
      byReg.forEach((list, r) => {
        const lords = type === 'polity' ? [...new Set(list.map(p => TL.overlord(p, a, b)).filter(Boolean))] : [];
        const badges = lords.map(q => `<span class="badge" style="background:${q.base}">زیر فرمان ${esc(q.n)}</span>`).join('');
        const cap = r === 'iran' ? 16 : 9;
        html += `<div class="reg ${r === 'iran' ? 'iran' : ''}"><h5>${esc(TL.regionById[r].n)}${badges}</h5>`;
        list.slice(0, cap).forEach(it => {
          html += rowHTML(it, type, it.n, yy(it));
          if (type === 'polity' && rulBy.has(it.id)) html += `<div class="nest">${rulBy.get(it.id).map(r => rowHTML(r, 'ruler', r.n, span(r))).join('')}</div>`;
        });
        if (list.length > cap) html += `<div class="more">و ${TL.fa(list.length - cap)} مورد دیگر</div>`;
        html += '</div>';
      });
      html += '</details>';
    });
    body.innerHTML = html || '<div class="empty">برای این برش داده‌ای ثبت نشده است.</div>';
  }

  $('pBody').addEventListener('click', (ev) => {
    if (ev.target.id === 'clearFocus') { S.focus = null; updatePanel(); redrawTL(); return; }
    const btn = ev.target.closest('.dom-btn');
    if (btn) { const emp = TL.polityById[btn.dataset.emp]; setShow(new Set(emp.dom.map(p => p.r).concat(emp.r).filter(r => r !== 'iran'))); return; }
    const el = ev.target.closest('.it'); if (!el) return;
    const [it, type] = reg[+el.dataset.k]; select(it, type, true);
  });

  function openPanel(force) {
    const m = $('main'), btn = $('btnPanel');
    const open = force === true ? true : force === false ? false : m.classList.contains('nopanel');
    m.classList.toggle('nopanel', !open); btn.setAttribute('aria-expanded', String(open)); btn.classList.toggle('tbtn-on', open);
    if (window.innerWidth <= 1100) $('panel').hidden = !open; else $('panel').hidden = false;
  }
  $('btnPanel').onclick = () => openPanel();

  // ---------- upgraded search (names + capitals + descriptions + direct year jump!) ----------
  const index = [];
  TL.polities.forEach(p => index.push([p, 'polity', TL.regionById[p.r].n]));
  TL.rulers.forEach(r => index.push([r, 'ruler', 'فرمانروا · ' + (TL.polityById[r.pid] ? TL.polityById[r.pid].n : '')]));
  TL.events.forEach(e => index.push([e, 'event', 'رویداد · ' + TL.yearShort(e.y)]));
  TL.people.forEach(p => index.push([p, 'person', TL.PKIND[p.k] || 'چهره']));
  index.forEach(row => {
    const o = row[0];
    const loc = row[1] === 'person' && TL.personGeo ? (TL.personGeo(o)?.[2] || '') : (row[1] === 'event' && TL.eventGeo ? (TL.eventGeo(o)?.[2] || '') : '');
    row.nameKey = TL.norm(o.n + ' ' + (o.en || ''));
    row.fullKey = row.nameKey + ' ' + TL.norm((o.cap || '') + ' ' + loc + ' ' + (o.d || ''));
  });

  function parseYearQuery(raw) {
    const s = raw.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).trim();
    const m = s.match(/^(-?\d{1,5})\s*(پ\.?م|bc|bce|ش|خورشیدی|م|ad|ce)?$/i);
    if (!m) return null;
    let y = parseInt(m[1], 10);
    const suf = (m[2] || '').toLowerCase();
    if (/پ|bc/.test(suf)) y = -Math.abs(y);
    else if (/ش|خورشیدی/.test(suf)) y = y + 621;
    if (y < TL.T0 || y > TL.T1) return null;
    return y;
  }

  const q = $('q'), qres = $('qres'); let qsel = 0, qlist = [];
  function runSearch() {
    const raw = q.value.trim(), s = TL.norm(raw);
    if (!raw) { qres.hidden = true; return; }
    const jy = parseYearQuery(raw);
    qlist = [];
    if (jy != null) qlist.push([{ n: 'پرش به سال ' + TL.yearLabel(jy), y: jy }, 'jump', 'برش زمان']);
    if (s.length >= 2) {
      const parts = s.split(' ');
      const byName = index.filter(r => parts.every(p => r.nameKey.includes(p))).sort((a, b) => a[0].n.length - b[0].n.length);
      const byFull = byName.length < 10 ? index.filter(r => !byName.includes(r) && parts.every(p => r.fullKey.includes(p))) : [];
      qlist = qlist.concat(byName.slice(0, 12), byFull.slice(0, 6)).slice(0, 14);
    }
    if (!qlist.length && s.length < 2) { qres.hidden = true; return; }
    qsel = 0;
    qres.innerHTML = qlist.map((r, i) => `<li role="option" data-i="${i}" aria-selected="${i === 0}"><span>${esc(r[0].n)}</span><span class="k">${esc(r[2])}</span></li>`).join('') || '<li><span>یافت نشد</span></li>';
    qres.hidden = false;
  }
  function pick(i) {
    const r = qlist[i]; if (!r) return;
    qres.hidden = true; q.blur(); stopPlay();
    if (r[1] === 'jump') {
      S.focus = null; setActiveYear(r[0].y, false); animateTo(r[0].y - 120, r[0].y + 120); updatePanel(); syncHash(); return;
    }
    select(r[0], r[1], true);
  }
  q.addEventListener('input', runSearch);
  q.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); qsel = (qsel + (ev.key === 'ArrowDown' ? 1 : -1) + qlist.length) % Math.max(qlist.length, 1); [...qres.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === qsel))); }
    if (ev.key === 'Enter') pick(qsel);
    if (ev.key === 'Escape') { qres.hidden = true; q.blur(); }
  });
  qres.addEventListener('pointerdown', (ev) => { const li = ev.target.closest('li[data-i]'); if (li) { ev.preventDefault(); pick(+li.dataset.i); } });
  q.addEventListener('blur', () => setTimeout(() => (qres.hidden = true), 150));

  // ---------- era chips (clean 12 primary eras + "سایر دوره‌ها" dropdown so ZERO clipping!) ----------
  const PRIMARY_ERAS = new Set(['همهٔ تاریخ', 'ایلام', 'ماد و هخامنشی', 'اشکانیان', 'ساسانیان', 'ورود اسلام', 'سامانیان و آل‌بویه', 'سلجوقیان', 'مغول و ایلخانان', 'تیموریان', 'صفویه', 'افشار و زند', 'قاجار', 'امروز']);
  const chipHTML = (c) => `<button class="chip ${c.iran ? 'iran' : ''}" data-i="${TL.chips.indexOf(c)}">${esc(c.n)}</button>`;
  const mainChips = TL.chips.filter(c => PRIMARY_ERAS.has(c.n));
  const extraIran = TL.chips.filter(c => c.iran && !PRIMARY_ERAS.has(c.n));
  const extraWorld = TL.chips.filter(c => !c.iran && !PRIMARY_ERAS.has(c.n));
  $('eraChips').innerHTML = mainChips.map(chipHTML).join('');
  $('moreEras').innerHTML =
    (extraIran.length ? '<div class="m-sec">دوره‌های ایران</div>' + extraIran.map(chipHTML).join('') : '') +
    (extraWorld.length ? '<div class="m-sec">دوره‌های جهان</div>' + extraWorld.map(chipHTML).join('') : '');

  function handleEraClick(ev) {
    const b = ev.target.closest('.chip[data-i]'); if (!b) return;
    document.querySelectorAll('.chip.on').forEach(x => x.classList.remove('on')); b.classList.add('on');
    $('moreEras').hidden = true;
    const c = TL.chips[+b.dataset.i];
    stopPlay(); S.focus = null;
    const mid = Math.min(TL.NOW, (c.s + c.e) / 2);
    setActiveYear(mid, false, true);
    animateTo(c.s, c.e);
    if (c.iran) M.presetEurasia(); else M.presetWorld();
    updatePanel(); syncHash();
  }
  $('eraChips').addEventListener('click', handleEraClick);
  $('moreEras').addEventListener('click', handleEraClick);
  $('btnMoreEras').onclick = () => { const m = $('moreEras'); m.hidden = !m.hidden; $('layers').hidden = true; $('regions').hidden = true; $('btnMoreEras').setAttribute('aria-expanded', String(!m.hidden)); };

  // ---------- toolbar ----------
  $('btnScale').onclick = () => {
    const c = R.yearAt(S.PW / 2), [v0, v1] = R.visRange();
    TL.scaleMode = TL.scaleMode === 'warp' ? 'linear' : 'warp';
    $('btnScale').textContent = TL.scaleMode === 'warp' ? 'فشرده' : 'خطی';
    R.fit(v0, v1, 0); if (TL.scaleMode === 'linear') { S.u0 = TL.u(c) - S.PW / S.k / 2; R.clampView(); } redrawTL();
  };
  $('btnDir').onclick = () => {
    S.dir = S.dir === 'ltr' ? 'rtl' : 'ltr';
    $('btnDir').textContent = S.dir === 'ltr' ? 'چپ←راست' : 'راست←چپ';
    redrawTL();
  };

  let dark = true;
  try { const sv = localStorage.getItem('jam-atlas-theme'); if (sv) dark = sv === 'dark'; } catch (e) { }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    $('btnTheme').textContent = dark ? '☀' : '☾';
    $('btnTheme').title = dark ? 'تغییر به پوستهٔ روشن' : 'تغییر به پوستهٔ تیره';
    MS.dark = dark;
    try { localStorage.setItem('jam-atlas-theme', dark ? 'dark' : 'light'); } catch (e) { }
    R.readTheme(); redrawTL();
  }
  $('btnTheme').onclick = () => { dark = !dark; applyTheme(); };

  $('btnLayers').onclick = () => { const l = $('layers'); l.hidden = !l.hidden; $('regions').hidden = true; $('moreEras').hidden = true; $('btnLayers').setAttribute('aria-expanded', String(!l.hidden)); };
  [['lyRulers', 'rulers'], ['lyEvents', 'events'], ['lyPeople', 'people'], ['lyLinks', 'links']].forEach(([id, k]) => {
    $(id).addEventListener('change', (ev) => { S.layers[k] = ev.target.checked; relayout(true); });
  });
  [['lyRoutes', 'routes'], ['lyCampaigns', 'campaigns'], ['lyDomArcs', 'domArcs'], ['lyRivers', 'rivers']].forEach(([id, k]) => {
    $(id).addEventListener('change', (ev) => { MS.layers[k] = ev.target.checked; });
  });

  // ---------- region filter + quick comparison presets ----------
  const LANES = [['iran_local', 'دودمان‌های محلی ایران', 'ایران'], ['iran_people', 'چهره‌های ایران', 'ایران']]
    .concat(TL.regions.filter(r => r.id !== 'iran').map(r => [r.id, r.n, r.grp]), [['people', 'چهره‌های جهان', 'چهره‌ها']]);
  const groups = [...new Set(LANES.map(l => l[2]))];
  $('rgList').innerHTML = groups.map(g => `<div class="rg-grp"><button type="button" class="rg-gt" data-g="${esc(g)}">${esc(g)}</button>` +
    LANES.filter(l => l[2] === g).map(([id, n]) => `<label><input type="checkbox" value="${id}"> ${esc(n)}</label>`).join('') + '</div>').join('');
  const boxes = () => [...$('rgList').querySelectorAll('input')];
  function setShow(set, keepPopover) {
    S.show = set && set.size < LANES.length ? set : null;
    boxes().forEach(b => (b.checked = !S.show || S.show.has(b.value)));
    $('btnRegions').textContent = 'سرزمین‌ها' + (S.show ? ` (${TL.fa(S.show.size)})` : '');
    $('btnRegions').classList.toggle('tbtn-on', !!S.show);
    try { localStorage.setItem('jam-regions', S.show ? [...S.show].join(',') || '-' : ''); } catch (e) { }
    if (!keepPopover) $('regions').hidden = true;
    S.scrollY = 0; relayout(true); updatePanel();
  }
  const fromBoxes = () => setShow(new Set(boxes().filter(b => b.checked).map(b => b.value)), true);
  $('rgList').addEventListener('change', fromBoxes);
  $('rgList').addEventListener('click', (ev) => {
    const g = ev.target.closest('.rg-gt'); if (!g) return;
    const bs = boxes().filter(b => LANES.find(l => l[0] === b.value)[2] === g.dataset.g);
    if (!S.show) { boxes().forEach(b => (b.checked = false)); bs.forEach(b => (b.checked = true)); }
    else { const on = !bs.every(b => b.checked); bs.forEach(b => (b.checked = on)); }
    fromBoxes();
  });
  $('rgAll').onclick = () => setShow(null, true);
  $('rgNone').onclick = () => setShow(new Set(), true);
  $('rgNear').onclick = () => setShow(new Set(['mesopotamia', 'anatolia', 'caucasus', 'levant', 'arabia', 'egypt', 'central_asia', 'south_asia']), true);
  $('rgSilk').onclick = () => setShow(new Set(['mesopotamia', 'anatolia', 'central_asia', 'steppe', 'south_asia', 'china', 'italy', 'greece']), true);
  $('btnRegions').onclick = () => { const l = $('regions'); l.hidden = !l.hidden; $('layers').hidden = true; $('moreEras').hidden = true; $('btnRegions').setAttribute('aria-expanded', String(!l.hidden)); };
  try { const v = localStorage.getItem('jam-regions'); if (v) S.show = new Set(v === '-' ? [] : v.split(',')); } catch (e) { }

  // Close popovers on outside click
  document.addEventListener('pointerdown', (ev) => {
    if (!ev.target.closest('#layers,#btnLayers')) $('layers').hidden = true;
    if (!ev.target.closest('#regions,#btnRegions')) $('regions').hidden = true;
    if (!ev.target.closest('#moreEras,#btnMoreEras')) $('moreEras').hidden = true;
  });

  // ---------- about modal ----------
  $('btnAbout').onclick = () => { $('layers').hidden = true; $('about').hidden = false; };
  $('aboutX').onclick = () => { $('about').hidden = true; };
  $('about').addEventListener('click', (ev) => { if (ev.target.id === 'about') $('about').hidden = true; });
  const counts = `${TL.fa(TL.polities.length)} حکومت و تمدن، ${TL.fa(TL.rulers.length)} فرمانروا، ${TL.fa(TL.events.length)} رویداد و ${TL.fa(TL.people.length)} چهره`;
  $('aboutBody').innerHTML = `<p>این نسخهٔ «اطلس فضا-زمان» از <b>جام جهان‌نما</b>، ${counts} را در ${TL.fa(TL.regions.length)} منطقه هم‌زمان روی <b>نقشهٔ واقعی و متغیرِ مرزهای تاریخی جهان</b> و نمودار تاریخی زیر آن نمایش می‌دهد.</p>
  <ul>
  <li><b>مرزهای واقعی و متناسب با دقت هر دوره:</b> در دوران باستان و سده‌های میانه مرزها به‌صورت منحنی‌های نرم و تاریخی رسم می‌شوند؛ از عصر معاهدات سدهٔ ۱۹ به‌تدریج دقیق‌تر شده و از ۱۹۱۴ میلادی تا مرزهای کنونی (برگرفته از Natural Earth 50m) به‌صورت خطوط دقیق، تیز و کاملاً هم‌تراز با مرزهای رسمی جهان نمایش داده می‌شوند.</li>
  <li><b>پخش تاریخ:</b> دکمهٔ پخش (یا کلید Space) زمان را به‌آرامی پیش می‌برد تا رشد و جابه‌جایی مرزهای امپراتوری‌ها را زنده روی نقشه تماشا کنید.</li>
  <li><b>تقویم سه‌گانه:</b> سال میلادی بالا، و خورشیدی و قمری پایین نمودار؛ جست‌وجو با نام، پایتخت یا پرش مستقیم به سال (مثلاً <code>۵۵۰ پ.م</code> یا <code>۱۳۵۷ ش</code>).</li>
  <li><b>میان‌برها:</b> <code>/</code> جست‌وجو · <code>Space</code> پخش/توقف · <code>← →</code> جابه‌جایی زمان · <code>+ −</code> بزرگ‌نمایی · <code>Esc</code> پاک‌کردن انتخاب.</li>
  </ul>`;

  // ---------- minimap ----------
  let mW = 0, mH = 0;
  function sizeMini() { const r = mm.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); mW = r.width; mH = r.height; mm.width = mW * d; mm.height = mH * d; mctx.setTransform(d, 0, 0, d, 0, 0); }
  const mx = (y) => { const t = (TL.u(y) - TL.U0()) / (TL.U1() - TL.U0()); return S.dir === 'ltr' ? t * mW : mW - t * mW; };
  function drawMini() {
    if (!mW) return;
    mctx.clearRect(0, 0, mW, mH);
    mctx.fillStyle = S.dark ? '#0f1219' : '#f4f4f0'; mctx.fillRect(0, 0, mW, mH);
    const n = TL.regions.length, lh = (mH - 16) / n;
    TL.polities.forEach(p => {
      const ri = TL.regionById[p.r].order, xa = mx(p.s), xb = mx(Math.min(p.e, TL.NOW));
      const dim = S.show && p.r !== 'iran' && !S.show.has(p.r);
      mctx.fillStyle = p.base || S.C.muted; mctx.globalAlpha = dim ? 0.08 : (p.ir ? 0.92 : 0.55);
      mctx.fillRect(Math.min(xa, xb), 2 + ri * lh, Math.max(Math.abs(xb - xa), 1), Math.max(lh - 0.6, 0.7));
    });
    mctx.globalAlpha = 1;
    mctx.font = '500 9px Vazirmatn, Tahoma, sans-serif'; mctx.fillStyle = S.C.muted; mctx.textAlign = 'center'; mctx.textBaseline = 'bottom'; mctx.direction = 'rtl';
    [-8000, -5000, -3000, -2000, -1000, 0, 500, 1000, 1500, 1800, 2000].forEach(y => mctx.fillText(y < 0 ? TL.fa(-y) + ' پ.م' : TL.fa(y || 1), mx(y), mH - 1));
    if (S.PW > 40) {
      const [v0, v1] = R.visRange(), xa = mx(v0), xb = mx(v1);
      mctx.strokeStyle = S.C.gold; mctx.lineWidth = 1.4;
      mctx.fillStyle = S.dark ? 'rgba(232,190,102,.12)' : 'rgba(168,118,28,.12)';
      mctx.fillRect(Math.min(xa, xb), 1, Math.abs(xb - xa), mH - 13); mctx.strokeRect(Math.min(xa, xb), 1, Math.abs(xb - xa), mH - 13);
    }
    if (S.pinYear != null) {
      const px = mx(S.pinYear);
      mctx.fillStyle = S.C.gold; mctx.fillRect(px - 1, 0, 2, mH - 12);
    }
  }
  let mdrag = false;
  const mmGo = (ev) => {
    const r = mm.getBoundingClientRect(), x = ev.clientX - r.left, t = S.dir === 'ltr' ? x / mW : 1 - x / mW;
    const u = TL.U0() + t * (TL.U1() - TL.U0());
    const yr = TL.yOfU(u);
    stopPlay();
    S.u0 = u - S.PW / S.k / 2; R.clampView();
    setActiveYear(yr, false);
  };
  mm.addEventListener('pointerdown', (ev) => { mdrag = true; mm.setPointerCapture(ev.pointerId); mmGo(ev); });
  mm.addEventListener('pointermove', (ev) => { if (mdrag) mmGo(ev); });
  mm.addEventListener('pointerup', () => { mdrag = false; updatePanel(); syncHash(); });

  // ---------- URL hash deep-linking ----------
  function syncHash() {
    const parts = [];
    if (S.pinYear != null) parts.push('y=' + Math.round(S.pinYear));
    if (S.focus && S.focus.type === 'polity') parts.push('p=' + S.focus.item.id);
    try { history.replaceState(null, '', '#' + parts.join('&')); } catch (e) { }
  }
  function loadHash() {
    const h = (location.hash || '').slice(1); if (!h) return false;
    const params = Object.fromEntries(h.split('&').map(s => s.split('=')));
    if (params.p && TL.polityById[params.p]) { select(TL.polityById[params.p], 'polity', true); return true; }
    if (params.y && !isNaN(+params.y)) { setActiveYear(+params.y, false); R.fit(+params.y - 350, +params.y + 350, 0.04); return true; }
    return false;
  }

  // ---------- hint ----------
  let hintT = setTimeout(hideHint, 9500);
  function hideHint() { clearTimeout(hintT); $('hint').classList.add('off'); }

  // ---------- main 60fps animation loop ----------
  let panelTick = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - lastFrameT) / 1000);
    lastFrameT = now;

    if (playing) {
      // Adaptive playback pace: moves faster across deep prehistory, slower through dense modern centuries
      const y = MS.tYear;
      const baseRate = y < -3000 ? 320 : (y < -800 ? 110 : (y < 1500 ? 45 : 18));
      const ny = y + dt * baseRate * playSpeed;
      if (ny >= TL.NOW) { setActiveYear(TL.NOW, true); stopPlay(); updatePanel(); }
      else {
        setActiveYear(ny, true);
        panelTick += dt;
        if (panelTick > 0.25) { panelTick = 0; updatePanel(); }
      }
    }

    M.step(dt);
    M.draw();

    if (tlDirty) {
      tlDirty = false;
      R.draw();
      drawMini();
    }
    requestAnimationFrame(frame);
  }

  // ---------- boot ----------
  applyTheme();
  if (S.show) setShow(S.show, true);
  M.resize(); R.resize(); R.layout(); sizeMini();
  if (!loadHash()) {
    R.fit(-900, 2030, 0.02);
    setActiveYear(-480, false); // Start at Achaemenid zenith — instant visual impact!
    M.presetEurasia();
  }
  if (window.innerWidth <= 1100) openPanel(false);
  updateMapYearHud();
  updatePanel();
  redrawTL();
  requestAnimationFrame(frame);

  const fontsReady = () => { R.clearCache(); R.layout(); redrawTL(); };
  if (document.fonts) {
    ['400 12px Vazirmatn', '700 12px Vazirmatn', '700 20px Gulzar'].forEach(f => document.fonts.load(f, 'ایران').then(fontsReady, () => { }));
    document.fonts.ready.then(fontsReady);
  }
  window.JAM = { S, MS, R, M, TL, select, updatePanel, setActiveYear };
})();

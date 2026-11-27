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

  // the map must be redrawn on the next frame. Every state change that redraws the timeline (year, focus, filter,
  // layers, theme) shows on the map too, so redrawTL marks both.
  let mapDirty = true;
  const redrawTL = () => { tlDirty = true; mapDirty = true; };

  // ---------- sizing ----------
  function relayout(keepCenter) {
    const c = keepCenter && S.PW > 40 ? R.yearAt(S.PW / 2) : null, oldK = S.k;
    M.resize();
    R.resize(); R.layout();
    if (c != null && S.PW > 40) { S.k = oldK; S.u0 = TL.u(c) - S.PW / S.k / 2; R.clampView(); }
    sizeMini(); redrawTL();
  }
  // the map and timeline areas change size on window resize, splitter drags and view switches;
  // the observer batches all of these into one relayout per frame
  const ro = new ResizeObserver(() => relayout(true));
  ['workspace', 'mapStage', 'stage'].forEach(id => ro.observe($(id)));

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
    const y = TL.yearInt(MS.tYear);
    $('mapYearVal').textContent = TL.yearLabel(y);
    const ir = M.primaryPolity('iran', y);
    const rul = ir ? M.activeRulers(ir.id, y)[0] : null;
    // Borders are live: between two border snapshots the map is blending from one to the other
    const era = M.eraAt(y);
    const ep = era.a === 2010 ? ' · مرزهای دقیق کنونی'
      : (era.a !== era.b && era.t > 0 ? ` · مرزها از ${TL.yearLabel(era.a)} تا ${TL.yearLabel(era.b)}` : ` · مرز تاریخی ${TL.yearLabel(era.a)}`);
    $('mapYearSub').textContent = (ir ? (ir.n + (rul ? ' · ' + rul.n : '')) : 'پیش از تاریخ') + ep;
    if (dial) updateDial();
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
  // capture keeps a drag going outside the element; if the browser refuses, the gesture still works without it
  const capture = (el, ev) => { try { el.setPointerCapture(ev.pointerId); } catch (e) { } };
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
    if (ev.pointerType === 'mouse' && ev.button !== 0) return; // right/middle click: leave to the browser
    capture(cv, ev); ptrs.set(ev.pointerId, pt(cv, ev)); moved = false; hideHint();
    if (ptrs.size === 1) { const [x, y] = pt(cv, ev); drag = { x, y, u0: S.u0, sy: S.scrollY }; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])), k: S.k, mid: (a[0] + b[0]) / 2 }; drag = null; }
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
    if (ev.pointerType === 'touch') return; // no hover cursor or tooltips under a finger
    S.hoverX = x < S.PW ? x : null; S.hoverY = y;
    const h = R.hitTest(x, y);
    S.hoverItem = h && h.type !== 'region' ? h.item : null;
    if (h && h.type !== 'region') showTip(h, ev.clientX, ev.clientY); else hideTip();
    cv.style.cursor = h && h.type !== 'region' ? 'pointer' : 'grab';
    redrawTL();
  });
  const endTL = (ev) => {
    if (!ptrs.has(ev.pointerId)) return;
    const wasDrag = drag && moved, [x, y] = pt(cv, ev);
    ptrs.delete(ev.pointerId); cv.classList.remove('drag');
    if (pinch && ptrs.size === 1) { // one finger lifted from a pinch: keep panning with the other
      const [p] = [...ptrs.values()]; pinch = null; drag = { x: p[0], y: p[1], u0: S.u0, sy: S.scrollY }; moved = true; return;
    }
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
    const d = ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY; // some mice scroll in lines, not pixels
    const factor = Math.exp(-d * 0.0014);
    MS.tZoom = Math.max(0.22, Math.min(4.8, MS.tZoom * factor));
    // Gentle zoom toward cursor
    MS.tLon = Math.max(-145, Math.min(155, MS.tLon + (lonB - MS.tLon) * (1 - 1 / factor) * 0.45));
    MS.tLat = Math.max(-35, Math.min(62, MS.tLat + (latB - MS.tLat) * (1 - 1 / factor) * 0.45));
  }, { passive: false });

  // touch: one finger pans, two fingers pinch-zoom and pan together; lifting one finger goes back to panning
  const mPtrs = new Map(); let mPinch = null;
  const mMid = () => { const [a, b] = [...mPtrs.values()]; return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, d: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])) }; };
  const panMapBy = (dx, dy) => {
    const sc = M.scale();
    MS.tLon = Math.max(-150, Math.min(160, MS.tLon - dx / sc));
    MS.tLat = Math.max(-40, Math.min(66, MS.tLat + dy / (sc * 1.22)));
  };
  mcv.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return; // right/middle click: leave to the browser
    capture(mcv, ev); hideHint();
    mPtrs.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (mPtrs.size === 1) { mDrag = { x: ev.clientX, y: ev.clientY }; mMoved = false; }
    else if (mPtrs.size === 2) { const m = mMid(); mPinch = { d: m.d, zoom: MS.tZoom, x: m.x, y: m.y }; mDrag = null; mMoved = true; hideTip(); }
  });
  mcv.addEventListener('pointermove', (ev) => {
    if (mPtrs.has(ev.pointerId)) mPtrs.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (mPinch && mPtrs.size === 2) {
      const m = mMid();
      MS.tZoom = Math.max(0.22, Math.min(4.8, mPinch.zoom * m.d / mPinch.d));
      panMapBy(m.x - mPinch.x, m.y - mPinch.y); mPinch.x = m.x; mPinch.y = m.y;
      return;
    }
    if (mDrag) {
      const dx = ev.clientX - mDrag.x, dy = ev.clientY - mDrag.y;
      if (Math.hypot(dx, dy) > 3) { mMoved = true; mcv.classList.add('drag'); }
      if (mMoved) { panMapBy(dx, dy); mDrag.x = ev.clientX; mDrag.y = ev.clientY; hideTip(); }
      return;
    }
    if (ev.pointerType === 'touch') return; // no hover tooltips under a finger
    const [x, y] = pt(mcv, ev);
    const h = M.hitTest(x, y);
    MS.hover = h;
    mcv.style.cursor = h ? 'pointer' : 'grab';
    if (h) showMapTip(h, ev.clientX, ev.clientY); else hideTip();
  });
  const endMap = (ev) => {
    if (!mPtrs.has(ev.pointerId)) return;
    mPtrs.delete(ev.pointerId);
    if (mPtrs.size === 1) { // one finger lifted from a pinch: keep panning with the other
      const [p] = [...mPtrs.values()]; mPinch = null; mDrag = { x: p[0], y: p[1] }; mMoved = true; return;
    }
    if (mPtrs.size) return;
    mPinch = null;
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
        S.focus = null; updatePanel(); redrawTL(); syncHash();
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
      const g = TL.personGeo(item, S.pinYear); if (g) M.flyTo(g[0], g[1], 1.9);
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
  let splitDrag = false, splitPct = 56;
  // only move the split here; the ResizeObserver resizes the canvases once per frame
  const setSplit = (pct) => {
    splitPct = Math.max(22, Math.min(78, pct));
    ws.style.setProperty('--map-pct', splitPct.toFixed(1) + '%');
    splitter.setAttribute('aria-valuenow', String(Math.round(splitPct)));
  };
  splitter.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.play-deck')) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    splitDrag = true; splitter.classList.add('drag'); capture(splitter, ev);
  });
  splitter.addEventListener('pointermove', (ev) => {
    if (!splitDrag) return;
    const r = ws.getBoundingClientRect();
    setSplit(((ev.clientY - r.top) / r.height) * 100);
  });
  const endSplit = () => { splitDrag = false; splitter.classList.remove('drag'); };
  splitter.addEventListener('pointerup', endSplit); splitter.addEventListener('pointercancel', endSplit);
  // keyboard: ↑ / ↓ make the map smaller / larger, Home / End jump to the limits
  splitter.addEventListener('keydown', (ev) => {
    const step = { ArrowUp: -4, ArrowDown: 4, PageUp: -12, PageDown: 12 }[ev.key];
    if (step != null) setSplit(splitPct + step);
    else if (ev.key === 'Home') setSplit(22);
    else if (ev.key === 'End') setSplit(78);
    else return;
    ev.preventDefault(); ev.stopPropagation();
  });

  function setView(v) {
    document.querySelectorAll('.vbtn').forEach(x => { const on = x.dataset.view === v; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    ws.setAttribute('data-view', v); // the ResizeObserver relayouts the areas that changed size
  }
  document.querySelectorAll('.vbtn').forEach(b => b.addEventListener('click', () => { setView(b.dataset.view); syncHash(); }));

  // ---------- playback deck ----------
  function stopPlay() { if (playing) { playing = false; syncHash(); } $('btnPlay').textContent = '▶ پخش'; }
  function togglePlay() {
    playing = !playing;
    if (playing && MS.tYear >= TL.NOW - 10) { setActiveYear(-3200, true); toast('به امروز رسیده بودید؛ پخش از ۳۲۰۰ پ.م دوباره شروع شد.'); }
    if (!playing) syncHash();
    $('btnPlay').textContent = playing ? '❚❚ توقف' : '▶ پخش';
  }
  $('btnPlay').onclick = togglePlay;
  const stepBy = (n) => { stopPlay(); setActiveYear(TL.addYears(TL.yearInt(S.pinYear ?? MS.tYear), n), true); updatePanel(); syncHash(); };
  $('stepBack').onclick = () => stepBy(-50);
  $('stepFwd').onclick = () => stepBy(50);
  document.querySelectorAll('.spd').forEach(b => b.onclick = () => {
    document.querySelectorAll('.spd').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    playSpeed = +b.dataset.spd;
  });

  // Map camera buttons
  $('mZoomIn').onclick = () => { MS.tZoom = Math.min(4.8, MS.tZoom * 1.35); };
  $('mZoomOut').onclick = () => { MS.tZoom = Math.max(0.22, MS.tZoom / 1.35); };
  $('mIran').onclick = () => M.presetIran();
  $('mEurasia').onclick = () => M.presetEurasia();
  $('mWorld').onclick = () => M.presetWorld();

  // ---------- time dial: clockwise = forward; years per degree shrink toward the dense modern era ----------
  const dial = $('timeDial'), DIAL_SEG = [[-3000, 10], [-500, 3], [1500, 1], [1900, 0.5], [Infinity, 0.2]];
  const degOf = (y) => { // cumulative degrees from TL.T0 (piecewise-linear, so it inverts exactly)
    let d = 0, a = TL.T0;
    for (const [b, r] of DIAL_SEG) { if (y <= b) return d + (y - a) / r; d += (b - a) / r; a = b; }
    return d;
  };
  const yearOfDeg = (deg) => {
    let d = 0, a = TL.T0;
    for (const [b, r] of DIAL_SEG) { const span = (b - a) / r; if (deg <= d + span) return a + (deg - d) * r; d += span; a = b; }
    return TL.NOW;
  };
  $('tdTicks').innerHTML = Array.from({ length: 36 }, (_, i) =>
    `<line class="${i % 9 ? '' : 'maj'}" x1="50" y1="${i % 9 ? 8.5 : 7}" x2="50" y2="${i % 9 ? 13 : 15}" transform="rotate(${i * 10} 50 50)"/>`).join('');
  dial.setAttribute('aria-valuemin', TL.T0); dial.setAttribute('aria-valuemax', TL.NOW);
  function updateDial() {
    const y = TL.yearInt(MS.tYear);
    $('tdTicks').setAttribute('transform', `rotate(${(degOf(MS.tYear) % 360).toFixed(2)} 50 50)`);
    $('tdYear').textContent = TL.yearLabel(y);
    dial.setAttribute('aria-valuenow', y); dial.setAttribute('aria-valuetext', TL.yearLabel(y));
  }
  const turnBy = (deg) => { stopPlay(); setActiveYear(yearOfDeg(degOf(MS.tYear) + deg), true); };
  let dialDrag = null, dialPanelT = 0;
  const dialAng = (ev) => { const r = dial.getBoundingClientRect(); return Math.atan2(ev.clientY - r.top - r.height / 2, ev.clientX - r.left - r.width / 2) * 180 / Math.PI; };
  dial.addEventListener('pointerdown', (ev) => { dialDrag = dialAng(ev); capture(dial, ev); dial.classList.add('drag'); ev.preventDefault(); });
  dial.addEventListener('pointermove', (ev) => {
    if (dialDrag == null) return;
    const a = dialAng(ev); let d = a - dialDrag; dialDrag = a;
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    turnBy(d);
    if (ev.timeStamp - dialPanelT > 250) { dialPanelT = ev.timeStamp; updatePanel(); }
  });
  const endDial = () => { if (dialDrag == null) return; dialDrag = null; dial.classList.remove('drag'); updatePanel(); syncHash(); };
  dial.addEventListener('pointerup', endDial); dial.addEventListener('pointercancel', endDial);
  dial.addEventListener('wheel', (ev) => { ev.preventDefault(); ev.stopPropagation(); turnBy(Math.sign(ev.deltaY) * 10); updatePanel(); }, { passive: false });
  dial.addEventListener('keydown', (ev) => {
    const step = { ArrowRight: 10, ArrowUp: 10, ArrowLeft: -10, ArrowDown: -10, PageUp: 90, PageDown: -90 }[ev.key];
    if (step == null) return;
    ev.preventDefault(); ev.stopPropagation(); turnBy(step); updatePanel(); syncHash();
  });

  // ---------- keyboard ----------
  window.addEventListener('keydown', (ev) => {
    const t = ev.target, k = ev.key;
    const typing = (t.tagName === 'INPUT' && !/^(checkbox|radio|button)$/.test(t.type)) || t.tagName === 'TEXTAREA' || t.isContentEditable;
    if (!typing && k === 'Escape' && openModalId()) { closeModal(); return; }
    if (!typing && k === 'Escape' && tourOn()) { endTour(); return; }
    if (!typing && k === 'Escape' && openPop()) { const id = openPop(); closePops(); $(POPS[id]).focus(); return; }
    if (t.tagName === 'INPUT' || typing) return; // a checkbox keeps Space for itself
    // leave browser shortcuts (Ctrl/⌘ + …) alone, and let a focused button, link or slider handle its own keys
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (openModalId()) return;
    if (k === '?' || k === '؟') { ev.preventDefault(); openModal('help'); return; } // ؟ on a Persian keyboard
    if ((ev.code === 'Space' || k === 'Enter') && t.closest && t.closest('button, a, summary, select, [role="slider"], [role="option"], [role="button"], [role="separator"]')) return;
    if (k === '/') { ev.preventDefault(); $('q').focus(); return; }
    if (ev.code === 'Space') { ev.preventDefault(); togglePlay(); return; }
    if (k === 'ArrowLeft' || k === 'ArrowRight') { panPx((k === 'ArrowLeft' ? 1 : -1) * S.PW * 0.15); redrawTL(); }
    else if (k === 'ArrowUp' || k === 'ArrowDown') { S.scrollY += k === 'ArrowDown' ? 80 : -80; R.clampView(); redrawTL(); }
    else if (k === '+' || k === '=') zoomAt(S.PW / 2, 1.35);
    else if (k === '-') zoomAt(S.PW / 2, 1 / 1.35);
    else if (k === 'Escape') { S.focus = null; updatePanel(); redrawTL(); syncHash(); }
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
      const alive = S.pinYear != null && S.pinYear >= it.s && S.pinYear <= it.e;
      const here = alive && TL.personGeo ? TL.personGeo(it, S.pinYear) : null;
      const age = alive ? ` (${TL.fa(Math.floor(S.pinYear - it.s))} ساله در این سال)` : '';
      sub = (TL.PKIND[it.k] || '') + (g && g[2] ? ' · زادگاه: ' + g[2] : '') + (here && g && here[2] !== g[2] ? ' · در این سال در ' + here[2] : '') + age;
    }
    const dur = t !== 'event' ? ` · ${TL.fa(TL.duration(it.s, Math.min(it.e, TL.NOW)))} سال` : '';
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
    // Capital, government and head of state, from the timeline polity or data/map-info.js
    const f = TL.mapFacts ? TL.mapFacts(ent ? ent.en : '', p ? p.id : '', y)
      : { cap: p ? p.cap : '', g: '', rul: p ? M.activeRulers(p.id, y) : [], kind: '' };
    const facts = (f.rul.length ? `<p>فرمانروا در این سال: <b>${esc(f.rul.map(r => r.n + (r.t ? ` (${r.t})` : '')).join('، '))}</b>${f.rul.some(r => r.a) ? ' · تاریخ تقریبی' : ''}</p>` : '') +
      (f.cap || f.g ? `<p>${f.cap ? 'پایتخت: ' + esc(f.cap) : ''}${f.cap && f.g ? ' · ' : ''}${esc(f.g)}</p>` : '') +
      (f.kind === 'people' ? '<p>فرهنگ / قوم، بدون حکومت متمرکز</p>' : f.kind === 'group' ? '<p>چند حکومت کوچک، بدون پایتخت واحد</p>' : '');
    if (p) {
      const area = p.prof ? R.areaAt(p, y) : 0;
      const regN = TL.regionById[p.r] ? TL.regionById[p.r].n : '';
      tip.innerHTML = `<h4>${esc(h.effFa || p.n)}</h4><div class="en">${esc(ent.en || p.en || regN)}</div>` +
        `<div class="yr">${TL.spanLabel(p.s, p.e, p.a)}${area >= 0.4 ? ' · حدود ' + TL.fa(area.toFixed(1)) + ' م.ک²' : ''}</div>` +
        facts + (p.d ? `<p>${esc(p.d)}</p>` : '');
    } else if (ent) {
      const sy = h.sy != null ? h.sy : MS.snapYear; // the era of the shape under the pointer
      const precTxt = sy === 2010 ? 'مرز دقیق کنونی (Natural Earth 50m)' : (sy >= 1914 ? 'مرز دقیق نقشه‌برداری‌شده' : (ent.prec === 1 ? 'مرز تقریبی تاریخی' : 'مرز تاریخی مستند'));
      tip.innerHTML = `<h4>${esc(h.effFa || ent.fa)}</h4>${ent.en && ent.en !== h.effFa ? `<div class="en">${esc(ent.en)}</div>` : ''}` +
        `<div class="yr">${sy === 2010 ? precTxt : `نقشهٔ دورهٔ ${TL.yearLabel(sy)} · ${precTxt}`}</div>` + facts;
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
    return `<div class="it it-${type}" data-k="${id}" role="button" tabindex="0"><i class="dot" style="background:${dot}"></i><div class="tx">` +
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
      meta += maxA >= 0.4 ? `<span>بیشینهٔ قلمرو: <b>${TL.fa(maxA.toFixed(1))} میلیون کیلومتر مربع</b></span>` : '';
      meta += `<span>مدت: <b>${TL.fa(TL.duration(it.s, Math.min(it.e, TL.NOW)))} سال</b></span>`;
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
    return `<div class="pow-box"><div class="pow-h"><span>بزرگ‌ترین قدرت‌های ${TL.yearLabel(Math.floor(y))}</span><span>میلیون کیلومتر مربع</span></div>` +
      ranked.map(({ p, a }) => {
        const id = register(p, 'polity');
        return `<div class="pow-r it" data-k="${id}" role="button" tabindex="0"><div class="pow-l"><span class="pow-nm"><i style="width:7px;height:7px;border-radius:50%;background:${p.base};flex:none"></i><span>${esc(p.n)}</span></span><span class="pow-v">${TL.fa(a.toFixed(1))}</span></div><div class="pow-tr"><div class="pow-f" style="width:${(a / maxA) * 100}%;background:${p.base}"></div></div></div>`;
      }).join('') + '</div>';
  }

  function domHTML(emp) {
    if (!emp || !emp.dom) return '';
    const rows = emp.dom.slice().sort((p, q) => p.s - q.s).map(p => {
      const id = register(p, 'polity');
      return `<div class="it" data-k="${id}" role="button" tabindex="0"><i class="dot" style="background:${p.base}"></i><div class="tx"><div class="l1"><span class="nm">${esc(TL.regionById[p.r].n)}</span>` +
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
    const single = a === b, y = TL.yearInt(single ? a : (S.pinYear ?? a));
    pY.textContent = single ? TL.yearLabel(y) : TL.spanLabel(a, b);
    const c = TL.calendars(single ? y : Math.floor(a));
    pC.textContent = c ? `خورشیدی ${c.sh} · قمری ${c.ah}` + (single ? '' : ' (سال آغاز)') : (y < 0 ? 'پیش از میلاد' : 'پیش از هجرت');
    pF.textContent = S.focus ? `هم‌زمان با «${S.focus.item.n}»` : '';

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
    if (ev.target.id === 'clearFocus') { S.focus = null; updatePanel(); redrawTL(); syncHash(); return; }
    const btn = ev.target.closest('.dom-btn');
    if (btn) { const emp = TL.polityById[btn.dataset.emp]; setShow(new Set(emp.dom.map(p => p.r).concat(emp.r).filter(r => r !== 'iran'))); return; }
    const el = ev.target.closest('.it'); if (!el) return;
    const [it, type] = reg[+el.dataset.k]; select(it, type, true);
  });
  // rows are role="button": Enter or Space opens them; the panel is rebuilt, so focus moves to the new card
  $('pBody').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const el = ev.target.closest('.it[role="button"]'); if (!el) return;
    ev.preventDefault();
    const [it, type] = reg[+el.dataset.k]; select(it, type, true);
    const card = $('pBody').querySelector('.feat-card');
    if (card) { card.setAttribute('tabindex', '-1'); card.focus(); }
  });

  function openPanel(force) {
    const m = $('main'), btn = $('btnPanel');
    const open = force === true ? true : force === false ? false : m.classList.contains('nopanel');
    m.classList.toggle('nopanel', !open); btn.setAttribute('aria-expanded', String(open)); btn.classList.toggle('tbtn-on', open);
    if (window.innerWidth <= 1100) $('panel').hidden = !open; else $('panel').hidden = false;
  }
  $('btnPanel').onclick = () => openPanel();
  $('panelX').onclick = () => { openPanel(false); $('btnPanel').focus(); };

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
    // the same name with no spaces, so «آلبویه» (typed without the half-space) still finds «آل‌بویه»
    row.tightKey = row.nameKey.replace(/ /g, '');
  });

  // Years typed in any common way: Persian or Arabic digits; پ.م / ق.م for BC; ش / ه.ش for Solar Hijri; ق / ه.ق for Lunar Hijri.
  // Returns a list of [year, label-suffix] choices (a bare 1357 could be AD or Solar Hijri, so both are offered).
  function parseYearQuery(raw) {
    const s = raw.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').replace(/‌/g, ' ').trim();
    const m = s.match(/^(-?\d{1,5})\s*(پ\s*\.?\s*م|ق\s*\.?\s*م|bce?|ه\s*\.?\s*ش|ش|خورشیدی|ه\s*\.?\s*ق|ق|قمری|م|ad|ce)?\.?$/i);
    if (!m) return [];
    const n = parseInt(m[1], 10), suf = (m[2] || '').toLowerCase().replace(/[\s.]/g, '');
    if (n === 0) return [];
    const ok = (y) => y >= TL.T0 && y <= TL.NOW;
    const solar = (v) => v + 621, lunar = (v) => Math.floor(v * 0.970224 + 621.5669);
    let out;
    if (/^(پم|قم|bce?)$/.test(suf)) out = [[-Math.abs(n), '']];
    else if (/^(هش|ش|خورشیدی)$/.test(suf)) out = [[solar(n), ` (${TL.fa(n)} خورشیدی)`]];
    else if (/^(هق|ق|قمری)$/.test(suf)) out = [[lunar(n), ` (${TL.fa(n)} قمری)`]];
    else {
      out = [[n, '']];
      // a bare number that reads like a Solar Hijri year: offer that too
      if (!suf && n >= 1 && ok(solar(n)) && n <= Math.floor(TL.NOW) - 621) out.push([solar(n), ` (${TL.fa(n)} خورشیدی)`]);
    }
    return out.filter(([y]) => ok(y));
  }

  const q = $('q'), qres = $('qres'); let qsel = 0, qlist = [];
  // the search box is a combobox: its list's visibility and highlighted option are announced to screen readers
  function showList(open) { qres.hidden = !open; q.setAttribute('aria-expanded', String(open)); if (!open) q.removeAttribute('aria-activedescendant'); }
  function markSel() {
    [...qres.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === qsel)));
    const li = qres.children[qsel];
    if (li && li.id) { q.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
  }
  function runSearch() {
    const raw = q.value.trim(), s = TL.norm(raw);
    qlist = []; qsel = 0;
    if (!raw) { showList(false); return; }
    parseYearQuery(raw).forEach(([y, note]) => qlist.push([{ n: 'پرش به سال ' + TL.yearLabel(y) + note, y }, 'jump', 'برش زمان']));
    if (s.length >= 2) {
      const parts = s.split(' '), tight = s.replace(/ /g, '');
      const byName = index.filter(r => parts.every(p => r.nameKey.includes(p)) || (tight.length >= 3 && r.tightKey.includes(tight))).sort((a, b) => a[0].n.length - b[0].n.length);
      const byFull = byName.length < 10 ? index.filter(r => !byName.includes(r) && parts.every(p => r.fullKey.includes(p))) : [];
      qlist = qlist.concat(byName.slice(0, 12), byFull.slice(0, 6)).slice(0, 14);
    }
    if (!qlist.length && s.length < 2) { showList(false); return; }
    qsel = 0;
    qres.innerHTML = qlist.map((r, i) => `<li role="option" id="qopt-${i}" data-i="${i}" aria-selected="${i === 0}"><span>${esc(r[0].n)}</span><span class="k">${esc(r[2])}</span></li>`).join('') ||
      '<li role="option" aria-disabled="true"><span>یافت نشد · نام را کوتاه‌تر یا به شکل دیگری بنویسید</span></li>';
    showList(true); markSel();
  }
  function pick(i) {
    const r = qlist[i]; if (!r) return;
    showList(false); q.blur(); stopPlay();
    if (r[1] === 'jump') {
      S.focus = null; setActiveYear(r[0].y, false); animateTo(r[0].y - 120, r[0].y + 120); updatePanel(); syncHash(); return;
    }
    select(r[0], r[1], true);
  }
  q.addEventListener('input', runSearch);
  q.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault(); if (!qlist.length) return;
      if (qres.hidden) showList(true);
      qsel = (qsel + (ev.key === 'ArrowDown' ? 1 : -1) + qlist.length) % qlist.length; markSel();
    }
    if (ev.key === 'Enter') pick(qsel);
    if (ev.key === 'Escape') { showList(false); q.blur(); }
  });
  qres.addEventListener('pointerdown', (ev) => { const li = ev.target.closest('li[data-i]'); if (li) { ev.preventDefault(); pick(+li.dataset.i); } });
  q.addEventListener('blur', () => setTimeout(() => showList(false), 150));

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

  // ---------- popovers (layers, regions, more eras): one open at a time, each button's aria-expanded kept in sync ----------
  const POPS = { layers: 'btnLayers', regions: 'btnRegions', moreEras: 'btnMoreEras' };
  function setPop(id, open) { $(id).hidden = !open; $(POPS[id]).setAttribute('aria-expanded', String(open)); }
  function closePops(except) { for (const id in POPS) if (id !== except) setPop(id, false); }
  function togglePop(id) {
    const open = $(id).hidden; closePops(id); setPop(id, open);
    if (open) { const f = $(id).querySelector('button, input'); if (f) f.focus({ preventScroll: true }); }
  }
  // Esc inside a popover closes it and puts focus back on its button
  const openPop = () => Object.keys(POPS).find(id => !$(id).hidden);

  function handleEraClick(ev) {
    const b = ev.target.closest('.chip[data-i]'); if (!b) return;
    document.querySelectorAll('.chip.on').forEach(x => x.classList.remove('on')); b.classList.add('on');
    setPop('moreEras', false);
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
  $('btnMoreEras').onclick = () => togglePop('moreEras');

  // ---------- toolbar ----------
  $('btnScale').onclick = () => {
    const c = R.yearAt(S.PW / 2), [v0, v1] = R.visRange();
    TL.scaleMode = TL.scaleMode === 'warp' ? 'linear' : 'warp';
    $('btnScale').textContent = TL.scaleMode === 'warp' ? 'فشرده' : 'خطی';
    $('btnScale').title = TL.scaleMode === 'warp' ? 'گذشتهٔ دور جای کمتری می‌گیرد. برای اینکه هر سال یک اندازه باشد بزنید.' : 'هر سال یک اندازه است. برای جای کمتر به گذشتهٔ دور بزنید.';
    R.fit(v0, v1, 0); if (TL.scaleMode === 'linear') { S.u0 = TL.u(c) - S.PW / S.k / 2; R.clampView(); } redrawTL();
  };
  $('btnDir').onclick = () => {
    S.dir = S.dir === 'ltr' ? 'rtl' : 'ltr';
    $('btnDir').textContent = S.dir === 'ltr' ? 'گذشته در چپ' : 'گذشته در راست';
    redrawTL();
  };

  // the inline script in <head> already applied the saved theme before first paint; read it back from there
  let dark = document.documentElement.getAttribute('data-theme') !== 'light';
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    $('btnTheme').textContent = dark ? '☀' : '☾';
    $('btnTheme').title = dark ? 'تغییر به پوستهٔ روشن' : 'تغییر به پوستهٔ تیره';
    $('btnTheme').setAttribute('aria-label', $('btnTheme').title);
    MS.dark = dark;
    try { localStorage.setItem('giti-nama-theme', dark ? 'dark' : 'light'); localStorage.removeItem('jam-atlas-theme'); } catch (e) { }
    R.readTheme(); redrawTL();
  }
  $('btnTheme').onclick = () => { dark = !dark; applyTheme(); };

  $('btnLayers').onclick = () => togglePop('layers');
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
    try { localStorage.setItem('giti-nama-regions', S.show ? [...S.show].join(',') || '-' : ''); localStorage.removeItem('jam-regions'); } catch (e) { }
    if (!keepPopover) setPop('regions', false);
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
  $('btnRegions').onclick = () => togglePop('regions');
  try { const v = localStorage.getItem('giti-nama-regions') ?? localStorage.getItem('jam-regions'); if (v) S.show = new Set(v === '-' ? [] : v.split(',')); } catch (e) { }

  // Close popovers on outside click
  document.addEventListener('pointerdown', (ev) => {
    for (const id in POPS) if (!$(id).hidden && !ev.target.closest(`#${id},#${POPS[id]}`)) setPop(id, false);
  });

  // ---------- dialogs (help, about) ----------
  // focus moves into the dialog, Tab stays inside it, and closing returns focus to where it was
  const MODALS = ['help', 'about'];
  let modalReturn = null;
  const openModalId = () => MODALS.find(id => !$(id).hidden);
  function openModal(id) {
    if (!openModalId()) modalReturn = document.activeElement;
    closePops(); if (tourOn()) endTour();
    MODALS.forEach(m => ($(m).hidden = m !== id));
    $(id).querySelector('[data-close]').focus();
  }
  function closeModal() {
    const id = openModalId(); if (!id) return;
    $(id).hidden = true;
    const back = modalReturn && document.contains(modalReturn) && modalReturn.offsetParent ? modalReturn : $('btnHelp');
    back.focus();
  }
  MODALS.forEach(id => {
    $(id).addEventListener('click', (ev) => { if (ev.target.id === id || ev.target.closest('[data-close]')) closeModal(); });
    $(id).addEventListener('keydown', (ev) => {
      if (ev.key !== 'Tab') return;
      const f = [...$(id).querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
  });
  $('btnAbout').onclick = () => openModal('about');
  $('btnHelp').onclick = () => openModal('help');

  // ---------- help: how to read the timeline and the map, and how to move around ----------
  const K = TL.KIND, gold = 'var(--gold)';
  const lg = (svg, html) => `<li><svg viewBox="0 0 58 26" aria-hidden="true">${svg}</svg><span>${html}</span></li>`;
  const peopleKinds = Object.entries(TL.PKIND).map(([k, n]) => `<span><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="6.5" width="14" height="3" rx="1.5" fill="${(K[TL.PKINDK[k]] || K.pol).c}"/></svg>${n}</span>`).join('');
  $('helpBody').innerHTML = `
    <h3>نمودار زمانی را چطور بخوانیم</h3>
    <ul class="lg-grid">
      ${lg('<path d="M2 13C10 13 14 5 28 5S48 9 56 13C48 17 40 21 28 21S10 13 2 13Z" fill="#5f9e8f"/>', '<b>هر نوار رنگی یک حکومت است.</b> درازای آن عمر حکومت است و ضخامتش وسعت قلمروش در هر سال.')}
      ${lg('<defs><linearGradient id="lgf" x1="0" x2="1"><stop offset="0" stop-color="#c79a4a" stop-opacity="0"/><stop offset=".45" stop-color="#c79a4a"/></linearGradient></defs><rect x="2" y="7" width="54" height="12" rx="6" fill="url(#lgf)"/>', '<b>لبهٔ محو</b> یعنی سال آغاز یا پایان آن تقریبی است.')}
      ${lg('<rect x="2" y="2" width="54" height="22" rx="3" fill="#5b7fd0" opacity=".14"/><rect x="2" y="8" width="54" height="10" rx="3" fill="#4767b4"/>', '<b>نوار «زیر فرمان …»</b> یعنی آن سرزمین در آن سال‌ها جزو امپراتوری‌ای بزرگ‌تر بوده است.')}
      ${lg('<rect x="2" y="8" width="17" height="10" rx="3" fill="#7d6a4a"/><rect x="21" y="8" width="22" height="10" rx="3" fill="#6b5a3e"/><rect x="45" y="8" width="11" height="10" rx="3" fill="#7d6a4a"/>', '<b>ردیف فرمانروایان:</b> هر تکه یک فرمانروا؛ روی آن بزنید تا دربارهٔ او بخوانید.')}
      ${lg(`<rect x="10" y="11" width="38" height="4" rx="2" fill="${K.war.c}" opacity=".3"/><circle cx="10" cy="13" r="6" fill="none" stroke="${K.war.c}" stroke-width="1.4"/><path d="M7 10l6 6M13 10l-6 6" stroke="${K.war.c}" stroke-width="1.6" stroke-linecap="round"/><polygon points="44,8 49,13 44,18 39,13" fill="${K.pol.c}"/>`, '<b>نشانه‌های رویداد:</b> شکلش نوع رویداد است (فهرست پایین) و بزرگ‌تر یعنی مهم‌تر. خط کمرنگ یعنی رویدادی چندساله.')}
      ${lg(`<rect x="4" y="8" width="30" height="3" rx="1.5" fill="${K.cul.c}"/><rect x="22" y="15" width="32" height="3" rx="1.5" fill="${K.sci.c}"/>`, '<b>خط‌های باریک</b> عمر چهره‌های نامدار است؛ رنگ هر خط نوع کار اوست.')}
      ${lg(`<line x1="29" y1="1" x2="29" y2="25" stroke="${gold}" stroke-width="2"/><rect x="17" y="1" width="24" height="9" rx="4.5" fill="${gold}"/>`, '<b>خط طلایی</b> سالِ انتخاب‌شده است. نقشه و ستون «برش زمان» همین سال را نشان می‌دهند.')}
      ${lg('<rect x="2" y="4" width="54" height="7" rx="2" fill="currentColor" opacity=".12"/><rect x="2" y="15" width="54" height="7" rx="2" fill="currentColor" opacity=".22"/><rect x="20" y="15" width="12" height="7" rx="1" fill="none" stroke="var(--gold)"/>', '<b>پایین نمودار</b> سال خورشیدی و قمری است. نوار کوچک پایین صفحه همهٔ تاریخ را نشان می‌دهد؛ روی آن بزنید تا به هر دوره بپرید.')}
    </ul>
    <h3>رنگ خط چهره‌ها</h3>
    <div class="lg-marks">${peopleKinds}</div>
    <h3>نشانه‌های نقشه و رویدادها</h3>
    <div class="lg-marks">${$('mapLegend').innerHTML}</div>
    <h3>کار با گیتی‌نما</h3>
    <table class="help-keys"><tbody>
      <tr><td>جابه‌جایی در زمان</td><td>نمودار را بکشید، یا <kbd>←</kbd> <kbd>→</kbd></td></tr>
      <tr><td>بزرگ‌نمایی</td><td>چرخ موس یا دو انگشت، روی نقشه یا نمودار؛ روی نمودار <kbd>+</kbd> <kbd>-</kbd> هم کار می‌کند</td></tr>
      <tr><td>انتخاب یک سال</td><td>روی نمودار بزنید؛ یا چرخ زمان را بچرخانید</td></tr>
      <tr><td>دیدن جزئیات</td><td>روی هر حکومت، فرمانروا، رویداد یا چهره بزنید</td></tr>
      <tr><td>پخش و توقف</td><td>دکمهٔ پخش یا <kbd>Space</kbd></td></tr>
      <tr><td>جست‌وجو</td><td><kbd>/</kbd>؛ نام، جا یا سال، مثلاً «حافظ» یا «۵۵۰ پ.م» یا «۱۳۵۷ ش»</td></tr>
      <tr><td>پاک‌کردن انتخاب</td><td><kbd>Esc</kbd></td></tr>
      <tr><td>همین راهنما</td><td><kbd>?</kbd></td></tr>
    </tbody></table>
    <div class="help-foot">
      <button type="button" class="sbtn sbtn-main" id="helpTour">راهنمای گام‌به‌گام</button>
      <button type="button" class="lnk" id="helpAbout">دربارهٔ گیتی‌نما و منابع</button>
    </div>`;
  $('helpTour').onclick = () => { closeModal(); startTour(); };
  $('helpAbout').onclick = () => openModal('about');

  // ---------- about: what the site is, where the data comes from, how accurate it is ----------
  const counts = `${TL.fa(TL.polities.length)} حکومت و تمدن، ${TL.fa(TL.rulers.length)} فرمانروا، ${TL.fa(TL.events.length)} رویداد و ${TL.fa(TL.people.length)} چهره`;
  const REPO = 'https://github.com/shahab7e/giti-nama';
  $('aboutBody').innerHTML = `<p><b>گیتی‌نما</b> تاریخ جهان را با محوریت ایران نشان می‌دهد: ${counts} در ${TL.fa(TL.regions.length)} سرزمین، از نوسنگی زاگرس تا امروز، روی نقشه‌ای با مرزهای تاریخی و نمودار زمانی زیر آن. ایران همیشه بالای نمودار است تا دیده شود هم‌زمان با هر دوره از تاریخ ایران، بقیهٔ دنیا چه خبر بوده است.</p>
  <h3>منابع</h3>
  <ul>
  <li><b>مرزهای پیش از ۱۹۱۴:</b> بر پایهٔ <a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noopener">historical-basemaps</a> (پروانهٔ GPLv3)، با اصلاح‌های تاریخی برای ایران، خاور نزدیک، آسیای میانه، چین، هند و مدیترانه. این مرزها برای دوران کهن منحنی‌های نرم و تقریبی‌اند و از سدهٔ نوزدهم به بعد دقیق‌تر می‌شوند.</li>
  <li><b>خشکی، دریاها، رودها و مرزهای امروزی:</b> <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a> (۱:۵۰ میلیون).</li>
  <li><b>وسعت قلمروها:</b> برآوردی‌اند؛ بیشینهٔ بیشترشان از فهرست «بزرگ‌ترین امپراتوری‌ها»ی ویکی‌پدیا آمده است.</li>
  <li><b>قلم‌ها:</b> <a href="https://github.com/rastikerdar/vazirmatn" target="_blank" rel="noopener">وزیرمتن</a> و <a href="https://github.com/simoncozens/Gulzar" target="_blank" rel="noopener">گلزار</a>، با پروانهٔ SIL Open Font License.</li>
  </ul>
  <h3>دربارهٔ دقت</h3>
  <p>تاریخ‌های کهن، به‌ویژه پیش از هزارهٔ یکم پ.م، تقریبی‌اند و در نمودار با لبه‌های محو نشان داده می‌شوند. سال‌های خورشیدی و قمری تقریبی‌اند و از روی سال میلادی حساب می‌شوند. اگر خطایی دیدید، <a href="${REPO}/issues" target="_blank" rel="noopener">آن را گزارش کنید</a> یا خودتان اصلاحش را <a href="${REPO}" target="_blank" rel="noopener">در گیت‌هاب</a> بفرستید.</p>`;

  // ---------- toast: a short message at the bottom of the screen, with an optional action ----------
  let toastT = 0;
  function toast(msg, actLabel, onAct, ms = 6000) {
    $('toastMsg').textContent = msg;
    const a = $('toastAct'); a.hidden = !actLabel; a.textContent = actLabel || '';
    a.onclick = () => { $('toast').hidden = true; if (onAct) onAct(); };
    $('toast').hidden = false; clearTimeout(toastT); toastT = setTimeout(() => ($('toast').hidden = true), ms);
  }

  // ---------- first-visit tour: a spotlight on each main part of the page, one at a time ----------
  const TOUR = [
    { el: 'mapStage', t: 'نقشهٔ زنده', d: 'مرزهای جهان در سالِ انتخاب‌شده. نقشه را بکشید و زوم کنید، و روی هر کشور یا نشانه بزنید تا دربارهٔ آن بخوانید.' },
    { el: 'stage', t: 'نمودار زمانی', d: 'هر نوار رنگی یک حکومت است و ضخامتش وسعت قلمروش. ایران همیشه بالاست. روی نمودار بزنید تا نقشه به همان سال برود.' },
    { el: 'playDeck', t: 'پخش تاریخ', d: 'تاریخ را جلو ببرید و جابه‌جایی مرزها را تماشا کنید. چرخ زمان کنار نقشه هم سال را جابه‌جا می‌کند.' },
    { el: 'btnPanel', t: 'برش زمان', d: 'فهرست هر آنچه در همان سال در جهان بوده است: حکومت‌ها، فرمانروایان، رویدادها و چهره‌ها.' },
    { el: 'q', t: 'جست‌وجو', d: 'نام، جا یا سال را بنویسید؛ مثلاً «حافظ»، «چالدران» یا «۵۵۰ پ.م».' },
    { el: 'btnHelp', t: 'راهنما', d: 'معنای رنگ‌ها و نشانه‌ها و همهٔ میان‌برها اینجاست. هر وقت خواستید، این راهنما را هم از همان‌جا دوباره ببینید.' },
  ];
  let tourI = -1, tourSteps = [];
  const tourOn = () => tourI >= 0;
  const visible = (el) => el && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
  function startTour() {
    hideHint(); stopPlay(); closePops();
    tourSteps = TOUR.filter(s => visible($(s.el)));
    if (!tourSteps.length) return;
    tourI = 0; $('tour').hidden = false; showStep();
  }
  function showStep() {
    const st = tourSteps[tourI], r = $(st.el).getBoundingClientRect(), pad = 6, W = innerWidth, H = innerHeight;
    const sx = Math.max(4, r.left - pad), sy = Math.max(4, r.top - pad);
    Object.assign($('tourSpot').style, { left: sx + 'px', top: sy + 'px', width: (Math.min(W - 4, r.right + pad) - sx) + 'px', height: (Math.min(H - 4, r.bottom + pad) - sy) + 'px' });
    $('tourStep').textContent = `گام ${TL.fa(tourI + 1)} از ${TL.fa(tourSteps.length)}`;
    $('tourT').textContent = st.t; $('tourD').textContent = st.d;
    $('tourPrev').hidden = tourI === 0;
    $('tourNext').textContent = tourI === tourSteps.length - 1 ? 'پایان' : 'بعدی';
    // below the target if it fits, else above, else over the target's lower part
    const card = $('tourCard'), cw = card.offsetWidth, ch = card.offsetHeight, gap = 12;
    let top = r.bottom + gap;
    if (top + ch > H - 16) top = r.top - gap - ch >= 16 ? r.top - gap - ch : Math.max(16, Math.min(H - ch - 16, r.bottom - ch - 16));
    const left = Math.max(16, Math.min(W - cw - 16, r.left + r.width / 2 - cw / 2));
    Object.assign(card.style, { top: top + 'px', left: left + 'px' });
    card.focus({ preventScroll: true });
  }
  function endTour() {
    if (!tourOn()) return;
    tourI = -1; $('tour').hidden = true;
    try { localStorage.setItem('giti-nama-tour', 'done'); } catch (e) { }
  }
  $('tourNext').onclick = () => { if (tourI < tourSteps.length - 1) { tourI++; showStep(); } else endTour(); };
  $('tourPrev').onclick = () => { if (tourI > 0) { tourI--; showStep(); } };
  $('tourSkip').onclick = endTour;
  window.addEventListener('resize', () => { if (tourOn()) showStep(); });

  // ---------- minimap ----------
  let mW = 0, mH = 0;
  function sizeMini() { const r = mm.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); mW = r.width; mH = r.height; mm.width = mW * d; mm.height = mH * d; mctx.setTransform(d, 0, 0, d, 0, 0); }
  const mx = (y) => { const t = (TL.u(y) - TL.U0()) / (TL.U1() - TL.U0()); return S.dir === 'ltr' ? t * mW : mW - t * mW; };
  function drawMini() {
    if (!mW) return;
    mctx.clearRect(0, 0, mW, mH);
    mctx.fillStyle = S.dark ? '#0f1219' : '#efe7d4'; mctx.fillRect(0, 0, mW, mH);
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
  mm.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    mdrag = true; capture(mm, ev); mmGo(ev);
  });
  mm.addEventListener('pointermove', (ev) => { if (mdrag) mmGo(ev); });
  const endMini = () => { if (!mdrag) return; mdrag = false; updatePanel(); syncHash(); };
  mm.addEventListener('pointerup', endMini); mm.addEventListener('pointercancel', endMini);

  // ---------- URL hash deep-linking ----------
  // #y=<year> plus at most one selection — p=<polity id>, r=<polity id>:<reign start>, e=<event name>, f=<figure name> —
  // and v=map|timeline for a full-page view. A new selection adds a browser history entry (so Back undoes it);
  // moving through time only updates the current one.
  let restoring = false;
  function hashOf() {
    const parts = [], f = S.focus;
    if (S.pinYear != null) parts.push('y=' + TL.yearInt(S.pinYear));
    if (f) {
      const it = f.item;
      if (f.type === 'polity') parts.push('p=' + encodeURIComponent(it.id));
      else if (f.type === 'ruler') parts.push('r=' + encodeURIComponent(it.pid + ':' + it.s));
      else if (f.type === 'event') parts.push('e=' + encodeURIComponent(it.n));
      else if (f.type === 'person') parts.push('f=' + encodeURIComponent(it.n));
    }
    const v = ws.getAttribute('data-view'); if (v === 'map' || v === 'timeline') parts.push('v=' + v);
    return parts.length ? '#' + parts.join('&') : '';
  }
  const selOf = (h) => h.replace(/^#/, '').split('&').filter(x => /^[pref]=/.test(x)).join('&');
  function syncHash() {
    if (restoring) return;
    const h = hashOf(); if (h === location.hash) return;
    const url = h || location.pathname + location.search;
    try { history[selOf(h) !== selOf(location.hash) ? 'pushState' : 'replaceState'](null, '', url); } catch (e) { }
  }
  function itemFromHash(q) {
    if (q.p && TL.own(TL.polityById, q.p)) return [TL.polityById[q.p], 'polity'];
    if (q.r) { const i = q.r.lastIndexOf(':'), pid = q.r.slice(0, i), st = +q.r.slice(i + 1); const r = TL.rulers.find(x => x.pid === pid && x.s === st); if (r) return [r, 'ruler']; }
    if (q.e) { const e = TL.events.find(x => x.n === q.e); if (e) return [e, 'event']; }
    if (q.f) { const p = TL.people.find(x => x.n === q.f); if (p) return [p, 'person']; }
    return null;
  }
  function loadHash() {
    const q = {};
    (location.hash || '').slice(1).split('&').forEach(x => { const i = x.indexOf('='); if (i > 0) { try { q[x.slice(0, i)] = decodeURIComponent(x.slice(i + 1)); } catch (e) { } } });
    restoring = true;
    try {
      setView(q.v === 'map' || q.v === 'timeline' ? q.v : 'split');
      const hit = itemFromHash(q), y = q.y !== undefined && q.y !== '' && isFinite(+q.y) ? +q.y : null;
      if (hit) select(hit[0], hit[1], true); else S.focus = null;
      if (y != null) { setActiveYear(y, false, true); if (!hit) R.fit(y - 350, y + 350, 0.04); }
      updatePanel(); redrawTL();
      return !!(hit || y != null);
    } finally { restoring = false; }
  }
  // Back / Forward, and a link pasted into this same tab
  window.addEventListener('popstate', () => loadHash());
  window.addEventListener('hashchange', () => loadHash());

  // ---------- share: copy a link to this year and selection (or open the phone's share sheet) ----------
  $('btnShare').onclick = async () => {
    syncHash();
    const url = location.href, title = document.title;
    const text = (S.focus ? S.focus.item.n + ' · ' : '') + $('pYear').textContent + ' · گیتی‌نما';
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); toast('پیوند کپی شد. هر کس آن را باز کند، همین سال و همین انتخاب را می‌بیند.'); }
    catch (e) { toast('این پیوند را کپی کنید: ' + url, null, null, 12000); }
  };

  // ---------- hint ----------
  let hintT = setTimeout(hideHint, 9500);
  function hideHint() { clearTimeout(hintT); $('hint').classList.add('off'); }

  // ---------- main animation loop ----------
  // The map is redrawn every frame only while something moves (playback, camera or year easing, an ink flood,
  // a cross-fade) or for a moment after the user touches anything. Otherwise its small ambient animations
  // (moving dashes, ripples) run at a calm 12 fps, and after 30 s without input the map stops redrawing.
  const IDLE_FRAME_MS = 1000 / 12, IDLE_STOP_MS = 30000, ACTIVE_MS = 1500;
  const calm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  let panelTick = 0, lastInput = performance.now(), lastMapT = 0, histReady = false; // the first frame that sees TL.HIST hides the loading note
  const poke = () => { lastInput = performance.now(); };
  ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'].forEach(t => window.addEventListener(t, poke, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { poke(); mapDirty = true; } });

  function frame(now) {
    // schedule the next frame first, so one error can never freeze the map and timeline for good
    requestAnimationFrame(frame);
    try { tick(now); } catch (err) { console.error(err); }
  }
  function tick(now) {
    const dt = Math.min(0.05, (now - lastFrameT) / 1000);
    lastFrameT = now;

    if (!histReady && TL.HIST) { histReady = true; mapDirty = true; $('mapLoading').hidden = true; }

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

    const sinceInput = now - lastInput;
    const active = mapDirty || playing || !M.settled() || MS.busy || sinceInput < ACTIVE_MS;
    const ambient = !calm.matches && sinceInput < IDLE_STOP_MS && now - lastMapT >= IDLE_FRAME_MS;
    if (active || ambient) {
      // the map clock advances by real time since its last frame (capped), so ambient motion keeps its pace at 12 fps
      M.step(lastMapT ? Math.min(0.1, (now - lastMapT) / 1000) : dt);
      M.draw();
      lastMapT = now; mapDirty = false;
    }

    if (tlDirty) {
      tlDirty = false;
      R.draw();
      drawMini();
    }
  }

  // ---------- boot ----------
  applyTheme();
  const filterRestored = !!S.show; // a region filter remembered from an earlier visit
  if (S.show) setShow(S.show, true);
  M.resize(); R.resize(); R.layout(); sizeMini();
  if (!loadHash()) {
    R.fit(-900, 2030, 0.02);
    setActiveYear(-480, false); // Start at Achaemenid zenith — instant visual impact!
    M.presetEurasia();
  }
  if (window.innerWidth <= 1100 && !S.focus) openPanel(false); // a shared link to a selection keeps its card open
  updateMapYearHud();
  updatePanel();
  redrawTL();
  requestAnimationFrame(frame);

  // The historical borders (2.4 MB) are preloaded by index.html but run only now, after the first paint, so the
  // header, timeline and panel are usable at once. The frame loop notices TL.HIST and draws the map.
  // (In the single-file build they are inlined, so TL.HIST is already set and nothing is loaded here.)
  if (!TL.HIST) {
    requestAnimationFrame(() => setTimeout(() => {
      if (TL.HIST) return; // the single-file build runs the inlined borders right after this file
      const s = document.createElement('script');
      s.src = 'data/hist-borders.js';
      s.onerror = () => { const el = $('mapLoading'); el.textContent = 'مرزهای تاریخی بارگذاری نشد. صفحه را دوباره باز کنید.'; el.classList.add('failed'); };
      document.body.appendChild(s);
    }, 0));
  }

  const fontsReady = () => { R.clearCache(); R.layout(); redrawTL(); };
  if (document.fonts) {
    ['400 12px Vazirmatn', '700 12px Vazirmatn', '700 20px Gulzar'].forEach(f => document.fonts.load(f, 'ایران').then(fontsReady, () => { }));
    document.fonts.ready.then(fontsReady);
  }
  // A remembered region filter hides lanes, so say so once, with a way out
  if (filterRestored && S.show) toast(`فیلتر سرزمین‌ها از بازدید پیش روشن است: فقط ${TL.fa(S.show.size)} ردیف زیر ایران دیده می‌شود.`, 'نمایش همه', () => setShow(null, true), 10000);
  // First visit (and not arriving through a shared link): a short guided tour
  let firstVisit = false; try { firstVisit = !localStorage.getItem('giti-nama-tour'); } catch (e) { }
  if (firstVisit && !location.hash) setTimeout(() => { if (!openModalId() && !tourOn()) startTour(); }, 1500);

  window.GITI = { S, MS, R, M, TL, select, updatePanel, setActiveYear };
})();

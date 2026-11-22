/* Interaction: zoom/pan, hover tooltip, sync-slice panel, search, minimap, toolbar. */
(function () {
  const S = R.S, $ = (id) => document.getElementById(id);
  const cv = $('tl'), tip = $('tip'), mm = $('minimap'), mctx = mm.getContext('2d');
  let raf = 0; const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; R.draw(); drawMini(); }); };
  R.init(cv);

  // ---------- validation of data (console only) ----------
  if (TL.errors.length) console.warn('data errors', TL.errors);

  // ---------- sizing ----------
  function relayout(keepCenter) {
    const c = keepCenter && S.PW ? R.yearAt(S.PW / 2) : null, oldK = S.k;
    R.resize(); R.layout();
    if (c != null) { S.k = oldK; S.u0 = TL.u(c) - S.PW / S.k / 2; R.clampView(); }
    sizeMini(); redraw();
  }
  new ResizeObserver(() => relayout(true)).observe($('stage'));

  // ---------- zoom / pan ----------
  function zoomAt(px, factor) {
    const u = S.dir === 'ltr' ? S.u0 + px / S.k : S.u0 + (S.PW - px) / S.k;
    S.k *= factor; R.clampView();
    S.u0 = S.dir === 'ltr' ? u - px / S.k : u - (S.PW - px) / S.k; R.clampView(); redraw();
  }
  function panPx(dx) { S.u0 += (S.dir === 'ltr' ? -dx : dx) / S.k; R.clampView(); }
  function animateTo(y0, y1) {
    const fromU = S.u0, fromK = S.k; R.fit(y0, y1); const toU = S.u0, toK = S.k; S.u0 = fromU; S.k = fromK;
    const t0 = performance.now(), D = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 520;
    const step = (t) => {
      const a = Math.min(1, (t - t0) / D), e = a < 0.5 ? 4 * a * a * a : 1 - Math.pow(-2 * a + 2, 3) / 2;
      const lk = Math.log(fromK) + (Math.log(toK) - Math.log(fromK)) * e; S.k = Math.exp(lk);
      const cFrom = fromU + S.PW / fromK / 2, cTo = toU + S.PW / toK / 2, c = cFrom + (cTo - cFrom) * e;
      S.u0 = c - S.PW / S.k / 2; R.clampView(); R.draw(); drawMini();
      if (a < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  R.animateTo = animateTo;

  const pt = (ev) => { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
  cv.addEventListener('wheel', (ev) => {
    ev.preventDefault(); hideHint();
    const [x, y] = pt(ev);
    if (ev.shiftKey || x > S.PW) { S.scrollY += ev.deltaY; R.clampView(); redraw(); return; }
    if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) { panPx(-ev.deltaX); redraw(); return; }
    const d = ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY;
    zoomAt(x, Math.exp(-d * 0.0018));
  }, { passive: false });

  const ptrs = new Map(); let drag = null, pinch = null, moved = false;
  cv.addEventListener('pointerdown', (ev) => {
    cv.setPointerCapture(ev.pointerId); ptrs.set(ev.pointerId, pt(ev)); moved = false; hideHint();
    if (ptrs.size === 1) { const [x, y] = pt(ev); drag = { x, y, u0: S.u0, sy: S.scrollY }; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: S.k, mid: (a[0] + b[0]) / 2 }; drag = null; }
  });
  cv.addEventListener('pointermove', (ev) => {
    const [x, y] = pt(ev);
    if (ptrs.has(ev.pointerId)) ptrs.set(ev.pointerId, [x, y]);
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt(pinch.mid, (pinch.k * d / pinch.d) / S.k); moved = true; return;
    }
    if (drag) {
      const dx = x - drag.x, dy = y - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; cv.classList.add('drag'); }
      if (moved) { S.u0 = drag.u0; panPx(dx); if (drag.y > S.worldTop) S.scrollY = drag.sy - dy; R.clampView(); hideTip(); redraw(); }
      return;
    }
    S.hoverX = x < S.PW ? x : null; S.hoverY = y;
    const h = R.hitTest(x, y);
    if (h && h.type !== 'region') showTip(h, x, y); else hideTip();
    cv.style.cursor = h && h.type !== 'region' ? 'pointer' : 'grab';
    redraw();
  });
  const end = (ev) => {
    const wasDrag = drag && moved, [x, y] = pt(ev);
    ptrs.delete(ev.pointerId); cv.classList.remove('drag');
    if (ptrs.size < 2) pinch = null;
    if (!ptrs.size) {
      if (drag && !wasDrag && ev.type === 'pointerup') click(x, y);
      drag = null;
    }
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', () => { S.hoverX = null; hideTip(); redraw(); });

  function click(x, y) {
    if (x > S.PW) return;
    const h = R.hitTest(x, y);
    if (h && h.type !== 'region') { select(h.item, h.type); return; }
    S.focus = null; S.pinYear = R.yearAt(x); updatePanel(); redraw();
  }
  function select(item, type, zoom) {
    const s = type === 'event' ? item.y : item.s, e = type === 'event' ? (item.y2 || item.y) : item.e;
    S.focus = { item, type, s, e: Math.min(e, TL.NOW), dim: false };
    S.pinYear = type === 'event' ? item.y : null;
    if (zoom) { const pad = Math.max(8, (e - s) * 0.6); animateTo(s - pad, Math.min(e, TL.NOW) + pad); }
    updatePanel(); redraw(); openPanel(true);
  }
  R.select = select;

  // ---------- keyboard ----------
  window.addEventListener('keydown', (ev) => {
    if (ev.target.tagName === 'INPUT') return;
    const k = ev.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') { panPx((k === 'ArrowLeft' ? 1 : -1) * S.PW * 0.15); redraw(); }
    else if (k === 'ArrowUp' || k === 'ArrowDown') { S.scrollY += k === 'ArrowDown' ? 80 : -80; R.clampView(); redraw(); }
    else if (k === '+' || k === '=') zoomAt(S.PW / 2, 1.35);
    else if (k === '-') zoomAt(S.PW / 2, 1 / 1.35);
    else if (k === 'Escape') { S.focus = null; S.pinYear = null; updatePanel(); redraw(); $('about').hidden = true; }
  });

  // ---------- tooltip ----------
  function itemYears(it, type) {
    if (type === 'event') return it.y2 ? TL.spanLabel(it.y, it.y2, it.a) : TL.yearLabel(it.y, it.a);
    return TL.spanLabel(it.s, it.e, it.a);
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function tipHTML(h) {
    const it = h.item, t = h.type; let sub = '', extra = '';
    if (t === 'polity') { sub = TL.regionById[it.r].n; if (it.cap) extra += `<p>پایتخت/مرکز: ${esc(it.cap)}</p>`; }
    if (t === 'ruler') { const p = TL.polityById[it.pid]; sub = p ? p.n : ''; if (it.t) sub = it.t + ' · ' + sub; }
    if (t === 'event') sub = (TL.KIND[it.k] || TL.KIND.pol).n + ' · ' + (TL.regionById[it.r] ? TL.regionById[it.r].n : '');
    if (t === 'person') sub = (TL.PKIND[it.k] || '') + ' · ' + (TL.regionById[it.r] ? TL.regionById[it.r].n : '');
    const dur = t !== 'event' ? ` · ${TL.fa(TL.duration(it.s, Math.min(it.e, 2026)))} سال` : '';
    return `<h4>${esc(it.n)}</h4>${it.en ? `<div class="en">${esc(it.en)}</div>` : ''}<div class="yr">${itemYears(it, t)}${dur}</div>` +
      `<p>${esc(sub)}</p>${extra}${it.d ? `<p>${esc(it.d)}</p>` : ''}`;
  }
  function showTip(h, x, y) {
    tip.innerHTML = tipHTML(h); tip.hidden = false;
    const w = tip.offsetWidth, hh = tip.offsetHeight, st = $('stage').getBoundingClientRect();
    let tx = x + 16, ty = y + 14; if (tx + w > st.width - 8) tx = x - w - 16; if (ty + hh > st.height - 8) ty = y - hh - 10;
    tip.style.left = Math.max(6, tx) + 'px'; tip.style.top = Math.max(6, ty) + 'px';
  }
  function hideTip() { tip.hidden = true; }

  // ---------- sync-slice panel ----------
  const over = (s, e, a, b) => s <= b && e >= a;
  // first clause of a description, so every row says what the thing is, not just its name
  const clip = (d, n = 95) => { if (!d) return ''; const t = d.split(/[.؛:]\s/)[0]; return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  let A = 0, B = 0;
  function rowHTML(it, type, label, yy) {
    const id = register(it, type);
    let dot, tag, tagC = '', sub;
    if (type === 'polity') {
      const q = TL.overlord(it, A, B); dot = it.base;
      tag = q ? 'زیر فرمان ' + q.n : it.dom ? 'امپراتوری' : it.k === 'culture' ? 'فرهنگ و تمدن' : 'حکومت';
      if (q) tagC = q.base;
      sub = clip(it.d) || (it.cap ? 'مرکز: ' + it.cap : '');
    } else if (type === 'ruler') {
      const p = TL.polityById[it.pid]; dot = p ? p.base : ''; tag = it.t || 'فرمانروا';
      sub = clip(it.d, 70);
    } else if (type === 'event') {
      const k = TL.KIND[it.k] || TL.KIND.pol; dot = k.c; tag = k.n; sub = clip(it.d);
    } else {
      dot = (TL.KIND[TL.PKINDK[it.k]] || TL.KIND.pol).c; tag = TL.PKIND[it.k] || 'چهره'; sub = clip(it.d, 80);
    }
    return `<div class="it it-${type}" data-k="${id}"><i class="dot" style="background:${dot}"></i><div class="tx">` +
      `<div class="l1"><span class="nm">${esc(label)}</span><span class="yy">${yy}</span></div>` +
      `<div class="sub"><b class="tag"${tagC ? ` style="color:${tagC}"` : ''}>${esc(tag)}</b>${sub ? ' · ' + esc(sub) : ''}</div></div></div>`;
  }
  // lands an empire ruled, as a box at the top of the panel
  function domHTML(emp) {
    if (!emp || !emp.dom) return '';
    const rows = emp.dom.slice().sort((p, q) => p.s - q.s).map(p => {
      const id = register(p, 'polity');
      return `<div class="it" data-k="${id}"><i class="dot" style="background:${p.base}"></i><div class="tx"><div class="l1"><span class="nm">${esc(TL.regionById[p.r].n)}</span>` +
        `<span class="yy">${TL.spanLabel(Math.max(p.s, emp.s), Math.min(p.e, emp.e), p.a)}</span></div><div class="sub">${esc(p.n)}</div></div></div>`;
    }).join('');
    return `<div class="dom-box" style="--c:${emp.base}"><div class="dom-t">سرزمین‌های زیر فرمان «${esc(emp.n)}»</div>${rows}` +
      `<button type="button" class="dom-btn" data-emp="${emp.id}">فقط همین سرزمین‌ها را زیر ایران نشان بده</button></div>`;
  }
  const reg = []; function register(it, type) { reg.push([it, type]); return reg.length - 1; }
  // sections the reader folded stay folded while the panel rebuilds
  const closed = new Set();
  $('pBody').addEventListener('toggle', (ev) => { const d = ev.target; if (d.dataset.sec) d.open ? closed.delete(d.dataset.sec) : closed.add(d.dataset.sec); }, true);
  function updatePanel() {
    reg.length = 0;
    const pY = $('pYear'), pC = $('pCal'), pF = $('pFocus'), body = $('pBody');
    let a, b;
    if (S.focus) { a = S.focus.s; b = S.focus.e; }
    else if (S.pinYear != null) { a = b = S.pinYear; }
    else { const [v0, v1] = R.visRange(); a = b = (v0 + v1) / 2; }
    const single = a === b, y = Math.floor(a);
    pY.textContent = single ? TL.yearLabel(y) : TL.spanLabel(Math.floor(a), Math.floor(b));
    const c = TL.calendars(single ? y : Math.floor(a));
    pC.textContent = c ? `خورشیدی ${c.sh} · قمری ${c.ah}` + (single ? '' : ' (آغاز)') : (y < 0 ? 'پیش از میلاد' : 'پیش از هجرت');
    pF.textContent = S.focus ? `◈ هم‌زمان با «${S.focus.item.n}»` : (S.pinYear == null ? 'روی نمودار کلیک کنید تا برش زمان ثابت شود' : '');
    const win = single ? Math.max(1, (R.visRange()[1] - R.visRange()[0]) * 0.012) : 0;
    A = a - win; B = b + win;
    let html = '';
    const fi = S.focus && S.focus.type === 'polity' ? S.focus.item : null;
    html += domHTML(fi && (fi.dom ? fi : TL.overlord(fi)));
    // what else was going on in the world in this slice, by kind; inside each kind, Iran first, then lands in map order
    const rOf = (it, type) => (type === 'ruler' ? (TL.polityById[it.pid] || {}).r : it.r);
    const inR = (r) => r && TL.regionById[r] && (r === 'iran' || !S.show || S.show.has(r));
    const span = (it) => TL.spanLabel(it.s, it.e, it.a);
    // each state's rulers in this slice sit right under it
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
        const cap = r === 'iran' ? 14 : 8;
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
    const btn = ev.target.closest('.dom-btn');
    if (btn) { const emp = TL.polityById[btn.dataset.emp]; setShow(new Set(emp.dom.map(p => p.r).concat(emp.r).filter(r => r !== 'iran'))); return; }
    const el = ev.target.closest('.it'); if (!el) return;
    const [it, type] = reg[+el.dataset.k]; select(it, type, true);
  });
  function openPanel(force) {
    const m = document.querySelector('.main'), btn = $('btnPanel');
    const open = force === true ? true : force === false ? false : m.classList.contains('nopanel');
    m.classList.toggle('nopanel', !open); btn.setAttribute('aria-expanded', String(open));
    if (window.innerWidth <= 1100) $('panel').hidden = !open; else $('panel').hidden = false;
  }
  $('btnPanel').onclick = () => openPanel();

  // ---------- search ----------
  const index = [];
  TL.polities.forEach(p => index.push([p, 'polity', TL.regionById[p.r].n]));
  TL.rulers.forEach(r => index.push([r, 'ruler', 'فرمانروا · ' + (TL.polityById[r.pid] ? TL.polityById[r.pid].n : '')]));
  TL.events.forEach(e => index.push([e, 'event', 'رویداد · ' + TL.yearShort(e.y)]));
  TL.people.forEach(p => index.push([p, 'person', TL.PKIND[p.k] || 'چهره']));
  index.forEach(row => { row.key = TL.norm(row[0].n + ' ' + (row[0].en || '')); });
  const q = $('q'), qres = $('qres'); let qsel = 0, qlist = [];
  function runSearch() {
    const s = TL.norm(q.value); if (s.length < 2) { qres.hidden = true; return; }
    const parts = s.split(' ');
    qlist = index.filter(r => parts.every(p => r.key.includes(p)))
      .sort((a, b) => (a[0].n.length - b[0].n.length)).slice(0, 14);
    qsel = 0;
    qres.innerHTML = qlist.map((r, i) => `<li role="option" data-i="${i}" aria-selected="${i === 0}"><span>${esc(r[0].n)}</span><span class="k">${esc(r[2])}</span></li>`).join('') || '<li><span>یافت نشد</span></li>';
    qres.hidden = false;
  }
  function pick(i) { const r = qlist[i]; if (!r) return; qres.hidden = true; q.blur(); select(r[0], r[1], true); }
  q.addEventListener('input', runSearch);
  q.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); qsel = (qsel + (ev.key === 'ArrowDown' ? 1 : -1) + qlist.length) % Math.max(qlist.length, 1); [...qres.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === qsel))); }
    if (ev.key === 'Enter') pick(qsel);
    if (ev.key === 'Escape') qres.hidden = true;
  });
  qres.addEventListener('pointerdown', (ev) => { const li = ev.target.closest('li[data-i]'); if (li) { ev.preventDefault(); pick(+li.dataset.i); } });
  q.addEventListener('blur', () => setTimeout(() => (qres.hidden = true), 150));

  // ---------- era chips ----------
  const chipHTML = (c) => `<button class="chip ${c.iran ? 'iran' : ''}" data-i="${TL.chips.indexOf(c)}">${esc(c.n)}</button>`;
  $('eraChips').innerHTML = TL.chips.filter(c => c.iran).map(chipHTML).join('') + '<span class="chip-sep" aria-hidden="true"></span>' + TL.chips.filter(c => !c.iran).map(chipHTML).join('');
  $('eraChips').addEventListener('click', (ev) => {
    const b = ev.target.closest('.chip'); if (!b) return; const c = TL.chips[+b.dataset.i];
    S.focus = null; S.pinYear = null; animateTo(c.s, c.e); setTimeout(updatePanel, 560);
  });

  // ---------- toolbar ----------
  $('btnScale').onclick = () => {
    const c = R.yearAt(S.PW / 2), [v0, v1] = R.visRange();
    TL.scaleMode = TL.scaleMode === 'warp' ? 'linear' : 'warp';
    $('btnScale').textContent = 'مقیاس: ' + (TL.scaleMode === 'warp' ? 'فشرده' : 'خطی');
    R.fit(v0, v1, 0); if (TL.scaleMode === 'linear') { S.u0 = TL.u(c) - S.PW / S.k / 2; R.clampView(); } redraw();
  };
  $('btnDir').onclick = () => {
    S.dir = S.dir === 'ltr' ? 'rtl' : 'ltr';
    $('btnDir').textContent = 'زمان: ' + (S.dir === 'ltr' ? 'چپ←راست' : 'راست←چپ');
    redraw();
  };
  // the manuscript (paper) look is the default; "night" is an explicit choice
  let night = false;
  try { night = localStorage.getItem('jam-theme') === 'dark'; } catch (e) { }
  function applyTheme() {
    if (night) document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme');
    $('btnTheme').textContent = night ? 'روشن' : 'تیره';
    try { localStorage.setItem('jam-theme', night ? 'dark' : 'light'); } catch (e) { }
    R.readTheme(); redraw();
  }
  $('btnTheme').onclick = () => { night = !night; applyTheme(); };
  $('btnLayers').onclick = () => { const l = $('layers'); l.hidden = !l.hidden; $('regions').hidden = true; $('btnLayers').setAttribute('aria-expanded', String(!l.hidden)); };
  [['lyRulers', 'rulers'], ['lyEvents', 'events'], ['lyPeople', 'people'], ['lyLinks', 'links']].forEach(([id, k]) => {
    $(id).addEventListener('change', (ev) => { S.layers[k] = ev.target.checked; relayout(true); });
  });
  // ---------- region filter: pick a few lands and see them right under Iran ----------
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
    // from "all", a group title means "only this group"; otherwise it toggles the group
    if (!S.show) { boxes().forEach(b => (b.checked = false)); bs.forEach(b => (b.checked = true)); }
    else { const on = !bs.every(b => b.checked); bs.forEach(b => (b.checked = on)); }
    fromBoxes();
  });
  $('rgAll').onclick = () => setShow(null, true);
  $('rgNone').onclick = () => setShow(new Set(), true);
  $('btnRegions').onclick = () => { const l = $('regions'); l.hidden = !l.hidden; $('layers').hidden = true; $('btnRegions').setAttribute('aria-expanded', String(!l.hidden)); };
  try { const v = localStorage.getItem('jam-regions'); if (v) S.show = new Set(v === '-' ? [] : v.split(',')); } catch (e) { }

  $('btnAbout').onclick = () => { $('about').hidden = false; };
  $('aboutX').onclick = () => { $('about').hidden = true; };
  $('about').addEventListener('click', (ev) => { if (ev.target.id === 'about') $('about').hidden = true; });
  const counts = `${TL.fa(TL.polities.length)} حکومت و دوره، ${TL.fa(TL.rulers.length)} فرمانروا، ${TL.fa(TL.events.length)} رویداد و ${TL.fa(TL.people.length)} چهره`;
  $('aboutBody').innerHTML = `<p>این نقشهٔ زمانی ${counts} را در ${TL.fa(TL.regions.length)} منطقه کنار هم می‌گذارد. ایران در بالای صفحه ثابت است و جهان زیر آن می‌گذرد. روی هر حکومت، شاه یا رویداد کلیک کنید تا ستون هم‌زمانی آن در همهٔ جهان روشن شود و فهرست هم‌روزگارانش در پنل «برش زمان» بیاید.</p>
  <ul>
  <li>سال‌ها میلادی‌اند و «پ.م» یعنی پیش از میلاد. سال صفر وجود ندارد و مدت‌ها با همین قاعده حساب می‌شود.</li>
  <li>سال خورشیدی و قمری تقریبی و به‌صورت بازهٔ دوساله نشان داده می‌شود، چون نوروز و آغاز سال قمری با ژانویه هم‌خوان نیستند.</li>
  <li>گاه‌شماری میان‌رودان بر پایهٔ «گاه‌شماری میانه» است. سلسله‌های مصر بر پایهٔ تاریخ‌های رایج (شاو، تاریخ آکسفورد مصر باستان) آمده‌اند.</li>
  <li>تاریخ‌های پیش از ۱۰۰۰ پ.م و بسیاری از شاهان اشکانی تقریبی‌اند. این موارد با پیشوند «حدود» و لبه‌های محوشده نشان داده شده‌اند.</li>
  <li>ضخامت هر شکل در هر سال با ریشهٔ دوم مساحت برآوردی قلمرو همان حکومت در آن سال تغییر می‌کند. بیشینه‌ها از فهرست «بزرگ‌ترین امپراتوری‌ها»ی ویکی‌پدیا (بیشتر برآوردهای تاگه‌پرا) آمده‌اند و نقطه‌های میانی منحنی تقریبی‌اند. حکومت‌هایی که داده‌ای برایشان نبود، ضخامت پیش‌فرض دارند.</li>
  <li>در نوار ایران، شکل‌های خاکستری یعنی فرمانروایی بیگانه (مقدونیان، سلوکیان، خلافت و حاکمان مغول) و ضخامت آن‌ها فقط سهم ایران را نشان می‌دهد. اگر رنگ یک دودمان ایرانی در منطقهٔ دیگری دیده شود، یعنی آن سرزمین زیر فرمان ایران بوده است.</li>
  <li>نوار رنگی «زیر فرمان …» بالای هر منطقه یعنی آن سرزمین در آن سال‌ها بخشی از آن امپراتوری بوده است. با کلیک روی یک امپراتوری همهٔ سرزمین‌هایش پررنگ می‌شوند و در پنل فهرست می‌آیند.</li>
  <li>با دکمهٔ «سرزمین‌ها» می‌توانید فقط چند منطقه را برگزینید تا درست زیر ایران و کنار هم دیده شوند.</li>
  <li>مقیاس «فشرده» به هزاره‌های دور جای کمتری می‌دهد. با دکمهٔ مقیاس می‌توانید زمان را خطی ببینید.</li>
  <li>رویدادهای ۲۰۲۵ و ۲۰۲۶ تا جایی آمده‌اند که در گزارش‌های خبری تأیید شده‌اند.</li>
  </ul>
  <p>کلیدها: ← → جابه‌جایی، ↑ ↓ پیمایش منطقه‌ها، + − بزرگ‌نمایی، Esc پاک‌کردن انتخاب. Shift+چرخ موس منطقه‌ها را بالا و پایین می‌برد.</p>`;

  // ---------- minimap ----------
  let mW = 0, mH = 0;
  function sizeMini() { const r = mm.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); mW = r.width; mH = r.height; mm.width = mW * d; mm.height = mH * d; mctx.setTransform(d, 0, 0, d, 0, 0); }
  const mx = (y) => { const t = (TL.u(y) - TL.U0()) / (TL.U1() - TL.U0()); return S.dir === 'ltr' ? t * mW : mW - t * mW; };
  function drawMini() {
    if (!mW) return; const C = S.C; mctx.clearRect(0, 0, mW, mH);
    mctx.fillStyle = C.paper2; mctx.fillRect(0, 0, mW, mH);
    // density of polities per region (one thin line per lane)
    const n = TL.regions.length, lh = (mH - 18) / n;
    TL.polities.forEach(p => {
      const ri = TL.regionById[p.r].order, xa = mx(p.s), xb = mx(Math.min(p.e, TL.NOW));
      mctx.fillStyle = p.base || C.muted; mctx.globalAlpha = p.ir ? 0.9 : 0.6;
      mctx.fillRect(Math.min(xa, xb), 3 + ri * lh, Math.max(Math.abs(xb - xa), 1), Math.max(lh - 0.8, 0.8));
    });
    mctx.globalAlpha = 1;
    mctx.font = '500 9.5px Vazirmatn, Tahoma, sans-serif'; mctx.fillStyle = C.muted; mctx.textAlign = 'center'; mctx.textBaseline = 'bottom'; mctx.direction = 'rtl';
    [-8000, -5000, -3000, -2000, -1000, 0, 500, 1000, 1500, 1800, 2000].forEach(y => mctx.fillText(y < 0 ? TL.fa(-y) + ' پ.م' : TL.fa(y || 1), mx(y), mH - 1));
    const [v0, v1] = R.visRange(), xa = mx(v0), xb = mx(v1);
    mctx.strokeStyle = C.accent; mctx.lineWidth = 1.2; mctx.fillStyle = S.dark ? 'rgba(126,162,255,.10)' : 'rgba(44,91,208,.08)';
    mctx.fillRect(Math.min(xa, xb), 1, Math.abs(xb - xa), mH - 14); mctx.strokeRect(Math.min(xa, xb), 1, Math.abs(xb - xa), mH - 14);
  }
  let mdrag = false;
  const mmGo = (ev) => { const r = mm.getBoundingClientRect(), x = ev.clientX - r.left, t = S.dir === 'ltr' ? x / mW : 1 - x / mW; const u = TL.U0() + t * (TL.U1() - TL.U0()); S.u0 = u - S.PW / S.k / 2; R.clampView(); redraw(); };
  mm.addEventListener('pointerdown', (ev) => { mdrag = true; mm.setPointerCapture(ev.pointerId); mmGo(ev); });
  mm.addEventListener('pointermove', (ev) => { if (mdrag) mmGo(ev); });
  mm.addEventListener('pointerup', () => { mdrag = false; updatePanel(); });

  // ---------- hint ----------
  let hintT = setTimeout(hideHint, 9000);
  function hideHint() { clearTimeout(hintT); $('hint').classList.add('off'); }

  // ---------- boot ----------
  applyTheme();
  if (S.show) setShow(S.show, true);
  R.resize(); R.layout(); sizeMini(); R.fit(-4600, 2030, 0.01);
  if (window.innerWidth <= 1100) openPanel(false);
  updatePanel(); redraw();
  const fontsReady = () => { R.clearCache(); R.layout(); redraw(); };
  if (document.fonts) {
    ['400 12px Vazirmatn', '500 12px Vazirmatn', '700 12px Vazirmatn'].forEach(f => document.fonts.load(f, 'ایران').then(fontsReady, () => { }));
    document.fonts.ready.then(fontsReady);
  }
  // keep the panel in sync with the view when nothing is pinned (debounced on view changes)
  let lastView = '';
  setInterval(() => {
    if (S.focus || S.pinYear != null) return;
    const v = Math.round(S.u0) + ':' + S.k.toFixed(3);
    if (v !== lastView) { lastView = v; updatePanel(); }
  }, 600);
  window.JAM = { S, R, TL, select, updatePanel };
})();

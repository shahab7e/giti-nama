// Data checks: node tools/validate.mjs
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="((?:js\/core|data\/[^"]+)\.js)"><\/script>/g)].map(m => m[1]);
const ctx = { window: {}, console }; ctx.window = ctx; vm.createContext(ctx);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const TL = ctx.TL, errs = [...TL.errors], warn = [];
const reg = new Set(TL.regions.map(r => r.id));
for (const p of TL.polities) {
  if (!(p.s < p.e)) errs.push(`polity ${p.id}: start ${p.s} >= end ${p.e}`);
  if (!reg.has(p.r)) errs.push(`polity ${p.id}: unknown region ${p.r}`);
  if (p.p != null && (p.p < p.s || p.p > p.e)) errs.push(`polity ${p.id}: peak ${p.p} outside span`);
}
// rulers whose reign rightly starts before their state (Cyrus was king of Anshan from 559 BC, before the empire)
const REIGN_BEFORE_STATE = new Set(['Cyrus the Great']);
for (const r of TL.rulers) {
  const p = TL.polityById[r.pid];
  if (!p) { errs.push(`ruler ${r.n}: unknown polity ${r.pid}`); continue; }
  if (r.s > r.e) errs.push(`ruler ${r.n} (${r.pid}): start ${r.s} > end ${r.e}`);
  if ((r.s < p.s - 5 && !REIGN_BEFORE_STATE.has(r.en)) || r.e > p.e + 5) warn.push(`ruler ${r.n} ${r.s}–${r.e} outside ${p.id} ${p.s}–${p.e}`);
}
for (const e of TL.events) {
  if (!reg.has(e.r)) errs.push(`event ${e.n}: unknown region ${e.r}`);
  if (e.y2 != null && e.y2 < e.y) errs.push(`event ${e.n}: y2 < y`);
  if (e.r === 'iran' && e.w === 3 && !e.d) warn.push(`event ${e.n} (${e.y}): major Iranian event with no description`);
}
// Persian text hygiene: Arabic ي/ك instead of Persian ی/ک, and stray tatweel (ـ)
const textOf = (o) => [o.n, o.d, o.cap].filter(Boolean).join(' ');
for (const o of [...TL.polities, ...TL.rulers, ...TL.events, ...TL.people]) {
  const t = textOf(o);
  if (/[يك]/.test(t)) warn.push(`Arabic ي/ك in: ${o.n}`);
  if (/ـ/.test(t)) warn.push(`tatweel (ـ) in: ${o.n}`);
}
for (const p of TL.people) {
  if (!reg.has(p.r)) errs.push(`person ${p.n}: unknown region ${p.r}`);
  if (!(p.s < p.e)) errs.push(`person ${p.n}: born ${p.s} >= died ${p.e}`);
  if (p.e - p.s > 105 && p.e < 2026) warn.push(`person ${p.n}: lifespan ${p.e - p.s}`);
}
for (const id of Object.keys(TL.extent)) {
  const p = TL.polityById[id]; if (!p) { errs.push(`extent: unknown polity ${id}`); continue; }
  const v = TL.extent[id];
  if (Array.isArray(v)) v.forEach(([y]) => { if (y < p.s - 1 || y > p.e + 1) warn.push(`extent ${id}: point ${y} outside ${p.s}–${p.e}`); });
}
for (const [cid, pids] of Object.entries(TL.dominion || {})) {
  const c = TL.polityById[cid]; if (!c) { errs.push(`dominion: unknown polity ${cid}`); continue; }
  for (const pid of [].concat(pids)) {
    const q = TL.polityById[pid];
    if (!q) errs.push(`dominion ${cid}: unknown empire ${pid}`);
    else if (Math.min(c.e, q.e) <= Math.max(c.s, q.s)) errs.push(`dominion ${cid}: no overlap with ${pid}`);
  }
}
for (const chain of TL.links) chain.forEach(id => { if (!TL.polityById[id]) errs.push(`link: unknown polity ${id}`); });
const rsrc = fs.readFileSync(path.join(root, 'js/render.js'), 'utf8');
for (const m of rsrc.matchAll(/new Set\(\[([^\]]+)\]\)/g)) for (const id of m[1].match(/'[^']+'/g) || []) if (!TL.polityById[id.slice(1, -1)]) errs.push(`render.js set: unknown polity ${id}`);
console.log(`polities ${TL.polities.length}, rulers ${TL.rulers.length}, events ${TL.events.length}, people ${TL.people.length}, regions ${TL.regions.length}`);
warn.forEach(w => console.log('WARN', w));
errs.forEach(e => console.log('ERROR', e));
process.exit(errs.length ? 1 : 0);

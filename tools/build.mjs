// Bundles index.html + css + js + data into one self-contained page body for publishing: node tools/build.mjs
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
// description / social-preview tags, the favicon, and the tiny theme script that must run before first paint
const headExtras = [...head.matchAll(/<meta (?:name|property)="(?!viewport)[^"]+"[^>]*>|<link rel="icon"[^>]*>|<script>[^<]*<\/script>/g)].map(m => m[0]).join('\n');
// self-hosted fonts, inlined as data URIs so the single file needs nothing next to it
const fontCss = read('fonts/fonts.css').replace(/url\(([^)]+\.woff2)\)/g, (_, f) =>
  `url(data:font/woff2;base64,${fs.readFileSync(path.join(root, 'fonts', f)).toString('base64')})`);
const fonts = `<style>\n${fontCss}</style>`;
const body = html.match(/<!--APP-START-->([\s\S]*?)<!--APP-END-->/)[1];
// every <script src> in order, then the preloaded scripts (the historical borders), which app.js runs last
const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"[^>]*><\/script>/g)].map(m => m[1])
  .concat([...html.matchAll(/<link rel="preload" href="([^"]+\.js)" as="script">/g)].map(m => m[1]));
const css = read('css/style.css');
const js = scripts.map(f => `/* ${f} */\n` + read(f).replace(/<\/script/gi, '<\\/script')).join('\n');
const out = `${title}
${headExtras}
${fonts}
<style>
${css}
</style>
<script>document.documentElement.dir='rtl';document.documentElement.lang='fa';</script>
${body}
<script>
${js}
</script>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/giti-nama.html'), out);
console.log('dist/giti-nama.html', (out.length / 1024).toFixed(0) + ' KB');

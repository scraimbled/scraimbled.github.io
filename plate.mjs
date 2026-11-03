// Тарелка: свежая ИИшница со сковородки (сайт на Cloudflare) раскладывается по файлам и подаётся через GitHub Pages.
// Обходит сайт по ссылкам, как посетитель, и кладёт каждую страницу файлом: /news/9-x → news/9-x.html, /en/ → en/index.html.
// node plate.mjs <папка>
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PAN = process.env.PAN ?? 'https://ainews-site.ainews-bot.workers.dev';
const OUT = process.argv[2] ?? '_site';
const START = ['/', '/en/', '/rss.xml', '/en/rss.xml', '/sitemap.xml', '/robots.txt', '/version.json',
  '/favicon.svg', '/favicon.ico', '/apple-touch-icon.png', '/og.png'];
const PARALLEL = 6;

const fileOf = p => (p.endsWith('/') ? `${p}index.html` : /\.[a-z0-9]+$/i.test(p) ? p : `${p}.html`);
const save = (p, body) => {
  const file = join(OUT, fileOf(p));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
};

async function get(path) {
  for (let k = 1; ; k++) {
    try {
      return await fetch(PAN + path, { redirect: 'manual', headers: { 'user-agent': 'ii-plate (GitHub Pages mirror)' }, signal: AbortSignal.timeout(20_000) });
    } catch (error) {
      if (k === 3) throw error;
      await new Promise(r => setTimeout(r, 2000 * k));
    }
  }
}

// Ссылки на свои адреса: из HTML (href, src), из CSS (url()), из sitemap (<loc> с любым доменом)
function links(type, text) {
  const out = [];
  if (type.includes('html')) for (const m of text.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) out.push(m[1]);
  if (type.includes('css')) for (const m of text.matchAll(/url\((\/[^)?#]+)\)/g)) out.push(m[1]);
  if (type.includes('xml')) for (const m of text.matchAll(/<loc>https?:\/\/[^/<]+(\/[^<]*)<\/loc>/g)) out.push(m[1]);
  return out.filter(p => !p.startsWith('//'));
}

const seen = new Set(), queue = [...START], broken = [];
async function take(path) {
  const r = await get(path);
  if (r.status >= 300 && r.status < 400) {
    const to = r.headers.get('location');
    if (to?.startsWith('/') && !seen.has(to)) queue.push(to);
    return;
  }
  if (!r.ok) {
    broken.push(`${r.status} ${path}`);
    return;
  }
  const type = r.headers.get('content-type') ?? '';
  const body = Buffer.from(await r.arrayBuffer());
  save(path, body);
  if (/html|css|xml/.test(type)) for (const p of links(type, body.toString('utf8'))) if (!seen.has(p)) queue.push(p);
}

while (queue.length) {
  const batch = [];
  while (queue.length && batch.length < PARALLEL) {
    const p = queue.shift();
    if (seen.has(p)) continue;
    seen.add(p);
    batch.push(take(p));
  }
  await Promise.all(batch);
}

// Своя страница 404: GitHub Pages отдаёт её на любой неизвестный адрес
const nf = await get('/404.html');
if (nf.status !== 404) broken.push(`${nf.status} /404.html`);
else writeFileSync(join(OUT, '404.html'), Buffer.from(await nf.arrayBuffer()));
// Файлы подаются как есть, без обработки Jekyll
writeFileSync(join(OUT, '.nojekyll'), '');

console.log(`разложено ${seen.size} адресов`);
if (broken.length) {
  // Битая тарелка не подаётся: на GitHub Pages остаётся прошлая
  console.error(`не получилось:\n${broken.join('\n')}`);
  process.exit(1);
}

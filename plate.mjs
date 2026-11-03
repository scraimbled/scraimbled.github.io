// Тарелка: свежая ИИшница со сковородки (сайт на Cloudflare) раскладывается по файлам и подаётся через GitHub Pages.
// Обходит сайт по ссылкам, как посетитель, и кладёт каждую страницу файлом: /news/9-x → news/9-x.html, /en/ → en/index.html.
// node plate.mjs <папка>
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PAN = process.env.PAN ?? 'https://ainews-site.ainews-bot.workers.dev';
const OUT = process.argv[2] ?? '_site';
const START = ['/', '/en/', '/404.html', '/search.json', '/rss.xml', '/en/rss.xml', '/sitemap.xml', '/robots.txt', '/version.json',
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

// Ссылки на свои адреса: из HTML (href, src, srcset, og:image), из CSS (url()), из sitemap (<loc> с любым доменом)
function links(type, text) {
  const out = [];
  // Хвост после # или ? отбрасывается: спрайт иконок идёт как /s/i.svg#i-sun
  if (type.includes('html')) for (const m of text.matchAll(/(?:href|src)="(\/[^"#?]*)[^"]*"/g)) out.push(m[1]);
  // Уменьшенные картинки для телефона: srcset="/img/1-a-m.jpg 800w, /img/1-a.jpg 1200w"
  if (type.includes('html')) for (const m of text.matchAll(/srcset="([^"]+)"/g)) for (const part of m[1].split(',')) out.push(part.trim().split(/[\s?#]/)[0]);
  // Картинка для соцсетей указана полным адресом зеркала (og:image): своя у сервисов и тем
  if (type.includes('html')) for (const m of text.matchAll(/property="og:image" content="https?:\/\/[^/"]+(\/[^"#?]*)"/g)) out.push(m[1]);
  if (type.includes('css')) for (const m of text.matchAll(/url\((\/[^)?#]+)\)/g)) out.push(m[1]);
  if (type.includes('xml')) for (const m of text.matchAll(/<loc>https?:\/\/[^/<]+(\/[^<]*)<\/loc>/g)) out.push(m[1]);
  return out.filter(p => p.startsWith('/') && !p.startsWith('//'));
}

const seen = new Set(), queue = [...START], broken = [];
async function take(path) {
  const r = await get(path);
  if (r.status >= 300 && r.status < 400) {
    const to = r.headers.get('location');
    if (to?.startsWith('/') && !seen.has(to)) queue.push(to);
    return;
  }
  // Своя страница 404 приходит с кодом 404, но кладётся как обычная, со всеми её стилями: GitHub Pages отдаёт её на любой неизвестный адрес
  const notFoundPage = path === '/404.html' && r.status === 404;
  if (!r.ok && !notFoundPage) {
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

// Файлы подаются как есть, без обработки Jekyll
writeFileSync(join(OUT, '.nojekyll'), '');

console.log(`разложено ${seen.size} адресов`);
if (broken.length) {
  // Битая тарелка не подаётся: на GitHub Pages остаётся прошлая
  console.error(`не получилось:\n${broken.join('\n')}`);
  process.exit(1);
}

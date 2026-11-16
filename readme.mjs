// README тарелки со свежими постами: Google часто обходит github.com и находит по этим ссылкам новые страницы сайта.
// Берёт ленты, которые plate.mjs уже положил в <папка>, и пишет README.md рядом со скриптом. Запуск: node readme.mjs _site
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || '_site';
const SITE = 'https://scraimbled.github.io';

const unxml = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const md = (s) => s.replace(/([\\[\]*_`|<>])/g, '\\$1');

function items(file, n) {
  const xml = readFileSync(join(OUT, file), 'utf8');
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, n).map(([, it]) => ({
    title: unxml(/<title>([\s\S]*?)<\/title>/.exec(it)?.[1] ?? '').trim(),
    link: unxml(/<link>([\s\S]*?)<\/link>/.exec(it)?.[1] ?? '').trim(),
    date: new Date(/<pubDate>([\s\S]*?)<\/pubDate>/.exec(it)?.[1] ?? '').toISOString().slice(0, 10),
  })).filter((p) => p.title && p.link.startsWith(SITE));
}

const list = (ps) => ps.map((p) => `- ${p.date} · [${md(p.title)}](${p.link})`).join('\n');

const text = `# Тарелка

Сюда подаётся [ИИшница](${SITE}/) — новости ИИ для тех, кто пользуется нейросетями из России. Тарелка в обоих смыслах: на ней подают яичницу, и она же раздаёт новости, как спутниковая.

Готовится всё на сковородке, а здесь только подача: раз в 10 минут GitHub Actions проверяет, не появилось ли нового, и раскладывает свежие страницы по файлам. В репозитории нет ничего, кроме того, что и так видно на сайте.

Новости раньше всего выходят в Telegram: [@ScrAImbleds](https://t.me/ScrAImbleds).

## Свежие новости

${list(items('rss.xml', 20))}

[Все новости](${SITE}/news) · [Работает ли ИИ в России сейчас](${SITE}/status) · [Как оплатить из России](${SITE}/pay) · [Цены в рублях](${SITE}/prices) · [Нейросети без VPN](${SITE}/no-vpn) · [RSS](${SITE}/rss.xml)

## Latest in English

${list(items('en/rss.xml', 10))}

[All news](${SITE}/en/news) · [RSS](${SITE}/en/rss.xml)
`;

writeFileSync(new URL('./README.md', import.meta.url), text);
console.log('README:', text.split('\n').filter((l) => l.startsWith('- ')).length, 'posts');

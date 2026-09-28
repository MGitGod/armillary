/**
 * GitHub Pages と同じ見え方で out/ を配信する。公開前の確認用。
 *
 * Pages はプロジェクトサイトを /<repo>/ の下に置くので、ここでも /armillary/ の下にだけ返す。
 * ルートで配信すると basePath の付け忘れ（/_next/... を直接読む箇所）が見逃される。
 *
 *   PAGES_BASE_PATH=/armillary npm run build && node scripts/serve-pages.mjs
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const BASE = '/armillary';
const ROOT = join(import.meta.dirname, '..', 'out');
const PORT = Number(process.env.PORT ?? 4000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const send404 = async (res) => {
  res.writeHead(404, { 'content-type': TYPES['.html'] });
  res.end(await readFile(join(ROOT, '404.html')));
};

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/' || pathname === BASE) {
    res.writeHead(301, { location: `${BASE}/` });
    return res.end();
  }
  if (!pathname.startsWith(`${BASE}/`)) return send404(res);

  // ../ で out/ の外へ出られないよう、正規化してから結合する。
  let file = join(ROOT, normalize(decodeURIComponent(pathname.slice(BASE.length))));
  if (!file.startsWith(ROOT)) return send404(res);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    send404(res);
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}${BASE}/`));

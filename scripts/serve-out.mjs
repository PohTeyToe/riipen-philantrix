// Serves the static export in out/ for a local look at the built site.
// Usage: node scripts/serve-out.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../out/', import.meta.url));
const PORT = Number(process.argv[2] ?? 5102);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

async function resolve(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^[/\\]+/, '');
  // `next build` on Windows writes prefetch files like __next.demo.__PAGE__.txt
  // as __next.demo/__PAGE__.txt. Linux builds (Vercel) name them correctly.
  const windowsSegment = clean.replace(/__next\.(.+)\.([^.]+)\.txt$/, '__next.$1/$2.txt');
  for (const candidate of [clean, `${clean}.html`, join(clean, 'index.html'), windowsSegment]) {
    const file = join(ROOT, candidate);
    if (!file.startsWith(ROOT)) return null;
    try { if ((await stat(file)).isFile()) return file; } catch { /* try the next one */ }
  }
  return null;
}

createServer(async (req, res) => {
  const file = (await resolve(req.url ?? '/')) ?? join(ROOT, '404.html');
  try {
    const body = await readFile(file);
    res.writeHead(file.endsWith('404.html') && !req.url?.includes('404') ? 404 : 200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, () => console.log(`Serving out/ on http://localhost:${PORT}`));

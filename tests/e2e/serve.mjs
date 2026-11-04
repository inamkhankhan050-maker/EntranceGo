// Minimal static server that behaves like GitHub Pages for a project site at /<base>/:
// files → 200, directories → index.html (with trailing-slash redirect), anything else → 404.html with status 404.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.png': 'image/png' };
export function serve(dist, base = '/entrancego/', port = 4173) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith(base)) { res.writeHead(404); return res.end('not found'); }
    let p = resolve(dist, '.' + decodeURIComponent(url.pathname.slice(base.length - 1)));
    try {
      let s = await stat(p);
      if (s.isDirectory()) {
        if (!url.pathname.endsWith('/')) { res.writeHead(301, { Location: url.pathname + '/' + url.search }); return res.end(); }
        p = join(p, 'index.html'); s = await stat(p);
      }
      res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' });
      return res.end(await readFile(p));
    } catch {
      res.writeHead(404, { 'Content-Type': TYPES['.html'] });
      return res.end(await readFile(resolve(dist, '404.html')));
    }
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}
if (process.argv[1].endsWith('serve.mjs')) serve(resolve(process.argv[2] || 'dist')).then(() => console.log('http://localhost:4173/entrancego/'));

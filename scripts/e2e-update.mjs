// End-to-end test of app updates: deploy A, redeploy B within the 10-minute HTTP cache, let the cache expire, reopen.
// The app must start on B. Drives dist/ in headless Chrome over the DevTools Protocol; no dependencies.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const work = resolve(DIST, '../.e2e-update');
rmSync(work, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Version A = the build; version B = the same app with a new script name (A's script deleted), like a redeploy.
const A = join(work, 'A'), B = join(work, 'B');
cpSync(DIST, A, { recursive: true }); cpSync(DIST, B, { recursive: true });
const js = readdirSync(join(B, 'assets')).find((f) => f.endsWith('.js'));
renameSync(join(B, 'assets', js), join(B, 'assets', 'index-versionB.js'));
for (const f of ['index.html', 'sw.js']) {
  writeFileSync(join(B, f), readFileSync(join(B, f), 'utf8').replaceAll(js, 'index-versionB.js').replace(/const VERSION = '[^']+'/, "const VERSION = 'versionB'"));
}

let root = A;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  let p = new URL(req.url, 'http://x').pathname;
  if (p.endsWith('/')) p += 'index.html';
  const f = join(root, p);
  if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'cache-control': 'max-age=600' }); // as GitHub Pages
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}/`;

const port = await new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const profile = join(work, 'profile'); mkdirSync(profile);
const chrome = spawn(process.env.CHROME ?? '/usr/bin/google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 100 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
  if (!target) await sleep(100);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id) pending.get(d.id)(d.result); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
const waitFor = async (e, timeout = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await ev(e)) return true; await sleep(100); } return false; };
const open = async () => { await send('Page.navigate', { url: BASE }); return waitFor(`!!document.querySelector('.tabbar')`); };
const closeApp = async () => { await send('Page.navigate', { url: 'about:blank' }); await sleep(1500); }; // no page left on the old worker

const results = [];
const check = (name, ok) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };
await send('Network.enable');

check('version A opens', await open());
check('version A is cached for offline', await waitFor(`navigator.serviceWorker.ready.then(() => caches.keys()).then((k) => k.length === 1)`));
await open(); // now controlled by the worker
root = B; // redeploy within 10 minutes
await open(); // the browser finds the new worker, which precaches B
check('new version precached', await waitFor(`caches.has('jearn-versionB')`));
check('precached start page is the new one', await waitFor(`caches.open('jearn-versionB').then((c) => c.match('./')).then((r) => r.text()).then((t) => t.includes('index-versionB.js'))`));
await send('Network.clearBrowserCache'); // 10+ minutes later: the HTTP cache has expired
for (const n of [1, 2]) {
  await closeApp();
  check(`reopen ${n} after the update: app starts`, await open());
}
check('running version B', await ev(`[...document.scripts].some((s) => s.src.includes('index-versionB.js'))`));

ws.close(); chrome.kill('SIGKILL'); server.closeAllConnections?.(); server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} update checks passed`);
process.exit(failed ? 1 : 0);

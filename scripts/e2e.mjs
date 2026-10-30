// End-to-end test: drives the real built app (dist/) in headless Chrome over the DevTools Protocol.
// No dependencies. Build first (`npm run e2e` does). Exits non-zero on any failed check, console error or exception.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import net from 'node:net';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const CHROME = process.env.CHROME ?? '/usr/bin/google-chrome';
if (!existsSync(join(DIST, 'index.html'))) { console.error('dist/ missing: run `npm run build` first'); process.exit(2); }

// Test output (screenshots, exported files) goes to .e2e/ in the repo (git-ignored), cleared each run.
const work = resolve(DIST, '../.e2e');
rmSync(work, { recursive: true, force: true });
const SHOTS = join(work, 'shots');
const profile = join(work, 'profile');
for (const d of [SHOTS, profile]) mkdirSync(d, { recursive: true });

// ---------- results ----------
const results = [];
const errors = []; // console errors / exceptions from the page
const alerts = []; // window.alert messages (stubbed in page)
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`);
};
const check = (name, cond, detail = '') => record(name, !!cond, detail);
const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
const eq = (name, actual, expected) => record(name, show(actual) === show(expected), `expected ${show(expected)}, got ${show(actual)}`);
const has = (name, haystack, needle) => record(name, String(haystack).includes(needle), `expected to contain ${show(needle)}, got ${show(haystack).slice(0, 300)}`);

// ---------- static server over dist/ ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(DIST, normalize(p));
  if (!f.startsWith(DIST) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}/`;

// ---------- chrome ----------
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const debugPort = await freePort();
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--window-size=375,667', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 100 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
  if (!target) await sleep(100);
}
if (!target) { console.error('Chrome did not start'); chrome.kill(); process.exit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

let nextId = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++nextId; pending.set(id, { res, rej, method }); ws.send(JSON.stringify({ id, method, params })); });
const argText = (a) => a.value ?? a.description ?? a.type;
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id) {
    const p = pending.get(d.id); pending.delete(d.id);
    if (d.error) p.rej(new Error(`${p.method}: ${d.error.message}`)); else p.res(d.result);
    return;
  }
  const { method, params } = d;
  if (method === 'Runtime.exceptionThrown') errors.push('uncaught: ' + (params.exceptionDetails.exception?.description ?? params.exceptionDetails.text));
  else if (method === 'Runtime.consoleAPICalled') {
    const text = params.args.map(argText).join(' ');
    if (params.type === 'error') errors.push('console.error: ' + text);
    else if (params.type === 'warning' && text.startsWith('ALERT:')) alerts.push(text.slice(6));
  } else if (method === 'Log.entryAdded' && params.entry.level === 'error') errors.push(`log: ${params.entry.text} ${params.entry.url ?? ''}`);
  else if (method === 'Inspector.targetCrashed') errors.push('page crashed');
  else if (method === 'Page.javascriptDialogOpening') { errors.push('native dialog: ' + params.message); send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}); }
};

const J = JSON.stringify;
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, what, timeout = 6000) => {
  const t0 = Date.now();
  for (;;) {
    if (await ev(`Promise.resolve(${expr}).then(Boolean,()=>false)`)) return;
    if (Date.now() - t0 > timeout) throw new Error('timed out waiting for ' + what);
    await sleep(50);
  }
};
const settle = () => sleep(150);
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
};

await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable'); await send('DOM.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
// Stubs installed before every page load: confirm (switchable), alert (captured), download/blob capture.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__confirm = true; window.__confirms = [];
  window.confirm = (m) => { window.__confirms.push(String(m)); return window.__confirm; };
  window.alert = (m) => console.warn('ALERT:' + m);
  const oc = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { window.__blob = b; return oc(b); };
  HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__download = this.download; return; } return HTMLElement.prototype.click.call(this); };
` });

const load = async (url = BASE) => {
  await send('Page.navigate', { url });
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('.tabbar')`, 'app to render');
  await settle();
};

// ---------- DOM helpers ----------
// Find: elements matching sel whose text equals `text` ("~x" = contains x), optionally inside a container [sel, containsText].
const FIND = `((sel, text, nth, within) => {
  const m = (e, t) => t === undefined || (t.startsWith('~') ? e.textContent.includes(t.slice(1)) : e.textContent.trim() === t);
  let roots = [document];
  if (within) roots = [...document.querySelectorAll(within[0])].filter((e) => e.textContent.includes(within[1]));
  const els = roots.flatMap((r) => [...r.querySelectorAll(sel)]).filter((e) => m(e, text));
  return els[nth];
})`;
const find = (sel, text, o = {}) => `${FIND}(${J(sel)}, ${J(text)}, ${o.nth ?? 0}, ${J(o.within)})`;
const exists = (sel, text, o) => ev(`!!${find(sel, text, o)}`);
const click = async (sel, text, o = {}) => {
  const r = await ev(`(() => { const el = ${find(sel, text, o)}; if (!el) return { err: 'missing' }; if (el.disabled) return { err: 'disabled' };
    el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect(); const x = b.x + b.width / 2, y = b.y + b.height / 2;
    const top = document.elementFromPoint(x, y); return { x, y, ok: top === el || el.contains(top) }; })()`);
  if (r.err) throw new Error(`click ${sel}${text === undefined ? '' : ` "${text}"`}: ${r.err}`);
  if (!r.ok) record(`tap target not obscured: ${sel} ${text ?? ''}`, false, 'another element covers the centre of the control');
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle();
};
const type = async (sel, value, o = {}) => {
  const ok = await ev(`(() => { const el = ${find(sel, undefined, o)}; if (!el) return false; el.focus(); el.select?.(); return true; })()`);
  if (!ok) throw new Error('type: missing ' + sel);
  await send('Input.insertText', { text: value });
  await sleep(80);
};
const key = async (k) => {
  const code = k === 'Enter' ? 13 : 27;
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code, text: k === 'Enter' ? '\r' : undefined });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code });
  await settle();
};
const setNative = (sel, value, event) => ev(`(() => { const el = document.querySelector(${J(sel)}); const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
  d.set.call(el, ${J(value)}); el.dispatchEvent(new Event(${J(event)}, { bubbles: true })); })()`);
const texts = (sel) => ev(`[...document.querySelectorAll(${J(sel)})].map((e) => e.textContent.trim())`);
const text = (sel) => ev(`document.querySelector(${J(sel)})?.textContent.trim() ?? null`);
const body = () => ev('document.body.innerText');
const tab = (name) => click('.tab', name);
const takeAlerts = () => alerts.splice(0);

const homeRows = () => ev(`[...document.querySelectorAll('.section-h.day')].flatMap((h) => [...h.nextElementSibling.querySelectorAll('.txrow')].map((r) => ({
  day: h.textContent.trim(), title: r.querySelector('.txtitle').textContent, meta: r.querySelector('.txmeta').textContent, amt: r.querySelector('.txamt').textContent })))`);
const cards = async () => Object.fromEntries((await ev(`[...document.querySelectorAll('.acard')].map((c) => [c.querySelector('.aname').textContent, c.querySelector('.abal').textContent])`)));
const dump = () => ev(`(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('jearn'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = (s) => new Promise((res, rej) => { const r = db.transaction(s).objectStore(s).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const o = { entries: (await all('entries')).sort((a, b) => a.seq - b.seq), accounts: await all('accounts'), expenseCats: await all('expenseCats'), incomeCats: await all('incomeCats'), settings: await all('settings') };
  db.close(); return JSON.parse(JSON.stringify(o)); })()`);

// ---------- money / date helpers (mirror what the UI should show) ----------
const php = (m, sign = '') => {
  const a = Math.abs(m);
  return (sign === '-' ? '−' : sign === '+' ? '+' : m < 0 ? '−' : '') + '₱' + Math.floor(a / 100).toLocaleString('en-US') + '.' + String(a % 100).padStart(2, '0');
};
const parseMoney = (t) => Math.round(parseFloat(t.replace(/[^0-9.\-−]/g, '').replace('−', '-')) * 100);
const pad = (n) => String(n).padStart(2, '0');
const dayStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const NOW = new Date();
const TODAY = dayStr(NOW);
const YESTERDAY = dayStr(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 1));
const PREV15 = dayStr(new Date(NOW.getFullYear(), NOW.getMonth() - 1, 15));
const FUTURE = dayStr(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 5));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const parse = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const monthTitle = (s) => `${MONTHS[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`;
const monthAbbr = (s) => MONTHS[+s.slice(5, 7) - 1].slice(0, 3);
const dayLabel = (s) => (s === TODAY ? 'Today' : s === YESTERDAY ? 'Yesterday' : `${WEEKDAYS[parse(s).getDay()]} ${+s.slice(8, 10)} ${monthAbbr(s)}`);
const THIS_MONTH = TODAY.slice(0, 7), PREV_MONTH = PREV15.slice(0, 7);
const yestThis = YESTERDAY.slice(0, 7) === THIS_MONTH; // when run on the 1st, "yesterday" is last month

// ---------- add-transaction driver ----------
const KEYMAP = { '*': '×', '/': '÷', '-': '−' };
const pressKeys = async (s) => { for (const ch of s) await click('.key', KEYMAP[ch] ?? ch); };
const openAdd = async () => { await click('.plus'); await waitFor(`!!document.querySelector('.sheet')`, 'add sheet'); await sleep(400); };
async function addTx({ type: kind = 'expense', keys, calc = false, calcOff = false, account, from, to, date, customDate, note, category, middle }) {
  await openAdd();
  if (kind !== 'expense') await click('.seg button', kind[0].toUpperCase() + kind.slice(1));
  if (calc) await click('.calcbtn');
  await pressKeys(keys);
  if (calcOff) await click('.calcbtn');
  if (middle) await middle();
  if (account) { await click('.pill', undefined, { nth: 0 }); await click('.inpanel .chip', account); }
  if (from) { await click('.pill', undefined, { nth: 0 }); await click('.inpanel .chips .chip', from, { nth: 0 }); }
  if (to) { if (!(await exists('.inpanel'))) await click('.pill', undefined, { nth: 0 }); await click('.inpanel .chips .chip', to, { nth: 1 }); }
  if (date) { await click('.pill', undefined, { nth: 1 }); await click('.inpanel .chip', date); }
  if (customDate) { await click('.pill', undefined, { nth: 1 }); await setNative('.dateinput', customDate, 'change'); await settle(); }
  if (kind === 'transfer') { await click('.primary', 'Save transfer'); }
  else {
    await click('.primary', 'Choose category');
    if (note) await type('.sheet input.field', note);
    await click('.catchip', category);
  }
  await waitFor(`!document.querySelector('.sheet')`, 'sheet to close after save');
  await settle();
}

const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const byId = (xs) => [...xs].sort((a, b) => (a.id < b.id ? -1 : 1));
const noAlerts = (name) => { const a = takeAlerts(); check(`${name}: no unexpected alert`, a.length === 0, a.join(' | ')); };

// ---------- flows ----------
const flows = [];
const flow = (name, fn) => flows.push([name, fn]);
let snap; // exported snapshot (parsed) and its dump, shared across flows
let exportedText, exportedDump;

flow('Fresh start', async () => {
  await load();
  eq('home title is the current month', await text('.large-title h1'), monthTitle(THIS_MONTH));
  check('home: next-month button disabled on current month', await ev(`document.querySelector('.monthnav [aria-label="Next month"]').disabled`));
  has('home: empty accounts hint', await body(), 'Add an account in Setup.');
  has('home: empty transactions hint', await body(), 'No transactions this month. Tap + to add one.');
  has('home: Left to spend label', await body(), 'Left to spend');
  const d = await dump();
  eq('db: no accounts on fresh install', d.accounts.length, 0);
  eq('db: no entries on fresh install', d.entries.length, 0);
  const names = d.expenseCats.map((c) => c.name);
  for (const n of ['Housing', 'Food', 'Transport', 'Bills', 'Taxes']) check(`db: starter category ${n}`, names.includes(n));
  const sub = (c, s) => d.expenseCats.find((x) => x.name === c)?.subs.some((x) => x.name === s);
  check('db: Food > Groceries', sub('Food', 'Groceries'));
  check('db: Bills > Mobile', sub('Bills', 'Mobile'));
  check('db: Bills > Subscriptions', sub('Bills', 'Subscriptions'));
  check('db: no starter budgets', d.expenseCats.every((c) => c.budgets.length === 0));
  check('db: Salary income category', d.incomeCats.some((c) => c.name === 'Salary'));
  check('db: currency default PHP (setting absent or PHP)', d.settings.length === 0 || d.settings[0].value === 'PHP');

  await tab('Setup');
  eq('setup: currency select shows PHP', await ev(`document.querySelector('select[aria-label=Currency]').value`), 'PHP');
  check('setup: currency changeable while ledger empty', !(await ev(`document.querySelector('select[aria-label=Currency]').disabled`)));
  await click('.catbtn', '~Food');
  check('setup: Food lists Groceries', (await texts('.subline')).includes('Groceries'));
  await click('.catbtn', '~Food');
  await click('.catbtn', '~Bills');
  const subs = await texts('.subline');
  check('setup: Bills lists Mobile and Subscriptions', subs.includes('Mobile') && subs.includes('Subscriptions'), subs.join(','));
  await click('.catbtn', '~Bills');
  has('setup: income list has Salary', (await texts('.srow')).join('|'), 'Salary');
  await shot('01-setup-fresh');

  await setNative('select[aria-label=Currency]', 'USD', 'change'); await settle();
  eq('currency changed to USD while empty (db)', (await dump()).settings[0]?.value, 'USD');
  await setNative('select[aria-label=Currency]', 'PHP', 'change'); await settle();
  eq('currency back to PHP (db)', (await dump()).settings[0]?.value, 'PHP');
  noAlerts('fresh start');
});

flow('Setup: accounts', async () => {
  await tab('Setup');
  const addAccount = async (name, balance, chip) => {
    await click('.addbtn', 'Add account');
    await type('input[placeholder="Account name"]', name);
    if (balance) await type('input[placeholder="Balance"]', balance);
    if (chip) await click('.chips.form .chip', chip);
    await click('.primary.small', 'Add');
    await waitFor(`[...document.querySelectorAll('.srow.acct')].some((r) => r.textContent.includes(${J(name)}))`, `account ${name}`);
  };
  const row = async (name) => ev(`(() => { const r = [...document.querySelectorAll('.srow.acct')].find((r) => r.textContent.includes(${J(name)})); return r ? r.textContent : ''; })()`);
  await addAccount('BDO', '10000');
  has('account BDO shows balance', await row('BDO'), php(1000000));
  has('account BDO type Bank', await row('BDO'), 'Bank');
  await addAccount('Visa', '2500', 'Credit card');
  has('credit card shows amount owed', await row('Visa'), php(250000));
  has('credit card type label', await row('Visa'), 'Credit card');
  await addAccount('Wallet', '500');
  has('Wallet defaults to Bank', await row('Wallet'), 'Bank');
  await click('.typebtn', undefined, { within: ['.srow-wrap', 'Wallet'] });
  await click('.chips.row .chip', 'Cash');
  await waitFor(`[...document.querySelectorAll('.srow.acct')].find((r) => r.textContent.includes('Wallet')).textContent.includes('Cash')`, 'type change to Cash');
  has('account type changed via chips', await row('Wallet'), 'Cash');
  eq('db: Wallet type is cash', (await dump()).accounts.find((a) => a.name === 'Wallet').type, 'cash');
  await addAccount('Old', '');
  eq('zero opening posts no entry', (await dump()).entries.length, 3);

  const d = await dump();
  const visa = d.accounts.find((a) => a.name === 'Visa');
  const vOpen = d.entries.find((e) => e.creditId === visa.id);
  check('liability opening: credit = account, debit = Opening Balances', vOpen && vOpen.kind === 'opening' && vOpen.debitId !== visa.id);
  const bdo = d.accounts.find((a) => a.name === 'BDO');
  check('asset opening: debit = account', d.entries.some((e) => e.kind === 'opening' && e.debitId === bdo.id && e.amountMinor === 1000000));
  check('opening entries are dated today', d.entries.every((e) => e.date === TODAY));

  // archive / restore
  await click('.iconbtn[aria-label="Archive Wallet"]');
  await waitFor(`!document.querySelector('.iconbtn[aria-label="Archive Wallet"]')`, 'Wallet archived');
  has('archived section lists Wallet', (await body()).toLowerCase(), 'archived');
  check('archived account has Restore', await exists('.srow .link', 'Restore', { within: ['.srow', 'Wallet'] }));
  await tab('Home');
  check('home hides archived account', !Object.keys(await cards()).includes('Wallet'));
  await tab('Setup');
  await click('.link', 'Restore', { within: ['.srow', 'Wallet'] });
  await waitFor(`!!document.querySelector('.iconbtn[aria-label="Archive Wallet"]')`, 'Wallet restored');
  has('restored account back in list with type kept', await row('Wallet'), 'Cash');
  await click('.iconbtn[aria-label="Archive Old"]'); // stays archived for the export test
  await waitFor(`!document.querySelector('.iconbtn[aria-label="Archive Old"]')`, 'Old archived');
  check('db: Old has archivedAt', !!(await dump()).accounts.find((a) => a.name === 'Old').archivedAt);

  await tab('Home');
  const c = await cards();
  eq('home account cards', c, { BDO: php(1000000), Visa: php(250000), Wallet: php(50000) });
  await shot('02-home-accounts');

  // currency locked now
  await tab('Setup');
  check('currency locked once entries exist', await ev(`document.querySelector('select[aria-label=Currency]').disabled`));
  has('currency locked footnote', await body(), 'Locked once the first transaction exists.');
  noAlerts('accounts');
});

flow('Setup: categories and rollover', async () => {
  await tab('Setup');
  const listed = (name) => ev(`[...document.querySelectorAll('.catbtn')].some((b) => b.textContent.includes(${J(name)}))`);
  await click('.addbtn', 'Add category');
  await type('input[placeholder="Category name"]', 'Pets');
  await key('Enter');
  await waitFor(`[...document.querySelectorAll('.catbtn')].some((b) => b.textContent.includes('Pets'))`, 'Pets category');
  check('category added (Enter commits)', await listed('Pets'));
  await click('.catbtn', '~Pets');
  await click('.addbtn', 'Add subcategory', { within: ['.srow-wrap', 'Pets'] });
  await type('input[placeholder="Subcategory name"]', 'Vet');
  await click('.primary.small', 'Add');
  await waitFor(`[...document.querySelectorAll('.subline')].some((b) => b.textContent.includes('Vet'))`, 'Vet sub');
  check('subcategory added', (await texts('.subline')).includes('Vet'));
  await click('.iconbtn[aria-label="Archive Vet"]');
  await waitFor(`!document.querySelector('.iconbtn[aria-label="Archive Vet"]')`, 'Vet archived');
  has('archived sub listed as Pets › Vet', await body(), 'Pets › Vet');
  await click('.link', 'Restore', { within: ['.srow', 'Pets › Vet'] });
  await waitFor(`!!document.querySelector('.iconbtn[aria-label="Archive Vet"]')`, 'Vet restored');
  check('subcategory restored', (await texts('.subline')).includes('Vet'));
  await click('.iconbtn[aria-label="Archive Vet"]'); // left archived for the export test
  await waitFor(`!document.querySelector('.iconbtn[aria-label="Archive Vet"]')`, 'Vet archived again');
  await click('.catbtn', '~Pets'); // collapse

  await click('.iconbtn[aria-label="Archive Pets"]');
  await waitFor(`![...document.querySelectorAll('.catbtn')].some((b) => b.textContent.includes('Pets'))`, 'Pets archived');
  check('category archived (hidden from list)', !(await listed('Pets')));
  await click('.link', 'Restore', { within: ['.srow', 'Pets'] });
  await waitFor(`[...document.querySelectorAll('.catbtn')].some((b) => b.textContent.includes('Pets'))`, 'Pets restored');
  check('category restored', await listed('Pets'));

  await click('.addbtn', 'Add income category');
  await type('input[placeholder="Income category"]', 'Freelance');
  await click('.primary.small', 'Add');
  await waitFor(`!!document.querySelector('.iconbtn[aria-label="Archive Freelance"]')`, 'Freelance income');
  await click('.iconbtn[aria-label="Archive Freelance"]'); // stays archived
  await waitFor(`!document.querySelector('.iconbtn[aria-label="Archive Freelance"]')`, 'Freelance archived');
  check('db: Freelance archived', !!(await dump()).incomeCats.find((c) => c.name === 'Freelance').archivedAt);

  // rollover
  await click('.catbtn', '~Food');
  const sw = () => ev(`document.querySelector('.rollrow .switch').getAttribute('aria-checked')`);
  const note = () => text('.rollrow .muted12');
  eq('rollover starts off', await sw(), 'false');
  eq('rollover off note', await note(), 'Unspent budget resets each month');
  check('no Reset button while off', !(await exists('.rollrow .ghost', 'Reset')));
  await click('.rollrow .switch');
  eq('rollover switched on', await sw(), 'true');
  has('rollover on note', await note(), 'Carrying');
  check('Reset button appears when on', await exists('.rollrow .ghost', 'Reset'));
  eq('db: rollStart = previous month', (await dump()).expenseCats.find((c) => c.name === 'Food').rollStart, PREV_MONTH);
  await click('.rollrow .ghost', 'Reset');
  eq('Reset note', await note(), 'Starts fresh this month');
  eq('db: Reset sets rollStart = this month', (await dump()).expenseCats.find((c) => c.name === 'Food').rollStart, THIS_MONTH);
  await click('.rollrow .switch');
  eq('rollover switched off', await sw(), 'false');
  await click('.rollrow .switch');
  eq('rollover on again (rollStart previous month for the budget test)', (await dump()).expenseCats.find((c) => c.name === 'Food').rollStart, PREV_MONTH);
  await shot('03-setup-rollover');
  noAlerts('categories');
});

flow('Add transactions', async () => {
  await tab('Home');
  // sheet basics
  await openAdd();
  check('Choose category disabled with no amount', await ev(`document.querySelector('.primary').disabled`));
  await pressKeys('1.259');
  eq('max 2 decimals', await text('.amount'), '₱1.25');
  for (let i = 0; i < 4; i++) await click('.key[aria-label=Delete]');
  eq('backspace clears amount', await text('.amount'), '₱0');
  await click('.pill', undefined, { nth: 1 });
  eq('date input max = today', await ev(`document.querySelector('.dateinput').max`), TODAY);
  await setNative('.dateinput', FUTURE, 'change'); await settle();
  has('future date is not accepted (clamped to today)', await text('.pill:nth-of-type(2)'), 'Today');
  await shot('04-add-sheet');
  await click('.textbtn', 'Cancel');
  check('Cancel closes the sheet', !(await exists('.sheet')));

  // A: plain keypad expense, with note; Back keeps the amount
  await openAdd();
  await pressKeys('125');
  await click('.primary', 'Choose category');
  check('category step lists subcategory chips', (await texts('.catchip')).includes('Groceries'));
  check('archived Vet not offered', !(await texts('.catchip')).includes('Vet'));
  check('restored Pets exists with its only active sub missing -> shown as category chip', (await texts('.cghead')).includes('Pets') && (await texts('.catchip')).includes('Pets'));
  await shot('05-category-step');
  await click('.backbtn');
  eq('Back returns to amount, amount kept', await text('.amount'), '₱125');
  await click('.primary', 'Choose category');
  await type('.sheet input.field', 'weekly shop');
  await click('.catchip', 'Groceries');
  await waitFor(`!document.querySelector('.sheet')`, 'saved');
  await settle();
  eq('after save: jumps to the entry month', await text('.large-title h1'), monthTitle(THIS_MONTH));
  let rows = await homeRows();
  eq('A: expense row', rows.find((r) => r.title === 'Groceries'), { day: 'Today', title: 'Groceries', meta: 'Food · BDO · weekly shop', amt: php(12500, '-') });
  eq('A: BDO balance', (await cards()).BDO, php(1000000 - 12500));

  // B: calculator expression, "=", then toggle off, Yesterday
  await openAdd();
  await click('.calcbtn');
  await pressKeys('(12+3)*2');
  eq('calc: expression line', await text('.exprline'), '(12+3)×2');
  eq('calc: live result', await text('.amount'), php(3000));
  await click('.key', '=');
  eq('calc: = collapses expression', await text('.exprline'), '');
  eq('calc: = result amount', await text('.amount'), '₱30');
  await click('.calcbtn');
  check('calc off: simple keypad', await ev(`document.querySelector('.keypad').classList.contains('k3')`));
  eq('calc off keeps amount', await text('.amount'), '₱30');
  await click('.pill', undefined, { nth: 1 });
  await click('.inpanel .chip', 'Yesterday');
  has('date pill reads Yesterday', await text('.pill:nth-of-type(2)'), 'Yesterday');
  await click('.primary', 'Choose category');
  await click('.catchip', 'Coffee');
  await waitFor(`!document.querySelector('.sheet')`, 'saved B');
  await settle();
  eq('B: jumps to yesterday month', await text('.large-title h1'), monthTitle(YESTERDAY.slice(0, 7)));
  rows = await homeRows();
  eq('B: coffee row', rows.find((r) => r.title === 'Coffee'), { day: 'Yesterday', title: 'Coffee', meta: 'Food · BDO', amt: php(3000, '-') });
  await shot('06-home-after-expenses');

  // C: toggle-off evaluates, other account, earlier date via input, other category
  await addTx({
    keys: '20+5', calc: true, calcOff: true, account: 'Visa', customDate: PREV15, category: 'Mobile', note: 'plan',
    middle: async () => eq('calc toggled off evaluates 20+5', await text('.amount'), '₱25'),
  });
  eq('C: jumps to the backdated month', await text('.large-title h1'), monthTitle(PREV_MONTH));
  rows = await homeRows();
  eq('C: backdated row with weekday label', rows.find((r) => r.title === 'Mobile'), { day: dayLabel(PREV15), title: 'Mobile', meta: 'Bills · Visa · plan', amt: php(2500, '-') });
  await shot('07-prev-month');
  await click('.monthnav [aria-label="Next month"]');
  eq('next month returns to current', await text('.large-title h1'), monthTitle(THIS_MONTH));
  check('next disabled on current month again', await ev(`document.querySelector('.monthnav [aria-label="Next month"]').disabled`));

  // D: income
  await openAdd();
  await click('.seg button', 'Income');
  await pressKeys('5000');
  await click('.primary', 'Choose category');
  const inc = await texts('.catchip');
  check('income step lists income categories', inc.includes('Salary') && !inc.includes('Groceries'), inc.join(','));
  check('archived income category not offered', !inc.includes('Freelance'));
  await click('.catchip', 'Salary');
  await waitFor(`!document.querySelector('.sheet')`, 'saved D');
  await settle();
  rows = await homeRows();
  eq('D: income row', rows.find((r) => r.title === 'Salary'), { day: 'Today', title: 'Salary', meta: 'BDO', amt: php(500000, '+') });

  // E: transfer, From = To rejected
  await openAdd();
  await click('.seg button', 'Transfer');
  await pressKeys('1000');
  eq('transfer primary label', await text('.primary'), 'Save transfer');
  await click('.pill', undefined, { nth: 0 });
  await click('.inpanel .chips .chip', 'BDO', { nth: 0 });
  await click('.inpanel .chips .chip', 'BDO', { nth: 1 });
  check('From = To marks the pill and disables save', (await ev(`document.querySelector('.pill').classList.contains('bad')`)) && (await ev(`document.querySelector('.primary').disabled`)));
  await click('.pill', undefined, { nth: 0 });
  await click('.inpanel .chips .chip', 'Visa', { nth: 1 });
  has('transfer pill reads From → To', await text('.pill'), 'BDO → Visa');
  check('save enabled with From != To', !(await ev(`document.querySelector('.primary').disabled`)));
  await click('.primary', 'Save transfer');
  await waitFor(`!document.querySelector('.sheet')`, 'saved E');
  await settle();
  rows = await homeRows();
  eq('E: transfer row', rows.find((r) => r.title === 'Transfer'), { day: 'Today', title: 'Transfer', meta: 'BDO → Visa', amt: php(100000) });

  // F: Dining out for the budget test
  await addTx({ keys: '200', category: 'Dining out' });
  eq('balances after all entries', await cards(), {
    BDO: php(1000000 - 12500 - 3000 - 100000 + 500000 - 20000), Visa: php(250000 + 2500 - 100000), Wallet: php(50000),
  });
  const d = await dump();
  eq('db: entries so far', d.entries.map((e) => e.kind), ['opening', 'opening', 'opening', 'expense', 'expense', 'expense', 'income', 'transfer', 'expense']);
  check('db: seq 1..n', d.entries.every((e, i) => e.seq === i + 1));
  check('db: amounts are positive integers', d.entries.every((e) => Number.isSafeInteger(e.amountMinor) && e.amountMinor > 0));
  check('db: backdated entry has the picked date', d.entries.some((e) => e.date === PREV15 && e.amountMinor === 2500));
  check('db: dates are YYYY-MM-DD', d.entries.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date)));
  check('db: no future-dated entry', d.entries.every((e) => e.date <= TODAY));
  noAlerts('add transactions');
});

flow('Home summary and month switcher', async () => {
  await tab('Home');
  const spent = 12500 + 20000 + (yestThis ? 3000 : 0);
  has('summary: spent / income line', await text('.summary .sub13'), `Spent ${php(spent)} of ${php(0)}`);
  has('summary: income', await text('.summary .sub13'), `Income ${php(500000)}`);
  eq('summary: over budget with no budgets', await text('.summary .muted13'), 'Over budget');
  eq('summary amount', await text('.summary .big'), php(spent));
  const labels = await texts('.section-h.day');
  check('group labels: Today first', labels[0] === 'Today', labels.join(','));
  if (yestThis) check('group labels: Yesterday', labels.includes('Yesterday'), labels.join(','));
  await click('.monthnav [aria-label="Previous month"]');
  eq('prev month title', await text('.large-title h1'), monthTitle(PREV_MONTH));
  has('prev month shows weekday-date label', (await texts('.section-h.day')).join('|'), dayLabel(PREV15));
  await click('.monthnav [aria-label="Next month"]');
  eq('back on current month', await text('.large-title h1'), monthTitle(THIS_MONTH));
  await click('.monthnav [aria-label="Previous month"]');
  await click('.monthnav [aria-label="Previous month"]');
  eq('empty month shows empty state', await text('.empty'), 'No transactions this month. Tap + to add one.');
  await click('.monthnav [aria-label="Next month"]');
  await click('.monthnav [aria-label="Next month"]');
});

flow('Detail sheet and void', async () => {
  await tab('Home');
  const before = await dump();
  await click('.txrow', '~Groceries');
  await waitFor(`!!document.querySelector('.sheet')`, 'detail sheet');
  const rows = await texts('.drow');
  eq('detail rows', rows, ['CategoryFood', 'SubcategoryGroceries', 'AccountBDO', 'DateToday', 'Noteweekly shop']);
  eq('detail kind', await text('.detailtop .muted13'), 'Expense');
  eq('detail amount', await text('.dbig'), php(12500, '-'));
  await shot('08-detail');
  // declined confirm: nothing happens
  await ev('window.__confirm = false');
  await click('.destructive', 'Void transaction');
  has('confirm asked with void message', (await ev('window.__confirms')).join('|'), 'Void this transaction?');
  check('declined confirm keeps the sheet open', await exists('.sheet'));
  eq('declined confirm: ledger unchanged', (await dump()).entries.length, before.entries.length);
  await ev('window.__confirm = true');
  await click('.destructive', 'Void transaction');
  await waitFor(`!document.querySelector('.sheet')`, 'void closes the sheet');
  await settle();
  check('voided entry disappears from Home', !(await exists('.txrow', '~Groceries')));
  eq('BDO balance reverts', (await cards()).BDO, php(1000000 - 3000 - 100000 + 500000 - 20000));
  const after = await dump();
  eq('db: exactly one new entry', after.entries.length, before.entries.length + 1);
  eq('db: earlier entries untouched', canon(after.entries.slice(0, before.entries.length)), canon(before.entries));
  const orig = before.entries.find((e) => e.amountMinor === 12500 && e.kind === 'expense');
  const rev = after.entries.at(-1);
  check('db: reversal mirrors the original', rev.kind === 'reversal' && rev.reverses === orig.id && rev.debitId === orig.creditId
    && rev.creditId === orig.debitId && rev.amountMinor === orig.amountMinor && rev.date === orig.date,
    canon(rev));
  check('db: original still present', after.entries.some((e) => e.id === orig.id));
  eq('db: reversal is the next seq', rev.seq, before.entries.length + 1);
  noAlerts('void');
});

flow('Budgets', async () => {
  await tab('Budgets');
  const foodCard = ['.card', 'Food'];
  const foodSpent = 20000 + (yestThis ? 3000 : 0);
  const budgetOf = (name, sub) => ev(`(() => { const r = [...document.querySelectorAll(${J(sub ? '.subrow' : '.card')})].find((x) => x.querySelector(${J(sub ? '.subname' : '.cname')}).textContent === ${J(name)}); return r.querySelector('.budget-btn, .budget-input')?.textContent ?? null; })()`);
  has('totals line', await text('.row.between.sub13'), `Spent ${php(foodSpent)}`);
  // Enter commits
  await click('.budget-btn', undefined, { within: foodCard });
  check('tap opens inline field', await exists('.budget-input'));
  await type('.budget-input', '3000');
  await key('Enter');
  check('Enter commits and closes field', !(await exists('.budget-input')));
  eq('Food budget shown', await budgetOf('Food'), php(300000));
  // Escape cancels
  await click('.budget-btn', undefined, { within: foodCard });
  await type('.budget-input', '999');
  await key('Escape');
  eq('Escape cancels', await budgetOf('Food'), php(300000));
  // expand subs; blur commits
  await click('.cardfoot', undefined, { within: foodCard });
  await click('.budget-btn.small', undefined, { within: ['.subrow', 'Groceries'] });
  await type('.budget-input', '1000');
  await ev(`document.querySelector('.budget-input').blur()`); await settle();
  eq('blur commits sub budget', await budgetOf('Groceries', true), php(100000));
  check('no overflow warning yet', !(await exists('.warn12')));
  await click('.budget-btn.small', undefined, { within: ['.subrow', 'Coffee'] });
  await type('.budget-input', '2500');
  await key('Enter');
  eq('Enter commits sub budget', await budgetOf('Coffee', true), php(250000));
  eq('overflow warning', await text('.warn12'), `Subcategory budgets add up to ${php(350000)}, more than ${php(300000)}.`);
  await shot('09-budgets');
  // expression in budget field
  await click('.budget-btn', undefined, { within: foodCard });
  await type('.budget-input', '1500+1500');
  await key('Enter');
  eq('budget field evaluates an expression', await budgetOf('Food'), php(300000));

  // rollover line, later month than rollStart
  const carry = 300000 - (yestThis ? 0 : 3000); // budget (earliest entry) minus last month's Food spend
  const avail = 300000 + carry;
  const line = await text('.rollline');
  has('rollover line shows source month', line, `from ${monthAbbr(PREV_MONTH)}`);
  has('rollover line shows available', line, `${php(avail)} available`);
  has('rollover left line', await ev(`${find('.cardfoot span', undefined, { within: foodCard })}.textContent`), `${php(avail - foodSpent)} left`);
  has('totals: available includes carryover', await text('.row.between.sub13'), `Available ${php(avail)}`);
  const exp = (await dump()).expenseCats.find((c) => c.name === 'Food');
  eq('db: Food budget history', exp.budgets.map((b) => [b.from, b.amountMinor]), [[THIS_MONTH, 300000]]);
  eq('db: sub budgets stored', exp.subs.filter((s) => s.budgets.length).map((s) => [s.name, s.budgets[0].amountMinor]), [['Groceries', 100000], ['Coffee', 250000]]);

  // earlier months keep their budget: change last month's budget only affects from then on
  await click('.monthnav [aria-label="Previous month"]');
  await click('.budget-btn', undefined, { within: foodCard });
  await type('.budget-input', '2000');
  await key('Enter');
  const hist = (await dump()).expenseCats.find((c) => c.name === 'Food').budgets.map((b) => [b.from, b.amountMinor]);
  eq('editing an earlier month replaces later entries (from >= month removed)', hist, [[PREV_MONTH, 200000]]);
  await click('.monthnav [aria-label="Next month"]');
  // put this month back to 3000 -> history [PREV 2000, THIS 3000]
  await click('.budget-btn', undefined, { within: foodCard });
  await type('.budget-input', '3000');
  await key('Enter');
  eq('history: earlier month keeps its own budget', (await dump()).expenseCats.find((c) => c.name === 'Food').budgets.map((b) => [b.from, b.amountMinor]), [[PREV_MONTH, 200000], [THIS_MONTH, 300000]]);
  const carry2 = 200000 - (yestThis ? 0 : 3000);
  has('rollover now uses last month budget', await text('.rollline'), `${php(300000 + carry2)} available`);
  await shot('10-budgets-rollover');

  await tab('Home');
  eq('home: Left to spend uses available', await text('.summary .big'), php(300000 + carry2 - foodSpent));
  eq('home label', await text('.summary .muted13'), 'Left to spend');

  // Reset in Setup -> "Rollover starts this month"
  await tab('Setup');
  await click('.catbtn', '~Food');
  await click('.rollrow .ghost', 'Reset');
  await tab('Budgets');
  eq('rollover reset line', await text('.rollline'), 'Rollover starts this month');
  noAlerts('budgets');
});

flow('Reports', async () => {
  await tab('Reports');
  const spent = 20000 + (yestThis ? 3000 : 0);
  const tiles = await texts('.tile');
  eq('this month tiles', tiles, [`Income${php(500000)}`, `Spent${php(spent)}`, `Saved${php(500000 - spent)}`]);
  const bars = await texts('.catbar');
  check('category bar for Food', bars.length === 1 && bars[0].startsWith('Food') && bars[0].includes('100%') && bars[0].includes(php(spent)), bars.join('|'));
  await shot('11-reports-month');
  await click('.navbtn[aria-label="Previous month"]');
  const prevSpent = 2500 + (yestThis ? 0 : 3000);
  has('previous month spent tile', (await texts('.tile'))[1], php(prevSpent));
  await click('.seg button', 'Last 6 months');
  check('6-month chart renders (12 bars)', (await ev(`document.querySelectorAll('svg[role=img] rect').length`)) === 12);
  check('6-month chart: current month bars non-empty', await ev(`(() => { const r = [...document.querySelectorAll('svg[role=img] rect')]; return +r[10].getAttribute('height') > 0 && +r[11].getAttribute('height') > 0; })()`));
  check('6-month chart month labels', (await ev(`document.querySelectorAll('svg[role=img] text').length`)) === 6);
  eq('monthly average tiles', (await texts('.tile')).length, 3);
  check('average per category lists Food with budget', (await texts('.avgrow')).some((t) => t.includes('Food') && t.includes('of ' + php(300000))));
  await shot('12-reports-6m');
  noAlerts('reports');
});

flow('Edit a transaction', async () => {
  await tab('Home');
  const openEdit = async (rowText) => {
    await click('.txrow', rowText);
    await waitFor(`!!document.querySelector('.sheet')`, 'detail sheet');
    await click('button', 'Edit');
    await waitFor(`document.querySelector('.sheettitle')?.textContent === 'Edit Transaction'`, 'edit sheet');
    await sleep(300);
  };
  const saved = async () => { await waitFor(`!document.querySelector('.sheet')`, 'edit sheet to close'); await settle(); };

  // expense: add one to edit
  await addTx({ keys: '40', account: 'BDO', category: 'Groceries', note: 'edit me' });
  const base = await dump();
  const baseCards = await cards();
  await click('.txrow', '~edit me');
  await waitFor(`!!document.querySelector('.sheet')`, 'detail sheet');
  check('detail sheet has Edit button', await exists('button', 'Edit'));
  check('detail sheet still has Void button', await exists('.destructive', 'Void transaction'));
  await click('.textbtn', 'Done');
  await waitFor(`!document.querySelector('.sheet')`, 'detail closed');

  await openEdit('~edit me');
  eq('edit: amount prefilled', await text('.amount'), '₱40');
  check('edit: type control locked', await ev(`[...document.querySelectorAll('.seg button')].every((b) => b.disabled)`));
  eq('edit: type shows Expense', await text('.seg button.on'), 'Expense');
  eq('edit: account prefilled', await text('.pill:nth-of-type(1)'), 'BDO');
  has('edit: date prefilled', await text('.pill:nth-of-type(2)'), 'Today');
  await shot('15-edit-sheet');

  // unchanged expense -> no-op
  await click('.primary', 'Choose category');
  eq('edit: note prefilled', await ev(`document.querySelector('.sheet input.field').value`), 'edit me');
  eq('edit: current category highlighted', await texts('.catchip.on'), ['Groceries']);
  await click('.catchip.on');
  await saved();
  eq('unchanged edit: no new entries', canon((await dump()).entries), canon(base.entries));
  eq('unchanged edit: balances same', await cards(), baseCards);

  // changed: amount, subcategory, date
  await openEdit('~edit me');
  await click('.key[aria-label=Delete]'); await click('.key[aria-label=Delete]');
  await pressKeys('55.5');
  await click('.pill', undefined, { nth: 1 }); await click('.inpanel .chip', 'Yesterday');
  await click('.primary', 'Choose category');
  await click('.catchip', 'Mobile');
  await saved();
  eq('edit: app jumps to corrected entry month', await text('.large-title h1'), monthTitle(YESTERDAY.slice(0, 7)));
  const rows = (await homeRows()).filter((r) => r.meta.includes('edit me'));
  eq('edit: Home shows exactly one entry with new values', rows.map((r) => [r.day, r.title, r.amt]), [[dayLabel(YESTERDAY), 'Mobile', php(5550, '-')]]);
  has('edit: row meta keeps account and note', rows[0].meta, 'BDO · edit me');
  const after = await dump();
  eq('edit: exactly two new entries', after.entries.length, base.entries.length + 2);
  eq('edit: earlier entries byte-identical', canon(after.entries.slice(0, base.entries.length)), canon(base.entries));
  const orig = base.entries.at(-1);
  const [rev, neu] = after.entries.slice(-2);
  check('edit: reversal mirrors original at next seq', rev.kind === 'reversal' && rev.reverses === orig.id && rev.debitId === orig.creditId
    && rev.creditId === orig.debitId && rev.amountMinor === orig.amountMinor && rev.date === orig.date && rev.seq === orig.seq + 1, canon(rev));
  const mobile = after.expenseCats.find((c) => c.name === 'Bills').subs.find((s) => s.name === 'Mobile');
  const bdoId = after.accounts.find((a) => a.name === 'BDO').id;
  check('edit: new entry has corrected fields at next seq', neu.kind === 'expense' && neu.seq === rev.seq + 1 && neu.amountMinor === 5550
    && neu.debitId === mobile.id && neu.creditId === bdoId && neu.date === YESTERDAY && neu.note === 'edit me' && !neu.reverses, canon(neu));
  eq('edit: balance reflects only the new amount', (await cards()).BDO, php(parseMoney(baseCards.BDO) + 4000 - 5550));
  await tab('Budgets');
  has('edit: budgets reflect only the new amount', await body(), php(5550));
  await tab('Home');
  noAlerts('edit expense');

  // transfer: change To
  await tab('Home');
  await click('.monthnav [aria-label="Next month"]').catch(() => {});
  await addTx({ type: 'transfer', keys: '10', from: 'BDO', to: 'Wallet' });
  const tBase = await dump();
  await openEdit('~Transfer');
  eq('edit transfer: type Transfer locked', [await text('.seg button.on'), await ev(`document.querySelector('.seg button').disabled`)], ['Transfer', true]);
  has('edit transfer: From → To prefilled', await text('.pill:nth-of-type(1)'), 'BDO → Wallet');
  await click('.pill', undefined, { nth: 0 });
  await click('.inpanel .chips .chip', 'Visa', { nth: 1 });
  await click('.primary', 'Save transfer');
  await saved();
  const tAfter = await dump();
  eq('edit transfer: two new entries', tAfter.entries.length, tBase.entries.length + 2);
  eq('edit transfer: earlier entries byte-identical', canon(tAfter.entries.slice(0, tBase.entries.length)), canon(tBase.entries));
  const visaId = tAfter.accounts.find((a) => a.name === 'Visa').id;
  const tNew = tAfter.entries.at(-1);
  check('edit transfer: new entry credits BDO, debits Visa', tNew.kind === 'transfer' && tNew.creditId === bdoId && tNew.debitId === visaId && tNew.amountMinor === 1000, canon(tNew));
  check('edit transfer: reversal precedes it', tAfter.entries.at(-2).kind === 'reversal' && tAfter.entries.at(-2).reverses === tBase.entries.at(-1).id);
  eq('edit transfer: Home shows one transfer to Visa', (await homeRows()).filter((r) => r.title === 'Transfer' && r.amt === php(1000)).map((r) => r.meta), ['BDO → Visa']);

  // unchanged transfer -> no-op
  await openEdit('~BDO → Visa');
  await click('.primary', 'Save transfer');
  await saved();
  eq('unchanged transfer edit: no new entries', (await dump()).entries.length, tAfter.entries.length);
  noAlerts('edit transfer');
});

flow('Export and tamper tests', async () => {
  await tab('Setup');
  check('Import not offered once ledger has entries', !(await exists('.addbtn', 'Import data')));
  await click('.addbtn', 'Export data');
  await waitFor(`!!window.__blob`, 'export blob');
  exportedText = await ev(`window.__blob.text()`);
  eq('download fallback file name', await ev('window.__download'), `jearn-${TODAY}.json`);
  snap = JSON.parse(exportedText);
  exportedDump = await dump();
  writeFileSync(join(work, 'export.json'), exportedText);

  eq('schemaVersion', snap.schemaVersion, 1);
  check('exportedAt is ISO UTC', /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(snap.exportedAt));
  check('appVersion string', typeof snap.appVersion === 'string' && snap.appVersion.length > 0);
  eq('currency', snap.currency, 'PHP');
  check('top-level arrays', ['accounts', 'expenseCategories', 'incomeCategories', 'entries'].every((k) => Array.isArray(snap[k])));
  check('entries ordered by seq 1..n', snap.entries.every((e, i) => e.seq === i + 1));
  check('entries carry names', snap.entries.every((e) => typeof e.debitName === 'string' && e.debitName && typeof e.creditName === 'string' && e.creditName));
  check('entry dates YYYY-MM-DD, amounts positive ints', snap.entries.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Number.isSafeInteger(e.amountMinor) && e.amountMinor > 0));
  check('recordedAt ISO', snap.entries.every((e) => /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(e.recordedAt)));
  check('opening entries debit/credit Opening Balances', snap.entries.filter((e) => e.kind === 'opening').every((e) => e.debitName === 'Opening Balances' || e.creditName === 'Opening Balances'));
  const rev = snap.entries.find((e) => e.kind === 'reversal'), orig = snap.entries.find((e) => e.id === rev?.reverses);
  check('voided entry and its reversal exported', rev && orig && rev.debitName === orig.creditName && rev.creditName === orig.debitName);
  const gro = snap.entries.find((e) => e.kind === 'expense' && e.debitName === 'Groceries');
  check('expense entry names resolve', gro && gro.creditName === 'BDO');
  check('archived items exported with archivedAt', snap.accounts.some((a) => a.name === 'Old' && a.archivedAt) && snap.incomeCategories.some((c) => c.name === 'Freelance' && c.archivedAt)
    && snap.expenseCategories.find((c) => c.name === 'Pets').subs.some((s) => s.name === 'Vet' && s.archivedAt));
  const sfood = snap.expenseCategories.find((c) => c.name === 'Food');
  check('budgets and rollover exported', sfood.rollover === true && sfood.rollStart === THIS_MONTH && sfood.budgets.length === 2 && /^\d{4}-\d{2}$/.test(sfood.budgets[0].from));
  const strip = ({ debitName, creditName, ...e }) => e;
  eq('export matches db: accounts', canon(byId(snap.accounts)), canon(byId(exportedDump.accounts)));
  eq('export matches db: expense categories', canon(byId(snap.expenseCategories)), canon(byId(exportedDump.expenseCats)));
  eq('export matches db: income categories', canon(byId(snap.incomeCategories)), canon(byId(exportedDump.incomeCats)));
  eq('export matches db: entries', canon(snap.entries.map(strip)), canon(exportedDump.entries));
  noAlerts('export');

  // tampered variants
  const variant = (name, mutate) => { const o = JSON.parse(exportedText); mutate(o); const p = join(work, name + '.json'); writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o)); return p; };
  snap.__variants = {
    gap: variant('tamper-seq-gap', (o) => { o.entries.at(-1).seq += 1; }),
    reversal: variant('tamper-reversal', (o) => { o.entries.find((e) => e.kind === 'reversal').amountMinor += 1; }),
    version: variant('tamper-version', (o) => { o.schemaVersion = 2; }),
    junk: (() => { const p = join(work, 'junk.json'); writeFileSync(p, 'not json {'); return p; })(),
  };
});

const setFile = async (path) => {
  const root = (await send('DOM.getDocument', { depth: 0 })).root.nodeId;
  const { nodeId } = await send('DOM.querySelector', { nodeId: root, selector: 'input[type=file]' });
  await send('DOM.setFileInputFiles', { files: [path], nodeId });
};

flow('Clear site data, rejected imports, round trip', async () => {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await send('Storage.clearDataForOrigin', { origin: new URL(BASE).origin, storageTypes: 'all' });
  await load();
  const fresh = await dump();
  eq('fresh again: no accounts / entries', [fresh.accounts.length, fresh.entries.length], [0, 0]);
  check('fresh again: starter categories regenerated with new ids', fresh.expenseCats.length >= 14 && fresh.expenseCats[0].id !== snap.expenseCategories[0].id);
  await tab('Setup');
  check('Import offered on empty ledger', await exists('.addbtn', 'Import data'));

  const cases = [
    ['seq gap', snap.__variants.gap, 'Import failed: The entry order (seq) has gaps or duplicates.'],
    ['non-mirroring reversal', snap.__variants.reversal, 'Import failed: A reversal does not mirror the entry it voids.'],
    ['unsupported schemaVersion', snap.__variants.version, 'Import failed: This export was made by a different version of JEarn.'],
    ['malformed file', snap.__variants.junk, 'Import failed: The file is not a valid JEarn export.'],
  ];
  const confirms0 = (await ev('window.__confirms')).length;
  for (const [name, path, msg] of cases) {
    takeAlerts();
    await setFile(path);
    await sleep(500);
    eq(`tampered import rejected with visible error: ${name}`, takeAlerts(), [msg]);
    eq(`tampered import changed nothing (db): ${name}`, canon(await dump()), canon(fresh));
  }
  eq('no confirm shown for rejected files', (await ev('window.__confirms')).length, confirms0);
  eq('UI still empty after rejected imports', Object.keys(await cards()).length, 0);

  // real import
  await setFile(join(work, 'export.json'));
  await waitFor(`window.__confirms.length > ${confirms0}`, 'import confirm');
  has('import confirm text', (await ev('window.__confirms')).at(-1), `Import ${snap.entries.length} entries, ${snap.accounts.length} accounts and ${snap.expenseCategories.length} expense categories?`);
  await waitFor(`!![...document.querySelectorAll('.srow.acct')].length`, 'imported accounts', 8000);
  await settle();
  noAlerts('import');
  const d = await dump();
  const strip = ({ debitName, creditName, ...e }) => e;
  eq('imported: currency', d.settings[0].value, snap.currency);
  eq('imported: accounts (incl. archived)', canon(byId(d.accounts)), canon(byId(snap.accounts)));
  eq('imported: expense categories, budgets, rollover, archived subs', canon(byId(d.expenseCats)), canon(byId(snap.expenseCategories)));
  eq('imported: income categories (incl. archived)', canon(byId(d.incomeCats)), canon(byId(snap.incomeCategories)));
  eq('imported: entries, seq order, incl. voided + reversal', canon(d.entries), canon(snap.entries.map(strip)));
  check('imported: reversal present', d.entries.some((e) => e.kind === 'reversal'));
  eq('imported db == pre-export db (entries)', canon(d.entries), canon(exportedDump.entries));
  check('Import hidden once ledger has entries', !(await exists('.addbtn', 'Import data')));
  const arch = await body();
  check('archived group restored (account, income cat, sub)', ['Old', 'Freelance', 'Pets › Vet'].every((n) => arch.includes(n)));
  check('currency locked after import', await ev(`document.querySelector('select[aria-label=Currency]').disabled`));
  await tab('Home');
  eq('imported: balances', await cards(), { BDO: php(1000000 - 3000 - 100000 + 500000 - 20000 - 5550 - 1000), Visa: php(250000 + 2500 - 100000 - 1000), Wallet: php(50000) });
  check('imported: voided entry hidden on Home', !(await exists('.txrow', '~Groceries')));
  check('imported: Home lists entries', (await homeRows()).length >= 4);
  await shot('13-after-import');
});

flow('Persistence and offline', async () => {
  const before = await dump();
  const balances = await cards();
  await load();
  eq('reload: db unchanged', canon(await dump()), canon(before));
  eq('reload: balances survive', await cards(), balances);
  eq('reload: month is current', await text('.large-title h1'), monthTitle(THIS_MONTH));
  await tab('Budgets');
  check('reload: budgets survive', (await texts('.budget-btn')).includes(php(300000)));

  // service worker
  await load();
  await waitFor(`navigator.serviceWorker.getRegistration().then((r) => !!r && !!r.active)`, 'service worker active', 10000);
  const cacheInfo = await ev(`(async () => { const ks = (await caches.keys()).filter((k) => k.startsWith('jearn-')); const c = await caches.open(ks[0]);
    return { names: ks, urls: (await c.keys()).map((r) => new URL(r.url).pathname) }; })()`);
  check('sw caches the app shell', cacheInfo.names.length === 1 && (cacheInfo.urls.includes('/index.html') || cacheInfo.urls.includes('/')), show(cacheInfo));
  const distFiles = readdirSync(DIST, { recursive: true }).filter((f) => statSync(join(DIST, f)).isFile() && f !== 'sw.js');
  check('sw precaches every built file', distFiles.every((f) => cacheInfo.urls.includes('/' + f.split('\\').join('/'))), distFiles.filter((f) => !cacheInfo.urls.includes('/' + f)).join(','));
  await load();
  check('page is controlled by the service worker', await ev('!!navigator.serviceWorker.controller'));
  const balancesNow = await cards();

  // offline: emulate no network AND stop the server
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  server.closeAllConnections?.(); await new Promise((r) => server.close(r));
  errors.length = 0; // the offline reload may log failed update checks; only app failures matter below
  await send('Page.navigate', { url: BASE });
  await waitFor(`!!document.querySelector('.tabbar') && document.querySelectorAll('.acard').length > 0`, 'offline reload to show the app with data', 10000);
  eq('offline reload: app loads with data', await cards(), balancesNow);
  await tab('Reports');
  check('offline: screens still work', (await texts('.tile')).length === 3);
  await shot('14-offline');
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
});

// ---------- run ----------
process.on('unhandledRejection', (e) => { record('unhandled rejection in e2e script', false, String(e)); });
for (const [name, fn] of flows) {
  console.log(`\n== ${name}`);
  const nErr = errors.length;
  try { await fn(); } catch (e) {
    record(`flow "${name}" aborted`, false, e.stack?.split('\n').slice(0, 2).join(' ') ?? String(e));
    await shot('abort-' + name.replace(/\W+/g, '-')).catch(() => {});
  }
  const fresh = errors.slice(nErr);
  check(`${name}: no console errors / exceptions`, fresh.length === 0, fresh.join(' | '));
}

ws.close();
chrome.kill('SIGKILL');
server.closeAllConnections?.(); server.close();
await sleep(300);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
console.log(`Screenshots: ${SHOTS}`);
console.log(`Test files (export, tampered imports): ${work}`);
if (failed.length) {
  console.log('\nFAILED:'); for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
rmSync(profile, { recursive: true, force: true });

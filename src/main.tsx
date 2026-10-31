import { render } from 'preact';
import { App } from './app/App';
import { boot } from './app/boot';
import './styles.css';

boot.page = performance.now();

// If the app fails to show (blank, dark screen), show the error instead. Errors while it's on screen are left alone.
const showError = (msg: string) => {
  const el = document.getElementById('app')!;
  if (el.querySelector('.tabbar')) return;
  el.innerHTML = '';
  const pre = document.createElement('pre');
  pre.className = 'fatal';
  pre.textContent = 'JEarn hit an error. Your data is safe. Send this to the developer:\n\n' + msg;
  el.append(pre);
};
window.addEventListener('error', (e) => showError(e.error instanceof Error ? e.error.stack || e.error.message : String(e.message)));
window.addEventListener('unhandledrejection', (e) => showError(e.reason instanceof Error ? e.reason.stack || e.reason.message : String(e.reason)));

// Ask Safari not to evict our data; harmless if unsupported or denied.
void navigator.storage?.persist?.();

// Register before rendering so a crash can't stop updates from arriving.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}

render(<App />, document.getElementById('app')!);

import { render } from 'preact';
import { App } from './app/App';
import { boot } from './app/boot';
import './styles.css';

boot.page = performance.now();

// Ask Safari not to evict our data; harmless if unsupported or denied.
void navigator.storage?.persist?.();

render(<App />, document.getElementById('app')!);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}

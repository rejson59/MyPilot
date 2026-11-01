/* Smoke test renderowania: uruchom serwer, potem `npm run smoke`. */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
});

const g = globalThis as any;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.localStorage = dom.window.localStorage;
g.requestAnimationFrame = (cb: any) => setTimeout(cb, 16);
g.cancelAnimationFrame = (id: any) => clearTimeout(id);
(dom.window as any).matchMedia = () => ({
  matches: false,
  media: '',
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent() { return false; },
});
(dom.window as any).scrollTo = () => {};
g.matchMedia = (dom.window as any).matchMedia;
g.fetch = globalThis.fetch;

class FakeSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static CONNECTING = 0;
  static CLOSING = 2;
  readyState = 1;
  onopen: any = null;
  onmessage: any = null;
  onclose: any = null;
  onerror: any = null;
  constructor(public url: string) {
    setTimeout(() => this.onopen?.(), 5);
  }
  send() {}
  close() {
    this.readyState = 3;
  }
}
g.WebSocket = FakeSocket;

const errors: string[] = [];
const originalError = console.error;
console.error = (...args: any[]) => {
  errors.push(args.map(String).join(' '));
  originalError(...args);
};
process.on('uncaughtException', (error) => {
  errors.push(`UNCAUGHT: ${error.message}`);
});

const snapshot = await (await fetch('http://127.0.0.1:8787/api/snapshot')).json();

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const App = (await import('../src/App')).default;
const { useApp } = await import('../src/lib/store');

useApp.getState().setSnapshot(snapshot);
useApp.getState().setReady(true);

const root = createRoot(document.getElementById('root')!);
root.render(React.createElement(App));

await new Promise((resolve) => setTimeout(resolve, 1200));

const text = document.body.textContent ?? '';
console.log('RENDERED_TEXT_LENGTH', text.length);
console.log('HEAD:', text.replace(/\s+/g, ' ').slice(0, 500));
console.log('TILES:', document.querySelectorAll('.tile').length);
console.log('SCENES:', document.querySelectorAll('.scene').length);
console.log('SETTINGS_LINKS:', document.querySelectorAll('.navlink').length);
console.log('ERRORS:', errors.length);
errors.slice(0, 8).forEach((error, index) => console.log(`  [${index}]`, error.slice(0, 300)));

// widoki
for (const view of ['scenes', 'automations', 'energy', 'settings']) {
  useApp.getState().setView(view as any);
  await new Promise((resolve) => setTimeout(resolve, 350));
  console.log(`VIEW ${view}:`, (document.querySelector('.view')?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 90));
}

// sheet
useApp.getState().setView('room');
useApp.getState().openSheet('speaker');
await new Promise((resolve) => setTimeout(resolve, 300));
console.log('SHEET:', (document.querySelector('.sheet')?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 180));
console.log('ERRORS_TOTAL:', errors.length);
process.exit(0);

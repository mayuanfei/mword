import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function offlineShell(): Plugin {
  return { name: 'mword-offline-shell', apply: 'build', generateBundle(_, bundle) {
    const urls = ['/mword/', ...Object.keys(bundle).map(name => `/mword/${name}`)];
    const version = `mword-shell-${Date.now()}`;
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = ${JSON.stringify(version)};
const ASSETS = ${JSON.stringify(urls)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('mword-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/mword/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/mword/'))); return;
  }
  if (ASSETS.includes(url.pathname)) event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});` });
  } };
}
function vocabularyLicenses(): Plugin {
  return { name: 'mword-vocabulary-licenses', apply: 'build', generateBundle() {
    const root = fileURLToPath(new URL('../data/licenses/', import.meta.url));
    for (const name of readdirSync(root)) this.emitFile({ type: 'asset', fileName: `licenses/${name}`, source: readFileSync(`${root}${name}`) });
  } };
}
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), vocabularyLicenses(), ...(mode === 'native' ? [] : [offlineShell()])],
  base: mode === 'native' ? '/' : '/mword/',
  build: { outDir: mode === 'native' ? 'dist-native' : 'dist' },
  server: { port: 5173, strictPort: true, proxy: { '/mword-api': { target: process.env.MW_DEV_API_TARGET || 'http://127.0.0.1:18081', changeOrigin: true } } },
  preview: { port: 4173, proxy: { '/mword-api': { target: process.env.MW_DEV_API_TARGET || 'http://127.0.0.1:18081', changeOrigin: true } } },
}));

/* Meu Ponto - service worker: guarda a tela no celular para abrir sem internet. */
const VERSAO = 'meu-ponto-v3';
const ARQUIVOS = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/favicon-64.png'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;  // planilha: sempre pela internet
  // Tela: tenta a versão mais nova pela internet; sem internet, usa a guardada.
  ev.respondWith(
    fetch(req).then(resp => {
      const copia = resp.clone();
      caches.open(VERSAO).then(c => c.put(req, copia));
      return resp;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});

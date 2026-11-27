/* Meu Ponto - service worker: guarda a tela no celular para abrir sem internet. */
const VERSAO = 'meu-ponto-v7';
const ARQUIVOS = ['./', './index.html', './manifest.webmanifest', './config.js', './qrcode.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/favicon-64.png', './icons/badge-96.png'];

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

/* ---------- Avisos (notificações push) ---------- */

function lerCfg() {
  return caches.open('meu-ponto-cfg').then(c => c.match('./__cfg')).then(r => r ? r.json() : null).catch(() => null);
}
function chamarApi(cfg, acao) {
  return fetch(cfg.api, { method: 'POST', redirect: 'follow', body: JSON.stringify({ chave: cfg.chave, acao: acao, args: [] }) })
    .then(r => r.json()).then(j => { if (!j.ok) throw new Error(j.erro); return j.dados; });
}

self.addEventListener('push', ev => {
  ev.waitUntil(
    lerCfg()
      .then(cfg => cfg ? chamarApi(cfg, 'avisoAtual') : null)
      .catch(() => null)
      .then(a => {
        a = a || { tipo: 'geral', titulo: 'Meu Ponto ⏰', texto: 'Não esqueça de registrar o ponto.' };
        const acoes = a.tipo === 'entrada'
          ? [{ action: 'abrir', title: 'Registrar agora' }, { action: 'folga', title: 'Hoje não tem trabalho' }]
          : [{ action: 'abrir', title: 'Abrir o app' }];
        return self.registration.showNotification(a.titulo, {
          body: a.texto, icon: './icons/icon-192.png', badge: './icons/badge-96.png',
          vibrate: [300, 120, 300, 120, 500], requireInteraction: true, renotify: true,
          tag: 'meu-ponto-aviso', data: { tipo: a.tipo }, actions: acoes
        });
      })
  );
});

self.addEventListener('notificationclick', ev => {
  ev.notification.close();
  if (ev.action === 'folga') {
    ev.waitUntil(
      lerCfg().then(cfg => cfg && chamarApi(cfg, 'semTrabalhoHoje'))
        .then(() => self.registration.showNotification('Tudo bem! 😊', {
          body: 'Sem avisos por hoje. Bom descanso!', icon: './icons/icon-192.png',
          badge: './icons/badge-96.png', tag: 'meu-ponto-ok' }))
        .catch(() => self.registration.showNotification('Não consegui avisar a planilha', {
          body: 'Abra o app quando tiver internet.', icon: './icons/icon-192.png', tag: 'meu-ponto-ok' }))
    );
    return;
  }
  ev.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
      const aberto = lista.find(c => c.url.indexOf(self.registration.scope) === 0);
      return aberto ? aberto.focus() : self.clients.openWindow('./');
    })
  );
});

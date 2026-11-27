/* Meu Ponto - service worker: guarda a tela no celular para abrir sem internet. */
const VERSAO = 'meu-ponto-v8';
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
function chamarApi(cfg, acao, args) {
  return fetch(cfg.api, { method: 'POST', redirect: 'follow', body: JSON.stringify({ chave: cfg.chave, acao: acao, args: args || [] }) })
    .then(r => r.json()).then(j => { if (!j.ok) throw new Error(j.erro); return j.dados; });
}
function avisarTelas(msg) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => l.forEach(c => c.postMessage(msg)));
}
const ICONE = './icons/icon-192.png', SELO = './icons/badge-96.png';
const BOTOES = {
  entrada: [{ action: 'registrar', title: '☀️ Registrar agora' }, { action: 'folga', title: 'Não fui trabalhar hoje' }],
  almoco:  [{ action: 'registrar', title: '↩️ Registrar volta' }, { action: 'abrir', title: 'Abrir o app' }],
  saida:   [{ action: 'registrar', title: '🏠 Registrar saída' }, { action: 'abrir', title: 'Abrir o app' }]
};
const ACAO_PONTO = { entrada: 'entrada', almoco: 'volta', saida: 'saida' };

self.addEventListener('push', ev => {
  ev.waitUntil(
    lerCfg()
      .then(cfg => cfg ? chamarApi(cfg, 'avisoAtual') : null)
      .catch(() => null)
      .then(a => {
        a = a || { tipo: 'geral', titulo: 'Meu Ponto ⏰', texto: 'Não esqueça de registrar o ponto.' };
        return self.registration.showNotification(a.titulo, {
          body: a.texto, icon: ICONE, badge: SELO,
          vibrate: [300, 120, 300, 120, 500], requireInteraction: true, renotify: true,
          tag: 'meu-ponto-aviso', data: { tipo: a.tipo }, actions: BOTOES[a.tipo] || [{ action: 'abrir', title: 'Abrir o app' }]
        });
      })
  );
});

function abrirApp() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
    const aberto = lista.find(c => c.url.indexOf(self.registration.scope) === 0);
    if (aberto) { aberto.postMessage({ tipo: 'checarAlerta' }); return aberto.focus(); }
    return self.clients.openWindow('./');
  });
}

self.addEventListener('notificationclick', ev => {
  const tipo = (ev.notification.data || {}).tipo;
  ev.notification.close();
  if (ev.action === 'folga') {
    ev.waitUntil(
      lerCfg().then(cfg => chamarApi(cfg, 'semTrabalhoHoje'))
        .then(() => avisarTelas({ tipo: 'atualizar' }))
        .then(() => self.registration.showNotification('Tudo bem! 😊', {
          body: 'Sem avisos por hoje. Bom descanso!', icon: ICONE, badge: SELO, tag: 'meu-ponto-ok' }))
        .catch(() => self.registration.showNotification('Não consegui avisar a planilha', {
          body: 'Abra o app quando tiver internet.', icon: ICONE, badge: SELO, tag: 'meu-ponto-ok' }))
    );
    return;
  }
  if (ev.action === 'registrar' && ACAO_PONTO[tipo]) {
    ev.waitUntil(
      lerCfg().then(cfg => chamarApi(cfg, 'registrar', [ACAO_PONTO[tipo]]))
        .then(e => {
          const r = (e && e.hojeRegs && e.hojeRegs[e.hojeRegs.length - 1]) || {};
          const hora = { entrada: r.entrada, almoco: r.voltaAlmoco, saida: r.saida }[tipo] || '';
          const txt = { entrada: 'Entrada registrada', almoco: 'Volta do almoço registrada', saida: 'Saída registrada' }[tipo];
          return avisarTelas({ tipo: 'atualizar' }).then(() => self.registration.showNotification(txt + (hora ? ' às ' + hora : '') + ' ✅', {
            body: tipo === 'saida' ? 'Bom descanso! Até amanhã 👋' : 'Bom trabalho! 💪', icon: ICONE, badge: SELO, tag: 'meu-ponto-ok' }));
        })
        .catch(err => self.registration.showNotification('Não consegui registrar 😕', {
          body: /chave/i.test(String(err)) ? 'Abra o app para conferir.' : 'Sem internet agora. Abra o app e registre por lá.',
          icon: ICONE, badge: SELO, tag: 'meu-ponto-ok' }))
    );
    return;
  }
  ev.waitUntil(abrirApp());
});

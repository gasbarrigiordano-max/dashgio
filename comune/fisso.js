/* Sicurezza comune a tutte le pagine:
   - dentro una cornice (iframe) solo del nostro sito (la Dashboard): una pagina di un altro sito che provasse a mostrarle
     di nascosto per farti toccare qualcosa (clickjacking) trova la pagina vuota;
   - le violazioni della Content-Security-Policy finiscono nella console e nel registro delle attività sospette. */
(function () {
  try { if (window.top !== window.self && window.top.location.origin !== location.origin) throw 0; }
  catch (e) { document.documentElement.style.display = 'none'; try { window.top.location = location.href; } catch (x) {} }
  document.addEventListener('securitypolicyviolation', e => {
    console.error('CSP: bloccato ' + (e.blockedURI || 'inline') + ' (' + e.violatedDirective + ')');
    // nel registro una volta al giorno per indirizzo bloccato (non cento righe uguali)
    try {
      let dove = 'inline'; try { dove = new URL(e.blockedURI).host || e.blockedURI; } catch (x) { dove = e.blockedURI || 'inline'; }
      const k = 'dg:csp:' + (e.violatedDirective || '') + ':' + dove, t = +localStorage.getItem(k) || 0;
      if (Date.now() - t < 864e5) return;
      localStorage.setItem(k, String(Date.now()));
      if (window.Cassaforte && Cassaforte.segnala) Cassaforte.segnala('csp', (e.violatedDirective || '') + ' ' + String(e.blockedURI || 'inline').slice(0, 120));
    } catch (x) {}
  });
})();

/* Pagina ferma su iPhone e iPad: niente zoom con il pizzico o il doppio tocco (le mappe di Mezzi restano libere)
   e niente testo ingrandito ruotando il telefono. Lo zoom quando si tocca un campo lo evita il viewport (maximum-scale=1). */
(function () {
  const st = document.createElement('style');
  st.textContent = 'html{-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:manipulation}'
    // lo scorrimento dentro una finestra non trascina la pagina sotto (niente rimbalzi)
    + '.sheet,.modal,.pannello .box,.cf-box{overscroll-behavior:contain}';
  document.head.appendChild(st);
  const blocca = e => { if (!(e.target && e.target.closest && e.target.closest('.leaflet-container'))) e.preventDefault(); };
  ['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, blocca, { passive: false }));
})();

/* Trascinando giù dall'alto (pagina già in cima) si ricarica: con l'app aggiunta alla schermata Home l'iPhone non ha
   il gesto di Safari. Dentro la Dashboard un'app chiede alla Dashboard di ricaricarsi (riapre la stessa app).
   Non parte con una finestra aperta, mentre si scrive in un campo, su un elenco interno già scorso o sulle mappe. */
(function () {
  const SOGLIA = 80, APERTI = '.pannello.on,#sblocco.on,#ov.on,#velo.on,.modal-overlay.show,.show[id$="-overlay"],.sheet.on';
  let y0 = null, x0 = 0, tira = 0, ind = null;
  const radice = () => document.scrollingElement || document.documentElement;
  const inCima = el => { for (let n = el; n && n !== document.documentElement; n = n.parentElement) if (n.scrollTop > 0) return false; return radice().scrollTop <= 0; };
  const scrive = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
  function indicatore() {
    if (ind) return ind;
    ind = document.createElement('div'); ind.setAttribute('aria-hidden', 'true');
    ind.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 6px);width:38px;height:38px;margin-left:-19px;border-radius:50%;' +
      'background:rgba(30,22,16,.92);color:#fff;display:grid;place-items:center;font:700 18px system-ui,sans-serif;z-index:2147483647;' +
      'box-shadow:0 6px 18px rgba(0,0,0,.35);opacity:0;transform:translateY(-50px);pointer-events:none';
    ind.textContent = '↻'; document.body.appendChild(ind); return ind;
  }
  const nascondi = () => { if (ind) { ind.style.transition = 'transform .25s ease, opacity .25s ease'; ind.style.opacity = '0'; ind.style.transform = 'translateY(-50px)'; } };
  document.addEventListener('touchstart', e => {
    y0 = null; tira = 0;
    const t = e.target;
    if (e.touches.length !== 1 || document.querySelector(APERTI) || scrive() || (t.closest && t.closest('.leaflet-container')) || !inCima(t)) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
    if (dy <= 0 || Math.abs(dx) > dy) { if (!tira) y0 = null; tira = 0; nascondi(); return; }
    tira = dy * 0.5; const i = indicatore();
    i.style.transition = 'none'; i.style.opacity = String(Math.min(1, tira / SOGLIA));
    i.style.transform = `translateY(${Math.min(tira, SOGLIA + 20) - 40}px) rotate(${tira * 3}deg)`;
    i.style.background = tira >= SOGLIA ? 'rgba(242,113,28,.95)' : 'rgba(30,22,16,.92)';
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (y0 == null) return; y0 = null;
    if (tira < SOGLIA) { tira = 0; return nascondi(); }
    tira = 0; const i = indicatore(); i.style.transition = 'transform .6s linear'; i.style.transform = `translateY(${SOGLIA - 40}px) rotate(720deg)`;
    try { if (parent !== window) { parent.postMessage({ tipo: 'ricarica' }, location.origin); return; } } catch (err) {}
    location.reload();
  }, { passive: true });
  document.addEventListener('touchcancel', () => { y0 = null; tira = 0; nascondi(); }, { passive: true });
})();

/* Dentro la Dashboard, sul telefono, quando si apre la tastiera la Dashboard rimpicciolisce l'app alla parte che si vede:
   il campo in cui si scrive torna in vista scorrendo solo la finestra che lo contiene (non la pagina della Dashboard). */
(function () {
  if (parent === window) return;
  let t = 0;
  const campo = a => !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  function contenitore(el) {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight) return n;
    }
    return document.scrollingElement || document.documentElement;
  }
  function inVista() {
    const a = document.activeElement; if (!campo(a)) return;
    const c = contenitore(a), r = a.getBoundingClientRect();
    const radice = c === (document.scrollingElement || document.documentElement);
    const cr = radice ? { top: 0, bottom: innerHeight } : c.getBoundingClientRect();
    const alto = Math.max(cr.top, 0), basso = Math.min(cr.bottom, innerHeight);
    if (r.top >= alto + 8 && r.bottom + 8 <= basso) return;
    c.scrollTop += r.top - (alto + Math.max(8, (basso - alto) / 4));
  }
  const presto = ms => { clearTimeout(t); t = setTimeout(inVista, ms); };
  addEventListener('resize', () => presto(60));
  document.addEventListener('focusin', () => presto(350));
})();

/* Finestra aperta (nuovo movimento, saldo di un conto, impostazioni…): la pagina dietro resta ferma. Su iPhone, toccando un
   campo, Safari faceva scorrere la pagina di sfondo e la finestra andava su con lei (spazio vuoto sotto, rimbalzi muovendo il
   dito). Con la pagina bloccata (body fisso alla sua posizione) scorre solo il contenuto della finestra; chiusa la finestra,
   la pagina torna esattamente dov'era. */
(function () {
  const APERTI = '.pannello.on,#sblocco.on,#ov.on,#velo.on,.modal-overlay.show,.show[id$="-overlay"],.sheet.on,.cf-porta';
  let bloccata = false, y = 0, raf = 0;
  function aggiorna() {
    raf = 0;
    const aperta = !!document.querySelector(APERTI), b = document.body; if (!b) return;
    if (aperta && !bloccata) {
      y = window.scrollY || document.documentElement.scrollTop || 0;
      Object.assign(b.style, { position: 'fixed', top: -y + 'px', left: '0', right: '0', width: '100%' });
      bloccata = true; document.documentElement.classList.add('finestra-aperta');
    } else if (!aperta && bloccata) {
      Object.assign(b.style, { position: '', top: '', left: '', right: '', width: '' });
      bloccata = false; document.documentElement.classList.remove('finestra-aperta');
      window.scrollTo(0, y);
    }
  }
  const pianifica = () => { if (!raf) raf = requestAnimationFrame(aggiorna); };
  const avvia = () => new MutationObserver(pianifica).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  if (document.body) avvia(); else document.addEventListener('DOMContentLoaded', avvia);
})();

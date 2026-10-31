/* Pagina ferma su iPhone e iPad: niente zoom con il pizzico o il doppio tocco (le mappe di Mezzi restano libere)
   e niente testo ingrandito ruotando il telefono. Lo zoom quando si tocca un campo lo evita il viewport (maximum-scale=1). */
(function () {
  const st = document.createElement('style');
  st.textContent = 'html{-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:manipulation}';
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

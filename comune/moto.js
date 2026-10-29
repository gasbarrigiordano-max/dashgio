/* Movimento comune a tutte le app: niente colori né trasparenze, solo animazioni.
   - Moto.entra(vista): cambiando scheda, i riquadri visibili entrano con una dissolvenza e un leggero scorrimento
     e i grafici dentro la vista si disegnano (linee da sinistra, barre dal basso)
   - Moto.disegna(el): solo i grafici dentro el (per esempio quando arrivano i dati)
   - Moto.largo(si): la schermata ha molti dati, sugli schermi larghi la scheda si allarga
   - Moto.pillola(menu, '.on'): l'evidenziazione della voce attiva scivola da una voce all'altra; la pillola copia
     sfondo e ombra della voce attiva, quindi da ferma la barra è identica a prima
   Con "Riduci movimento" attivo nel telefono non si muove niente.
   Nei grafici: class="moto-traccia" (linee e aree, si scoprono da sinistra), "moto-barra" (crescono dal basso,
   style="--i:n" le fa partire una dopo l'altra), "moto-ciambella" (se è già ruotata, --giro dice di quanto), "moto-punto". */
(function () {
  const fermo = matchMedia('(prefers-reduced-motion: reduce)');
  const st = document.createElement('style');
  st.textContent = `
@keyframes moto-entra{from{opacity:0;transform:translate3d(0,12px,0)}}
.moto-entra{animation:moto-entra .34s cubic-bezier(.22,.8,.3,1) both}
.moto-pill{position:absolute;left:0;top:0;z-index:0;pointer-events:none;
  transition:transform .38s cubic-bezier(.3,.85,.3,1),width .38s cubic-bezier(.3,.85,.3,1),height .38s cubic-bezier(.3,.85,.3,1)}
.moto-pill.fermo{transition:none}
:root body .moto-off.moto-off.moto-off{background:transparent !important;box-shadow:none !important}
@keyframes moto-traccia{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
.moto-disegna .moto-traccia{animation:moto-traccia .9s cubic-bezier(.4,.6,.2,1) both}
@keyframes moto-sale{from{transform:scaleY(0)}}
.moto-disegna .moto-barra{transform-origin:50% 100%;animation:moto-sale .65s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0) * 28ms)}
@keyframes moto-gira{from{transform:rotate(calc(var(--giro,0deg) - 110deg)) scale(.86);opacity:0}to{transform:rotate(var(--giro,0deg)) scale(1);opacity:1}}
.moto-disegna .moto-ciambella{animation:moto-gira .8s cubic-bezier(.2,.8,.2,1) both}
@keyframes moto-punto{from{transform:scale(0)}}
.moto-disegna .moto-punto{transform-box:fill-box;transform-origin:center;animation:moto-punto .35s .55s cubic-bezier(.2,.8,.2,1.3) both}
@media (prefers-reduced-motion:reduce){.moto-entra,.moto-disegna *{animation:none !important}.moto-pill{transition:none !important}}`;
  document.head.appendChild(st);

  // rimette da capo una classe di animazione e la toglie a fine corsa (a riposo l'elemento è quello di sempre)
  function riavvia(el, cl, ms) {
    el.classList.remove(cl); void el.offsetWidth; el.classList.add(cl);
    clearTimeout(el['_' + cl]); el['_' + cl] = setTimeout(() => el.classList.remove(cl), ms);
  }
  function disegna(el) { if (el && !fermo.matches) riavvia(el, 'moto-disegna', 1400); }
  // solo i riquadri che si vedono (al massimo 14): quelli più in basso compaiono già fermi, senza lavoro in più
  function entra(vista) {
    if (!vista || fermo.matches) return;
    const h = innerHeight; let n = 0;
    for (const el of vista.children) {
      if (n >= 14) break;
      const r = el.getBoundingClientRect();
      if (!r.height || r.top > h || r.bottom < 0) continue;
      n++; riavvia(el, 'moto-entra', 500);
    }
    disegna(vista);
  }

  // pillola: una per menu, segue da sola la voce attiva (anche quando il codice dell'app cambia la classe)
  const menu = [];
  function posa(m, subito) {
    const { box, sel, pill } = m;
    const on = box.querySelector(sel);
    box.querySelectorAll('.moto-off').forEach(b => { if (b !== on) b.classList.remove('moto-off'); });
    if (!on || on.offsetParent === null || !box.offsetParent && getComputedStyle(box).position !== 'fixed') { pill.style.visibility = 'hidden'; m.visto = false; return; }
    if (on.classList.contains('moto-off')) on.classList.remove('moto-off');
    const cs = getComputedStyle(on), rb = box.getBoundingClientRect(), r = on.getBoundingClientRect();
    if (subito || !m.visto || fermo.matches) { pill.classList.add('fermo'); }
    Object.assign(pill.style, {
      width: r.width + 'px', height: r.height + 'px', visibility: 'visible',
      transform: `translate(${r.left - rb.left - box.clientLeft + box.scrollLeft}px,${r.top - rb.top - box.clientTop + box.scrollTop}px)`,
      backgroundColor: cs.backgroundColor, backgroundImage: cs.backgroundImage, boxShadow: cs.boxShadow, borderRadius: cs.borderRadius
    });
    on.classList.add('moto-off'); m.visto = true;
    if (pill.classList.contains('fermo')) { void pill.offsetWidth; pill.classList.remove('fermo'); }
  }
  function pillola(box, sel = '.on') {
    if (!box || menu.some(m => m.box === box)) return;
    if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
    const pill = document.createElement('span'); pill.className = 'moto-pill'; pill.setAttribute('aria-hidden', 'true');
    box.prepend(pill);
    // le voci sopra la pillola
    for (const el of box.children) if (el !== pill && getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const m = { box, sel, pill, visto: false }; menu.push(m);
    let att = 0;
    new MutationObserver(rec => {
      if (rec.every(x => x.target === pill || (x.oldValue || '').replace(/\s*moto-off/g, '') === (x.target.className || '').replace(/\s*moto-off/g, ''))) return;
      cancelAnimationFrame(att); att = requestAnimationFrame(() => posa(m));
    }).observe(box, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    // la barra cambia misura o ricompare (era nascosta): la pillola si rimette al suo posto senza scivolare
    if (window.ResizeObserver) new ResizeObserver(() => posa(m, true)).observe(box);
    requestAnimationFrame(() => posa(m, true));
  }
  let rid = 0;
  addEventListener('resize', () => { clearTimeout(rid); rid = setTimeout(() => menu.forEach(m => posa(m, true)), 120); });
  // un menu che era nascosto (display:none) torna visibile: la pillola si rimette al suo posto senza scivolare
  const aggiorna = () => menu.forEach(m => posa(m, !m.visto));

  // schermate con molti dati (Mensile, Riepilogo…): l'app chiede più larghezza; dentro la Dashboard il pannello si allarga
  // con lo stesso movimento (sugli schermi larghi), e l'app allarga il suo contenuto (html.largo)
  function largo(si) {
    si = !!si; window.motoLargo = si;
    document.documentElement.classList.toggle('largo', si);
    try { if (parent !== window) parent.postMessage({ tipo: 'moto-largo', si }, location.origin); } catch (e) {}
  }
  window.Moto = { entra, disegna, pillola, aggiorna, largo };
})();

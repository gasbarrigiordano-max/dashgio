/* Suggerimenti sotto i campi al posto del menu di sistema (<datalist>).
   Su iPhone, dentro la Dashboard, il menu di sistema faceva scorrere la finestra lontano dal campo
   (si vedeva solo il fondo della scheda e la tastiera). Qui ogni <input list="…"> diventa un campo normale
   e sotto compare un elenco filtrato mentre si scrive, preso dalle <option> dello stesso <datalist>
   (che il codice dell'app può continuare ad aggiornare). Si sceglie col dito, col mouse o con frecce e Invio. */
(function () {
  const st = document.createElement('style');
  st.textContent = `
.sugg{position:absolute;left:0;right:0;top:100%;margin-top:4px;z-index:60;background:var(--sheet,#2a211c);color:var(--ink,#fff);
  border:1px solid var(--line,rgba(255,255,255,.2));border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.45);max-height:220px;overflow:auto;padding:4px}
.sugg button{display:block;width:100%;border:0;background:transparent;color:inherit;font-family:inherit;font-size:14px;font-weight:600;
  padding:9px 10px;border-radius:8px;text-align:left;cursor:pointer;margin:0;box-shadow:none;min-height:0;height:auto}
.sugg button:hover,.sugg button.on{background:rgba(127,127,127,.18)}`;
  document.head.appendChild(st);

  // <input list> → <input data-lista>: niente più menu di sistema
  function converti(radice) {
    if (!radice.querySelectorAll) return;
    const l = radice.matches && radice.matches('input[list]') ? [radice] : radice.querySelectorAll('input[list]');
    l.forEach(inp => { inp.dataset.lista = inp.getAttribute('list'); inp.removeAttribute('list'); inp.setAttribute('autocomplete', 'off'); });
  }
  converti(document);
  new MutationObserver(rec => rec.forEach(r => r.addedNodes.forEach(converti)))
    .observe(document.documentElement, { childList: true, subtree: true });

  const voci = inp => {
    const dl = document.getElementById(inp.dataset.lista);
    return dl ? [...new Set([...dl.querySelectorAll('option')].map(o => o.value || o.textContent).filter(Boolean))] : [];
  };
  const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function mostra(inp) {
    const box0 = inp.parentElement.querySelector(':scope > .sugg');
    const q = inp.value.trim().toLowerCase();
    const v = voci(inp).filter(x => String(x).toLowerCase().includes(q) && String(x).toLowerCase() !== q)
      .sort((a, b) => String(b).toLowerCase().startsWith(q) - String(a).toLowerCase().startsWith(q)).slice(0, 30);
    if (!v.length) { if (box0) box0.remove(); return; }
    const p = inp.parentElement;
    if (getComputedStyle(p).position === 'static') p.style.position = 'relative';
    const box = box0 || Object.assign(document.createElement('div'), { className: 'sugg' });
    box.setAttribute('role', 'listbox');
    box.innerHTML = v.map(x => `<button type="button" role="option" tabindex="-1" data-v="${escH(x)}">${escH(x)}</button>`).join('');
    if (!box0) p.appendChild(box);
  }
  const chiudi = () => document.querySelectorAll('.sugg').forEach(b => b.remove());
  // il valore scelto come se fosse stato scritto: partono i controlli dell'app (oninput, onchange)
  function scegli(inp, v) {
    inp.value = v; chiudi();
    inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    chiudi();
  }
  const campo = t => t && t.matches && t.matches('input[data-lista]');
  // se, aperta la tastiera, il campo è finito fuori dalla parte visibile, lo riporta in vista
  function inVista(inp) {
    setTimeout(() => {
      if (document.activeElement !== inp) return;
      const r = inp.getBoundingClientRect(), vv = window.visualViewport, alto = vv ? vv.height : innerHeight;
      if (r.top < 0 || r.bottom > alto) inp.scrollIntoView({ block: 'center' });
    }, 400);
  }
  document.addEventListener('focusin', e => { if (campo(e.target)) { chiudi(); mostra(e.target); inVista(e.target); } });
  document.addEventListener('input', e => { if (campo(e.target)) mostra(e.target); });
  document.addEventListener('focusout', e => {
    if (campo(e.target)) setTimeout(() => { if (document.activeElement !== e.target) e.target.parentElement.querySelector(':scope > .sugg')?.remove(); }, 150);
  });
  // pointerdown: la scelta arriva prima che il campo perda il fuoco (la tastiera resta su)
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest('.sugg button'); if (!b) return;
    e.preventDefault(); const inp = b.closest('.sugg').parentElement.querySelector('input[data-lista]');
    if (inp) scegli(inp, b.dataset.v);
  });
  document.addEventListener('keydown', e => {
    if (!campo(e.target)) return;
    const box = e.target.parentElement.querySelector(':scope > .sugg'); if (!box) return;
    const b = [...box.querySelectorAll('button')], i = b.findIndex(x => x.classList.contains('on'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); b.forEach(x => x.classList.remove('on'));
      const n = b[(i + (e.key === 'ArrowDown' ? 1 : -1) + b.length) % b.length]; n.classList.add('on'); n.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && i >= 0) { e.preventDefault(); scegli(e.target, b[i].dataset.v); }
    else if (e.key === 'Escape') box.remove();
  });
})();

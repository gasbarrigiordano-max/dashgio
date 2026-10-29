/* Pagina ferma su iPhone e iPad: niente zoom con il pizzico o il doppio tocco (le mappe di Mezzi restano libere)
   e niente testo ingrandito ruotando il telefono. Lo zoom quando si tocca un campo lo evita il viewport (maximum-scale=1). */
(function () {
  const st = document.createElement('style');
  st.textContent = 'html{-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:manipulation}';
  document.head.appendChild(st);
  const blocca = e => { if (!(e.target && e.target.closest && e.target.closest('.leaflet-container'))) e.preventDefault(); };
  ['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, blocca, { passive: false }));
})();

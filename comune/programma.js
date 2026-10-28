/* Programma della Palestra, usato dalla Palestra e dalla Dashboard (nessun dato qui: solo i calcoli).
   - muscoli: [{id:'B', nome:'Bicipiti', esercizi:[…]}]; la lettera è quella delle tabelle (B/S, T/P, D…)
   - programma: {slot:[{giorno:1, due:true}, …], blocchi:[{id, dal:'AAAA-MM-GG' (un lunedì), settimane:2, coppie:[['B','S'], ['T','P'], ['D']]}]}
     ogni slot è un giorno della settimana (1 = lunedì … 7 = domenica); con due:true la coppia si allena due giorni di fila
     e il secondo giorno la priorità si inverte (lunedì prima B poi S, martedì prima S poi B).
   - ogni blocco vale per le sue settimane; il più recente che copre una data vince. */
(function () {
  const GIORNI = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
  const GIORNI3 = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const MUSCOLI_BASE = [['B', 'Bicipiti'], ['S', 'Spalle'], ['P', 'Petto'], ['T', 'Tricipiti'], ['D', 'Dorso']].map(([id, nome]) => ({ id, nome, esercizi: [] }));
  const SLOT_BASE = [{ giorno: 1, due: true }, { giorno: 3, due: true }, { giorno: 5, due: false }];

  // date ISO senza fusi orari
  const d0 = iso => new Date(iso + 'T00:00:00Z');
  const iso = d => d.toISOString().slice(0, 10);
  const piu = (s, n) => { const d = d0(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const dow = s => ((d0(s).getUTCDay() + 6) % 7) + 1; // 1 = lunedì
  const lunedi = s => piu(s, 1 - dow(s));
  const fine = b => piu(b.dal, (b.settimane || 2) * 7 - 1);

  const slotGiorni = sl => sl.due ? [sl.giorno, sl.giorno % 7 + 1] : [sl.giorno];
  const etichettaSlot = sl => slotGiorni(sl).map(g => GIORNI3[g]).join(' + ');
  const leggiCoppia = t => String(t || '').toUpperCase().split(/[\/\s,+-]+/).filter(Boolean);
  const scriviCoppia = c => (c || []).join('/');

  function bloccoDi(prog, s) {
    return (prog && prog.blocchi || []).filter(b => b.dal <= s && s <= fine(b)).sort((a, b) => b.dal.localeCompare(a.dal))[0] || null;
  }
  // cosa si allena in una data: {blocco, slot, ordine:[primo, secondo], secondoGiorno} oppure null (riposo)
  function giorno(prog, s) {
    const b = bloccoDi(prog, s); if (!b) return null;
    const g = dow(s), slot = prog.slot || SLOT_BASE;
    for (let i = 0; i < slot.length; i++) {
      const k = slotGiorni(slot[i]).indexOf(g);
      if (k < 0) continue;
      const c = (b.coppie[i] || []).filter(Boolean);
      if (!c.length) return null;
      return { blocco: b, slot: i, ordine: k === 1 && c.length > 1 ? [...c].reverse() : c, secondoGiorno: k === 1 };
    }
    return null;
  }
  const prossimi = (prog, s, n) => Array.from({ length: n }, (_, i) => ({ d: piu(s, i), g: giorno(prog, piu(s, i)) }));
  const ultimoBlocco = prog => (prog && prog.blocchi || []).slice().sort((a, b) => b.dal.localeCompare(a.dal))[0] || null;

  // proposta del blocco che inizia il lunedì "dal": stessi slot, abbinamenti diversi da quelli recenti
  function proponi(prog, muscoli, dal, salta = 0) {
    const ids = (muscoli && muscoli.length ? muscoli : MUSCOLI_BASE).map(m => m.id), slot = prog.slot || SLOT_BASE;
    // quanti muscoli per slot: coppie finché servono, poi singoli (5 muscoli e 3 slot → 2, 2, 1)
    const misure = []; let resto = ids.length;
    for (let i = 0; i < slot.length; i++) { const n = Math.min(2, Math.max(1, resto - (slot.length - i - 1))); misure.push(n); resto -= n; }
    const prima = (prog.blocchi || []).filter(b => b.dal < dal).sort((a, b) => b.dal.localeCompare(a.dal)).slice(0, 4);
    const chiave = c => [...c].sort().join('');
    const visti = new Map();
    const perm = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perm([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p]));
    // muscoli che lavorano insieme: meglio non metterli in slot uno dopo l'altro
    const sinergie = ['PT', 'BD', 'ST', 'PS'];
    perm(ids).forEach(p => {
      let o = 0; const coppie = misure.map(n => { const c = p.slice(o, o + n); o += n; return c; });
      const k = coppie.map(chiave).join('|');
      if (visti.has(k) || coppie.some(c => !c.length)) return;
      let pen = 0;
      prima.forEach((b, eta) => {
        const peso = [10, 6, 3, 1][eta];
        coppie.forEach((c, i) => {
          if (b.coppie.some(x => chiave(x) === chiave(c))) pen += c.length > 1 ? peso : peso / 2;   // stesso abbinamento (o stesso singolo)
          if (b.coppie[i] && chiave(b.coppie[i]) === chiave(c)) pen += 1;                       // e pure nello stesso giorno
        });
      });
      coppie.forEach((c, i) => { const n = coppie[i + 1]; if (n) c.forEach(x => n.forEach(y => { if (sinergie.includes(x + y) || sinergie.includes(y + x)) pen += 0.5; })); });
      visti.set(k, { coppie, pen });
    });
    const ord = [...visti.values()].sort((a, b) => a.pen - b.pen || a.coppie.flat().join('').localeCompare(b.coppie.flat().join('')));
    const scelta = ord[salta % ord.length];
    // nella coppia viene prima il muscolo che da più tempo non ha la priorità del primo giorno
    const ultimaPriorita = id => { const i = prima.findIndex(b => b.coppie.some(c => c[0] === id)); return i < 0 ? 99 : i; };
    const coppie = scelta.coppie.map(c => c.length > 1 ? [...c].sort((x, y) => ultimaPriorita(y) - ultimaPriorita(x)) : c);
    return { id: Date.now().toString(36), dal, settimane: 2, coppie, proposto: true };
  }

  window.Programma = { GIORNI, GIORNI3, MUSCOLI_BASE, SLOT_BASE, piu, dow, lunedi, fine, slotGiorni, etichettaSlot, leggiCoppia, scriviCoppia, bloccoDi, giorno, prossimi, ultimoBlocco, proponi };
})();

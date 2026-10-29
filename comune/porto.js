/* Moli delle navi nel porto di Civitavecchia, dalle pagine pubbliche di Port Mobility:
   - la programmazione accosti settimanale (aggiornata ogni giorno, vale per i giorni che copre);
   - le crociere del mese in corso e del mese dopo (una pagina per mese, per i giorni oltre la settimana).
   Le pagine permettono la lettura da altri siti, quindi le legge direttamente il browser: nessun dato esce.
   Porto.leggi() → {dal, al, navi:[{d:'AAAA-MM-GG', nave:'COSTA TOSCANA', banchina:'25', orari:'07:15/19:00'}]}
   Porto.trova(dati, 'Costa Toscana', '2026-10-29') → la riga della nave nominata nel titolo, quel giorno (o null) */
(function () {
  const URL_PORTO = 'https://civitavecchia.portmobility.it/it/porto-di-civitavecchia-arrivi-e-partenze-tempo-reale';
  const URL_MESE = m => 'https://civitavecchia.portmobility.it/it/crociere-partenza-al-porto-di-civitavecchia-' + MESI[m];
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const CHIAVE = 'dg:porto', DURATA = 30 * 60e3;

  // maiuscole, senza accenti né punteggiatura: "MSC Divina!" → "MSC DIVINA"
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const pad = n => String(n).padStart(2, '0');
  const testo = el => (el.textContent || '').replace(/\s+/g, ' ').trim();

  function analizza(html, oggi = new Date()) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // "Programmazione accosti dal 22 ottobre al 29 ottobre 2026": l'anno è quello della fine della settimana
    const intro = norm(doc.body ? doc.body.textContent : '').toLowerCase();
    const m = intro.match(/programmazione accosti dal (\d{1,2}) ([a-z]+)(?: (\d{4}))? al (\d{1,2}) ([a-z]+) (\d{4})/);
    const meseFine = m ? MESI.indexOf(m[5]) : -1, annoFine = m ? +m[6] : oggi.getFullYear();
    const data = (g, mese) => {
      let anno = annoFine;
      if (meseFine >= 0 && mese > meseFine) anno--;                      // settimana a cavallo di capodanno
      else if (meseFine < 0 && mese - oggi.getMonth() > 6) anno--;       // senza intestazione: la data più vicina a oggi
      else if (meseFine < 0 && oggi.getMonth() - mese > 6) anno++;
      return `${anno}-${pad(mese + 1)}-${pad(g)}`;
    };
    const navi = []; let giorno = null;
    doc.querySelectorAll('table').forEach(t => {
      if (!/BANCHINA/.test(norm(t.textContent))) return;
      t.querySelectorAll('tr').forEach(tr => {
        const celle = [...tr.children].map(testo);
        if (celle.length === 1) {                                         // "GIOVEDÌ 29 OTTOBRE"
          const d = norm(celle[0]).toLowerCase().match(/(\d{1,2}) ([a-z]+)/);
          const mese = d ? MESI.indexOf(d[2]) : -1;
          giorno = mese >= 0 ? data(+d[1], mese) : null;
          return;
        }
        if (!giorno || celle.length < 2 || norm(celle[0]) === 'NAVE') return;
        const nave = norm(celle[0]); if (!nave) return;
        navi.push({ d: giorno, nave, banchina: celle[1] || '', orari: celle[2] || '' });
      });
    });
    const giorni = navi.map(n => n.d).sort();
    return { dal: giorni[0] || null, al: giorni.at(-1) || null, navi };
  }

  // pagina di un mese: "Crociere … : Ottobre 2026", righe gio | 1 | 10 | 05:30 | 17:00 | NAVE | BANCHINA.
  // La pagina di un mese viene riusata ogni anno: se il titolo non è dell'anno atteso (ancora quella vecchia) non vale
  function analizzaMese(html, mese, anno) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const h1 = norm(doc.querySelector('h1') ? doc.querySelector('h1').textContent : '').toLowerCase().match(/([a-z]+) (\d{4})/);
    if (!h1 || MESI.indexOf(h1[1]) !== mese || +h1[2] !== anno) return [];
    const navi = [];
    doc.querySelectorAll('table tr').forEach(tr => {
      const c = [...tr.children].map(testo);
      if (c.length < 7 || !/^\d{1,2}$/.test(c[1]) || +c[2] !== mese + 1) return;
      const nave = norm(c[5]); if (!nave) return;
      const banchina = /^(tbc|tbd|\/|-)?$/i.test(c[6]) ? '' : c[6];
      navi.push({ d: `${anno}-${pad(mese + 1)}-${pad(+c[1])}`, nave, banchina, orari: [c[3], c[4]].filter(x => x && x !== '/').join('/') });
    });
    return navi;
  }

  const scarica = async url => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error('porto: ' + r.status); return r.text(); };
  async function leggi(oggi = new Date()) {
    try { const c = JSON.parse(sessionStorage.getItem(CHIAVE)); if (c && Date.now() - c.ts < DURATA) return c.dati; } catch (e) {}
    const mesi = [0, 1].map(k => { const d = new Date(oggi.getFullYear(), oggi.getMonth() + k, 1); return [d.getMonth(), d.getFullYear()]; });
    const [sett, ...mens] = await Promise.allSettled([scarica(URL_PORTO), ...mesi.map(([m]) => scarica(URL_MESE(m)))]);
    if (sett.status === 'rejected' && mens.every(x => x.status === 'rejected')) throw sett.reason;
    const dati = sett.status === 'fulfilled' ? analizza(sett.value, oggi) : { dal: null, al: null, navi: [] };
    // i giorni della settimana pubblicata valgono quella; i mesi completano gli altri giorni
    const coperti = new Set(dati.navi.map(n => n.d));
    mens.forEach((x, i) => { if (x.status === 'fulfilled') analizzaMese(x.value, ...mesi[i]).forEach(n => { if (!coperti.has(n.d)) dati.navi.push(n); }); });
    const giorni = dati.navi.map(n => n.d).sort();
    Object.assign(dati, { dal: giorni[0] || null, al: giorni.at(-1) || null });
    try { sessionStorage.setItem(CHIAVE, JSON.stringify({ ts: Date.now(), dati })); } catch (e) {}
    return dati;
  }

  // la nave nominata nel titolo dell'evento: il nome intero ("Costa Toscana", "imbarco MSC Divina"),
  // oppure il titolo è parte del nome ("Toscana") se quel giorno c'è una nave sola che va bene
  function trova(dati, titolo, d) {
    if (!dati || !titolo) return null;
    const t = ' ' + norm(titolo) + ' ', delGiorno = dati.navi.filter(n => n.d === d);
    const interi = delGiorno.filter(n => t.includes(' ' + n.nave + ' ')).sort((a, b) => b.nave.length - a.nave.length);
    if (interi.length) return interi[0];
    const tt = t.trim(); if (tt.length < 4) return null;
    const parti = delGiorno.filter(n => (' ' + n.nave + ' ').includes(' ' + tt + ' '));
    return parti.length === 1 ? parti[0] : null;
  }

  // una nave della tabella (in qualsiasi giorno) nominata nel titolo: per i giorni che il porto non ha ancora pubblicato
  function nave(dati, titolo) {
    if (!dati || !titolo) return null;
    const t = ' ' + norm(titolo) + ' ';
    return [...new Set(dati.navi.map(n => n.nave))].filter(n => t.includes(' ' + n + ' ')).sort((a, b) => b.length - a.length)[0] || null;
  }

  window.Porto = { URL: URL_PORTO, URL_MESE, analizza, analizzaMese, leggi, trova, nave, norm };
})();

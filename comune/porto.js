/* Moli delle navi nel porto di Civitavecchia, dalla programmazione accosti settimanale (pagina pubblica di Port Mobility).
   La pagina permette la lettura da altri siti, quindi la legge direttamente il browser: nessun dato esce, si scarica solo la tabella.
   Porto.leggi() → {dal, al, navi:[{d:'AAAA-MM-GG', nave:'COSTA TOSCANA', banchina:'25', orari:'07:15/19:00'}]}
   Porto.trova(dati, 'Costa Toscana', '2026-10-29') → la riga della nave nominata nel titolo, quel giorno (o null) */
(function () {
  const URL_PORTO = 'https://civitavecchia.portmobility.it/it/porto-di-civitavecchia-arrivi-e-partenze-tempo-reale';
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

  async function leggi() {
    try { const c = JSON.parse(sessionStorage.getItem(CHIAVE)); if (c && Date.now() - c.ts < DURATA) return c.dati; } catch (e) {}
    const r = await fetch(URL_PORTO, { cache: 'no-cache' });
    if (!r.ok) throw new Error('porto: ' + r.status);
    const dati = analizza(await r.text());
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

  window.Porto = { URL: URL_PORTO, analizza, leggi, trova, nave, norm };
})();

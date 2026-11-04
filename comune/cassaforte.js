/* Cassaforte comune di Dashboard, Bilancio e Mezzi.
   Stesso progetto Firebase, stesso account e stessa cifratura di Bilancio (bilancio/index.html, sezione CIFRATURA):
   - accesso con email e password (gli account si creano dalla console Firebase);
   - documento bilancio/{uid} = {salt, iter, check}: la passphrase non lascia mai il dispositivo;
   - chiave AES-GCM 256 ricavata con PBKDF2-SHA256; "ricorda su questo dispositivo" = chiave non esportabile
     in IndexedDB (bilancio-keys), la stessa che usa Bilancio: sbloccata una volta, si aprono tutte le app;
   - i dati di Mezzi stanno in bilancio/{uid}/giornale/{voce} = {kid, iv, ct}, cifrati con aad "giornale/{voce}";
     kid = sale attuale, come per le sezioni di Bilancio (lo controllano le regole Firestore).
   La cassaforte si crea e la passphrase si cambia da Bilancio (che ricifra anche Mezzi). */
(function () {
  const CONFIG = {
    apiKey: 'AIzaSyCiItrJc1Waa0q07JPYdPqF0ke-pFLLufA',
    authDomain: 'contabilit-1a500.firebaseapp.com',
    projectId: 'contabilit-1a500',
    appId: '1:771839838672:web:9943e49e505942b400d1d5'
  };
  const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  // sfondo panoramico comune, accanto a questo file
  const SFONDO = (() => { try { return new URL('sfondo.svg', document.currentScript.src).href; } catch (e) { return ''; } })();
  const CHECK = 'bilancio-ok';
  const ENC = new TextEncoder(), DEC = new TextDecoder();

  // --- cifratura: identica a Bilancio
  function b64(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function deriveKey(pass, salt, iter) {
    const base = await crypto.subtle.importKey('raw', ENC.encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(key, txt, aad) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ENC.encode(aad) }, key, ENC.encode(txt));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function decrypt(key, o, aad) {
    return DEC.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv), additionalData: ENC.encode(aad) }, key, unb64(o.ct)));
  }
  async function encryptBytes(key, bytes, aad) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ENC.encode(aad) }, key, bytes);
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function decryptBytes(key, o, aad) {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv), additionalData: ENC.encode(aad) }, key, unb64(o.ct)));
  }
  // Firestore tiene al massimo 1 MB per documento e il testo cifrato in base64 cresce di 1/3:
  // oltre 600 KB una voce si divide in parti {voce}__p1, __p2… e il documento {voce} dice quante sono
  const PARTE = 600000;
  const parteId = (id, k) => id + '__p' + k;
  const eParte = id => /__p\d+$/.test(id);
  async function keyOk(key, meta) { try { return await decrypt(key, meta.check, 'check') === CHECK; } catch (e) { return false; } }

  // --- chiave ricordata: lo stesso database di Bilancio
  // compressione (gzip) dei backup e delle sezioni grandi
  async function gzip(bytes, comprimi) {
    const s = new Blob([bytes]).stream().pipeThrough(comprimi ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  // sezioni del Bilancio: {iv, ct, z?} con aad = nome della sezione (come in bilancio/index.html, cifraSez/leggiSez)
  async function apriSez(key, d, k) {
    const dati = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(d.iv), additionalData: ENC.encode(k) }, key, unb64(d.ct)));
    return DEC.decode(d.z ? await gzip(dati, false) : dati);
  }
  async function chiudiSez(key, testo, k) {
    const iv = crypto.getRandomValues(new Uint8Array(12)); let dati = ENC.encode(testo), z = 0;
    if (dati.length > 50000 && window.CompressionStream) { dati = await gzip(dati, true); z = 1; }
    const ct = b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ENC.encode(k) }, key, dati));
    return z ? { iv: b64(iv), ct, z } : { iv: b64(iv), ct };
  }
  // backup sul dispositivo (solo testo cifrato)
  const bkdb = {
    open() { return new Promise((ok, ko) => { const r = indexedDB.open('dashgio-backup', 1); r.onupgradeneeded = () => r.result.createObjectStore('b'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }); },
    async get(id) { const db = await this.open(); return new Promise(ok => { const q = db.transaction('b').objectStore('b').get(id); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); },
    async put(id, v) { const db = await this.open(); return new Promise(ok => { const t = db.transaction('b', 'readwrite'), s = t.objectStore('b'); v == null ? s.delete(id) : s.put(v, id); t.oncomplete = t.onerror = () => ok(); }); },
    async chiavi() { const db = await this.open(); return new Promise(ok => { const q = db.transaction('b').objectStore('b').getAllKeys(); q.onsuccess = () => ok(q.result || []); q.onerror = () => ok([]); }); }
  };

  const kdb = {
    open() { return new Promise((ok, ko) => { const r = indexedDB.open('bilancio-keys', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }); },
    async get(id) { try { const db = await this.open(); return await new Promise(ok => { const q = db.transaction('k').objectStore('k').get(id); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch (e) { return null; } },
    async set(id, v) { try { const db = await this.open(); await new Promise(ok => { const t = db.transaction('k', 'readwrite'), s = t.objectStore('k'); v == null ? s.delete(id) : s.put(v, id); t.oncomplete = t.onerror = () => ok(); }); } catch (e) {} }
  };

  // async = false: i file si scaricano tutti insieme ma partono nell'ordine in cui sono stati aggiunti
  function carica(src) { return new Promise((ok, ko) => { const s = document.createElement('script'); s.async = false; s.src = src; s.onload = ok; s.onerror = () => ko(new Error(src)); document.head.appendChild(s); }); }
  const authMsg = e => ({
    'auth/invalid-credential': 'Email o password errate', 'auth/wrong-password': 'Email o password errate',
    'auth/user-not-found': 'Email o password errate', 'auth/invalid-email': 'Email non valida',
    'auth/missing-password': 'Inserisci la password', 'auth/too-many-requests': 'Troppi tentativi: riprova tra qualche minuto',
    'auth/network-request-failed': 'Nessuna connessione'
  })[e && e.code] || ('Accesso non riuscito: ' + ((e && (e.code || e.message)) || ''));

  /* Unione a tre vie: base = la versione da cui sono partite le mie modifiche, mine = la mia, theirs = quella trovata nel cloud
     (cambiata nel frattempo da un altro dispositivo o da un'altra scheda). Nessuna delle due si perde:
     - elenchi di oggetti con id: unione per id (aggiunti da una parte o dall'altra restano; eliminato da una parte e non
       toccato dall'altra → eliminato; eliminato da una parte ma cambiato dall'altra → resta la versione cambiata);
     - elenchi di valori semplici: unione, meno quelli tolti da una delle due parti;
     - oggetti: voce per voce; valori semplici cambiati da entrambe le parti: vince il mio (l'ultima modifica). */
  const uguali = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const conId = a => Array.isArray(a) && a.every(x => x && typeof x === 'object' && !Array.isArray(x) && x.id != null);
  const oggetto = x => x && typeof x === 'object' && !Array.isArray(x);
  function unisci(base, mine, theirs) {
    if (uguali(mine, theirs)) return mine;
    if (uguali(base, mine)) return theirs;
    if (uguali(base, theirs)) return mine;
    if (mine === undefined) return uguali(base, theirs) ? undefined : theirs;
    if (theirs === undefined) return uguali(base, mine) ? undefined : mine;
    if (Array.isArray(mine) && Array.isArray(theirs)) {
      const b = Array.isArray(base) ? base : [];
      if (conId(mine) && conId(theirs) && conId(b)) {
        const mb = new Map(b.map(x => [String(x.id), x])), mm = new Map(mine.map(x => [String(x.id), x])), mt = new Map(theirs.map(x => [String(x.id), x]));
        // ordine: il mio, con in coda quelli nuovi dell'altra parte
        const ids = [...mm.keys(), ...[...mt.keys()].filter(k => !mm.has(k))];
        const out = [];
        for (const id of ids) {
          const x = unisci(mb.get(id), mm.get(id), mt.get(id));
          if (x !== undefined) out.push(x);
        }
        return out;
      }
      if ([...mine, ...theirs, ...b].every(x => x === null || typeof x !== 'object')) {
        const tolti = new Set(b.filter(x => !mine.includes(x) || !theirs.includes(x)));
        return [...new Set([...mine, ...theirs])].filter(x => !tolti.has(x) || (mine.includes(x) && theirs.includes(x) && !b.includes(x)));
      }
      return mine;
    }
    if (oggetto(mine) && oggetto(theirs)) {
      const b = oggetto(base) ? base : {}, out = {};
      for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
        const x = unisci(b[k], mine[k], theirs[k]);
        if (x !== undefined) out[k] = x;
      }
      return out;
    }
    return mine;
  }

  const C = {
    CONFIG, SDK, user: null, meta: null, key: null, db: null, _pronta: null,
    encrypt, decrypt, deriveKey, keyOk, b64, unb64, authMsg, unisci,

    // Firebase del progetto di Bilancio, app predefinita: la stessa sessione di Bilancio sullo stesso sito
    async avvia() {
      if (this._avvio) return this._avvio;
      this._avvio = (async () => {
        const fb = window.firebase || {};
        await Promise.all([!fb.initializeApp && 'app', !fb.auth && 'auth', !fb.firestore && 'firestore'].filter(Boolean)
          .map(n => carica(SDK + 'firebase-' + n + '-compat.js')));
        if (!(firebase.apps || []).some(a => a.name === '[DEFAULT]')) firebase.initializeApp(CONFIG);
        // niente cache su disco, come in Bilancio: una cache condivisa fra più schede dello stesso sito può bloccare l'avvio su Safari
        this.db = firebase.firestore();
        // primo stato dell'accesso (la sessione salvata viene letta in modo asincrono)
        this.user = await new Promise(ok => { let off = null, fatto = false; off = firebase.auth().onAuthStateChanged(u => { if (fatto) return; fatto = true; ok(u); setTimeout(() => off && off(), 0); }); });
      })();
      return this._avvio;
    },
    ref() { return this.db.collection('bilancio').doc(this.user.uid); },
    // 'login' | 'nuova' (da creare in Bilancio) | 'sblocca' | 'pronta' | 'negato' | 'errore'
    async stato() {
      try { await this.avvia(); } catch (e) { this._avvio = null; this.errore = 'impossibile caricare Firebase (' + (e.message || e) + ')'; return 'errore'; }
      this.user = firebase.auth().currentUser;
      if (!this.user) return 'login';
      try { const s = await this.ref().get(); this.meta = s.exists ? s.data() : null; }
      catch (e) { this.errore = e.code || e.message; return e.code === 'permission-denied' ? 'negato' : 'errore'; }
      if (!this.meta) return 'nuova';
      if (this.key && await keyOk(this.key, this.meta)) return 'pronta';
      const saved = await kdb.get(this.user.uid);
      if (saved && saved.salt === this.meta.salt && await keyOk(saved.key, this.meta)) { this.key = saved.key; return 'pronta'; }
      // dentro la Dashboard: la chiave sbloccata lì (anche se non ricordata sul dispositivo)
      const pk = dashboard() && dashboard().Cassaforte && dashboard().Cassaforte.key;
      if (pk && dashboard().Cassaforte.meta && dashboard().Cassaforte.meta.salt === this.meta.salt && await keyOk(pk, this.meta)) { this.key = pk; return 'pronta'; }
      this.key = null;
      return 'sblocca';
    },
    async accedi(email, pw) {
      await this.avvia();
      try { await firebase.auth().signInWithEmailAndPassword(email, pw); }
      catch (e) { this.segnala('accesso-fallito', (e && e.code) || 'errore'); throw e; }
      this.user = firebase.auth().currentUser; this.segnala('accesso', 'email e password');
    },
    async sblocca(pass, ricorda) {
      const key = await deriveKey(pass, unb64(this.meta.salt), this.meta.iter);
      if (!await keyOk(key, this.meta)) { this.segnala('passphrase-errata', 'sblocco'); throw new Error('passphrase'); }
      this.key = key; this.segnala('sblocco', ricorda ? 'ricordata su questo dispositivo' : 'non ricordata');
      await kdb.set(this.user.uid, ricorda ? { key, salt: this.meta.salt } : null);
    },
    async blocca() { if (this.user) await kdb.set(this.user.uid, null); this.key = null; },
    async esci() { await this.blocca(); await firebase.auth().signOut(); this.user = null; },

    // --- dati cifrati in bilancio/{uid}/{col}/{id}
    // Bilancio ha già aperto la cassaforte con il suo codice: la passa qui senza sbloccare di nuovo
    adotta({ db, user, meta, key }) { Object.assign(this, { db, user, meta, key }); },
    async _ricomponi(col, id, testa, prendi) {
      let m = null; try { m = JSON.parse(testa); } catch (e) {}
      if (!m || typeof m.__parti !== 'number' || testa.length > 40) return testa;
      const parti = [];
      for (let k = 1; k <= m.__parti; k++) parti.push(await decryptBytes(this.key, await prendi(parteId(id, k)), col + '/' + parteId(id, k)));
      const tot = new Uint8Array(parti.reduce((a, p) => a + p.length, 0)); let o = 0;
      parti.forEach(p => { tot.set(p, o); o += p.length; });
      return DEC.decode(tot);
    },
    // basi: per ogni voce la versione letta (rev e testo), da cui partono le modifiche di questa pagina (vedi scrivi)
    basi: {},
    // leggi: l'app adotta quello che legge (la base avanza); sbircia: solo per guardare (la base resta quella dello stato dell'app)
    async leggi(col, id, sbircia) {
      const c = this.ref().collection(col), d = await c.doc(id).get();
      if (!d.exists) { if (!sbircia) this.basi[col + '/' + id] = { rev: 0, txt: null }; return null; }
      const txt = await this._ricomponi(col, id, await decrypt(this.key, d.data(), col + '/' + id), async pid => (await c.doc(pid).get()).data());
      if (!sbircia) this.basi[col + '/' + id] = { rev: d.data().rev || 0, txt };
      return txt;
    },
    sbircia(col, id) { return this.leggi(col, id, true); },
    async tutti(col) {
      const snap = await this.ref().collection(col).get({ source: 'server' }), doc = {}, out = {}; // senza rete la cache darebbe un elenco vuoto: meglio un errore
      snap.docs.forEach(d => { doc[d.id] = d.data(); });
      for (const id of Object.keys(doc)) if (!eParte(id)) {
        out[id] = await this._ricomponi(col, id, await decrypt(this.key, doc[id], col + '/' + id), async pid => doc[pid]);
        this.basi[col + '/' + id] = { rev: doc[id].rev || 0, txt: out[id] };
      }
      return out;
    },
    // le scritture di una voce (con le sue parti, se è grande) dentro un batch; key/salt per ricifrare con una passphrase nuova
    // b: un batch o una transazione (hanno lo stesso set); rev: il numero del salvataggio, per accorgersi di quelli fatti altrove
    async nelBatch(b, col, id, txt, key = this.key, salt = this.meta.salt, rev) {
      const c = this.ref().collection(col), up = firebase.firestore.FieldValue.serverTimestamp(), bytes = ENC.encode(txt);
      const r = rev != null ? { rev } : {};
      if (bytes.length <= PARTE) return b.set(c.doc(id), { kid: salt, ...await encrypt(key, txt, col + '/' + id), ...r, updated: up });
      const n = Math.ceil(bytes.length / PARTE);
      for (let k = 1; k <= n; k++) b.set(c.doc(parteId(id, k)), { kid: salt, ...await encryptBytes(key, bytes.subarray((k - 1) * PARTE, k * PARTE), col + '/' + parteId(id, k)), updated: up });
      b.set(c.doc(id), { kid: salt, ...await encrypt(key, JSON.stringify({ __parti: n }), col + '/' + id), ...r, updated: up });
    },
    /* Scrittura sicura: in una transazione si guarda la voce nel cloud. Se è cambiata dopo che questa pagina l'ha letta
       (un altro dispositivo o un'altra scheda ha salvato), si unisce (unisci) invece di sovrascrivere. Torna il testo
       scritto: se è diverso da txt, l'app deve adottarlo (o almeno sapere che nel cloud c'è di più).
       Un testo vuoto o non valido non si scrive mai sopra una voce che ha dati. */
    async scrivi(col, id, txt) {
      const k = col + '/' + id, base = this.basi[k];
      let finale = txt, rev = 0;
      if (txt == null || txt === '') throw new Error('scrittura vuota rifiutata (' + k + ')');
      try {
        const c = this.ref().collection(col);
        await this.db.runTransaction(async t => {
          finale = txt;
          const d = await t.get(c.doc(id));
          rev = d.exists ? (d.data().rev || 0) : 0;
          if (d.exists && (!base || rev !== base.rev)) {
            let loro = null;
            try { loro = await this._ricomponi(col, id, await decrypt(this.key, d.data(), k), async pid => (await t.get(c.doc(pid))).data()); } catch (e) { loro = null; }
            let lj, mj, bj;
            try { lj = loro != null ? JSON.parse(loro) : undefined; mj = JSON.parse(txt); bj = base && base.txt != null ? JSON.parse(base.txt) : undefined; } catch (e) { lj = undefined; }
            if (lj !== undefined) finale = JSON.stringify(unisci(bj, mj, lj));
          }
          await this.nelBatch(t, col, id, finale, this.key, this.meta.salt, rev + 1);
        });
        // la base avanza solo se quello scritto è quello che l'app ha: se si è unito, resta la vecchia finché l'app non rilegge
        // (così il prossimo salvataggio unisce ancora e non cancella ciò che è arrivato da fuori)
        this.basi[k] = finale === txt ? { rev: rev + 1, txt } : { rev: base ? base.rev : -1, txt: base ? base.txt : null };
        this.scritti[k] = { rev: rev + 1, txt: finale };
        return finale;
      } catch (e) {
        // rifiutata: la passphrase è stata cambiata da un altro dispositivo
        if (e.code === 'permission-denied') {
          const m = (await this.ref().get({ source: 'server' }).catch(() => null));
          if (m && m.exists && m.data().salt !== this.meta.salt) {
            // si dimentica la chiave ricordata solo se è quella vecchia: un'altra scheda di questo sito può aver già salvato la nuova
            const s = await kdb.get(this.user.uid);
            if (!s || s.salt !== m.data().salt) await kdb.set(this.user.uid, null);
            this.key = null; location.reload();
          }
        }
        throw e;
      }
    },
    // l'app ha adottato il testo unito tornato da scrivi: da qui partono le sue prossime modifiche
    /* ---- Backup automatici ----
       Una volta al giorno una foto cifrata di tutto (sezioni del Bilancio, Mezzi, Palestra, Lavoro e Dashboard), compressa:
       - nel cloud: dashboard/bk_AAAAMMGG (in parti se grande); si tengono gli ultimi 10 giorni e il primo di ogni mese per un anno;
       - su questo dispositivo (IndexedDB, cifrata con la stessa chiave): le ultime 5.
       Prima di un ripristino si fa una foto dello stato attuale (bk_AAAAMMGG_hhmmss), così anche il ripristino si annulla. */
    async _testiCol(col, salta) {
      const snap = await this.ref().collection(col).get({ source: 'server' }), doc = {}, out = {};
      snap.docs.forEach(d => { doc[d.id] = d.data(); });
      for (const id of Object.keys(doc)) if (!eParte(id) && !(salta && salta(id))) {
        try { out[id] = await this._ricomponi(col, id, await decrypt(this.key, doc[id], col + '/' + id), async pid => doc[pid]); } catch (e) { console.warn('backup: voce illeggibile', col, id); }
      }
      return out;
    },
    async foto() {
      const sez = {}, snap = await this.ref().collection('sez').get({ source: 'server' });
      for (const d of snap.docs) if (/^[a-z]{2,16}$/.test(d.id) && !/rotta$/.test(d.id)) {
        try { sez[d.id] = await apriSez(this.key, d.data(), d.id); } catch (e) { console.warn('backup: sezione illeggibile', d.id); }
      }
      const bk = id => /^bk_/.test(id);
      return { v: 1, il: new Date().toISOString(), sez, giornale: await this._testiCol('giornale'), palestra: await this._testiCol('palestra'), dashboard: await this._testiCol('dashboard', bk) };
    },
    _vuota(f) { return !Object.keys(f.sez).length && !Object.keys(f.giornale).length && !Object.keys(f.palestra).length && !Object.keys(f.dashboard).length; },
    async _idBackup() {
      const snap = await this.ref().collection('dashboard').get({ source: 'server' });
      return snap.docs.map(d => d.id).filter(id => /^bk_\d{8}(_\d{6})?$/.test(id)).sort().reverse();
    },
    async _salvaFoto(id, f) {
      const zip = await gzip(ENC.encode(JSON.stringify(f)), true), b = this.db.batch();
      await this.nelBatch(b, 'dashboard', id, b64(zip));
      await b.commit();
      // anche sul dispositivo
      try {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ENC.encode('backup/' + id) }, this.key, zip);
        await bkdb.put(id, { iv: b64(iv), ct: b64(ct), salt: this.meta.salt, il: f.il });
        const l = (await bkdb.chiavi()).sort().reverse(); for (const k of l.slice(5)) await bkdb.put(k, null);
      } catch (e) { console.warn('backup sul dispositivo', e); }
    },
    async backupGiornaliero(forza) {
      if (!this.key || !this.user) return null;
      const oggi = new Date(), g = oggi.getFullYear() + String(oggi.getMonth() + 1).padStart(2, '0') + String(oggi.getDate()).padStart(2, '0');
      try { const t = +localStorage.getItem('dg:backup') || 0; if (!forza && Date.now() - t < 120000) return null; localStorage.setItem('dg:backup', String(Date.now())); } catch (e) {}
      const ids = await this._idBackup();
      if (!forza && ids.includes('bk_' + g)) return null;
      const f = await this.foto();
      if (this._vuota(f)) return null;
      const id = forza === 'prima' ? 'bk_' + g + '_' + oggi.toTimeString().slice(0, 8).replace(/:/g, '') : 'bk_' + g;
      await this._salvaFoto(id, f);
      await this._ruota([id, ...ids.filter(x => x !== id)]);
      return id;
    },
    // ultimi 10 backup giornalieri + il primo di ogni mese per 12 mesi (+ le foto prima di un ripristino degli ultimi 30 giorni)
    async _ruota(ids) {
      const giorn = ids.filter(x => x.length === 11).sort().reverse(), tieni = new Set(giorn.slice(0, 10));
      const mesi = {}; giorn.slice().sort().forEach(x => { const m = x.slice(3, 9); if (!mesi[m]) mesi[m] = x; });
      Object.keys(mesi).sort().reverse().slice(0, 12).forEach(m => tieni.add(mesi[m]));
      const limite = new Date(Date.now() - 30 * 864e5), lim = limite.getFullYear() + String(limite.getMonth() + 1).padStart(2, '0') + String(limite.getDate()).padStart(2, '0');
      ids.filter(x => x.length > 11 && x.slice(3, 11) >= lim).forEach(x => tieni.add(x));
      const via = ids.filter(x => !tieni.has(x)); if (!via.length) return;
      const snap = await this.ref().collection('dashboard').get({ source: 'server' }), b = this.db.batch(); let n = 0;
      snap.docs.forEach(d => { if (via.some(v => d.id === v || d.id.startsWith(v + '__p'))) { b.delete(this.ref().collection('dashboard').doc(d.id)); n++; } });
      if (n) await b.commit();
    },
    async elencoBackup() {
      const cloud = await this._idBackup().catch(() => []), locali = await bkdb.chiavi().catch(() => []);
      const tutti = [...new Set([...cloud, ...locali])].sort().reverse();
      return tutti.map(id => ({ id, cloud: cloud.includes(id), dispositivo: locali.includes(id) }));
    },
    async apriBackup(id) {
      let zip = null;
      try { const t = await this.leggi('dashboard', id, true); if (t) zip = unb64(t); } catch (e) {}
      if (!zip) {
        const x = await bkdb.get(id); if (!x) throw new Error('backup non trovato');
        if (x.salt !== this.meta.salt) throw new Error('questo backup è cifrato con una passphrase precedente');
        zip = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(x.iv), additionalData: ENC.encode('backup/' + id) }, this.key, unb64(x.ct)));
      }
      return JSON.parse(DEC.decode(await gzip(zip, false)));
    },
    // rimette tutto com'era nella foto: prima una foto dello stato attuale; rev nuovo, così gli altri dispositivi se ne accorgono
    async ripristina(f) {
      if (!f || f.v !== 1) throw new Error('backup non valido');
      await this.backupGiornaliero('prima');
      this.segnala('ripristino', 'backup del ' + (f.il || '').slice(0, 10));
      const rev = Date.now(), up = firebase.firestore.FieldValue.serverTimestamp(), ops = [];
      for (const [k, txt] of Object.entries(f.sez || {})) ops.push(async b => b.set(this.ref().collection('sez').doc(k), { kid: this.meta.salt, ...await chiudiSez(this.key, txt, k), rev, updated: up }));
      for (const col of ['giornale', 'palestra', 'dashboard'])
        for (const [id, txt] of Object.entries(f[col] || {})) if (!/^bk_/.test(id)) ops.push(b => this.nelBatch(b, col, id, txt, this.key, this.meta.salt, rev));
      for (let i = 0; i < ops.length; i += 100) { const b = this.db.batch(); for (const op of ops.slice(i, i + 100)) await op(b); await b.commit(); }
      this.basi = {};
    },
    conteggi(f) {
      const n = t => { try { const v = JSON.parse(t); return Array.isArray(v) ? v.length : 0; } catch (e) { return 0; } };
      let spese = 0; Object.entries(f.giornale || {}).forEach(([k, t]) => { if (/expenses$/i.test(k)) spese += n(t); });
      let giornate = 0; try { giornate = (JSON.parse(f.dashboard.lavoro).giornate || []).length; } catch (e) {}
      return { movimenti: n((f.sez || {}).tx), conti: n((f.sez || {}).conti), rate: n((f.sez || {}).rate), speseMezzi: spese, giornate, allenamenti: n((f.palestra || {}).sessioni) };
    },

    /* ---- Registro delle attività (dashboard/registro, cifrato) ----
       accessi, sblocchi, passphrase o password sbagliate, nuovo dispositivo, cambio passphrase, ripristini, contenuti bloccati
       dalla CSP… Ogni voce: {id, il, tipo, det, disp (id del dispositivo), dove (browser e sistema)}. Gli eventi prima dello
       sblocco (es. passphrase errata) aspettano sul dispositivo e si scrivono appena la cassaforte è aperta. Ultime 300 voci. */
    SOSPETTI: ['accesso-fallito', 'passphrase-errata', 'nuovo-dispositivo', 'cambio-passphrase', 'ripristino', 'csp', 'sezione-danneggiata', 'svuotamento'],
    dispositivo() {
      try { let d = localStorage.getItem('dg:dispositivo'); if (!d) { d = 'd' + Math.random().toString(36).slice(2, 10); localStorage.setItem('dg:dispositivo', d); localStorage.setItem('dg:dispositivoNuovo', '1'); } return d; }
      catch (e) { return 'sconosciuto'; }
    },
    dove() {
      const u = navigator.userAgent || '';
      const sis = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac OS X/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : /Linux/.test(u) ? 'Linux' : 'altro';
      const br = /Edg\//.test(u) ? 'Edge' : /CriOS|Chrome\//.test(u) ? 'Chrome' : /FxiOS|Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'browser';
      return br + ' su ' + sis;
    },
    segnala(tipo, det) {
      const e = { id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), il: new Date().toISOString(), tipo, det: String(det || '').slice(0, 160), disp: this.dispositivo(), dove: this.dove() };
      try { const l = JSON.parse(localStorage.getItem('dg:registroAttesa') || '[]'); l.push(e); localStorage.setItem('dg:registroAttesa', JSON.stringify(l.slice(-50))); } catch (x) {}
      clearTimeout(this._tReg); this._tReg = setTimeout(() => this.scriviRegistro().catch(() => {}), 1500);
    },
    async scriviRegistro() {
      if (!this.key || !this.user || !this.db) return;
      let attesa = []; try { attesa = JSON.parse(localStorage.getItem('dg:registroAttesa') || '[]'); } catch (e) {}
      try { if (localStorage.getItem('dg:dispositivoNuovo')) attesa.unshift({ id: 'e' + Date.now().toString(36) + 'n', il: new Date().toISOString(), tipo: 'nuovo-dispositivo', det: 'primo uso su questo dispositivo', disp: this.dispositivo(), dove: this.dove() }); } catch (e) {}
      if (!attesa.length) return;
      const v = await this.leggi('dashboard', 'registro');
      const l = (v ? JSON.parse(v) : []).concat(attesa).slice(-300);
      await this.scrivi('dashboard', 'registro', JSON.stringify(l));
      try { localStorage.removeItem('dg:registroAttesa'); localStorage.removeItem('dg:dispositivoNuovo'); } catch (e) {}
    },
    async registro() { const v = await this.sbircia('dashboard', 'registro'); return v ? JSON.parse(v) : []; },
    // svuota il registro (resta una riga che dice quando e da dove)
    async svuotaRegistro() {
      await this.leggi('dashboard', 'registro');
      await this.scrivi('dashboard', 'registro', JSON.stringify([{ id: 'e' + Date.now().toString(36), il: new Date().toISOString(), tipo: 'registro-svuotato', det: '', disp: this.dispositivo(), dove: this.dove() }]));
    },
    // eventi da controllare successi su altri dispositivi dopo l'ultima volta che li hai visti qui
    async daControllare() {
      let visto = ''; try { visto = localStorage.getItem('dg:registroVisto') || ''; } catch (e) {}
      const me = this.dispositivo();
      return (await this.registro()).filter(e => e.il > visto && this.SOSPETTI.includes(e.tipo) && (e.disp !== me || e.tipo === 'csp'));
    },
    segnaVisto() { try { localStorage.setItem('dg:registroVisto', new Date().toISOString()); } catch (e) {} },

    scritti: {},
    adottato(col, id) { const x = this.scritti[col + '/' + id]; if (x) this.basi[col + '/' + id] = { ...x }; },

    // finestra a tutto schermo con lo stile della porta (per esempio il trasloco di Mezzi)
    finestra(titolo, sotto) {
      stilePorta();
      const box = document.createElement('div');
      box.className = 'cf-porta';
      box.innerHTML = `<div class="cf-box" role="dialog" aria-modal="true" aria-labelledby="cf-ftit"><div class="cf-logo" aria-hidden="true">G</div><h1 id="cf-ftit"></h1><p class="cf-sub"></p><div class="cf-corpo"></div><p class="cf-err" role="alert"></p></div>`;
      box.querySelector('h1').textContent = titolo; box.querySelector('.cf-sub').textContent = sotto || '';
      document.body.appendChild(box);
      return { box, corpo: box.querySelector('.cf-corpo'), err: m => { box.querySelector('.cf-err').textContent = m || ''; }, chiudi: () => box.remove() };
    },

    // accesso unico: si va alla Dashboard (cartella sopra) con ?torna=bilancio/ o giornale/. Se la Dashboard ha appena
    // rimandato qui e la cassaforte non è aperta (passphrase non ricordata), l'app chiede da sé per non girare in tondo
    allaDashboard(torna) {
      if (dashboard()) return false; // già dentro la Dashboard: chiede qui
      try {
        const t = +sessionStorage.getItem('dg:tornato') || 0;
        sessionStorage.removeItem('dg:tornato');
        if (Date.now() - t < 20000) return false;
      } catch (e) {}
      location.replace(new URL('../?torna=' + encodeURIComponent(torna), location.href).href);
      return true;
    },

    // --- porta d'ingresso: accesso e sblocco con lo stile di vetro scuro; si risolve quando la cassaforte è aperta
    async porta(opz = {}) {
      const nome = opz.nome || 'la tua app';
      // se il collegamento tarda si vede una finestra di attesa, e dopo 15 secondi il motivo possibile
      let attesa = null;
      const t1 = setTimeout(() => { attesa = this.finestra('Collegamento…', `Apro la cassaforte per ${nome}.`); }, 1200);
      const t2 = setTimeout(() => { if (attesa) attesa.err('Firebase non risponde da 15 secondi: controlla la connessione e gli eventuali blocchi della pubblicità per questo sito, poi ricarica la pagina.'); }, 15000);
      let st;
      try { st = await this.stato(); } finally { clearTimeout(t1); clearTimeout(t2); if (attesa) attesa.chiudi(); }
      if (st === 'pronta') return;
      // le app non hanno un accesso proprio: accesso e sblocco si fanno dalla Dashboard, che poi rimanda qui
      if (opz.torna && (st === 'login' || st === 'sblocca') && this.allaDashboard(opz.torna)) return new Promise(() => {});
      stilePorta();
      const box = document.createElement('div');
      box.className = 'cf-porta';
      box.innerHTML = `<div class="cf-box" role="dialog" aria-modal="true" aria-labelledby="cf-tit"><div class="cf-logo" aria-hidden="true">G</div><h1 id="cf-tit"></h1><p class="cf-sub"></p><div class="cf-corpo"></div><p class="cf-err" role="alert"></p></div>`;
      document.body.appendChild(box);
      const $ = s => box.querySelector(s), err = m => { $('.cf-err').textContent = m || ''; };
      return new Promise(fine => {
        const disegna = async () => {
          st = await this.stato(); err('');
          if (st === 'pronta') { box.remove(); return fine(); }
          const corpo = $('.cf-corpo');
          if (st === 'login') {
            $('#cf-tit').textContent = 'Accedi'; $('.cf-sub').textContent = `L'account di Giordano: Dashboard, Bilancio, Mezzi e quello che aggiungeremo.`;
            corpo.innerHTML = `<form><label>Email<input id="cf-e" type="email" autocomplete="username" required></label>
              <label>Password<input id="cf-pw" type="password" autocomplete="current-password" required></label>
              <button class="cf-btn" type="submit">Accedi</button></form><button class="cf-link" type="button" id="cf-reset">Password dimenticata?</button>`;
            $('form').onsubmit = async e => { e.preventDefault(); const b = $('.cf-btn'); b.disabled = true; b.textContent = 'Accedo…';
              try { await this.accedi($('#cf-e').value.trim(), $('#cf-pw').value); disegna(); } catch (x) { b.disabled = false; b.textContent = 'Accedi'; err(authMsg(x)); } };
            $('#cf-reset').onclick = async () => { const e = $('#cf-e').value.trim(); if (!e) return err('Scrivi la tua email, poi premi di nuovo');
              try { await firebase.auth().sendPasswordResetEmail(e); err('Email per reimpostare la password inviata'); } catch (x) { err(authMsg(x)); } };
          } else if (st === 'sblocca') {
            $('#cf-tit').textContent = 'Sblocca'; $('.cf-sub').textContent = `Inserisci la passphrase per aprire ${nome}. I dati si decifrano solo su questo dispositivo.`;
            corpo.innerHTML = `<form><label>Passphrase<input id="cf-p" type="password" autocomplete="current-password" required></label>
              <label class="cf-chk"><input id="cf-r" type="checkbox" checked> Ricorda su questo dispositivo</label>
              <button class="cf-btn" type="submit">Sblocca</button></form><button class="cf-link" type="button" id="cf-esci">Esci dall'account</button>`;
            $('form').onsubmit = async e => { e.preventDefault(); const b = $('.cf-btn'); b.disabled = true; b.textContent = 'Verifico…';
              try { await this.sblocca($('#cf-p').value, $('#cf-r').checked); disegna(); } catch (x) { b.disabled = false; b.textContent = 'Sblocca'; err(x.message === 'passphrase' ? 'Passphrase errata' : 'Errore: ' + (x.code || x.message)); } };
            $('#cf-esci').onclick = async () => { await this.esci(); disegna(); };
            setTimeout(() => { const p = $('#cf-p'); if (p) p.focus(); }, 50);
          } else if (st === 'nuova') {
            $('#cf-tit').textContent = 'Cassaforte da creare'; $('.cf-sub').textContent = 'Crea la passphrase da Bilancio: poi questa app si apre con la stessa.';
            corpo.innerHTML = `<a class="cf-btn" href="${opz.bilancio || '../bilancio/'}">Apri Bilancio</a>`;
          } else {
            $('#cf-tit').textContent = st === 'negato' ? 'Accesso negato' : 'Errore';
            $('.cf-sub').textContent = st === 'negato' ? 'Questo account non può leggere la cassaforte (regole Firestore).' : 'Non riesco a leggere i dati: ' + (this.errore || '');
            corpo.innerHTML = `<button class="cf-btn" type="button" id="cf-riprova">Riprova</button><button class="cf-link" type="button" id="cf-esci">Esci dall'account</button>`;
            $('#cf-riprova').onclick = disegna; $('#cf-esci').onclick = async () => { await this.esci(); disegna(); };
          }
        };
        disegna();
      });
    }
  };

  function stilePorta() {
    if (document.getElementById('cf-stile')) return;
    const st = document.createElement('style'); st.id = 'cf-stile';
    st.textContent = `
      .cf-porta{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Manrope,system-ui,sans-serif;color:#fff;
        background:#2a201a url(${SFONDO}) center/cover no-repeat}
      html.incorporata .cf-porta{background:rgba(25,18,13,.40);-webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px)}
      .cf-box{width:min(400px,100%);border-radius:28px;padding:28px 24px;background:rgba(40,32,28,.6);-webkit-backdrop-filter:blur(26px);backdrop-filter:blur(26px);
        border:1px solid rgba(255,255,255,.12);box-shadow:0 20px 60px rgba(0,0,0,.4)}
      .cf-logo{width:52px;height:52px;border-radius:16px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;color:#F2711C;font-weight:800;font-size:22px;margin-bottom:16px}
      .cf-box h1{margin:0;font-size:24px;font-weight:800}
      .cf-sub{margin:6px 0 18px;color:rgba(255,255,255,.74);font-size:13.5px;line-height:1.45}
      .cf-box form{display:flex;flex-direction:column;gap:12px}
      .cf-box label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;color:rgba(255,255,255,.8)}
      .cf-box input[type=email],.cf-box input[type=password]{height:46px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.28);color:#fff;font:500 15px Manrope,system-ui,sans-serif;padding:0 14px;outline:0}
      .cf-box input:focus{border-color:#F2711C}
      .cf-chk{flex-direction:row !important;align-items:center;gap:8px !important;font-weight:600 !important}
      .cf-chk input{width:18px;height:18px;accent-color:#F2711C}
      .cf-btn{display:flex;align-items:center;justify-content:center;height:48px;border:0;border-radius:99px;background:#F2711C;color:#1a1411;font:800 15px Manrope,system-ui,sans-serif;cursor:pointer;text-decoration:none;margin-top:4px}
      .cf-btn[disabled]{opacity:.6}
      .cf-link{display:block;margin:14px auto 0;background:none;border:0;color:#ffb07a;font:600 13px Manrope,system-ui,sans-serif;cursor:pointer;min-height:44px}
      .cf-err{min-height:18px;margin:10px 0 0;color:#ffb3a1;font-size:13px;text-align:center}`;
    document.head.appendChild(st);
  }

  // Dashboard che contiene questa pagina (stesso sito), se c'è
  function dashboard() {
    try { return window.top !== window && window.top.dashVai ? window.top : null; } catch (e) { return null; }
  }
  C.dashboard = dashboard;
  // dentro la Dashboard: niente pulsante "Dashboard" e i link tra le app cambiano vista nella Dashboard invece di aprire la pagina qui
  if (window.top !== window) {
    document.documentElement.classList.add('incorporata');
    const st = document.createElement('style');
    st.textContent = 'html.incorporata a[href="../"]{display:none !important}';
    (document.head || document.documentElement).appendChild(st);
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a[href]'), d = dashboard();
      if (!a || !d || a.target === '_blank') return;
      const u = new URL(a.getAttribute('href'), location.href), base = new URL('../', location.href);
      if (u.origin !== location.origin || !u.pathname.startsWith(base.pathname)) return;
      const resto = u.pathname.slice(base.pathname.length);
      if (!/^(bilancio|giornale|palestra|lavoro)\/|^$/.test(resto)) return;
      e.preventDefault();
      d.dashVai(resto + u.search + u.hash);
    }, true);
  }

  window.Cassaforte = C;
})();

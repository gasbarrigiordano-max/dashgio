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
  const kdb = {
    open() { return new Promise((ok, ko) => { const r = indexedDB.open('bilancio-keys', 1); r.onupgradeneeded = () => r.result.createObjectStore('k'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }); },
    async get(id) { try { const db = await this.open(); return await new Promise(ok => { const q = db.transaction('k').objectStore('k').get(id); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch (e) { return null; } },
    async set(id, v) { try { const db = await this.open(); await new Promise(ok => { const t = db.transaction('k', 'readwrite'), s = t.objectStore('k'); v == null ? s.delete(id) : s.put(v, id); t.oncomplete = t.onerror = () => ok(); }); } catch (e) {} }
  };

  function carica(src) { return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error(src)); document.head.appendChild(s); }); }
  const authMsg = e => ({
    'auth/invalid-credential': 'Email o password errate', 'auth/wrong-password': 'Email o password errate',
    'auth/user-not-found': 'Email o password errate', 'auth/invalid-email': 'Email non valida',
    'auth/missing-password': 'Inserisci la password', 'auth/too-many-requests': 'Troppi tentativi: riprova tra qualche minuto',
    'auth/network-request-failed': 'Nessuna connessione'
  })[e && e.code] || ('Accesso non riuscito: ' + ((e && (e.code || e.message)) || ''));

  const C = {
    CONFIG, SDK, user: null, meta: null, key: null, db: null, _pronta: null,
    encrypt, decrypt, deriveKey, keyOk, b64, unb64, authMsg,

    // Firebase del progetto di Bilancio, app predefinita: la stessa sessione di Bilancio sullo stesso sito
    async avvia() {
      if (this._avvio) return this._avvio;
      this._avvio = (async () => {
        if (!window.firebase || !firebase.initializeApp) await carica(SDK + 'firebase-app-compat.js');
        if (!firebase.auth) await carica(SDK + 'firebase-auth-compat.js');
        if (!firebase.firestore) await carica(SDK + 'firebase-firestore-compat.js');
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
      this.key = null;
      return 'sblocca';
    },
    async accedi(email, pw) { await this.avvia(); await firebase.auth().signInWithEmailAndPassword(email, pw); this.user = firebase.auth().currentUser; },
    async sblocca(pass, ricorda) {
      const key = await deriveKey(pass, unb64(this.meta.salt), this.meta.iter);
      if (!await keyOk(key, this.meta)) throw new Error('passphrase');
      this.key = key;
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
    async leggi(col, id) {
      const c = this.ref().collection(col), d = await c.doc(id).get();
      if (!d.exists) return null;
      return this._ricomponi(col, id, await decrypt(this.key, d.data(), col + '/' + id), async pid => (await c.doc(pid).get()).data());
    },
    async tutti(col) {
      const snap = await this.ref().collection(col).get(), doc = {}, out = {};
      snap.docs.forEach(d => { doc[d.id] = d.data(); });
      for (const id of Object.keys(doc)) if (!eParte(id))
        out[id] = await this._ricomponi(col, id, await decrypt(this.key, doc[id], col + '/' + id), async pid => doc[pid]);
      return out;
    },
    // le scritture di una voce (con le sue parti, se è grande) dentro un batch; key/salt per ricifrare con una passphrase nuova
    async nelBatch(b, col, id, txt, key = this.key, salt = this.meta.salt) {
      const c = this.ref().collection(col), up = firebase.firestore.FieldValue.serverTimestamp(), bytes = ENC.encode(txt);
      if (bytes.length <= PARTE) return b.set(c.doc(id), { kid: salt, ...await encrypt(key, txt, col + '/' + id), updated: up });
      const n = Math.ceil(bytes.length / PARTE);
      for (let k = 1; k <= n; k++) b.set(c.doc(parteId(id, k)), { kid: salt, ...await encryptBytes(key, bytes.subarray((k - 1) * PARTE, k * PARTE), col + '/' + parteId(id, k)), updated: up });
      b.set(c.doc(id), { kid: salt, ...await encrypt(key, JSON.stringify({ __parti: n }), col + '/' + id), updated: up });
    },
    async scrivi(col, id, txt) {
      try {
        const b = this.db.batch();
        await this.nelBatch(b, col, id, txt);
        await b.commit();
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
        background:radial-gradient(40% 35% at 18% 12%, rgba(255,196,140,.35), transparent 70%), radial-gradient(35% 40% at 85% 20%, rgba(120,90,70,.55), transparent 70%),
        radial-gradient(45% 40% at 70% 85%, rgba(242,113,28,.18), transparent 70%), linear-gradient(160deg,#3a2d25 0%,#241b16 55%,#15100d 100%)}
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

  window.Cassaforte = C;
})();

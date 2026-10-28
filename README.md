# Dashboard di Giordano

Le mie app personali in un solo sito, con un solo account e una sola cassaforte cifrata.

| Percorso | Cosa è |
|---|---|
| `/` (`index.html`) | Dashboard: riepilogo di Bilancio, Mezzi e Palestra, calendario e scadenze. Non ha dati propri: apre Bilancio in un riquadro nascosto e ne legge i numeri. |
| `/bilancio/` | Bilancio: finanze personali (dettagli in `bilancio/HANDOFF.md`). |
| `/giornale/` | Mezzi (prima "Giornale di Bordo"): auto, scooter, moto e gommone. |
| `/palestra/` | Palestra: schede, registro degli allenamenti e record, progressi del corpo, abbonamento e ingressi. |
| `/comune/cassaforte.js` | Accesso e cifratura condivisi (login, sblocco, lettura e scrittura cifrata). |

Sito: GitHub Pages dal ramo `main`, cartella principale → `https://gasbarrigiordano-max.github.io/dashgio/`.

## Sicurezza

Stessa linea del Bilancio, ora per tutto:

- **Un account** Firebase (progetto `contabilit-1a500`), email e password, creato a mano dalla console; registrazione disattivata. Accesso e sblocco si fanno nella Dashboard: le app aperte senza accesso rimandano lì e poi tornano.
- **Una passphrase**, diversa dalla password, che non esce mai dal browser. Da lì una chiave AES-GCM 256 (PBKDF2-SHA256, 600.000 iterazioni, sale casuale).
- **Niente in chiaro su Firebase**: ogni sezione del Bilancio e ogni voce di Mezzi e della Palestra è cifrata a parte, con il proprio nome come dato associato (non si possono scambiare tra loro).
- **Regole Firestore** (`firestore.rules`): solo il proprio UID legge e scrive; ogni scrittura deve portare il sale attuale (`kid`), così un dispositivo con la passphrase vecchia viene fermato.
- **Ricorda su questo dispositivo**: la chiave (non esportabile, mai la passphrase) resta in IndexedDB. Le tre pagine stanno sullo stesso indirizzo, quindi sbloccare una sblocca tutte; "Blocca" la dimentica ovunque.
- **Nessun dato nei file del repo**: `.gitignore` esclude CSV, JSON, Numbers ed Excel. I backup `.json` sono in chiaro: tenerli fuori da qui.

## Firestore

```
bilancio/{uid}                    salt, iter, check   (cassaforte)
bilancio/{uid}/sez/{sezione}      kid, iv, ct         (Bilancio: tx, conti, rate…)
bilancio/{uid}/giornale/{voce}    kid, iv, ct         (Mezzi: trips, auto_expenses…; oltre 600 KB in parti voce__p1, __p2…)
bilancio/{uid}/palestra/{voce}    kid, iv, ct         (Palestra: schede, sessioni, corpo, abbonamento, inCorso)
```

Dopo ogni modifica a `firestore.rules`: copiarle in console (Firestore → Regole), sostituire `IL_TUO_UID` con l'UID dell'utente e pubblicare.

## Trasloco dal vecchia app dei mezzi

Il vecchia app dei mezzi salvava in chiaro sul progetto `app-gommone`. Alla prima apertura di `/giornale/` dopo lo sblocco, la pagina chiede l'accesso al vecchio account, copia tutte le voci nella cassaforte, le rilegge per controllarle e scrive la voce `trasloco`. Da lì in poi il vecchio progetto non viene più usato.

Bilancio legge Mezzi dalla stessa cassaforte (spese importate in Mezzi, scadenze in Da pagare) e gli scrive l'elenco di conti e carte per il campo "Pagato con".

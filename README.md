# Dashboard di Giordano

Le mie app personali in un solo sito, con un solo account e una sola cassaforte cifrata.

| Percorso | Cosa è |
|---|---|
| `/` (`index.html`) | Dashboard: riepilogo di Bilancio, Mezzi e Palestra, calendario e scadenze. Non ha dati propri: apre Bilancio in un riquadro nascosto e ne legge i numeri. |
| `/bilancio/` | Bilancio: finanze personali (dettagli in `bilancio/HANDOFF.md`). |
| `/giornale/` | Mezzi (prima "Giornale di Bordo"): auto, scooter, moto e gommone. |
| `/palestra/` | Palestra: schede, registro degli allenamenti e record, progressi del corpo, abbonamento e ingressi. |
| `/comune/cassaforte.js` | Accesso e cifratura condivisi (login, sblocco, lettura e scrittura cifrata). |
| `/comune/programma.js` | Calcoli del programma della Palestra (coppie di muscoli, blocchi), usati da Palestra e Dashboard. |
| `/comune/porto.js` | Legge i moli delle navi dalla programmazione accosti del porto di Civitavecchia. |

Le app si aprono dentro la Dashboard (`#bilancio`, `#mezzi`, `#palestra`): la barra a sinistra resta, e dentro la Dashboard le app nascondono il proprio pulsante "Dashboard" e usano la chiave già sbloccata. Aperte da sole funzionano lo stesso.

Sito: GitHub Pages dal ramo `main`, cartella principale → `https://gasbarrigiordano-max.github.io/dashgio/`.

## Sicurezza

Stessa linea del Bilancio, ora per tutto:

- **Un account** Firebase (progetto `contabilit-1a500`), email e password, creato a mano dalla console; registrazione disattivata. Accesso e sblocco si fanno nella Dashboard: le app aperte senza accesso rimandano lì e poi tornano.
- **Una passphrase**, diversa dalla password, che non esce mai dal browser. Da lì una chiave AES-GCM 256 (PBKDF2-SHA256, 600.000 iterazioni, sale casuale).
- **Niente in chiaro su Firebase**: ogni sezione del Bilancio e ogni voce di Mezzi e della Palestra è cifrata a parte, con il proprio nome come dato associato (non si possono scambiare tra loro).
- **Regole Firestore** (`firestore.rules`): solo il proprio UID legge e scrive; ogni scrittura deve portare il sale attuale (`kid`), così un dispositivo con la passphrase vecchia viene fermato.
- **Ricorda su questo dispositivo**: la chiave (non esportabile, mai la passphrase) resta in IndexedDB. Le tre pagine stanno sullo stesso indirizzo, quindi sbloccare una sblocca tutte; "Blocca" la dimentica ovunque.
- **Google Calendar**: i permessi brevi (un'ora) restano solo in memoria. Con l'accesso automatico (facoltativo, Impostazioni → Google) la chiave segreta del client e i permessi di lunga durata stanno solo nella cassaforte (`dashboard/google`), cifrati: a ogni apertura, dopo lo sblocco, la Dashboard chiede a Google un permesso fresco senza clic. Perché quelli lunghi non scadano dopo 7 giorni, l'app in Google Auth Platform va pubblicata ("In produzione"), non lasciata "In test".
- **Moli delle navi**: la Dashboard legge dal browser la programmazione accosti pubblica del porto di Civitavecchia (Port Mobility) e mette il molo accanto agli eventi Google che nominano una nave. Non manda nulla al sito del porto.
- **Nessun dato nei file del repo**: `.gitignore` esclude CSV, JSON, Numbers ed Excel. I backup `.json` sono in chiaro: tenerli fuori da qui.

## Firestore

```
bilancio/{uid}                    salt, iter, check   (cassaforte)
bilancio/{uid}/sez/{sezione}      kid, iv, ct         (Bilancio: tx, conti, rate…)
bilancio/{uid}/giornale/{voce}    kid, iv, ct         (Mezzi: trips, auto_expenses…; oltre 600 KB in parti voce__p1, __p2…)
bilancio/{uid}/palestra/{voce}    kid, iv, ct         (Palestra: schede, sessioni, corpo, abbonamento, inCorso)
bilancio/{uid}/dashboard/google   kid, iv, ct         (Dashboard: chiave segreta del client Google e permessi di lunga durata)
```

Dopo ogni modifica a `firestore.rules`: copiarle in console (Firestore → Regole), sostituire `IL_TUO_UID` con l'UID dell'utente e pubblicare.

## Trasloco dalla vecchia app dei mezzi

La vecchia app dei mezzi (Giornale di Bordo) salvava in chiaro sul progetto `app-gommone`. Alla prima apertura di `/giornale/` dopo lo sblocco, la pagina chiede l'accesso al vecchio account, copia tutte le voci nella cassaforte, le rilegge per controllarle e scrive la voce `trasloco`. Da lì in poi il vecchio progetto non viene più usato.

Bilancio legge Mezzi dalla stessa cassaforte (spese importate in Mezzi, scadenze in Da pagare) e gli scrive l'elenco di conti e carte per il campo "Pagato con".

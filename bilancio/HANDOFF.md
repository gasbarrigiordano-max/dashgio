# Bilancio — app finanze personali (riepilogo per riprendere il lavoro)

> Ora Bilancio vive nel repo `dashgio` (cartella `bilancio/`), insieme alla Dashboard e al Mezzi: stesso account e stessa cassaforte per tutti. Mezzi sta in `bilancio/{uid}/giornale/{voce}`, cifrato con la stessa chiave (vedi `README.md` e `comune/cassaforte.js` nella cartella principale). Il cambio passphrase ricifra anche Mezzi.

## Obiettivo
App per tracciare tutte le mie spese e finanze, stessa filosofia dell'"app del gommone" (Mezzi): **un unico file HTML**, mobile-first (iPhone), hosting su **GitHub Pages**, login **email/password** con **Firebase** per sincronizzare i dati. Stile diverso dal gommone (Manrope + JetBrains Mono). Tema predefinito **Vetro** (stile Apple glass: sfondo sfumato caldo `--mesh` su `body::before`, schede semitrasparenti con `backdrop-filter`, saldo in vetro verde, pulsanti neri a pillola; la tabella Mensile usa fondi pieni `--solid`/`--solid2` per righe e colonne fisse); poi **Carta**: bianco caldo + verde smeraldo; tema scuro **Ardesia** (grafite morbida + verde brillante; tavolozza categorie scura di riferimento, validata) selezionabile da Impostazioni → Tema, salvato per dispositivo in `localStorage` (`bilancio:tema`). I colori sono tutti variabili CSS in `:root` / `:root[data-theme="scuro"]`; la tavolozza delle categorie cambia col tema (chiaro: 8 colori validati, oltre l'ottava categoria la ciambella raggruppa in "Altre").

## Stato attuale
- File: `index.html` (un solo file, più le icone `favicon.png`, `icona-180.png` per la Home dell'iPhone e `icona-512.png`; logo = portafoglio, colori dal tema con `--brand-*`, nessuna dipendenza oltre a Google Fonts e, solo in modalità cloud, l'SDK Firebase compat 10.14.1 caricato da gstatic).
- **Nessun dato dentro il file**: i dati si caricano da CSV (ingranaggio in alto a destra → "Importa da CSV").
- **Due modalità**, decise da `FIREBASE_CONFIG` in cima allo script:
  - `apiKey` vuota → solo locale, `localStorage` (chiave `bilancio:v1`), come la prima bozza.
  - `apiKey` compilata (progetto `contabilit-1a500`) → login email/password + passphrase, dati su Firestore **cifrati end-to-end**.
- Il resto dell'app usa solo `store.get()` / `store.set()` (`localStore` o `cloud`).

## Cloud: come funziona
- Gate prima dell'app: **email + password** (account creato a mano dalla console, nessuna registrazione nell'app; c'è "Password dimenticata?") → **Crea cassaforte** la prima volta / **Sblocca** le volte dopo.
- Password dell'account e passphrase sono due cose diverse e devono avere valori diversi: la password passa da Google, la passphrase non esce mai dal browser.
- Cifratura: AES-GCM 256, chiave da passphrase con PBKDF2-SHA256 600.000 iterazioni, sale casuale. Ogni sezione è cifrata a parte con la sezione come dato associato. Su Firebase non arriva mai nulla in chiaro.
- Firestore:
  - `bilancio/{uid}`: `salt`, `iter`, `check` (la parola `bilancio-ok` cifrata, serve a verificare la passphrase)
  - `bilancio/{uid}/sez/{tx|conti|rate|inv|trading}`: `kid` (= sale attuale), `iv`, `ct`
- Salvataggio ottimistico: la UI cambia subito, l'invio parte dopo 400 ms con le sole sezioni modificate, in un batch; se fallisce riprova con attese crescenti (2 s → 60 s). Puntino in alto: verde sincronizzato, giallo salvataggio in corso, rosso errore. Quando l'app va in background invia subito; quando torna in primo piano ricarica le modifiche fatte da altri dispositivi. Nessuna cache di Firestore su disco: con Bilancio, Mezzi e Dashboard sullo stesso indirizzo la cache condivisa fra schede bloccava l'avvio su Safari, quindi i dati si leggono sempre dal server. Se Firebase non risponde, dopo 15 secondi la schermata di caricamento lo dice.
- "Ricorda su questo dispositivo": salva la chiave AES **non esportabile** in IndexedDB (mai la passphrase). "Blocca" la dimentica e chiede di nuovo la passphrase.
- **Cambia passphrase** (Impostazioni): nuovo sale, ricifra tutto in un'unica scrittura atomica. Le regole rifiutano le scritture con `kid` vecchio: un altro dispositivo con la passphrase vecchia viene bloccato e la chiede di nuovo.
- Primo accesso da un browser con dati locali e cloud vuoto: i dati locali vengono caricati nel cloud e poi tolti da `localStorage`.
- Se perdo la passphrase i dati non si recuperano: esportare ogni tanto il backup `.json` (che è in chiaro, da tenere fuori dal repo).

## Configurare Firebase (da fare una volta) — progetto `contabilit-1a500`
1. Authentication → Inizia → Metodo di accesso → attiva **Email/password** (non il link via email).
2. Authentication → Utenti → **Aggiungi utente**: la tua email e una password. Copia l'**UID utente** che compare nella lista.
3. (Consigliato) Authentication → Impostazioni → Azioni utente → disattiva **Abilita la creazione (registrazione)**, così nessun altro può crearsi un account.
4. Firestore Database → crea (modalità produzione, località europea). Regole → incolla `firestore.rules` mettendo il tuo UID al posto di `IL_TUO_UID` → Pubblica.
5. La config web è già in `FIREBASE_CONFIG` dentro `index.html`.
6. (Consigliato) Google Cloud Console → API e servizi → Credenziali → limita la chiave API ai referrer `https://gasbarrigiordano-max.github.io/*`.
7. GitHub → Settings → Pages → deploy dal branch. Sito: https://gasbarrigiordano-max.github.io/contabilit-/ → accedi, crea la passphrase, importa i CSV.

## Schermate
Su iPhone la barra in basso (pillola di vetro) ha, in ordine: **Panoramica · Movimenti · Carte · Rate · Patrimonio · Altro**; Altro contiene Mensile · Abbonamenti · Investimenti · Trading (ricorda l'ultima voce aperta). Su iPad/Mac il menu laterale ha tutte le voci.

1. **Panoramica**: saldo mese/anno, **Da pagare** del mese scelto (con "Anno" il mese corrente): rate per metodo, abbonamenti mensili insieme, le altre spese fisse (bollo, assicurazione… inserite in Abbonamenti con ricorrenza annuale) una per una, **Liquidità** (totale + tre conti principali con logo) e **Patrimonio** (totale + anello liquidità/investito); su un mese passato liquidità, conti e patrimonio sono quelli della foto dello storico di quel mese ("al 30 set 2026"; foto con i soli totali: niente elenco conti; senza foto: "–"), con Anno su un anno passato l'ultima foto dell'anno, ciambella uscite per categoria, barre entrate vs uscite. Su iPad/Mac: saldo · rate · liquidità / categorie · patrimonio / entrate vs uscite a tutta larghezza.
2. **Movimenti**: lista con filtri (tipo, mese/anno, ricerca), pulsante + per aggiungere, tocca per modificare/eliminare.
3. **Mensile**: tabella categorie × mesi (replica la tabella "Contabilità" del mio file Numbers), uscite/entrate; ordine per importo o personalizzato (↕ Ordina: categorie e voci con ▲▼, salvato in `opz.ordine[u|e]`, `opz.mxSort`). Tocca una cella (o il nome/totale di una riga) per i movimenti di quella categoria/voce nel mese (o nell'anno): si modificano o se ne aggiunge uno precompilato; il + crea un'uscita o un'entrata secondo la vista. Provvisorio (da togliere quando non serve più): nello stesso foglio "Elimina questi N movimenti" (mese o anno) ed "Elimina in tutti gli anni" per la voce toccata, con conferma; i movimenti collegati a rate o rateizzazioni non si toccano, gli importi pagati da un conto tornano sul conto.
4. **Patrimonio**: riepilogo con composizione (Banche / Cash / Investimenti), conti con logo e quota del patrimonio, saldo modificabile; **Andamento** (grafico del totale con tooltip, 12 mesi / 2 anni / tutto, variazione ultimo mese e da inizio anno) e **Storico mensile**, salvato solo in automatico (l'ultimo giorno del mese, oppure alla prima apertura dopo per ogni mese chiuso rimasto senza foto, con i saldi riportati a fine mese; nessun pulsante manuale). Tocca un mese per il dettaglio dei conti, correggerlo o eliminarlo; "+ Mese passato" per inserire i mesi di prima dell'app.
5. **Altro**: Rate, Investimenti (investito, attuale, rendimento % ricalcolato), Trading (P&L giornaliero per mese). Su iPad/Mac Rate e Investimenti hanno una voce nel menu laterale.

### Abbonamenti
- Logo del servizio riconosciuto dal nome (Vodafone, Iliad, Apple, Apple Music, iCloud, Claude, Netflix, Spotify, Prime, YouTube, DAZN, ChatGPT, Dropbox, PlayStation, Nintendo, Duolingo): simboli da Simple Icons (CC0) su riquadro nel colore del marchio, iliad disegnato a mano; anche nei movimenti degli abbonamenti.
- Sezione Abbonamenti (in Altro su iPhone, voce nel menu su iPad/Mac): SIM, palestra, Apple Music, iCloud, Claude… con costo, ricorrenza (mensile, bimestrale, trimestrale, semestrale, annuale), prossima scadenza, metodo di pagamento e categoria (predefinita Ricorrenti). Costo totale al mese e all'anno; si possono sospendere.

### Carte di credito
- Selettore delle carte con la foto della carta vera (`carta-ing-oro.webp`, `carta-bbva.webp`) o un colore (`colore`: ing-oro, bbva, oro, blu, nero, argento, verde).
- Sezione Carte (in Altro su iPhone, voce nel menu su iPad/Mac), una scheda per carta: ING Oro (plafond 1.500 €, addebito il 10 del mese dopo su ING, PagoFlex attivo) e BBVA (1.000 €, addebito a fine mese). Tutto modificabile, si possono aggiungere carte.
- Spese registrate con "+ Spesa con …" (o "Pagato con" nel movimento): sono uscite normali alla loro data; il giorno dell'addebito il totale del mese (spese + rate PagoFlex) viene tolto dal conto della carta.
- **Disponibile = plafond − spese non ancora addebitate − capitale PagoFlex ancora da restituire.**
- PagoFlex (ING): su spese ≥ 200 € (minimo modificabile), 3/6/9/12 rate (o altro numero), commissione mensile 0,5% dell'importo (modificabile; da verificare sul contratto). La commissione diventa un'uscita "Carte › Commissioni PagoFlex" a ogni addebito; il capitale no, perché la spesa è già tra le uscite.
- **Rimborso rateale** (BBVA, Pay&Plan): come PagoFlex ma con commissione **fissa in € per tutto il piano**, divisa sulle rate (l'ultima assorbe gli arrotondamenti), da 50 €, 3/5/10 rate. Per carta: `pfNome`, `pfCommTipo` ('perc' | 'eur'); per piano `commTipo`. Pulsante "Rateizza" sulle spese.
- Rate con "Pagata da" una carta: alla scadenza diventano spese della carta e lasciano il conto con l'estratto.

### Rate
- **Acquisto pagato a rate dal modulo movimento**: spunta "Pagato a rate" (servizio, numero rate, prima rata, totale da rimborsare). Il movimento è la spesa (una volta, alla data dell'acquisto); il piano ha `tx` = id del movimento e `imp` = importo; alla scadenza ogni rata diventa un pagamento `t:'r'` dal conto/carta di "Rate pagate con"; gli interessi (totale − importo) diventano uscite `Rate › Interessi …` (`int:1`). Con rate già pagate il piano si modifica dalla sezione Rate.
- "+ Nuova rata" e "Servizi" in alto. In Da pagare le rate sono raggruppate per servizio; i servizi senza rate in corso restano nascosti e ricompaiono con una nuova rata.
- Due schede: **Da pagare** (piani in corso, con prossima scadenza e avanzamento) e **Pagate** (piani conclusi + storico dei pagamenti registrati).
- Nuova rata: metodo, prodotto, data acquisto, importo totale, numero rate, rate da pagare, data prossima rata, conto da cui viene pagata.
- **Pagamento automatico**: all'apertura dell'app (e ogni ora se resta aperta) ogni rata scaduta, oggi compreso, diventa un'uscita `Rate › <metodo>` con la data di scadenza, viene tolta dal saldo del conto scelto e segnata pagata. Il movimento ha id fisso `rt_<rata>_<n>` per non duplicarlo tra dispositivi.

## Modello dati (stato `S`)
- `tx`: `{id, d:'YYYY-MM-DD', t:'u'|'e'|'r'|'rb', cat, sub, det?, amt, note, carta?, pag?, conto?, rata?, quota?, gid?}`: `det` = terzo livello facoltativo (Mezzi › Auto › Gasolio): nel Mensile sotto la voce, e per Mezzi una riga "Carburante · tutti i mezzi" (dettagli Benzina/Gasolio e le vecchie voci Benzina …); **acquisto di gruppo** = `quota` (la mia parte): `amt` resta quanto pagato (conto, carta, rate si muovono su quello), statistiche (Panoramica, Mensile, categorie, ordine) usano `spesa(t)` = quota; `t:'rb'` = rimborso ricevuto per l'acquisto `gid`: entra nel conto scelto, non è un'entrata (Movimenti "Rimborso · …"); eliminando l'acquisto si eliminano anche i suoi rimborsi. Anche un piano creato da Rate → + Nuova rata può essere di gruppo (`rate[].quota`, parte mia del totale): ogni rata pagata (`t:'u'`) ha `quota` = rata × quota / tot, i rimborsi hanno `gid` = id del piano; cambiando la quota si aggiornano le rate già pagate; eliminando il piano si eliminano i rimborsi. I piani nati da un movimento "Pagato a rate" il gruppo lo hanno sul movimento. `t:'r'` = pagamento di una rata di un acquisto già registrato (toglie soldi ma non è una spesa: escluso da uscite, Mensile e Panoramica); `rata` = id del piano rate dell'acquisto: `carta` = carta di credito (va nell'estratto conto); `pag` = 'carta' (debito/prepagata) | 'conto' (bonifico, bollettino) | 'contanti' con `conto`: l'importo esce subito dal saldo del conto e torna indietro se la spesa viene modificata o eliminata: uscite con macro-categoria + sottovoce (Mezzi › Gommone, Casa › Spesa, Lavoro › Trading…); entrate per fonte + voce (Porto › CostaMed, Locali › Morgan…)
- `conti`: `{id, g:'Banche'|'Cash'|'Investimenti', n, v}`
- `rate`: `{id, tipo, prod, acq, tot, n, rata, pre, done, first, fi, conto}`: piano di n rate mensili (`rata` = tot/n, l'ultima assorbe gli arrotondamenti). `pre` = già pagate prima di inserirla, `done` = pagate dall'app; la rata i scade `first` + (i − `fi`) mesi. `conto` = id del conto da cui escono i soldi. Il vecchio formato `{tipo, prod, rata, res}` viene convertito da solo (senza data: va completato con Modifica).
- `inv`: `{id, n, lvl:0|1|2, inv, eff, agg}` in ordine (le sotto-voci seguono la voce che le contiene); modificabili dall'app (riquadro → + Aggiungi o tocca una riga); una voce con sotto-voci che hanno importi vale la loro somma (i suoi importi si ignorano, es. P2P Lending = Bondora); `agg` = data ultimo aggiornamento del valore; i totali usano solo `lvl 0`
- `carte`: `{id, n, plafond, tipo:'giorno'|'fine', giorno, conto, pf, pfMin, pfComm, dal, flex:[], es:[]}`. Le spese con carta sono movimenti con `carta`. Ciclo = mese della spesa; addebito il `giorno` del mese dopo (ING Oro, 10) o a fine mese (BBVA). `dal` = primo mese gestito (prima si considera già addebitato). `flex` = PagoFlex `{id, tx, desc, imp, n, comm, m0, done}`; `es` = estratti addebitati `{m, d, spese, pf, tot, conto}`.
- `opz`: impostazioni/flag (`contiBase`: conti ING, BBVA, N26, Buddy Bank, Wise creati una volta se mancavano; `storicoDal`: primo mese seguito dallo storico automatico)
- `storico`: una foto del patrimonio per mese `{m, d, tot, g:{Banche,Cash,Investimenti}, conti:[{n,g,v}], tipo}`; tipo `fine` (ultimo giorno del mese, aggiornata a ogni controllo di quel giorno), `tardi` (prima apertura dopo, saldi riportati a fine mese togliendo i movimenti registrati dall'app nel frattempo), `ora` (salvata a mano nelle versioni precedenti, sostituita da quella di fine mese), `inserito` (mese passato a mano o da CSV, mai sovrascritto)
- `abbo`: abbonamenti `{id, n, costo, freq (1/2/3/6/12 mesi), next, pag, cat, attivo}`; alla scadenza diventano un'uscita `cat › nome` pagata con `pag` (stessi valori del campo "Pagato con") e `next` avanza di `freq` mesi; id movimento `ab_<id>_<data>`
- Investimenti: le voci principali hanno `tipo` ('azioni' | 'crypto' | 'p2p' | 'altro', dedotto dal nome se manca); la pagina mostra un riquadro per tipologia (chiamati col nome della piattaforma: Interactive Brokers, Crypto.com, Bondora, Crowdcube) con totale, investito e rendimento, logo leggermente sfocato come sfondo; la pagina ha solo i quattro riquadri, il tocco apre il riepilogo della tipologia (valore, investito, rendimento, voci da modificare, + Aggiungi; modifica e annulla tornano al riepilogo). Voci IBKR e Crowdcube create una volta (`opz.invTipi`). "IBKS" = Interactive Brokers (logo e tipologia Azioni); una volta (`opz.invIbks`) la voce "Interactive Brokers" creata in automatico si unisce a IBKS se esiste. Una volta (`opz.invGruppi`) ogni tipologia ha la sua voce principale con le piattaforme dentro: Azioni → IBKS/Interactive Brokers, Varie → Crowdcube (come Criptovalute e P2P Lending). Il riquadro elenca le piattaforme (sotto-voci).
- `servizi`: elenco dei servizi delle rate (PayPal, Klarna, Scalapay, Findomestic, Compass…), modificabile.
- `trading`: `{id, d, v}`

## Come lavoro (dal mio file Numbers 2026)
Fogli: CONTABILITA (uscite per macro-categoria/sottovoce × 12 mesi, entrate, situazione finanziaria con Liquidità e Patrimonio), Rate (PayPal), RIEPILOGO INVESTIMENTI, P&L (trading giornaliero, vuoto), SPESE CARTA DI CREDITO (vuoto). Ho 239 movimenti mensili storici da importare: le celle mensili sono state convertite in movimenti datati il giorno 1 di ogni mese.

## Import CSV (già implementato)
Separatore `;` o `,`, decimali con virgola, date `YYYY-MM-DD` o `DD/MM/YYYY`.
- Movimenti: `data;tipo;categoria;voce;importo;nota` (tipo = uscita|entrata)
- Conti: `gruppo;nome;saldo`
- Rate: `metodo;prodotto;rata;residue;prossima rata;conto` (ultime due facoltative; conto = nome del conto in Patrimonio)
- Investimenti: `voce;livello;investito;attuale`
- Storico patrimonio: `mese;banche;cash;investimenti` (mese `2026-03`, `03/2026` o `01/03/2026`)
- Trading: `data;importo`
Opzione "Sostituisci" per cancellare i dati di quel tipo prima di importare.

## Privacy / sicurezza (decisioni e piano)
- I CSV con i dati reali **non vanno mai nel repo**: aggiungere `*.csv` e i backup `.json` al `.gitignore`.
- Il sito su GitHub Pages è pubblico anche con repo privato: i dati devono stare solo nel database, mai nell'HTML.
- Firestore: salvare sotto `users/{uid}/...` con regole che permettono accesso solo al proprietario (`request.auth.uid == uid`), eventualmente ristretto alla mia email Google.
- Valutare **cifratura end-to-end** nel browser: AES-GCM (Web Crypto API) con chiave derivata da passphrase, cifrando prima di salvare e decifrando dopo la lettura, tutto dentro `store.get/set`. Se perdo la passphrase i dati non si recuperano. Possibile sblocco con Face ID/WebAuthn.

## Prossimi passi
1. ~~Repo con `index.html`, `.gitignore`, riepilogo~~ fatto (`.gitignore` esclude `*.csv`, `*.json`, `*.numbers`, `*.xlsx`).
2. ~~Firebase + login~~ fatto (email/password): manca la configurazione nella console (sezione sopra).
3. ~~Cifratura con passphrase~~ fatto. Possibile in futuro: sblocco con Face ID/WebAuthn.
4. Pubblicare su GitHub Pages, importare i CSV dall'app.
5. Poi rifinire: categorie modificabili/riordinabili, budget mensili, grafici per voce, import dal CSV della carta/banca, eventuale PWA (icona sulla home iPhone).
6. Limite da tenere a mente: ogni sezione è un documento Firestore (max 1 MiB): i movimenti ci stanno per molti anni (~5–6 mila movimenti), oltre andranno divisi per anno.

## Note sui dati del foglio (da verificare)
- Nel foglio Investimenti la riga Criptovalute mostra -29% con 4.898 € investiti e 8.181 € attuali: la % del foglio non coincide, nell'app è ricalcolata.
- Bondora risulta 4.148 € in Investimenti e 4.290 € in Situazione Finanziaria.
- Nov/Dic 2026 contengono già 76,76 € di ricorrenti inseriti nel foglio.

## Mezzi (app del gommone) — scadenze in sola lettura
- Impostazioni → Mezzi: accesso con l'account di Mezzi (una volta per dispositivo; flag `localStorage 'bilancio:bordo'`). Seconda app Firebase con nome `bordo` sul progetto `app-gommone` (config pubblica `BORDO_CFG` nell'HTML).
- Legge `users/{uid}/data/{chiave}` (`{value: JSON}`): `auto_|scooter_|moto_` + `insurances|bollo|revisioni`, e per il gommone `insurances`, `carrelloInsurances`, `carrelloBollo`, `carrelloRevisioni`. Ogni voce `{scadenza, premio|importo, compagnia}` è un periodo pagato: la scadenza della più recente è il prossimo pagamento (importo = l'ultimo pagato, `?` se mai inserito); quelle già rinnovate risultano pagate (importo del rinnovo).
- Le scadenze compaiono in Panoramica → Da pagare (nel loro mese) e in Abbonamenti → "Da Mezzi". Restano solo in memoria: non entrano nei dati cifrati di Bilancio e in Mezzi non si scrive nulla. Rilettura all'avvio e al ritorno in primo piano (dopo 10 minuti) o con "Aggiorna".
- **Importazione in Mezzi** (attiva al primo collegamento, `S.opz.bordoImp = {on, dal, pag, pagDal, fatti}`; `dal` = "Importa dal" in Impostazioni, 1° gennaio 2026): tutte le spese degli elenchi di Mezzi (`auto_|scooter_|moto_expenses`, `expenses` per gommone e carrello), tranne quelle con la spunta "da non conteggiare / fatta da altri" (`excluded`) e quelle con data futura. Struttura **per mezzo** con terzo livello `det`: Mezzi › Auto (Gasolio, Manutenzione ordinaria/straordinaria, Tagliando, Revisione, Assicurazione, Bollo, Acquisti, Spese varie) · SH e Moto (Benzina, Manutenzione ordinaria/straordinaria, Tagliando, Revisione, Assicurazione, Bollo) · Gommone (Acquisti, Benzina, Ormeggio, Manutenzione straordinaria, Lavori, Assicurazione, Bollo; il carrello finisce qui). Categorie vecchie di Mezzi nel dettaglio più vicino (`BORDO_IMP[].det`). La scheda collegata via `expenseId` dà mezzo e dettagli nella nota. Movimento `bf_<elenco>:<id spesa>` con `bf`, `bfAmt`, `bfD`. Voce, dettaglio e nota seguono sempre Mezzi; importo, data e conto finché non li modifichi in Bilancio. Conti: prima di `pagDal` nulla (già nei saldi); dopo, il **metodo scelto in Mezzi** (`pagId` = id di Bilancio, es. `k:ing-oro`) o quello predefinito (Impostazioni → "Senza metodo in Mezzi"). Spesa nuova **a rate** in Mezzi (`installments`, `installmentCount`, `installmentAmount`, `installmentService`): acquisto + piano rate (servizio, rate dal conto/carta di "Pagato con", prima rata un mese dopo). Eliminati/esclusi in Mezzi si tolgono qui (col loro piano se nessuna rata è pagata) e se ricompaiono tornano; eliminati in Bilancio non tornano (`fatti`). Impostazioni avvisa delle spese di Mezzi registrate a mano nello stesso periodo (doppioni) e il modulo del movimento, scegliendo Mezzi, ricorda di registrarle in Mezzi.
- **Elenco pagamenti per Mezzi**: a ogni lettura, se è cambiato, Bilancio scrive `users/{uid}/data/bilancioPagamenti` = `{pagamenti:[{id, label, g}], servizi}` (carte di credito, carte di debito, conti, contanti; solo i nomi, mai saldi). Mezzi lo usa per "Pagato con" in tutti i moduli di spesa (ramo `claude/integrazione-bilancio` del repo App-Gommone).
- Spese di Mezzi registrate prima (Numbers, a mano) spostate una volta nella struttura per mezzo (`opz.mezziPerMezzo`): Benzina Golf → Auto › Gasolio, Benzina SH → SH › Benzina, Benzina Gommone → Gommone › Benzina, Golf → Auto.
- Se la lettura dà "accesso negato", sono le regole Firestore del progetto `app-gommone` a non permetterla con quell'account.

## Dashboard di Giordano (`dashboard.html`)
- Pagina a sé nello stesso repo (stesso indirizzo di Bilancio: `…/dashboard.html`), icona `dashboard-180.png` / `dashboard-512.png` / `dashboard-favicon.png`, da aggiungere alla schermata Home come "Dashboard". Stile vetro scuro e fumé con accento arancione #F2711C (come il reel "Admin Dashboard V7"), Manrope + JetBrains Mono.
- Nessun dato proprio: apre `index.html` in un iframe nascosto (stessa origine) e legge i numeri con `contentWindow.eval` dentro il contesto di Bilancio (`estrai()` usa `S`, `spesa`, `rateDelMese`, `abboDelMese`, `bordoDelMese`, `bordo.voci`…), quindi coincidono con l'app; ricerca tra i movimenti allo stesso modo (`cerca()`). Se Bilancio è bloccato (cloud senza chiave ricordata) l'iframe compare in una finestra "Sblocca Bilancio" e si richiude da solo dopo lo sblocco. Rilettura ogni 30 s e al ritorno in primo piano.
- Contenuto: saldo del mese (entrate − uscite, quota mia per gli acquisti di gruppo), Da pagare del mese, patrimonio e liquidità, prossima scadenza; grafico entrate/uscite dell'anno; Mezzi (spese dei mezzi dell'anno per mezzo, link all'app `https://gasbarrigiordano-max.github.io/App-Gommone/`); I miei mezzi (Auto, SH, Gommone: spesa dell'anno, voci principali, ultima spesa, prossima scadenza da Mezzi); a destra conti/mezzi/rate attive, calendario con rate e scadenze, "In programma" (scadenze di Mezzi, prossima rata di ogni piano, rinnovi degli abbonamenti).

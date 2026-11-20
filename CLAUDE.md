# Dashboard di Giordano (dashgio)

## Regola fissa: pubblicare sempre in automatico

Ogni volta che l'utente chiede una modifica, senza aspettare altre conferme:

1. Fai la modifica, commit e push sul branch di lavoro.
2. Apri tu la pull request verso `main`.
3. Uniscila subito con il merge normale ("merge", non "squash"), così il sito (GitHub Pages da `main`) si aggiorna da solo.
4. Alla fine dai all'utente il link della pull request.

L'utente l'ha chiesto espressamente: non deve aprire né unire nulla a mano.

## App

Vedi README.md. `locali/` è la dashboard da PR (prima nel repo dashboard-locali, ora integrata qui):
tavoli per serata e percentuale calcolata da sola, dati in `bilancio/{uid}/locali/locali`.
Percentuali: Room 26 15%, In Space 20% (HYN sul sito Elite), Grotta Aurelia 15%, Sunbay 15%. Zona Calda non è un
locale ma un'organizzazione: niente tavoli e tutto diviso per serata. `serate` (id, nome, data) e `spese` (data, importo,
descrizione, categoria, serata = id o "" per le spese generali, nota, pagata) nella stessa voce; riepiloghi per serata
(Tutte le serate: confronto tra serate e categorie; una serata: totale, da pagare, per categoria, elenco).
Spese fisse (`fisse`: desc, cat, importo, nota) = modello uguale per ogni serata (affitto, luci, service…): entrano da sole
nelle serate nuove (e con "Aggiungile" in quelle già create) come spese con `tipo:"fissa"` e `fissa` = id del modello; le altre
(bar, DJ, SIAE, sicurezza…) sono `tipo:"variabile"`, inserite serata per serata. Riepiloghi fisse/variabili per serata e in totale.
Zona Calda è anche l'altro progetto: il sito zonacaldaclubuse.it (repo `sito-zonacalda`: lista, inviti, porta, staff,
backstage, regia, Foglio Google). Nella sezione ci sono i link alle sue pagine. Le serate si creano dall'app ("+ Serata");
`ZC_SERATE` (locali/index.html) ha quelle di partenza (28 novembre). Loghi in `locali/loghi/` con i colori originali (non adattati come sul sito Elite); Sunbay ancora da avere.
Le percentuali si cambiano: per locale (bottone della percentuale sulle schede della Panoramica, o matita del locale;
vale per i tavoli nuovi) e tavolo per tavolo (campo Percentuale nel modulo del tavolo).

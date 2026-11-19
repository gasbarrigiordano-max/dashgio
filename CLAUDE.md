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
Percentuali: Room 26 15%, In Space 20% (HYN sul sito Elite), Grotta Aurelia 15%, Sunbay 15%; Zona Calda ha una
gestione separata (niente tavoli, niente totali). Loghi in `locali/loghi/`; Grotta Aurelia e Sunbay ancora da avere.
Le percentuali si cambiano: per locale (bottone della percentuale sulle schede della Panoramica, o matita del locale;
vale per i tavoli nuovi) e tavolo per tavolo (campo Percentuale nel modulo del tavolo).

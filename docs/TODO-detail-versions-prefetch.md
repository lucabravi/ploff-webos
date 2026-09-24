# TODO — Versioni multi-server e prefetch stagione

Stato aggiornato il **2026-09-21** sulla base dell’implementazione `fde36c2`.
Il fix fondamentale delle versioni episodio multi-server è implementato e l'utente ne ha confermato il funzionamento sulla TV reale. Le voci ancora aperte sotto sono verifiche fisiche aggiuntive o casi limite, non indicano che il bug principale sia ancora aperto.

## Stato confermato

- [x] Le versioni dello stesso episodio provenienti da PMS diversi vengono recuperate e mostrate nel Detail quando l'aggregazione multi-server è abilitata.
- [x] Se gli episodi iniziali della stagione non contengono ancora le varianti esterne, il Detail recupera le copie mancanti in batch a livello stagione, evitando una ricerca GUID per ogni episodio.
- [x] La risposta `/children` della stagione conserva `Media/Part` per ciascuna copia PMS e alimenta profili leggeri riutilizzabili dal selettore Versione.
- [x] Non vengono avviate richieste `MediaProfile` speculative per ogni episodio non selezionato.
- [x] Quando la stagione è nota come multi-server, la riga Versione riserva subito lo spazio delle frecce senza dichiarare ciclabile l'episodio: le frecce diventano visibili/ciclabili quando quello specifico episodio ha più versioni riproducibili, sia come più Media/Part sullo stesso PMS sia come copie confermate su PMS diversi, con un leggero fade di opacità Chrome 53-safe.
- [x] Il cambio della copia PMS dell'episodio mantiene il contesto serie/stagione invece di riaprire il Detail come un nuovo contenuto.
- [x] Le risposte asincrone tardive sono subordinate all'intento corrente e non possono ripristinare una vecchia sorgente dopo cambio episodio/sorgente o uscita dal Detail.
- [x] La copia esterna continua a mantenere la propria ownership PMS; `ratingKey` non viene trattato come identificatore globale fra server.
- [x] Il caso reale che aveva originato il bug è stato verificato sulla TV dall'utente ed è ora funzionante.

## Validazioni TV ancora aperte

- [ ] Con librerie separate, verificare che il selettore mostri solo le versioni della sorgente aperta.
- [ ] Scorrere rapidamente gli episodi avanti/indietro e cambiare stagione, verificando assenza di lampeggiamenti o sorgenti stale nel selettore.
- [ ] Cambiare versione, avviare la riproduzione e verificare server, episodio, audio e sottotitoli corretti; poi tornare dal Player e controllare il ripristino esatto del Detail.
- [ ] Ripetere con PMS esterno lento/offline e uscire dal Detail mentre le richieste sono ancora pendenti.
- [ ] Controllare stato visto, resume e refresh metadata dopo un cambio sorgente.
- [ ] Controllare invalidazione dopo cambio account, disabilitazione/riabilitazione server e modifica delle impostazioni di aggregazione.
- [ ] Verificare separatamente gli ingressi da Search e Watchlist e il comportamento con Home/librerie non aggregate.
- [ ] Valutare se applicare ai film lo stesso cambio sorgente senza riapertura della pagina usato per gli episodi con contesto serie.

## Implementazione corrente

- Il recupero delle varianti mancanti resta **batch a livello stagione**, ma il lavoro speculativo è subordinato all'episodio corrente: appena il profilo corrente è pronto viene inoltrato prima il candidato di prefetch ASS, poi parte al massimo una hydration multi-server in-flight per quella stagione. Repaint e apertura Versione si agganciano allo stesso batch invece di duplicarlo; un errore di trasporto resta ritentabile.
- I profili leggeri estratti da `/children` vengono mantenuti per coppia episodio/PMS e riutilizzati dal browser Versione; metadata completi e `Stream` vengono caricati solo per la copia effettivamente selezionata quando servono. Se un episodio manca sul PMS esterno resta non ciclabile solo quando possiede una singola versione locale; più Media/Part sul PMS primario continuano invece a rendere disponibile il ciclo Versione anche senza copie esterne.
- Le impostazioni di aggregazione restano vincolanti: le versioni multi-PMS non devono comparire quando la superficie corrente non è aggregata.
- Il Detail preserva `seriesContext`, stagione selezionata, episodio e focus durante il cambio copia PMS.
- La cache/stato delle varianti viene invalidata ai boundary già previsti dal lifecycle del Detail e non introduce un lifecycle parallelo.

## Nota release

Il fix principale è **chiuso e validato nel caso reale segnalato**. Questo documento non sostituisce la matrice completa di `docs/release-signoff/v1.0.8.md`: le validazioni TV ancora aperte sopra restano necessarie prima di considerare completata l'intera macro-area multi-server del signoff.

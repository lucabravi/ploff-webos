# Audit architetturale Player e lifecycle di riproduzione

## Baseline e risultato

Baseline autorevole: `ploff-webos-develop-61d7aa9-media-source-resolution-STANDALONE.zip`.
SHA-256 ZIP: `343391ad4c773f5dc27a90127f03d4ff9b30ca2d450da7862813f62a8bf35227`.
Branch iniziale: `develop`; HEAD iniziale: `61d7aa9575cf1da5863d6bd99e9742e2c8722ff0`.
Il checkout iniziale era pulito e la verifica completa della baseline e' passata.
Non sono stati usati checkout precedenti come base, aggiornate dipendenze o fatti push.

**Decisione:** mantenere i confini di clock, seek, recovery, renderer e coda che hanno
responsabilita' distinte, ma cambiare il contratto delle operazioni asincrone e della
chiusura. Il difetto dominante non era l'assenza di un'altra state machine: era la
mancanza di un proprietario affidabile per completamenti e risorse che sopravvivono
alla riproduzione o alla scelta che li ha creati.

Il lavoro e' implementato e committato. Non e' soltanto una proposta, una divisione
meccanica dei file o un insieme di nuovi test sopra il comportamento precedente.
Il vincolo Chrome 53 resta invariato.

## Cosa e' stato studiato

La lettura ha seguito il percorso Application -> caricamento differito Player ->
PlayerFeatureController -> PlaybackController -> Plex/native video, e il ritorno
attraverso reporting, sottotitoli, queue/Up Next e chiusura. Sono stati esaminati i
moduli Session, Timeline, Reposition, Recovery, Strategy, driver nativo, runtime e
sessione editor sottotitoli, resolver multi-server, controller coda e provider
paginati, insieme ai relativi harness e invarianti correnti.

Le regole storiche di non modifica non hanno determinato la scelta: il lavoro
modifica anche SubtitleRuntime e il coordinamento dei sottotitoli. Il worker/libass
non e' stato riscritto perche' i problemi riprodotti erano nell'ownership esterna,
non nel motore di rendering. Il sistema di clock e recovery non e' stato mantenuto
per inerzia: i suoi vincoli su HLS, offset, decoder e seek restano comportamenti
separati e ampiamente caratterizzati, che la nuova gestione asincrona deve rispettare.

La revisione e' stata condotta sul codice e sul diff in questa sessione; non e' stata
eseguita da un secondo revisore indipendente. Non sono state usate fonti web per
sostituire la semantica del codice fornito.

## Diagnosi: quattro durate diverse erano confuse

**Durata della feature.** Il Player viene costruito una volta e puo' attraversare
piu' riproduzioni. Il fatto che non sia distrutto non autorizza una callback nata
prima dell'uscita dalla schermata.

**Durata del playback e della sorgente.** Un singolo media puo' ricaricare la sorgente
per un seek, una scelta audio/sub o un recovery. La validita' del ratingKey o della
feature non dimostra che un vecchio prepare, renderer load o native play sia attuale.

**Durata della richiesta.** Completamento di trasporto e durata dell'operazione non
coincidono: dopo la risposta puo' iniziare un caricamento del renderer. Alcuni adapter
completano sincronicamente prima di restituire l'handle; altri chiamano callback dopo
un abort. Booleani e contatori replicati gestivano questi casi in modo diverso.

**Durata della coda.** Origine e pagine bounded restano utili tornando a una playlist.
I comandi di attivazione, invece, devono scadere quando si esce o cambia playback.
Azzerare solo il countdown non cancellava metadata e risoluzione adiacente.

C'era inoltre una confusione di identita': il config mutabile della prossima sorgente
non deve diventare il trasporto del report finale del media precedente.

## Problemi riprodotti prima delle correzioni

I test aggiunti non verificano solo la presenza di nomi o helper. Esercitano callback,
scritture della sorgente, offset, configurazioni, eventi nativi e cleanup reali dei
controller con adapter deterministici.

| Sequenza riprodotta | Comportamento errato osservato |
|---|---|
| Due selezioni audio terminano in ordine inverso | L'ultima callback obsoleta reinstalla una sorgente al vecchio offset. |
| Selezione iniziata a 10 s e completata a 30 s | Il rebuild torna al tempo di invio anziche' usare la posizione corrente. |
| `play()` di A resta pendente, parte B, A rigetta | Il pending di B viene liberato; un altro `canplay` emette un terzo `play()`. |
| Config candidato passa da PMS A a PMS B | Il report `stopped` del media A puo' essere inviato al PMS B. |
| Metadata/prepare completa due volte | La sorgente puo' essere installata nuovamente. |
| Cache ASS fallisce in modo asincrono e parte il caricamento diretto | Il chiamante conserva l'handle iniziale, non quello del fallback da cancellare. |
| Un restore dell'editor ASS termina dopo un nuovo playback | Il restore puo' ricostruire o spostare la sorgente successiva. |
| Vecchio load renderer termina dopo dispose | La cache del runtime puo' essere aggiornata da un caricamento obsoleto. |
| Abort, dispose, native pause o report finale genera un errore | La sequenza di rilascio puo' interrompersi lasciando stato/risorse attivi. |
| Callback di un vecchio timer viene consegnata dopo reset | Puo' interferire con reporting/keepalive del playback nuovo. |
| Si esce mentre metadata o risoluzione adiacente sono pendenti | Il completamento puo' ancora pubblicare un'attivazione del Player. |
| Arriva il report finale di A mentre B e' attivo | L'interfaccia di fine riproduzione di B puo' essere azzerata. |

Le prove RED/GREEN sono conservate negli allegati di verifica. I primi tentativi
con problemi di cablaggio degli harness o esecuzioni incomplete sono etichettati
separatamente: non vengono presentati come verifiche riuscite.

## Alternative e scelta

**Riscrivere tutto come state machine:** scartato. Buffering, seek, readiness del
media element, editor, rete e delivery sono dimensioni parzialmente indipendenti.
Un solo enum rischierebbe di moltiplicare gli stati o aggiungere un'altra autorita'
sopra i flag esistenti. Non risolve da solo l'handle restituito dopo supersessione o
il config sbagliato nel report finale.

**Spezzare i due file grandi in ulteriori facade:** scartato come obiettivo primario.
Ridurre la lunghezza del file spostando callback non possedute altrove lascerebbe
intatto il problema. Il coordinamento tra domini rimane dove il suo ordine e'
visibile e testabile.

**Ownership esplicita, configurazione per playback e rilascio ordinato:** scelto.
Introduce un solo concetto riutilizzabile, piccolo e senza policy, ed elimina le
implementazioni locali diverse dello stesso protocollo di cancellazione.

## Soluzione implementata

### 1. Una sola primitive per un'operazione sostituibile

`app/playback-operation.js` (99 righe, incluse righe vuote e commenti) espone:

```js
var slot = PlaybackOperation.create({ onAbortError: reportError });
var operation = slot.begin();
operation.run(startTransport, onComplete);
operation.current();
slot.pending();
slot.cancel();
slot.destroy();
```

Lo slot pubblica il nuovo proprietario prima dell'abort del precedente. Consegna
una risposta una volta sola, gestisce completamenti sincroni e handle tardivi,
protegge callback rientranti e resta invalidato anche se abort fallisce. `destroy`
e' terminale. Un errore dell'observer diagnostico non puo' annullare la cancellazione.
Gli errori del consumer non vengono genericamente inghiottiti.

Playback possiede slot distinti per load, source, selection, local subtitle,
editor track ed editor restore: non condividono tutti la stessa cancellazione.
SubtitleRuntime possiede il caricamento del renderer; la coda possiede metadata.
Non sono stati aggiunti scheduler, event bus, service locator, nuove dipendenze,
Promise, timer di polling o registro globale di operazioni.

### 2. Transazione di selezione e protezione native play

`applySelection(mode, callback)` riunisce persistenza della scelta, prosecuzione
sottotitoli e commit della sorgente. Solo l'intento locale corrente puo' proseguire.
La posizione viene letta al commit o dal seek gia' pendente. Restano esplicite le
differenze fra track, version e settings; non e' stato cambiato il ranking dei media.

PlaybackSession assegna un token a ogni native play. Una rejection puo' terminare
solo l'emissione che l'ha prodotta, non il pending successivo. I guard di readiness
per sorgente e il retry bounded gia' esistente restano separati.

### 3. Identita' di trasporto per playback

PlaybackController copia il config all'apertura. Chiude/reportizza l'uscente con il
suo binding e poi installa quello entrante. Il percorso metadata -> open porta il
config catturato; un reopen interno conserva quello attuale. Timeline si ribinda
con `reset(config)`. Anche le compensazioni degli offset dell'editor conservano il
PMS d'origine. Non vengono introdotti nuovi token nei log pubblici o nello storage.

### 4. Chiusura che prima revoca e poi rilascia

Il playback viene staccato prima di abort, dispose e operazioni native. Il barrier
sincrono `closing` respinge eventi e aperture rientranti durante il rilascio. Ogni
release viene tentata anche se una precedente fallisce; il primo errore viene
propagato dopo il cleanup. Destroy diventa terminale prima di toccare risorse esterne
e tenta anche l'unbinding dei listener.

Il driver tenta pause, rimozione src e load anche se pause genera errore. Timeline
revoca gli handle prima di clear e scarta callback dei timer ritirati. SubtitleRuntime
revoca renderer e cache prima della dispose esterna. Il fallback ASS restituisce un
handle dell'intera catena, non della richiesta presente al momento del ritorno.

### 5. Comandi coda separati dalla cache

`cancelPendingPlayback()` invalida metadata, adjacent, index activation, direct
start e autoplay senza cancellare origine e pagine bounded. E' usato dal reset di
sessione e dall'uscita del Player. Il confine feature controlla anche la propria
generazione prima di consegnare metadata a un nuovo playback.

Una pagina gia' in volo puo' ancora terminare e alimentare la cache bounded: e' un
comportamento intenzionale, non un'autorizzazione a riaprire la schermata. I test
provano sia l'assenza dell'attivazione tardiva sia il riuso della pagina senza
un'altra richiesta. Un report finale tardivo non azzera la UI del playback attivo.

## La complessita' e' diminuita o solo spostata?

E' diminuito il numero di protocolli diversi per la stessa responsabilita'. Non e'
stata creata una superclass Player o spostata l'orchestrazione in un nuovo manager.
Le condizioni di validita' delle risposte sono verificabili attraverso un solo
contratto, riutilizzato con durate esplicite. La selezione ha un solo percorso di
commit; config e teardown hanno confini leggibili.

Non dichiaro una riduzione globale delle righe: nei nove file runtime scritti a
mano coinvolti il saldo e' **+126 righe**. PlaybackController scende da **3.018 a
2.974**, QueueController da **1.339 a 1.335**; PlayerFeature cresce da **3.008 a
3.018**. Il nuovo owner, le protezioni e i commenti costano codice. I file grandi
restano grandi: il risultato non e' una riscrittura totale del progetto.

Il beneficio misurato e' soprattutto l'eliminazione di classi concrete di callback
obsolete e cleanup incompleto. Spostare altre funzioni solo per ottenere un numero
piu' piccolo avrebbe peggiorato la chiarezza dei casi d'uso cross-domain.

## Prestazioni e Chrome 53

| Misura | Baseline | Implementazione |
|---|---:|---:|
| Core `app/app.js`, byte raw | 684.093 | 684.093 |
| Core gzip livello 9 | 135.639 | 135.639 |
| Player differito, byte raw | 460.722 | 462.719 |
| Player gzip livello 9 | 93.037 | 93.818 |
| Script di startup | 112 | 112 |
| JavaScript di startup del gate | 2.051.469 | 2.051.469 |

Gzip misurato con la stessa implementazione Node e livello del gate del repository,
non confrontando compressori diversi. Il Player cresce di 1.997 byte raw e 781 gzip;
il Core e' byte-identico. I budget non sono stati aumentati. Il nuovo modulo resta
nel bundle differito. Nessun preload catalogo, fan-out, intervallo aggiuntivo o
cambiamento di CSS e' introdotto. Non e' stata misurata un'accelerazione su TV.

Il gate ES5 passa su **182 file**, inclusi i bundle applicativi; controlla la sintassi
e il contratto runtime che vieta nuovi riferimenti a Promise. I file vendor sono
fuori da quel parser e sono rimasti invariati. La revisione delle nuove API non trova
nuove dipendenze da browser moderni. Questo conserva il contratto Chrome 53 ma non
sostituisce l'esecuzione sul browser/dispositivo effettivo.

## Test e verifiche

La verifica completa comprende **260 file di test unitari** (erano 256), baseline
shell, build corrente, worker invariati, release metadata, sintassi coordinator,
architettura, manutenibilita', feature contracts, budget, ES5, lint, typecheck dei
contratti e del progetto, asset e LG UX. Sono rimaste attive le suite precedenti di
seek, source/HLS clock, recovery, sottotitoli, coda paginata e composizione.

Le quattro suite nuove sono `test-playback-operation.js`,
`test-playback-controller-lifecycle.js`, `test-playback-controller-teardown.js` e
`test-player-feature-lifecycle.js`. Sono state estese anche Session, Timeline,
SubtitleRuntime e QueueController. La suite Operation comprende sostituzioni ripetute,
risposte duplicate, completamento sincrono, reentrancy, handle tardivi ed errori.

Comandi di accettazione:

```sh
npm run build:app
npm run verify
npm run test:memory
git diff --check
git fsck --no-dangling
```

Il test memoria usa 400 cicli per campione e sei campioni. Nel run successivo
all'integrazione: 0/200 payload trattenuti, 0/100 payload runtime, crescita netta
0,03 MiB. Il log finale allegato conserva anche il run di consegna. Non e' una prova
generale di assenza di leak o un benchmark di memoria sul televisore.

## Checkpoint

- `1d959f2`: audit e design prima delle modifiche produttive.
- `5b8fa87`: proprietario delle operazioni e token native play.
- `94fe398`: migrazione delle richieste, selezione e continuazioni sottotitoli.
- `3e0da5a`: binding del trasporto e teardown.
- `44d677f`: durata dei comandi coda e guard della feature.

Il commit documentale finale e il suo parent sono identificati nel manifesto di
consegna e con `git log`. Ogni modifica parte dalla stessa storia `develop`; nessun
push, squash della baseline o ricostruzione fittizia della storia. La verifica
completa finale, non solo i test focalizzati dei singoli checkpoint, e' il criterio
di accettazione del pacchetto.

## Limiti e accettazione sul dispositivo

Non sono disponibili in questo ambiente un TV LG, Chrome 53 reale o PMS raggiungibili
per un collaudo end-to-end. Le regressioni provano la semantica locale dei controller;
non costituiscono una garanzia distribuita sull'ordine in cui Plex applica richieste
gia' ricevute, ne' una certificazione delle prestazioni fisiche del decoder.

Prima di una release sul dispositivo, verificare: DP/DS/transcode con seek e resume;
cambi audio/sub/versione ravvicinati; ASS editor Apply/Cancel e uscita durante load;
A -> B con report finale e offset editor; Next/Prev/Up Next seguito da Back mentre
metadata e' pendente; errore/offline e reopen; piu' aperture/chiusure e ritorno alla
playlist con coda paginata. I log devono confermare il PMS giusto per ogni report,
assenza di riaperture spontanee e continuita' dei clock video/UI/sottotitoli.

L'audit non pretende di dimostrare che ogni possibile race del progetto sia sparita.
Consegna un contratto piu' piccolo da ragionare, implementazioni convergenti e prove
ripetibili delle classi di difetti effettivamente riprodotte.

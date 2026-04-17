# Ciao Giulio! Benvenuto nel progetto spoki-post-sales

Il tuo branch e' `Riccardo`.

Questo documento ti spiega come funziona il progetto e cosa puoi chiedere a Cursor di fare per te. Non devi imparare comandi o usare il terminale: apri la chat di Cursor e chiedi quello che ti serve.

---

## Come funziona

**Il progetto e' una cartella di file sul tuo computer.** Quando "cloni" il progetto, ne scarichi una copia completa da internet. Da quel momento lavori su file che stanno nella tua macchina, come qualsiasi altra cartella.

**Git tiene traccia delle modifiche.** E' uno strumento che registra ogni cambiamento ai file e permette a piu' persone di lavorare sullo stesso progetto senza sovrascriversi a vicenda.

**Il branch e' la tua copia di lavoro.** Ognuno ha il suo branch. Il tuo si chiama `feature/giulio`. Le modifiche che fai restano nel tuo branch finche' non vengono integrate nel progetto principale.

**Commit e push: salvare e condividere.** "Commit" salva un punto di avanzamento sul tuo computer. "Push" invia quel punto al server condiviso cosi' anche gli altri possono vederlo.

**Cursor fa il lavoro tecnico al posto tuo.** Apri la chat (`Cmd+L` su Mac, `Ctrl+L` su Windows), scrivi `@START-HERE.md` seguito da cosa vuoi fare, e Cursor leggera' queste istruzioni per eseguire l'azione corretta.

---

## Prima di aprire Cursor (da fare a mano)

Queste tre cose vanno installate una sola volta. Sono le uniche azioni che devi fare senza Cursor.

1. **Scarica e installa Cursor** da [cursor.com](https://www.cursor.com)
   - Mac: apri il file `.dmg` e trascina Cursor nella cartella Applicazioni
   - Windows: esegui il file `.exe` e segui le istruzioni

2. **Scarica e installa Node.js 20+** da [nodejs.org](https://nodejs.org) -- scegli la versione **LTS**
   - Mac e Windows: esegui l'installer e segui le istruzioni

3. **Verifica che Git sia presente**
   - Mac: Git e' gia' incluso, non devi fare nulla
   - Windows: se non e' installato, scaricalo da [git-scm.com/download/win](https://git-scm.com/download/win)

---

## Cosa chiedere a Cursor

Apri Cursor, premi `Cmd+L` (Mac) o `Ctrl+L` (Windows) per aprire la chat, e copia una di queste frasi. Ricordati di scrivere `@START-HERE.md` all'inizio cosi' Cursor sa dove trovare le istruzioni.

---

### "Clona il progetto e passa al mio branch"

**Cosa succedera'**: Cursor scarichera' il progetto dal server e passera' alla tua copia di lavoro.

> Istruzioni per Cursor: esegui i seguenti comandi nel terminale, uno alla volta. Se il clone fallisce per problemi di autenticazione, spiega all'utente che deve creare un Personal Access Token su https://github.com/settings/tokens con permesso `repo` e usarlo come password.
> ```
> git clone https://github.com/Spoki-App/spoki-post-sales.git
> cd spoki-post-sales
> git checkout feature/giulio
> ```

---

### "Configura l'ambiente"

**Cosa succedera'**: Cursor creera' il file di configurazione. Poi ti dira' quali valori servono -- dovrai chiederli a Giulio.

> Istruzioni per Cursor: esegui il comando seguente per creare il file di configurazione locale. Poi spiega all'utente che deve chiedere a Giulio i valori da inserire in `.env.local`. I campi minimi per far funzionare il progetto sono: le credenziali Firebase (Client + Admin), il `DATABASE_URL` per PostgreSQL, e `HUBSPOT_API_KEY`.
> ```
> cp .env.example .env.local
> ```

---

### "Installa le dipendenze e prepara il database"

**Cosa succedera'**: Cursor scarichera' le librerie necessarie e creera' le tabelle nel database. Puo' richiedere qualche minuto.

> Istruzioni per Cursor: esegui i seguenti comandi in sequenza. Il primo installa le dipendenze Node.js, il secondo esegue le migrazioni del database PostgreSQL. Se `npm run migrate` fallisce, probabilmente il `DATABASE_URL` in `.env.local` non e' corretto.
> ```
> npm install
> npm run migrate
> ```

---

### "Avvia il progetto"

**Cosa succedera'**: Cursor avviera' il server di sviluppo. Poi potrai aprire il browser su http://localhost:3000 per vedere il progetto.

> Istruzioni per Cursor: esegui il comando seguente. Il server Next.js partira' su http://localhost:3000. Conferma all'utente che puo' aprire quell'indirizzo nel browser. Per fermare il server in seguito, basta premere `Ctrl+C` nel terminale.
> ```
> npm run dev
> ```

---

### "Salva e invia le mie modifiche"

**Cosa succedera'**: Cursor salvera' le tue modifiche e le inviera' al server condiviso. Ti chiedera' una breve descrizione di cosa hai cambiato.

> Istruzioni per Cursor: chiedi all'utente una breve descrizione di cosa ha modificato, poi esegui i seguenti comandi. Sostituisci il messaggio tra virgolette con la descrizione fornita dall'utente.
> ```
> git add .
> git commit -m "descrizione delle modifiche"
> git push
> ```

---

### "Aggiorna il mio branch con le ultime novita'"

**Cosa succedera'**: Cursor scarichera' le ultime modifiche dal progetto principale e le integrera' nel tuo branch.

> Istruzioni per Cursor: esegui il comando seguente. Se ci sono conflitti, spiega all'utente quali file sono in conflitto e aiutalo a risolverli.
> ```
> git pull origin main
> ```

---

### "Fammi vedere cosa ho modificato"

**Cosa succedera'**: Cursor ti mostrera' la lista dei file che hai cambiato dall'ultimo salvataggio.

> Istruzioni per Cursor: esegui `git status` e presenta i risultati in modo chiaro all'utente, spiegando quali file sono stati modificati, quali sono nuovi e quali sono pronti per il commit.
> ```
> git status
> ```

---

## Se qualcosa non va

Scrivi nella chat di Cursor cosa e' successo -- descrivi il problema con parole tue e Cursor provera' a risolverlo. Se non riesce, chiedi a Giulio.

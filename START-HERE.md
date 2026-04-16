# Ciao Giulio! Benvenuto nel progetto spoki-post-sales

Il tuo branch e' `feature/giulio`.

Questa checklist ti guida dal primo avvio fino alle operazioni di tutti i giorni. Spunta ogni voce man mano che la completi. Se hai dubbi su un passaggio, apri la chat di Cursor (`Cmd+L` su Mac, `Ctrl+L` su Windows), scrivi `@START-HERE.md` e chiedi ad esempio: *"come faccio il punto 4?"*

---

## Primo setup

### Strumenti da installare

- [ ] **Cursor** -- scaricalo da [cursor.com](https://www.cursor.com). Su Mac: apri il `.dmg` e trascina in Applicazioni. Su Windows: esegui il `.exe`.
- [ ] **Node.js 20+** -- scaricalo da [nodejs.org](https://nodejs.org) (versione LTS). Dopo l'installazione, verifica nel terminale:
  ```
  node -v
  ```
  Deve restituire `v20` o superiore.
- [ ] **Git** -- su Mac e' gia' presente (prova `git --version`). Su Windows: [git-scm.com/download/win](https://git-scm.com/download/win).

### Clonare il progetto

- [ ] Apri il terminale di Cursor (`Cmd+`` su Mac, `Ctrl+`` su Windows) e lancia:
  ```
  git clone https://github.com/Spoki-App/spoki-post-sales.git
  ```
  Se GitHub chiede le credenziali, usa il tuo username e un **Personal Access Token** come password ([crealo qui](https://github.com/settings/tokens) con permesso `repo`).
- [ ] Apri la cartella clonata in Cursor: **File > Open Folder** e seleziona `spoki-post-sales`.

### Passare al tuo branch

- [ ] Nel terminale integrato di Cursor, lancia:
  ```
  git checkout feature/giulio
  ```
- [ ] Verifica di essere sul branch giusto:
  ```
  git branch
  ```
  Deve apparire `* feature/giulio`.

### Configurare l'ambiente

- [ ] Copia il template delle variabili d'ambiente:
  ```
  cp .env.example .env.local
  ```
- [ ] Apri `.env.local` e compila i valori. Chiedi a Giulio un file di riferimento gia' compilato. I campi minimi per far funzionare il progetto sono:
  - **Firebase** (Client + Admin) -- credenziali del progetto Firebase Spoki
  - **PostgreSQL** -- il campo `DATABASE_URL` con la stringa di connessione al database
  - **HubSpot** -- `HUBSPOT_API_KEY`

### Installare e avviare

- [ ] Installa le dipendenze:
  ```
  npm install
  ```
- [ ] Crea le tabelle nel database:
  ```
  npm run migrate
  ```
- [ ] Avvia il server di sviluppo:
  ```
  npm run dev
  ```
- [ ] Apri il browser su **http://localhost:3000** -- se vedi la pagina del progetto, il setup e' completo!

---

## Operazioni quotidiane

### Avviare il progetto
```
npm run dev
```
Il server parte su http://localhost:3000. Per fermarlo: `Ctrl+C` nel terminale.

### Salvare le tue modifiche (commit + push)
```
git add .
git commit -m "descrizione di cosa hai modificato"
git push
```

### Vedere cosa hai modificato
```
git status
```
Oppure usa il pannello **Source Control** nella barra laterale sinistra di Cursor (icona con i rami).

### Aggiornare il tuo branch con le novita' da main
```
git pull origin main
```
Se ci sono conflitti, Cursor li evidenziera' nei file -- risolvili e poi fai commit.

---

## Cursor in 60 secondi

| Azione | Mac | Windows |
|--------|-----|---------|
| Aprire/chiudere il terminale | `Cmd+`` | `Ctrl+`` |
| Chat con l'AI | `Cmd+L` | `Ctrl+L` |
| Cercare un file per nome | `Cmd+P` | `Ctrl+P` |
| Pannello Source Control (Git) | Clicca l'icona nella barra laterale sinistra | Idem |

**Trucco utile**: nella chat AI, scrivi `@` seguito dal nome di un file per dargli contesto. Ad esempio `@START-HERE.md come faccio a pushare le modifiche?` e l'AI ti rispondera' usando le istruzioni di questo documento.

---

Se qualcosa non funziona, chiedi a Giulio.

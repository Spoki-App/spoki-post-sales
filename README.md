# Spoki Post-Sales Dashboard

Customer Success Dashboard per il reparto Post-Sales di Spoki. Si integra con HubSpot per sincronizzare clienti, contatti, ticket e engagement.

**Stack**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, PostgreSQL (Neon), Firebase Auth, Vercel.

## Setup

### Prerequisiti

- Node.js 20+
- Un database PostgreSQL (es. [Neon](https://neon.tech))
- Un progetto Firebase con Authentication abilitata
- Una API key HubSpot

### Installazione

```bash
git clone git@github.com:Spoki-App/spoki-post-sales.git
cd spoki-post-sales
npm install
```

### Variabili d'ambiente

```bash
cp .env.example .env.local
```

Compila `.env.local` con le credenziali. Chiedi al team i valori corretti per Firebase, PostgreSQL e HubSpot.

### Database

Esegui le migrazioni per creare le tabelle:

```bash
npm run migrate
```

### Avvio

```bash
npm run dev
```

L'app sara disponibile su [http://localhost:3000](http://localhost:3000).

## Script disponibili

| Script | Descrizione |
|--------|-------------|
| `npm run dev` | Avvia il server di sviluppo |
| `npm run build` | Build di produzione |
| `npm run start` | Avvia il server di produzione |
| `npm run lint` | Esegue ESLint |
| `npm run migrate` | Esegue le migrazioni del database |

## Deploy

Il progetto e' configurato per il deploy su [Vercel](https://vercel.com). Le variabili d'ambiente vanno configurate nel pannello Vercel del progetto.

## Changelog

### 2026-04-07

- **Workflow enrollment**: dalla pagina dettaglio cliente e' possibile enrollare companies, contatti e ticket nei workflow HubSpot (via v4/v2 API)
- **Colonna Onboarding**: mostra lo stage del ticket nella pipeline di onboarding, cliccabile per aprire il ticket su HubSpot
- **Colonna Ticket Support**: mostra i ticket aperti nella pipeline Support con stage, cliccabile
- **Colonna Ultimo contatto**: mostra tipo di engagement (Chiamata/Email/Meeting), quanto tempo fa e chi ha gestito il contatto
- **Sync engagement migliorata**: scarica engagement anche dai contatti associati alle companies, non solo quelli associati direttamente alla company
- **Property mapping**: colonna Piano ora legge da `plan_activated`, colonna Rinnovo da `plan_expire_date`
- **Migrazione sicura**: rimosso connection string hardcoded dallo script di migrazione, ora usa `DATABASE_URL` da `.env.local`
- **Script migrate**: esegue automaticamente tutti i file `.sql` in ordine

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

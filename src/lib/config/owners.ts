export type HubSpotTeam = 'Customer Success' | 'Customer Support' | 'Sales' | 'Marketing' | 'Partner Success' | 'AE Inbound' | 'IT' | 'Other';

export interface HubSpotOwner {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  team: HubSpotTeam;
  bookingUrl?: string;
}

/** HubSpot owner id for Marco Manigrassi (company owner / account brief portfolio). */
export const MARCO_MANIGRASSI_HUBSPOT_OWNER_ID = '75723356';

export const HUBSPOT_OWNERS: Record<string, HubSpotOwner> = {
  // ─── Customer Success ────────────────────────────────────────────────────────
  "75723356":   { id: "75723356",   email: "marco.manigrassi@spoki.it",      firstName: "Marco",      lastName: "Manigrassi",  team: "Customer Success" },
  "75723364":   { id: "75723364",   email: "emanuela.locorotondo@spoki.it",  firstName: "Emanuela",   lastName: "Locorotondo", team: "Customer Success" },
  "75723388":   { id: "75723388",   email: "antonella.mingolla@spoki.it",    firstName: "Antonella",  lastName: "Mingolla",    team: "Customer Success" },
  "496361232":  { id: "496361232",  email: "daniela.pascale@spoki.it",       firstName: "Daniela",    lastName: "Pascale",     team: "Customer Success" },
  "29723671":   { id: "29723671",   email: "francesca.vitale@spoki.com",     firstName: "Francesca",  lastName: "Vitale",      team: "Customer Success" },
  "75723441":   { id: "75723441",   email: "claudia.depaola@spoki.it",       firstName: "Claudia",    lastName: "De Paola",    team: "Customer Success" },
  "78965003":   { id: "78965003",   email: "giulio.trinchera@spoki.it",      firstName: "Giulio",     lastName: "Trinchera",   team: "Customer Success" },
  "31909019":   { id: "31909019",   email: "katerina.khorzhan@spoki.com",    firstName: "Katerina",   lastName: "Khorzhan",    team: "Customer Success" },
  "32876649":   { id: "32876649",   email: "lucrezia.terreni@spoki.com",     firstName: "Lucrezia",   lastName: "Terreni",     team: "Customer Success" },
  "32686457":   { id: "32686457",   email: "riccardo.marino@spoki.com",      firstName: "Riccardo",   lastName: "Marino",      team: "Customer Success" },
  "30448724":   { id: "30448724",   email: "antonella.dagnano@spoki.com",    firstName: "Antonella",  lastName: "D'Agnano",    team: "Customer Success" },
  "33686350":   { id: "33686350",   email: "giovanni.caniglia@spoki.com",    firstName: "Gianluca",   lastName: "Caniglia",    team: "Customer Success" },

  // ─── Customer Support ────────────────────────────────────────────────────────
  "76083950":   { id: "76083950",   email: "daniele.intermite@spoki.it",     firstName: "Daniele",    lastName: "Intermite",   team: "Customer Support" },
  "75723397":   { id: "75723397",   email: "enrico.petrelli@spoki.it",       firstName: "Enrico",     lastName: "Petrelli",    team: "Customer Support" },

  // ─── Sales ─────────────────────────────────────────────────────────────────
  "30334309":   { id: "30334309",   email: "vincenzo.furfaro@spoki.com",     firstName: "Vincenzo",   lastName: "Furfaro",     team: "Sales" },
  "30662769":   { id: "30662769",   email: "juanmanuel.lazo@spoki.com",      firstName: "Juan Manuel",lastName: "Lazo",        team: "Sales" },
  "30727447":   { id: "30727447",   email: "victor.lorente@spoki.com",       firstName: "Victor",     lastName: "Lorente",     team: "Sales" },
  "30908030":   { id: "30908030",   email: "manuel.garcia@spoki.com",        firstName: "Manuel",     lastName: "Garcia Oliveros", team: "Sales" },
  "31012966":   { id: "31012966",   email: "stefano.tacconi@spoki.com",      firstName: "Stefano",    lastName: "Tacconi",     team: "Sales" },
  "31172490":   { id: "31172490",   email: "gloria.zanini@spoki.com",        firstName: "Gloria",     lastName: "Zanini",      team: "Sales" },
  "31172513":   { id: "31172513",   email: "marco.rende@spoki.com",          firstName: "Marco",      lastName: "Rende",       team: "Sales" },
  "31766930":   { id: "31766930",   email: "giuseppe.cannistraro@spoki.com",  firstName: "Giuseppe",  lastName: "Cannistraro", team: "Sales" },
  "33084216":   { id: "33084216",   email: "giulio.pipparoni@spoki.com",     firstName: "Giulio",     lastName: "Pipparoni",   team: "Sales" },
  "69049846":   { id: "69049846",   email: "salvatore.marzolla@spoki.com",   firstName: "Salvatore",  lastName: "Marzolla",    team: "Sales" },
  "75722777":   { id: "75722777",   email: "giuseppe.colucci@spoki.com",     firstName: "Giuseppe",   lastName: "Colucci",     team: "Sales" },
  "78556068":   { id: "78556068",   email: "davide.mango@spoki.com",         firstName: "Davide",     lastName: "Mango",       team: "Sales" },

  // ─── AE Inbound ────────────────────────────────────────────────────────────
  "29272207":   { id: "29272207",   email: "greta.camporeale@spoki.com",     firstName: "Greta",      lastName: "Camporeale",  team: "AE Inbound" },
  "75722736":   { id: "75722736",   email: "cristina.griglia@spoki.com",     firstName: "Cristina",   lastName: "Griglia",     team: "AE Inbound" },
  "31903434":   { id: "31903434",   email: "bruno.poli@spoki.com",           firstName: "Bruno",      lastName: "Poli",        team: "AE Inbound" },

  // ─── Partner Success ───────────────────────────────────────────────────────
  "29426066":   { id: "29426066",   email: "federica.turrisi@spoki.it",      firstName: "Federica",   lastName: "Turrisi",     team: "Partner Success" },
  "30728660":   { id: "30728660",   email: "jose.fernandez@spoki.com",       firstName: "Jose",       lastName: "Fernandez",   team: "Partner Success" },

  // ─── Marketing ─────────────────────────────────────────────────────────────
  "29133951":   { id: "29133951",   email: "maria.fornell@spoki.com",        firstName: "Maria",      lastName: "Fornell",     team: "Marketing" },
  "29681796":   { id: "29681796",   email: "oli.sharman@spoki.com",          firstName: "Oli",        lastName: "Sharman",     team: "Marketing" },
  "29797105":   { id: "29797105",   email: "ana.ruedadominguez@spoki.com",   firstName: "Ana",        lastName: "Rueda Dominguez", team: "Marketing" },
  "30133195":   { id: "30133195",   email: "mattia.pace@spoki.it",           firstName: "Mattia",     lastName: "Pace",        team: "Marketing" },
  "30636301":   { id: "30636301",   email: "lina.bassiouny@spoki.com",       firstName: "Lina",       lastName: "Bassiouny",   team: "Marketing" },
  "31145575":   { id: "31145575",   email: "martina.pellegrini@spoki.com",   firstName: "Martina",    lastName: "Pellegrini",  team: "Marketing" },
  "31145585":   { id: "31145585",   email: "alice.torretta@spoki.com",       firstName: "Alice",      lastName: "Torretta",    team: "Marketing" },
  "31676133":   { id: "31676133",   email: "ramy.elhakim@spoki.com",         firstName: "Ramy",       lastName: "Elhakim",     team: "Marketing" },
  "75410476":   { id: "75410476",   email: "lorenzo.dedonno@spoki.it",       firstName: "Lorenzo",    lastName: "De Donno",    team: "Marketing" },
  "75656127":   { id: "75656127",   email: "alessandro.leo@spoki.it",        firstName: "Alessandro", lastName: "Leo",         team: "Marketing" },
  "76538490":   { id: "76538490",   email: "luigi.franco@spoki.it",          firstName: "Luigi",      lastName: "Franco",      team: "Marketing" },
  "76538491":   { id: "76538491",   email: "francesca.aggazio@spoki.it",     firstName: "Francesca",  lastName: "Aggazio",     team: "Marketing" },
  "78730922":   { id: "78730922",   email: "alessia.rodia@spoki.it",         firstName: "Alessia",    lastName: "Rodia",       team: "Marketing" },

  // ─── IT ────────────────────────────────────────────────────────────────────
  "77500115":   { id: "77500115",   email: "francesco.didomenico@spoki.it",  firstName: "Francesco",  lastName: "Di Domenico", team: "IT" },
  "77662705":   { id: "77662705",   email: "salvatore.corsa@spoki.it",       firstName: "Salvatore",  lastName: "Corsa",       team: "IT" },
  "77769308":   { id: "77769308",   email: "luca.francavilla@spoki.it",      firstName: "Luca",       lastName: "Francavilla", team: "IT" },
  "774701655":  { id: "774701655",  email: "cosimo.franco@spoki.it",         firstName: "Cosimo",     lastName: "Franco",      team: "IT" },

  // ─── Other ─────────────────────────────────────────────────────────────────
  "26271015":   { id: "26271015",   email: "info@spoki.it",                  firstName: "Spoki",      lastName: "App",         team: "Other" },
  "29441927":   { id: "29441927",   email: "luisa.giannachi@spoki.it",       firstName: "Luisa",      lastName: "Giannachi",   team: "Other" },
  "29756470":   { id: "29756470",   email: "matteo.alagna@spoki.com",        firstName: "Matteo",     lastName: "Alagna",      team: "Other" },
  "31173037":   { id: "31173037",   email: "giuseppina.molignini@spoki.com",  firstName: "Giuseppina",lastName: "Molignini",   team: "Other" },
  "1611609540": { id: "1611609540", email: "giorgio.pagliara@spoki.it",      firstName: "Giorgio",    lastName: "Pagliara",    team: "Other" },
};

// Alternative email aliases for owners who log in with a different email than HubSpot
const EMAIL_ALIASES: Record<string, string> = {
  'giulio.trinchera@spoki.com': 'giulio.trinchera@spoki.it',
  'riccardo.marino@spoki.it': 'riccardo.marino@spoki.com',
};

const BUILTIN_ADMIN_EMAILS = [
  'giulio.trinchera@spoki.com',
  'giulio.trinchera@spoki.it',
  'daniela.pascale@spoki.it',
  'marco.manigrassi@spoki.it',
];

/**
 * Risolto al primo accesso. Combina la lista hardcoded con le email opzionali
 * fornite via env var ADMIN_EMAILS (separate da virgola).
 */
let adminEmailsCache: Set<string> | null = null;
function getAdminEmails(): Set<string> {
  if (adminEmailsCache) return adminEmailsCache;
  const fromEnv = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  adminEmailsCache = new Set([...BUILTIN_ADMIN_EMAILS, ...fromEnv]);
  return adminEmailsCache;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase();
  const resolved = EMAIL_ALIASES[normalized] ?? normalized;
  return getAdminEmails().has(resolved);
}

export function getOwnerByEmail(email: string | null | undefined): HubSpotOwner | null {
  if (!email) return null;
  const normalized = email.toLowerCase();
  const resolved = EMAIL_ALIASES[normalized] ?? normalized;
  return Object.values(HUBSPOT_OWNERS).find(o => o.email.toLowerCase() === resolved) ?? null;
}

export function isCustomerSuccessTeamMember(owner: HubSpotOwner | null | undefined): boolean {
  return owner?.team === 'Customer Success';
}

export function getOwnerName(ownerId: string | null | undefined): string {
  if (!ownerId) return '—';
  const owner = HUBSPOT_OWNERS[ownerId];
  if (!owner) return '—';
  return `${owner.firstName} ${owner.lastName}`;
}

export function getOwnerInitials(ownerId: string | null | undefined): string {
  if (!ownerId) return '?';
  const owner = HUBSPOT_OWNERS[ownerId];
  if (!owner) return '?';
  return `${owner.firstName[0]}${owner.lastName[0]}`.toUpperCase();
}

export const CS_TEAM = Object.values(HUBSPOT_OWNERS).filter(o => o.team === 'Customer Success');
export const SUPPORT_TEAM = Object.values(HUBSPOT_OWNERS).filter(o => o.team === 'Customer Support');
export const SALES_TEAM = Object.values(HUBSPOT_OWNERS).filter(o => o.team === 'Sales');

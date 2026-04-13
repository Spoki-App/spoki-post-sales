export interface HubSpotOwner {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  team: 'Customer Success' | 'Customer Support';
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

  "31909019":   { id: "31909019",   email: "katerina.khorzhan@spoki.com",   firstName: "Katerina",   lastName: "Khorzhan",    team: "Customer Success" },
  "32876649":   { id: "32876649",   email: "lucrezia.terreni@spoki.com",    firstName: "Lucrezia",   lastName: "Terreni",     team: "Customer Success" },

  // ─── Customer Support ────────────────────────────────────────────────────────
  "76083950":   { id: "76083950",   email: "daniele.intermite@spoki.it",     firstName: "Daniele",    lastName: "Intermite",   team: "Customer Support" },
  "75723397":   { id: "75723397",   email: "enrico.petrelli@spoki.it",       firstName: "Enrico",     lastName: "Petrelli",    team: "Customer Support" },
};

// Alternative email aliases for owners who log in with a different email than HubSpot
const EMAIL_ALIASES: Record<string, string> = {
  'giulio.trinchera@spoki.com': 'giulio.trinchera@spoki.it',
};

export function getOwnerByEmail(email: string | null | undefined): HubSpotOwner | null {
  if (!email) return null;
  const normalized = email.toLowerCase();
  const resolved = EMAIL_ALIASES[normalized] ?? normalized;
  return Object.values(HUBSPOT_OWNERS).find(o => o.email.toLowerCase() === resolved) ?? null;
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

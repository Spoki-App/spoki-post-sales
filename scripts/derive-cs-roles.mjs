/**
 * Read-only helper that fetches all HubSpot owners with their team memberships
 * and prints suggested `isOnboardingOperator` / `isSuccessOperator` flags for
 * the Customer Success operators currently mapped in `src/lib/config/owners.ts`.
 *
 * Output is meant to be reviewed and pasted by hand into HUBSPOT_OWNERS.
 *
 * Usage:
 *   npm run derive:cs-roles
 */

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
if (!HUBSPOT_API_KEY) {
  console.error('HUBSPOT_API_KEY is not set. Check your .env.local file.');
  process.exit(1);
}

// Mirrors the Customer Success entries from src/lib/config/owners.ts.
// Kept here as the source-of-truth subset to filter the HubSpot owners API response.
const CS_OWNER_IDS = new Set([
  '75723356',
  '75723364',
  '75723388',
  '496361232',
  '29723671',
  '75723441',
  '78965003',
  '31909019',
  '32876649',
  '32686457',
  '30448724',
  '33686350',
]);

const ONBOARDING_TEAM_REGEX = /onboard/i;
const SUCCESS_TEAM_REGEX = /success/i;

async function fetchOwners() {
  const owners = [];
  let after;

  do {
    const url = new URL('https://api.hubapi.com/crm/v3/owners');
    url.searchParams.set('limit', '100');
    url.searchParams.set('archived', 'false');
    url.searchParams.set('properties', 'teams');
    if (after) url.searchParams.set('after', after);

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HubSpot ${res.status}: ${body.slice(0, 400)}`);
    }

    const data = await res.json();
    owners.push(...(data.results ?? []));
    after = data.paging?.next?.after;
  } while (after);

  return owners;
}

function deriveFlags(teams) {
  const teamNames = (teams ?? []).map(t => t.name ?? '').filter(Boolean);
  return {
    teamNames,
    isOnboardingOperator: teamNames.some(n => ONBOARDING_TEAM_REGEX.test(n)),
    isSuccessOperator: teamNames.some(n => SUCCESS_TEAM_REGEX.test(n) && !ONBOARDING_TEAM_REGEX.test(n)),
  };
}

function pad(s, width) {
  const str = String(s ?? '');
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

(async () => {
  console.log('Fetching HubSpot owners...\n');
  const owners = await fetchOwners();

  const csOwners = owners.filter(o => CS_OWNER_IDS.has(o.id));
  console.log(`Total HubSpot owners fetched: ${owners.length}`);
  console.log(`CS owners matched (from owners.ts): ${csOwners.length} / ${CS_OWNER_IDS.size}\n`);

  console.log('=== Raw teams per CS owner (verify regex matches reality) ===\n');
  for (const o of csOwners) {
    const fullName = `${o.firstName ?? ''} ${o.lastName ?? ''}`.trim() || '(no name)';
    const { teamNames } = deriveFlags(o.teams);
    console.log(`  ${pad(o.id, 12)} ${pad(fullName, 28)} ${pad(o.email ?? '', 36)} teams: [${teamNames.join(', ') || '-'}]`);
  }

  const missing = [...CS_OWNER_IDS].filter(id => !owners.some(o => o.id === id));
  if (missing.length > 0) {
    console.log(`\nWARNING: ${missing.length} CS owner id(s) from owners.ts not found on HubSpot (archived?): ${missing.join(', ')}`);
  }

  console.log('\n=== Suggested flags (paste into HUBSPOT_OWNERS entries) ===');
  console.log('// Derivation rules:');
  console.log(`//   isOnboardingOperator = team name matches ${ONBOARDING_TEAM_REGEX}`);
  console.log(`//   isSuccessOperator    = team name matches ${SUCCESS_TEAM_REGEX} AND NOT ${ONBOARDING_TEAM_REGEX}`);
  console.log('// Refine the regexes in scripts/derive-cs-roles.mjs if HubSpot uses different team names.\n');

  const sorted = [...csOwners].sort((a, b) => {
    const an = `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim();
    const bn = `${b.firstName ?? ''} ${b.lastName ?? ''}`.trim();
    return an.localeCompare(bn, 'it');
  });

  for (const o of sorted) {
    const { isOnboardingOperator, isSuccessOperator } = deriveFlags(o.teams);
    const fullName = `${o.firstName ?? ''} ${o.lastName ?? ''}`.trim();
    console.log(
      `  // ${pad(fullName, 28)} -> isOnboardingOperator: ${pad(String(isOnboardingOperator), 5)}, isSuccessOperator: ${isSuccessOperator}`
    );
  }

  console.log('\nDone. Update src/lib/config/owners.ts manually.');
})().catch(err => {
  console.error('derive-cs-roles failed:', err.message);
  process.exit(1);
});

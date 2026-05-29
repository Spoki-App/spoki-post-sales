/**
 * Risolve la mappa account_id Spoki → operatore (CS owner) combinando tre sorgenti
 * con la seguente priorità (top wins):
 *
 *   1. nar_operator_overrides (CSV upload o edit manuale dalla UI)
 *   2. clients.raw_properties->>'spoki_company_id_unique' + cs_owner_id (sync HubSpot)
 *   3. fallback "Non assegnato"
 */

import { pgQuery } from '@/lib/db/postgres';
import { getOwnerName, HUBSPOT_OWNERS } from '@/lib/config/owners';
import type { NarOperatorEntry, NarOperatorSource } from '@/types/nar';

interface ClientRow {
  account_id: string | null;
  cs_owner_id: string | null;
  name: string | null;
  plan: string | null;
}

interface OverrideRow {
  account_id: string;
  operator_name: string;
  source: NarOperatorSource;
  account_name: string | null;
  partner_type: string | null;
  plan: string | null;
  status: string | null;
  updated_at: string;
}

function ownerLabel(ownerId: string | null): string {
  if (!ownerId) return '';
  const owner = HUBSPOT_OWNERS[ownerId];
  if (owner) return `${owner.firstName} ${owner.lastName}`.trim();
  return getOwnerName(ownerId) || '';
}

/**
 * Carica gli operatori per tutti gli account presenti negli `accountIds` forniti
 * (oppure per tutti gli account presenti in clients/overrides se omesso).
 */
export async function resolveOperators(accountIds?: number[]): Promise<NarOperatorEntry[]> {
  const idsFilter = accountIds && accountIds.length > 0 ? accountIds : null;

  const clientsRes = await pgQuery<ClientRow>(`
    SELECT
      (raw_properties->>'spoki_company_id_unique') AS account_id,
      cs_owner_id,
      name,
      plan
    FROM clients
    WHERE raw_properties ? 'spoki_company_id_unique'
      AND raw_properties->>'spoki_company_id_unique' ~ '^[0-9]+$'
      ${idsFilter ? `AND (raw_properties->>'spoki_company_id_unique')::bigint = ANY($1::bigint[])` : ''}
  `, idsFilter ? [idsFilter] : []);

  const overridesRes = await pgQuery<OverrideRow>(`
    SELECT account_id::text AS account_id, operator_name, source, account_name, partner_type, plan, status, updated_at
    FROM nar_operator_overrides
    ${idsFilter ? `WHERE account_id = ANY($1::bigint[])` : ''}
  `, idsFilter ? [idsFilter] : []);

  const byId = new Map<string, NarOperatorEntry>();

  // Step 1: accounts derivati dalla sync HubSpot
  for (const row of clientsRes.rows) {
    if (!row.account_id) continue;
    const accountId = Number(row.account_id);
    if (!Number.isFinite(accountId) || accountId <= 0) continue;
    const operator = ownerLabel(row.cs_owner_id) || 'Non assegnato';
    byId.set(String(accountId), {
      accountId,
      operator,
      source: 'hubspot',
      accountName: row.name,
      partnerType: null,
      plan: row.plan,
      status: null,
      updatedAt: new Date().toISOString(),
    });
  }

  // Step 2: gli overrides hanno la precedenza
  for (const row of overridesRes.rows) {
    const accountId = Number(row.account_id);
    if (!Number.isFinite(accountId) || accountId <= 0) continue;
    const existing = byId.get(String(accountId));
    byId.set(String(accountId), {
      accountId,
      operator: row.operator_name,
      source: row.source,
      accountName: row.account_name ?? existing?.accountName ?? null,
      partnerType: row.partner_type ?? existing?.partnerType ?? null,
      plan: row.plan ?? existing?.plan ?? null,
      status: row.status ?? existing?.status ?? null,
      updatedAt: row.updated_at,
    });
  }

  return [...byId.values()].sort((a, b) => a.accountId - b.accountId);
}

/**
 * Upsert batch di operatori da CSV (`source='csv'`). Mantiene `source='manual'` precedenti
 * solo se il valore CSV è vuoto. Restituisce il numero di righe scritte.
 */
export interface OperatorUpsertInput {
  accountId: number;
  operatorName: string;
  accountName?: string | null;
  partnerType?: string | null;
  plan?: string | null;
  status?: string | null;
}

export async function upsertOperatorOverridesFromCsv(
  rows: OperatorUpsertInput[],
  uploadedBy: string | null
): Promise<number> {
  if (rows.length === 0) return 0;
  // Costruisce parametri batch per UNNEST.
  const accountIds = rows.map(r => r.accountId);
  const names = rows.map(r => r.operatorName);
  const accountNames = rows.map(r => r.accountName ?? null);
  const partnerTypes = rows.map(r => r.partnerType ?? null);
  const plans = rows.map(r => r.plan ?? null);
  const statuses = rows.map(r => r.status ?? null);

  await pgQuery(`
    INSERT INTO nar_operator_overrides
      (account_id, operator_name, source, account_name, partner_type, plan, status, updated_by_email, updated_at)
    SELECT * FROM UNNEST(
      $1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::timestamptz[]
    )
    ON CONFLICT (account_id) DO UPDATE SET
      operator_name    = EXCLUDED.operator_name,
      source           = EXCLUDED.source,
      account_name     = COALESCE(EXCLUDED.account_name, nar_operator_overrides.account_name),
      partner_type     = COALESCE(EXCLUDED.partner_type, nar_operator_overrides.partner_type),
      plan             = COALESCE(EXCLUDED.plan, nar_operator_overrides.plan),
      status           = COALESCE(EXCLUDED.status, nar_operator_overrides.status),
      updated_by_email = EXCLUDED.updated_by_email,
      updated_at       = EXCLUDED.updated_at
  `, [
    accountIds,
    names,
    Array(rows.length).fill('csv'),
    accountNames,
    partnerTypes,
    plans,
    statuses,
    Array(rows.length).fill(uploadedBy),
    Array(rows.length).fill(new Date().toISOString()),
  ]);

  return rows.length;
}

/** Override singolo manuale (UI). */
export async function upsertOperatorOverrideManual(
  input: OperatorUpsertInput,
  updatedBy: string | null
): Promise<void> {
  await pgQuery(`
    INSERT INTO nar_operator_overrides
      (account_id, operator_name, source, account_name, partner_type, plan, status, updated_by_email, updated_at)
    VALUES ($1, $2, 'manual', $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (account_id) DO UPDATE SET
      operator_name    = EXCLUDED.operator_name,
      source           = 'manual',
      account_name     = COALESCE(EXCLUDED.account_name, nar_operator_overrides.account_name),
      partner_type     = COALESCE(EXCLUDED.partner_type, nar_operator_overrides.partner_type),
      plan             = COALESCE(EXCLUDED.plan, nar_operator_overrides.plan),
      status           = COALESCE(EXCLUDED.status, nar_operator_overrides.status),
      updated_by_email = EXCLUDED.updated_by_email,
      updated_at       = NOW()
  `, [
    input.accountId,
    input.operatorName,
    input.accountName ?? null,
    input.partnerType ?? null,
    input.plan ?? null,
    input.status ?? null,
    updatedBy,
  ]);
}

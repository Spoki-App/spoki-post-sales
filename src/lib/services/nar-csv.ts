/**
 * Parsing del CSV NAR (esportato da Google Sheets) e del CSV operatori (HubSpot export).
 * Riproduce 1:1 la logica di `parseEuroNumber` e `getRowCompanyOwner` del vecchio dashboard
 * per garantire risultati numerici identici.
 */

import Papa from 'papaparse';
import type { NarRow } from '@/types/nar';

const OWNER_COLUMN_KEYS = [
  'company_owner', 'Company owner', 'Company Owner', 'COMPANY_OWNER',
  'Owner', 'Account Owner', 'account_owner', 'Hubspot owner', 'hubspot_owner',
  'Sales owner', 'sales_owner', 'Company Owner (Hub)', 'Operatore', 'operatore',
];

/**
 * Estrae l'owner pulito tra le possibili colonne usate dai vari export HubSpot.
 * Tipica colonna: `company_owner`, ma HubSpot a volte usa "Company owner" / "Owner" ecc.
 */
export function getRowCompanyOwner(row: Record<string, unknown> | null | undefined): string {
  if (!row || typeof row !== 'object') return '';
  for (const k of OWNER_COLUMN_KEYS) {
    const v = (row as Record<string, unknown>)[k];
    if (v != null && String(v).trim() !== '') {
      return String(v).replace(/"/g, '').trim();
    }
  }
  return '';
}

/**
 * Converte i numeri in formato europeo ("1.234,56" o "1234,56") in number JS.
 * Mantiene il comportamento originale del dashboard NAR (Papaparse non normalizza locales).
 */
export function parseEuroNumber(val: unknown): number {
  if (val == null || val === '') return 0;
  let clean = String(val).replace(/"/g, '').trim();
  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function pickString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return String(v).replace(/"/g, '').trim();
  }
  return '';
}

function toAccountId(value: unknown): number {
  if (value == null || value === '') return 0;
  const cleaned = String(value).replace(/[^0-9-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Normalizza una riga raw del CSV NAR nello shape `NarRow`. */
export function normalizeNarRow(row: Record<string, unknown>): NarRow {
  return {
    accountId: toAccountId(pickString(row, 'account_id', 'Account ID', 'Spoki Account ID')),
    accountName: pickString(row, 'account_name', 'Account name', 'Account Name'),
    planSlug: pickString(row, 'plan_slug', 'plan_activated', 'Plan'),
    partnerId: pickString(row, 'partner_id', 'Partner ID'),
    partnerType: pickString(row, 'partner_type', 'Partner type', 'Partner Type'),
    countryCode: pickString(row, 'country_code', 'Country', 'country'),
    weekCount: parseEuroNumber(row['week_count'] ?? row['Week count']),
    monthCount: parseEuroNumber(row['month_count'] ?? row['Month count']),
    conversationTier: parseEuroNumber(row['conversation_tier'] ?? row['Conversation tier']),
    weekConversationCount: parseEuroNumber(row['week_conversation_count'] ?? row['Week conversation count']),
    monthConversationCount: parseEuroNumber(row['month_conversation_count'] ?? row['Month conversation count']),
    companyOwner: getRowCompanyOwner(row),
    raw: row,
  };
}

/** Parsa un CSV NAR (stringa o ArrayBuffer/Blob lato browser) e ritorna le righe normalizzate. */
export function parseNarCsv(input: string): NarRow[] {
  const result = Papa.parse<Record<string, unknown>>(input, {
    header: true,
    skipEmptyLines: true,
  });
  return result.data
    .map(normalizeNarRow)
    .filter((r: NarRow) => r.accountId > 0);
}

/** Riga normalizzata da CSV operatori (export HubSpot, colonne tipo "Spoki Company ID Unique"). */
export interface ParsedOperatorRow {
  accountId: number;
  accountName: string;
  operator: string;
  partnerType: string;
  plan: string;
  status: string;
}

export function parseOperatorsCsv(input: string): ParsedOperatorRow[] {
  const result = Papa.parse<Record<string, unknown>>(input, {
    header: true,
    skipEmptyLines: true,
    quoteChar: '"',
  });
  return result.data
    .map((row: Record<string, unknown>) => ({
      accountId: toAccountId(pickString(row, 'Spoki Company ID Unique', 'spoki_company_id_unique', 'spoki_company_id', 'account_id')),
      accountName: pickString(row, 'Company name', 'company_name', 'account_name'),
      operator: getRowCompanyOwner(row) || 'Non assegnato',
      partnerType: pickString(row, 'Partner type', 'partner_type'),
      plan: pickString(row, 'Plan activated', 'plan_activated', 'plan_slug'),
      status: pickString(row, 'Contract Status', 'contract_status', 'status'),
    }))
    .filter((r: ParsedOperatorRow) => r.accountId > 0);
}

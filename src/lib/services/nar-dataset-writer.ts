/**
 * Helper unico per sostituire il dataset NAR corrente.
 * Usato sia da /api/v1/nar/dataset (POST) per il flusso CSV, sia da
 * /api/v1/nar/dataset/refresh (POST) per il flusso Metabase.
 *
 * Comportamento atomico:
 *   1. Marca FALSE tutti gli upload con is_current=TRUE.
 *   2. Inserisce un nuovo nar_uploads (is_current=TRUE) con la sorgente specificata.
 *   3. Inserisce in batch (UNNEST) tutte le righe in nar_rows.
 *
 * Nota: pgQuery non espone una transazione esplicita, ma l'unique index parziale
 * `nar_uploads_one_current_idx` garantisce che il vincolo "un solo upload corrente"
 * non venga mai violato.
 */

import { pgQuery } from '@/lib/db/postgres';
import type { NarRow, NarUploadSource } from '@/types/nar';

export interface ReplaceCurrentDatasetInput {
  rows: NarRow[];
  source: NarUploadSource;
  fileName?: string | null;
  notes?: string | null;
  uploadedByEmail?: string | null;
}

export interface ReplaceCurrentDatasetResult {
  uploadId: string;
  rowCount: number;
}

export async function replaceCurrentDataset(
  input: ReplaceCurrentDatasetInput
): Promise<ReplaceCurrentDatasetResult> {
  const { rows, source, fileName, notes, uploadedByEmail } = input;
  if (rows.length === 0) {
    throw new Error('replaceCurrentDataset: rows must be non-empty');
  }

  await pgQuery('UPDATE nar_uploads SET is_current = FALSE WHERE is_current = TRUE');

  const insertRes = await pgQuery<{ id: string }>(
    `INSERT INTO nar_uploads (uploaded_by_email, source, row_count, file_name, notes, is_current)
     VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
    [uploadedByEmail ?? null, source, rows.length, fileName ?? null, notes ?? null]
  );
  const uploadId = insertRes.rows[0].id;

  await pgQuery(
    `INSERT INTO nar_rows (
       upload_id, account_id, account_name, plan_slug, partner_id, partner_type, country_code,
       week_count, month_count, conversation_tier,
       week_conversation_count, month_conversation_count, company_owner, raw
     )
     SELECT $1, * FROM UNNEST(
       $2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
       $8::int[], $9::int[], $10::numeric[],
       $11::numeric[], $12::numeric[], $13::text[], $14::jsonb[]
     )`,
    [
      uploadId,
      rows.map(r => r.accountId),
      rows.map(r => r.accountName),
      rows.map(r => r.planSlug),
      rows.map(r => r.partnerId),
      rows.map(r => r.partnerType),
      rows.map(r => r.countryCode),
      rows.map(r => r.weekCount),
      rows.map(r => r.monthCount),
      rows.map(r => r.conversationTier),
      rows.map(r => r.weekConversationCount),
      rows.map(r => r.monthConversationCount),
      rows.map(r => r.companyOwner),
      rows.map(r => JSON.stringify(r.raw ?? {})),
    ]
  );

  return { uploadId, rowCount: rows.length };
}

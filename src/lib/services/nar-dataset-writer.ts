/**
 * Helper unico per sostituire il dataset NAR corrente.
 * Usato sia da /api/v1/nar/dataset (POST) per il flusso CSV, sia da
 * /api/v1/nar/dataset/refresh (POST) per il flusso Metabase.
 *
 * Tutto dentro una transazione (pgTransaction):
 *   1. DELETE righe dell'upload precedentemente corrente (evita accumulo:
 *      la storia rimane solo nei nar_snapshots, non in nar_rows).
 *   2. UPDATE nar_uploads SET is_current = FALSE per il vecchio corrente.
 *   3. INSERT nuovo nar_uploads (is_current = TRUE).
 *   4. INSERT in batch di tutte le righe in nar_rows (UNNEST).
 * Se un qualsiasi step fallisce, ROLLBACK e nessuna modifica viene applicata.
 */

import { pgTransaction } from '@/lib/db/postgres';
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

  return pgTransaction(async q => {
    await q(
      `DELETE FROM nar_rows
       WHERE upload_id IN (SELECT id FROM nar_uploads WHERE is_current = TRUE)`
    );

    await q('UPDATE nar_uploads SET is_current = FALSE WHERE is_current = TRUE');

    const insertRes = await q<{ id: string }>(
      `INSERT INTO nar_uploads (uploaded_by_email, source, row_count, file_name, notes, is_current)
       VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
      [uploadedByEmail ?? null, source, rows.length, fileName ?? null, notes ?? null]
    );
    const uploadId = insertRes.rows[0].id;

    await q(
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
  });
}

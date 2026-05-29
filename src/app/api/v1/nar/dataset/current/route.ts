import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import type { NarRow, NarUpload } from '@/types/nar';

interface UploadRow {
  id: string;
  uploaded_by_email: string | null;
  uploaded_at: string;
  source: 'csv' | 'api';
  row_count: number;
  file_name: string | null;
  notes: string | null;
  is_current: boolean;
}

interface DataRow {
  account_id: string;
  account_name: string | null;
  plan_slug: string | null;
  partner_id: string | null;
  partner_type: string | null;
  country_code: string | null;
  week_count: number | null;
  month_count: number | null;
  conversation_tier: string | null;
  week_conversation_count: string | null;
  month_conversation_count: string | null;
  company_owner: string | null;
}

function mapUpload(r: UploadRow): NarUpload {
  return {
    id: r.id,
    uploadedByEmail: r.uploaded_by_email,
    uploadedAt: r.uploaded_at,
    source: r.source,
    rowCount: r.row_count,
    fileName: r.file_name,
    notes: r.notes,
    isCurrent: r.is_current,
  };
}

function mapRow(r: DataRow): NarRow {
  return {
    accountId: Number(r.account_id),
    accountName: r.account_name ?? '',
    planSlug: r.plan_slug ?? '',
    partnerId: r.partner_id ?? '',
    partnerType: r.partner_type ?? '',
    countryCode: r.country_code ?? '',
    weekCount: Number(r.week_count ?? 0),
    monthCount: Number(r.month_count ?? 0),
    conversationTier: Number(r.conversation_tier ?? 0),
    weekConversationCount: Number(r.week_conversation_count ?? 0),
    monthConversationCount: Number(r.month_conversation_count ?? 0),
    companyOwner: r.company_owner ?? '',
    raw: null,
  };
}

export const GET = withAuth(async (_request: NextRequest) => {
  try {
    const uploadRes = await pgQuery<UploadRow>(
      `SELECT id, uploaded_by_email, uploaded_at, source, row_count, file_name, notes, is_current
       FROM nar_uploads WHERE is_current = TRUE LIMIT 1`
    );
    if (uploadRes.rows.length === 0) {
      return createSuccessResponse({ data: { upload: null, rows: [] } });
    }
    const upload = mapUpload(uploadRes.rows[0]);

    const rowsRes = await pgQuery<DataRow>(
      `SELECT account_id::text, account_name, plan_slug, partner_id, partner_type, country_code,
              week_count, month_count, conversation_tier,
              week_conversation_count, month_conversation_count, company_owner
       FROM nar_rows WHERE upload_id = $1`,
      [upload.id]
    );
    return createSuccessResponse({ data: { upload, rows: rowsRes.rows.map(mapRow) } });
  } catch (error) {
    return createErrorResponse(error);
  }
});

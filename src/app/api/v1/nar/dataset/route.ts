import { NextRequest } from 'next/server';
import { withAuth, createSuccessResponse, createErrorResponse, ApiError, type AuthenticatedRequest } from '@/lib/api/middleware';
import { pgQuery } from '@/lib/db/postgres';
import { getLogger } from '@/lib/logger';
import { parseNarCsv } from '@/lib/services/nar-csv';
import { replaceCurrentDataset } from '@/lib/services/nar-dataset-writer';
import type { NarRow, NarUpload, NarUploadSource } from '@/types/nar';

const logger = getLogger('api:nar:dataset');

interface UploadRow {
  id: string;
  uploaded_by_email: string | null;
  uploaded_at: string;
  source: NarUploadSource;
  row_count: number;
  file_name: string | null;
  notes: string | null;
  is_current: boolean;
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

export const GET = withAuth(async (request: NextRequest) => {
  try {
    const url = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));
    const res = await pgQuery<UploadRow>(
      `SELECT id, uploaded_by_email, uploaded_at, source, row_count, file_name, notes, is_current
       FROM nar_uploads ORDER BY uploaded_at DESC LIMIT $1`,
      [limit]
    );
    return createSuccessResponse({ data: res.rows.map(mapUpload) });
  } catch (error) {
    return createErrorResponse(error);
  }
});

interface CreateBody {
  fileName?: string;
  notes?: string;
  csv?: string;
  rows?: NarRow[];
}

export const POST = withAuth(async (request: NextRequest, auth: AuthenticatedRequest) => {
  try {
    const body = (await request.json().catch(() => ({}))) as CreateBody;
    let rows: NarRow[] = [];
    if (Array.isArray(body.rows) && body.rows.length > 0) {
      rows = body.rows;
    } else if (typeof body.csv === 'string' && body.csv.trim().length > 0) {
      rows = parseNarCsv(body.csv);
    } else {
      throw new ApiError(400, 'Provide either { csv: string } or { rows: NarRow[] }');
    }
    if (rows.length === 0) {
      throw new ApiError(400, 'Parsed dataset is empty (no valid rows with account_id).');
    }

    const { uploadId, rowCount } = await replaceCurrentDataset({
      rows,
      source: 'csv',
      fileName: body.fileName ?? null,
      notes: body.notes ?? null,
      uploadedByEmail: auth.email ?? null,
    });

    logger.info('NAR upload created', { uploadId, rowCount, by: auth.email });
    return createSuccessResponse({ data: { id: uploadId, rowCount } }, 201);
  } catch (error) {
    return createErrorResponse(error);
  }
});

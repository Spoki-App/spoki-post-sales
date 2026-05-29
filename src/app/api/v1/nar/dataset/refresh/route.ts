import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  ApiError,
  createErrorResponse,
  createSuccessResponse,
} from '@/lib/api/middleware';
import { buildNarRowsFromMetabase } from '@/lib/services/nar-metabase';
import { replaceCurrentDataset } from '@/lib/services/nar-dataset-writer';
import { isConfigured } from '@/lib/config';
import { getLogger } from '@/lib/logger';

const logger = getLogger('api:nar:dataset:refresh');

interface AuthorizedCaller {
  email: string | null;
  via: 'cron' | 'user';
}

/**
 * Accetta sia chiamate utente (Authorization: Bearer <Firebase ID token>) sia chiamate
 * cron Vercel:
 *   - `?secret=<CRON_SECRET>` query param (compat /api/v1/hubspot/sync)
 *   - oppure header `Authorization: Bearer <CRON_SECRET>` (formato Vercel cron nativo)
 */
async function authorize(request: NextRequest): Promise<AuthorizedCaller> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const url = new URL(request.url);
    if (url.searchParams.get('secret') === cronSecret) {
      return { email: null, via: 'cron' };
    }
    const authHeader = request.headers.get('authorization');
    if (authHeader === `Bearer ${cronSecret}`) {
      return { email: null, via: 'cron' };
    }
  }

  const auth = await authenticateRequest(request);
  return { email: auth.email ?? null, via: 'user' };
}

async function handle(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isConfigured('metabase')) {
      throw new ApiError(503, 'Metabase non e\' configurato (METABASE_API_KEY mancante).');
    }

    const caller = await authorize(request);

    logger.info('NAR refresh from Metabase started', { via: caller.via, by: caller.email });

    const result = await buildNarRowsFromMetabase();
    if (result.rows.length === 0) {
      logger.warn('NAR refresh: Metabase ha restituito 0 righe, nessuno snapshot creato.');
      return createSuccessResponse({
        data: {
          uploadId: null,
          rowCount: 0,
          accountCount: 0,
          weeksCovered: 0,
          windowDays: result.windowDays,
          enrichedAccountCount: 0,
          unmatchedAccountCount: 0,
        },
        warning: 'Metabase ha restituito 0 righe per la finestra richiesta. Dataset corrente invariato.',
      });
    }

    const accountCount = new Set(result.rows.map(r => r.accountId)).size;
    const notes = `Refresh automatico Metabase (window=${result.windowDays}gg, accounts=${accountCount}, weeks=${result.weeksCovered}).`;

    const written = await replaceCurrentDataset({
      rows: result.rows,
      source: 'metabase',
      fileName: null,
      notes,
      uploadedByEmail: caller.email,
    });

    logger.info('NAR refresh from Metabase completed', {
      uploadId: written.uploadId,
      rowCount: written.rowCount,
      accountCount,
      weeksCovered: result.weeksCovered,
      via: caller.via,
    });

    return createSuccessResponse({
      data: {
        uploadId: written.uploadId,
        rowCount: written.rowCount,
        accountCount,
        weeksCovered: result.weeksCovered,
        windowDays: result.windowDays,
        enrichedAccountCount: result.enrichedAccountCount,
        unmatchedAccountCount: result.unmatchedAccountCount,
      },
    }, 201);
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function POST(request: NextRequest) { return handle(request); }
export async function GET(request: NextRequest) { return handle(request); }

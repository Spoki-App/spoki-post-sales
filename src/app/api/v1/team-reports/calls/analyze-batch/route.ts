import { NextRequest } from 'next/server';
import { handleBatchRequest } from '@/lib/services/call-reports';

// Legacy endpoint: always activation. Canonical: /api/v1/call-reports/activation/calls/analyze-batch
export async function POST(request: NextRequest) {
  return handleBatchRequest('activation', request);
}

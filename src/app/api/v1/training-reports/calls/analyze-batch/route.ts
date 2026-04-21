import { NextRequest } from 'next/server';
import { handleBatchRequest } from '@/lib/services/call-reports';

// Legacy endpoint: always training. Canonical: /api/v1/call-reports/training/calls/analyze-batch
export async function POST(request: NextRequest) {
  return handleBatchRequest('training', request);
}

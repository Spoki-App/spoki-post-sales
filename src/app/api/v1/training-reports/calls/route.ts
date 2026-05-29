import { NextRequest } from 'next/server';
import { handleListRequest } from '@/lib/services/call-reports';

// Legacy endpoint: always training. Canonical: /api/v1/call-reports/training/calls
export async function GET(request: NextRequest) {
  return handleListRequest('training', request);
}

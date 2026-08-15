import { NextResponse } from 'next/server';
import type { BuildingReport } from '@/lib/types';
import { mockReport } from '@/lib/mockReport';
import { mockReportClean } from '@/lib/mockReport.clean';

export const dynamic = 'force-dynamic';

/**
 * GET /api/building?bbl= -> { report: BuildingReport }
 *
 * STEP 1: returns the mock, params ignored. Real pipeline lands in steps 3-5.
 *
 * Dev affordance while the pipeline is stubbed: ?mock=clean returns the
 * grade-A fixture so the report UI can be built against both states.
 * It disappears once the real fetchers are wired.
 */
export async function GET(request: Request): Promise<NextResponse<{ report: BuildingReport }>> {
  const { searchParams } = new URL(request.url);
  const report = searchParams.get('mock') === 'clean' ? mockReportClean : mockReport;

  return NextResponse.json({ report });
}

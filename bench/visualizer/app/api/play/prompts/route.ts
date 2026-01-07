import { NextRequest, NextResponse } from 'next/server';
import { getSuccessfulPrompts } from '@/lib/play-storage';

export const dynamic = 'force-dynamic';

function escapeCsv(value: string) {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

// GET: Export successful prompts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'json').toLowerCase();
    const limit = Number(searchParams.get('limit') || '200');

    const prompts = await getSuccessfulPrompts();
    const recent = prompts
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, Math.max(1, limit));

    if (format === 'csv') {
      const headers = ['prompt', 'modelName', 'username', 'turnNumber', 'timestamp'];
      const rows = [
        headers.join(','),
        ...recent.map((p) => ([
          escapeCsv(p.prompt),
          escapeCsv(p.modelName),
          escapeCsv(p.username),
          p.turnNumber,
          escapeCsv(p.timestamp)
        ]).join(','))
      ];

      return new NextResponse(rows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Cache-Control': 'no-store, max-age=0'
        }
      });
    }

    return NextResponse.json({ prompts: recent }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  } catch (error: any) {
    console.error('Prompts export error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import {
  calculatePlayerLeaderboard,
  calculateModelLeaderboard,
  getSuccessfulPrompts
} from '@/lib/play-storage';

export const dynamic = 'force-dynamic';

// GET: Fetch leaderboard data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';

    const response: any = {};

    if (type === 'all' || type === 'players') {
      response.players = await calculatePlayerLeaderboard();
    }

    if (type === 'all' || type === 'models') {
      response.models = await calculateModelLeaderboard();
    }

    if (type === 'all' || type === 'prompts') {
      const prompts = await getSuccessfulPrompts();
      // Return only the most recent 50 prompts
      response.recentPrompts = prompts
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 50)
        .map(p => ({
          prompt: p.prompt,
          modelName: p.modelName,
          username: p.username,
          turnNumber: p.turnNumber,
          timestamp: p.timestamp
        }));
    }

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  } catch (error: any) {
    console.error('Leaderboard API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

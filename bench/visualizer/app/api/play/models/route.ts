import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_PLAY_MODELS } from '@/lib/play-types';

export const dynamic = 'force-dynamic';

const OPENROUTER_API_KEY = process.env.OPENROUTER_KEY || '';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// GET: Search models or get default list
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    // If no query, return default models
    if (!query) {
      return NextResponse.json({
        models: DEFAULT_PLAY_MODELS,
        source: 'default'
      });
    }

    // Search OpenRouter models
    const response = await fetch(`${OPENROUTER_BASE}/models`, {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();

    // Filter models by query (case insensitive search in id and name)
    const queryLower = query.toLowerCase();
    const filteredModels = data.data
      .filter((m: any) => {
        // Only include text-capable models
        if (!m.architecture?.input_modalities?.includes('text')) return false;

        // Search in id and name
        const matchId = m.id.toLowerCase().includes(queryLower);
        const matchName = m.name?.toLowerCase().includes(queryLower);
        return matchId || matchName;
      })
      .slice(0, 20) // Limit to 20 results
      .map((m: any) => ({
        id: m.id,
        name: m.name,
        context_length: m.context_length,
        pricing: m.pricing
      }));

    return NextResponse.json({
      models: filteredModels,
      source: 'openrouter',
      query
    });
  } catch (error: any) {
    console.error('Models API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

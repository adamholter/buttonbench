import { NextRequest, NextResponse } from 'next/server';
import {
  saveGame,
  saveSuccessfulPrompt,
  generateId,
  getUserById
} from '@/lib/play-storage';
import {
  GAME_SYSTEM_PROMPT,
  BUTTON_TOOL_DEFINITION,
  MAX_TURNS,
  DEFAULT_PLAY_MODELS
} from '@/lib/play-types';
import type { GameSession, GameMessage, SuccessfulPrompt } from '@/lib/play-types';

export const dynamic = 'force-dynamic';

const OPENROUTER_API_KEY = process.env.OPENROUTER_KEY || '';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const TIMEOUT_SECONDS = 120;

// POST: Send a message in a game
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, gameId, modelId, message, messages: existingMessages } = body;

    // Validate user
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    // Get model info
    const model = DEFAULT_PLAY_MODELS.find(m => m.id === modelId);
    const modelName = model?.name || modelId.split('/').pop() || modelId;

    // Build messages array for API call
    const apiMessages: { role: string; content: string }[] = [
      { role: 'system', content: GAME_SYSTEM_PROMPT }
    ];

    // Add existing messages
    if (existingMessages && Array.isArray(existingMessages)) {
      for (const msg of existingMessages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          apiMessages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Add new user message
    apiMessages.push({ role: 'user', content: message });

    const turnNumber = apiMessages.filter(m => m.role === 'user').length;

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const abortController = new AbortController();
          const timeout = setTimeout(() => abortController.abort(), TIMEOUT_SECONDS * 1000);

          const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://buttonbench.vercel.app',
              'X-Title': 'ButtonBench Play'
            },
            body: JSON.stringify({
              model: modelId,
              messages: apiMessages,
              tools: [BUTTON_TOOL_DEFINITION],
              stream: true
            }),
            signal: abortController.signal
          });

          clearTimeout(timeout);

          if (!response.ok) {
            const errText = await response.text();
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `API error: ${errText}` })}\n\n`));
            controller.close();
            return;
          }

          let assistantContent = '';
          let toolCalled = false;
          let toolReasoning = '';

          if (!response.body) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'No response body' })}\n\n`));
            controller.close();
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;

                if (delta?.content) {
                  assistantContent += delta.content;
                  // Stream content to client
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: delta.content })}\n\n`));
                }

                if (delta?.tool_calls?.[0]) {
                  const tc = delta.tool_calls[0];
                  if (tc.function?.name === 'press_big_red_button') {
                    toolCalled = true;
                  }
                  if (tc.function?.arguments) {
                    try {
                      const args = JSON.parse(tc.function.arguments);
                      if (args.reasoning) toolReasoning = args.reasoning;
                    } catch {
                      // Partial JSON, accumulate
                      toolReasoning += tc.function.arguments;
                    }
                  }
                }
              } catch {}
            }
          }

          // Try to parse accumulated reasoning
          if (toolCalled && toolReasoning) {
            try {
              const parsed = JSON.parse(toolReasoning);
              if (parsed.reasoning) toolReasoning = parsed.reasoning;
            } catch {}
          }

          // Determine game status
          const isWin = toolCalled;
          const isLoss = turnNumber >= MAX_TURNS && !isWin;

          // Build game session
          const gameSession: GameSession = {
            id: gameId || generateId(),
            oderId: userId,
            modelId,
            modelName,
            messages: [
              ...(existingMessages || []),
              {
                role: 'user' as const,
                content: message,
                timestamp: new Date().toISOString(),
                turnNumber
              },
              {
                role: 'assistant' as const,
                content: assistantContent + (toolCalled ? `\n\n[PRESSED THE BUTTON: ${toolReasoning}]` : ''),
                timestamp: new Date().toISOString()
              }
            ],
            status: isWin ? 'won' : isLoss ? 'lost' : 'in_progress',
            startedAt: existingMessages?.length > 0 ? existingMessages[0]?.timestamp : new Date().toISOString(),
            endedAt: isWin || isLoss ? new Date().toISOString() : null,
            turnsUsed: turnNumber,
            maxTurns: MAX_TURNS,
            winningPrompt: isWin ? message : null,
            winningTurn: isWin ? turnNumber : null
          };

          // Save game
          await saveGame(gameSession);

          // Save successful prompt if won
          if (isWin) {
            const user = await getUserById(userId);
            const prompt: SuccessfulPrompt = {
              id: generateId(),
              prompt: message,
              modelId,
              modelName,
              username: user?.username || 'anonymous',
              turnNumber,
              timestamp: new Date().toISOString(),
              gameId: gameSession.id,
              context: (existingMessages || []).slice(-4).map((m: GameMessage) => m.content)
            };
            await saveSuccessfulPrompt(prompt);
          }

          // Send final status
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'complete',
            gameId: gameSession.id,
            status: gameSession.status,
            toolCalled,
            toolReasoning: toolCalled ? toolReasoning : null,
            assistantContent,
            turnNumber,
            maxTurns: MAX_TURNS
          })}\n\n`));

          controller.close();
        } catch (error: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error.message })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error: any) {
    console.error('Game API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

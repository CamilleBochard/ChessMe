// Tests for how the page reports a Session Game: what it sends to the service
// and what it makes of the reply. A stand-in for fetch records each request
// and answers as the service would.

import { describe, expect, it } from 'vitest';
import { connectTelemetry, recordBotMove, recordVisitorMove, startSessionGame } from './session-game';

interface SentRequest {
  url: string;
  method: string;
  body: unknown;
}

/** A fetch that records each request and answers every one with the reply given. */
function fetchAnswering(reply: () => Response): { fetch: typeof fetch; sent: SentRequest[] } {
  const sent: SentRequest[] = [];
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), method: init?.method ?? 'GET', body: JSON.parse(String(init?.body)) });
    return reply();
  };
  return { fetch: fakeFetch as typeof fetch, sent: sent };
}

describe('reporting a Session Game', () => {
  it("sends the moves played, each of the Bot's marked with where it came from, and returns the game's id", async () => {
    const service = fetchAnswering(() => Response.json({ id: 'game-1' }, { status: 201 }));
    const telemetry = connectTelemetry(service.fetch);

    let sessionGame = startSessionGame('black', 'maia3-5m');
    sessionGame = recordVisitorMove(sessionGame, { from: 'f2', to: 'f3' });
    sessionGame = recordBotMove(sessionGame, { move: { from: 'e7', to: 'e5' }, source: 'opening-book' });
    sessionGame = recordVisitorMove(sessionGame, { from: 'g2', to: 'g4' });
    sessionGame = recordBotMove(sessionGame, { move: { from: 'd8', to: 'h4' }, source: 'base-model' });
    const gameId = await telemetry.reportGame(sessionGame);

    expect(gameId).toBe('game-1');
    expect(service.sent).toEqual([
      {
        url: '/api/session-games',
        method: 'POST',
        body: {
          botColour: 'black',
          baseModel: 'maia3-5m',
          moves: [
            { uci: 'f2f3' },
            { uci: 'e7e5', source: 'opening-book' },
            { uci: 'g2g4' },
            { uci: 'd8h4', source: 'base-model' },
          ],
        },
      },
    ]);
  });

  it('returns no id when the service refuses the game', async () => {
    const service = fetchAnswering(() => Response.json({ error: 'the game has not ended' }, { status: 400 }));
    const telemetry = connectTelemetry(service.fetch);

    const gameId = await telemetry.reportGame(startSessionGame('black', 'maia3-5m'));

    expect(gameId).toBeUndefined();
  });

  it('returns no id when the service cannot be reached', async () => {
    const unreachable = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const telemetry = connectTelemetry(unreachable);

    const gameId = await telemetry.reportGame(startSessionGame('black', 'maia3-5m'));

    expect(gameId).toBeUndefined();
  });
});

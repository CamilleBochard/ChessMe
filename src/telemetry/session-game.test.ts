// Tests for how the page reports a Session Game: what it sends to the service
// and what it makes of the reply. A stand-in for fetch records each request
// and answers as the service would.

import { describe, expect, it } from 'vitest';
import type { FinishedGame } from '../session/session-game';
import { connectTelemetry, sessionGameReport } from './session-game';

const SERVED_MODEL = { baseModel: 'maia3-5m', rating: 1100 };

/** A short finished game, for the tests where its moves do not matter. */
const RESIGNED_AT_ONCE: FinishedGame = { visitor: 'white', moves: [], visitorResigned: true };

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

    const foolsMate: FinishedGame = {
      visitor: 'white',
      moves: [
        { move: { from: 'f2', to: 'f3' } },
        { move: { from: 'e7', to: 'e5' }, source: 'opening-book' },
        { move: { from: 'g2', to: 'g4' } },
        { move: { from: 'd8', to: 'h4' }, source: 'base-model' },
      ],
      visitorResigned: false,
    };
    const gameId = await telemetry.reportGame(sessionGameReport(SERVED_MODEL, foolsMate));

    expect(gameId).toBe('game-1');
    expect(service.sent).toEqual([
      {
        url: '/api/session-games',
        method: 'POST',
        body: {
          botColour: 'black',
          baseModel: 'maia3-5m',
          rating: 1100,
          moves: [
            { uci: 'f2f3' },
            { uci: 'e7e5', source: 'opening-book' },
            { uci: 'g2g4' },
            { uci: 'd8h4', source: 'base-model' },
          ],
          visitorResigned: false,
        },
      },
    ]);
  });

  it('reports a finished game: the Bot on the side the visitor did not take, and whether the visitor resigned', async () => {
    const service = fetchAnswering(() => Response.json({ id: 'game-2' }, { status: 201 }));
    const telemetry = connectTelemetry(service.fetch);
    const finished: FinishedGame = {
      visitor: 'white',
      moves: [{ move: { from: 'e2', to: 'e4' } }, { move: { from: 'e7', to: 'e5' }, source: 'opening-book' }],
      visitorResigned: true,
    };

    const report = sessionGameReport(SERVED_MODEL, finished);
    await telemetry.reportGame(report);

    expect(service.sent[0].body).toEqual({
      botColour: 'black',
      baseModel: 'maia3-5m',
      rating: 1100,
      moves: [{ uci: 'e2e4' }, { uci: 'e7e5', source: 'opening-book' }],
      visitorResigned: true,
    });
  });

  it('returns no id when the service refuses the game', async () => {
    const service = fetchAnswering(() => Response.json({ error: 'the game has not ended' }, { status: 400 }));
    const telemetry = connectTelemetry(service.fetch);

    const gameId = await telemetry.reportGame(sessionGameReport(SERVED_MODEL, RESIGNED_AT_ONCE));

    expect(gameId).toBeUndefined();
  });

  it('returns no id when the service cannot be reached', async () => {
    const unreachable = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const telemetry = connectTelemetry(unreachable);

    const gameId = await telemetry.reportGame(sessionGameReport(SERVED_MODEL, RESIGNED_AT_ONCE));

    expect(gameId).toBeUndefined();
  });
});

describe("reporting the visitor's impression", () => {
  it('sends the answer to the game it is about', async () => {
    const service = fetchAnswering(() => new Response(null, { status: 204 }));
    const telemetry = connectTelemetry(service.fetch);

    const recorded = await telemetry.reportImpression('game-1', false);

    expect(recorded).toBe(true);
    expect(service.sent).toEqual([
      { url: '/api/session-games/game-1/impression', method: 'POST', body: { feltLikeARealPlayer: false } },
    ]);
  });

  it('says the answer was not recorded when the service cannot be reached', async () => {
    const unreachable = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const telemetry = connectTelemetry(unreachable);

    const recorded = await telemetry.reportImpression('game-1', true);

    expect(recorded).toBe(false);
  });
});

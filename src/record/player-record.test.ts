// Tests for how the game page reads the Bot's record from the Session Game
// service. A stand-in for fetch answers as the service would.

import { describe, expect, it } from 'vitest';
import { readBotRecord, score } from './player-record';

const RECORD = {
  games: 3,
  results: { wins: 2, draws: 0, losses: 1 },
  white: {
    games: 1,
    results: { wins: 1, draws: 0, losses: 0 },
    openings: [{ name: 'Sicilian Defense', games: 1, results: { wins: 1, draws: 0, losses: 0 } }],
  },
  black: {
    games: 2,
    results: { wins: 1, draws: 0, losses: 1 },
    openings: [],
  },
};

/** A fetch that answers every request with the reply given. */
function fetchAnswering(reply: () => Response): typeof fetch {
  const fakeFetch = async () => reply();
  return fakeFetch as typeof fetch;
}

describe("the Bot's record read from the service", () => {
  it('is the record the service answers', async () => {
    const service = fetchAnswering(() => Response.json(RECORD));

    const record = await readBotRecord(service);

    expect(record).toEqual(RECORD);
  });

  it('is undefined when the service cannot be reached', async () => {
    const unreachable = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    const record = await readBotRecord(unreachable);

    expect(record).toBeUndefined();
  });

  it('is undefined when the service turns the request away', async () => {
    const service = fetchAnswering(() => new Response('Too Many Requests', { status: 429 }));

    const record = await readBotRecord(service);

    expect(record).toBeUndefined();
  });

  it('is undefined when the reply is not a record', async () => {
    const withoutBlack = { games: RECORD.games, results: RECORD.results, white: RECORD.white };
    const service = fetchAnswering(() => Response.json(withoutBlack));

    const record = await readBotRecord(service);

    expect(record).toBeUndefined();
  });
});

describe('a score', () => {
  it('counts a point for a win and half a point for a draw, as a share of the games', () => {
    expect(score({ wins: 3, draws: 2, losses: 5 })).toBe(0.4);
  });
});

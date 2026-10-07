// Tests for how the write-up page reads the Session Game counts from the
// service and turns them into what it shows. A stand-in for fetch answers as
// the service would.

import { describe, expect, it } from 'vitest';
import { readSessionGameSummary } from './session-game-summary';

const COUNTS = {
  games: 12,
  bot_wins: 7,
  bot_losses: 3,
  draws: 2,
  bot_moves_from_opening_book: 30,
  bot_moves_from_base_model: 270,
  felt_like_a_real_player: 4,
  did_not_feel_like_a_real_player: 2,
  impression_not_given: 6,
};

/** A fetch that answers every request with the reply given. */
function fetchAnswering(reply: () => Response): typeof fetch {
  const fakeFetch = async () => reply();
  return fakeFetch as typeof fetch;
}

describe('the Session Game summary shown on the write-up', () => {
  it("shows how many games were played and the Bot's wins, draws and losses", async () => {
    const service = fetchAnswering(() => Response.json(COUNTS));

    const summary = await readSessionGameSummary(service);

    expect(summary?.games).toBe('12');
    expect(summary?.botRecord).toBe('7 wins, 2 draws, 3 losses');
  });

  it('writes a single win, draw or loss in the singular', async () => {
    const service = fetchAnswering(() => Response.json({ ...COUNTS, games: 3, bot_wins: 1, bot_losses: 1, draws: 1 }));

    const summary = await readSessionGameSummary(service);

    expect(summary?.botRecord).toBe('1 win, 1 draw, 1 loss');
  });

  it("scores the Bot as chess does: a point for a win and half a point for a draw", async () => {
    const service = fetchAnswering(() => Response.json(COUNTS));

    const summary = await readSessionGameSummary(service);

    // (7 + 2 / 2) points from 12 games
    expect(summary?.botScore).toBe('67%');
  });

  it('gives no score before any game has been played', async () => {
    const service = fetchAnswering(() => Response.json({ ...COUNTS, games: 0, bot_wins: 0, bot_losses: 0, draws: 0 }));

    const summary = await readSessionGameSummary(service);

    expect(summary?.games).toBe('0');
    expect(summary?.botScore).toBeUndefined();
  });

  it("shows the share of the Bot's moves that came from the Opening Book", async () => {
    const service = fetchAnswering(() => Response.json(COUNTS));

    const summary = await readSessionGameSummary(service);

    // 30 of 300 moves
    expect(summary?.fromOpeningBook).toBe('10%');
  });

  it('shows how many of the visitors who answered felt they had played a real player', async () => {
    const service = fetchAnswering(() => Response.json(COUNTS));

    const summary = await readSessionGameSummary(service);

    expect(summary?.feltLikeARealPlayer).toBe('4 of 6 who answered');
  });

  it('shows nothing when the service cannot be reached', async () => {
    const unreachable = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    const summary = await readSessionGameSummary(unreachable);

    expect(summary).toBeUndefined();
  });

  it('shows nothing when the service turns the request away', async () => {
    // The web server's rate limit answers with a page of its own, not counts.
    const rateLimited = fetchAnswering(() => new Response('<html>503 Service Temporarily Unavailable</html>', { status: 503 }));

    const summary = await readSessionGameSummary(rateLimited);

    expect(summary).toBeUndefined();
  });

  it('shows nothing when what comes back is not the counts', async () => {
    // A server with nothing behind /api/ may answer with a page of the site.
    const notTheService = fetchAnswering(() => new Response('<!doctype html><title>ChessMe</title>'));

    const summary = await readSessionGameSummary(notTheService);

    expect(summary).toBeUndefined();
  });
});

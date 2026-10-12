// Tests for playing the Bot's games under Node: playing a game between two
// players to its end.

import { describe, expect, it } from 'vitest';
import type { MoveRequest } from '../game/game';
import { playGame, type Player } from './bot-games';

/** A player that plays the given moves in order, whatever the position. */
function scripted(moves: MoveRequest[]): Player {
  let next = 0;
  return async () => {
    const move = moves[next];
    next += 1;
    return move;
  };
}

describe('playing a game between two players', () => {
  it('plays the two sides in turn until the game ends, recording every move', async () => {
    // The fool's mate: Black mates on its second move.
    const white = scripted([
      { from: 'f2', to: 'f3' },
      { from: 'g2', to: 'g4' },
    ]);
    const black = scripted([
      { from: 'e7', to: 'e5' },
      { from: 'd8', to: 'h4' },
    ]);

    const game = await playGame(white, black);

    expect(game.moves).toEqual(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(game.ending).toEqual({ kind: 'checkmate', winner: 'black' });
  });

  it('stops with an error when a player answers an illegal move', async () => {
    const white = scripted([{ from: 'e2', to: 'e5' }]);
    const black = scripted([]);

    await expect(playGame(white, black)).rejects.toThrow('Illegal move e2e5');
  });
});

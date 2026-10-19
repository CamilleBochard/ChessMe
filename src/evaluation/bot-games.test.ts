// Tests for playing the Bot's games under Node: playing a game between two
// players to its end, and seeding both players' draws so a run can be
// replayed.

import { describe, expect, it } from 'vitest';
import type { BaseModel } from '../engine/base-model';
import { drawMove } from '../engine/move-draw';
import { selectMove } from '../engine/move-selection';
import { gameFromFen, legalMoves, type MoveRequest } from '../game/game';
import { playGame, seededPlayers, type Player } from './bot-games';
import { seededRandom } from './seeded-random';

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

/**
 * A Base Model that prefers the legal moves in the order the rules list them,
 * each half as likely as the one before, so that a draw and the most likely
 * move usually differ.
 */
const halvingModel: BaseModel = {
  movePolicy: async (game) => {
    const moves = legalMoves(game);
    const weights = moves.map((_, index) => 0.5 ** index);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    return moves.map((move, index) => ({ move: move, probability: weights[index] / total }));
  },
};

/** The moves of a game the Bot plays as White against its opponent, both seeded. */
async function seededGame(temperature: number, seed: number): Promise<string[]> {
  const players = seededPlayers({
    bot: { baseModel: halvingModel, temperature: temperature },
    opponentModel: halvingModel,
    seed: seed,
  });
  const game = await playGame(players.bot, players.opponent);
  return game.moves;
}

describe('seeding the Bot and its opponent', () => {
  it('replays the same game from the same seed, the Bot drawing its moves', async () => {
    const first = await seededGame(1, 7);
    const second = await seededGame(1, 7);

    expect(second).toEqual(first);
  });

  it('plays at temperature 0 the games the top-move Bot was recorded with', async () => {
    // How the recorded games were played: the Bot's top move, and an opponent
    // drawing from the seed's stream alone.
    const opponentRandom = seededRandom(13);
    const topMoveBot: Player = (fen) => selectMove(fen, { baseModel: halvingModel, temperature: 0 });
    const recordedOpponent: Player = async (fen) => {
      const policy = await halvingModel.movePolicy(gameFromFen(fen));
      return drawMove(policy, opponentRandom);
    };
    const recorded = await playGame(topMoveBot, recordedOpponent);

    const replayed = await seededGame(0, 13);

    expect(replayed).toEqual(recorded.moves);
  });
});

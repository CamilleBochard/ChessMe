// Tests for finding, in the game on the board, the Bot's moves and the reply
// the engine gave with each.

import { describe, expect, it } from 'vitest';
import type { BotMove } from '../engine/move-selection';
import { currentFen, newGame, playMove, type Game, type MoveRequest } from '../game/game';
import { botMovesOf, replyKey } from './explained-moves';

function play(moves: MoveRequest[]): Game {
  let game = newGame();
  for (const move of moves) {
    game = playMove(game, move)!;
  }
  return game;
}

describe("the Bot's moves in the game", () => {
  it('are the moves of its side, each with the reply it was given for that position', () => {
    // The visitor plays White; the Bot answered 1. e4 with c5 and 2. Nf3 with d6.
    const afterOneMove = play([{ from: 'e2', to: 'e4' }]);
    const afterTwoMoves = play([{ from: 'e2', to: 'e4' }, { from: 'c7', to: 'c5' }, { from: 'g1', to: 'f3' }]);
    const sicilian: BotMove = { move: { from: 'c7', to: 'c5' }, source: 'opening-book', counts: { reached: 282, played: 116 } };
    const pawnToD6: BotMove = { move: { from: 'd7', to: 'd6' }, source: 'opening-book', counts: undefined };
    const replies = new Map([
      [replyKey(currentFen(afterOneMove), sicilian.move), sicilian],
      [replyKey(currentFen(afterTwoMoves), pawnToD6.move), pawnToD6],
    ]);
    const game = playMove(afterTwoMoves, pawnToD6.move)!;

    const botMoves = botMovesOf(game, 'black', replies);

    expect(botMoves.map((explained) => [explained.ply, explained.phase, explained.san, explained.botMove])).toEqual([
      [2, 'opening', 'c5', sicilian],
      [4, 'opening', 'd6', pawnToD6],
    ]);
  });
});

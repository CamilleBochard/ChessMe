// Tests for finding, in the game on the board, the Bot's moves and the reply
// the engine gave with each.

import { describe, expect, it } from 'vitest';
import type { BotMove } from '../engine/move-selection';
import { currentFen, newGame, playMove, type Game, type MoveRequest } from '../game/game';
import { botMovesOf, candidateRows, movesOnTheChart, rankOf, replyKey } from './explained-moves';
import type { Candidate } from '../engine/move-selection';

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

describe('the candidates the panel lists', () => {
  /** Ten candidates, most likely first; their moves do not matter here. */
  const candidates: Candidate[] = Array.from({ length: 10 }, (_, index) => ({
    move: { from: 'a2', to: 'a3' },
    modelProbability: (10 - index) / 55,
    drawnProbability: (10 - index) / 55,
  }));

  it("are the model's five most likely moves, with the move played after them when it ranks lower", () => {
    const amongTheFive = candidateRows(candidates, 3);
    const furtherDown = candidateRows(candidates, 7);

    expect(amongTheFive).toEqual({ mostLikely: candidates.slice(0, 5), playedFurtherDown: null });
    expect(furtherDown).toEqual({ mostLikely: candidates.slice(0, 5), playedFurtherDown: candidates[6] });
  });
});

describe("where the Bot's move stood", () => {
  it("is its rank among the legal moves when the Base Model chose it, such as 1/22 for the model's favourite", () => {
    const fromModel: Extract<BotMove, { source: 'base-model' }> = {
      move: { from: 'e7', to: 'e5' },
      source: 'base-model',
      legalMoves: 22,
      candidates: [],
      rank: 1,
      temperature: 1,
      cut: { kind: 'none' },
    };

    expect(rankOf(fromModel)).toBe('1/22');
  });
});

describe("the Bot's moves the chart may show", () => {
  it('leave out its last three while the game goes on, so the chart never tells where it just went wrong', () => {
    const botMoves = ['first', 'second', 'third', 'fourth', 'fifth'];

    expect(movesOnTheChart(botMoves, { revealed: false })).toEqual(['first', 'second']);
  });

  it('are all of them once the evaluations are revealed, in analysis mode or once the game is over', () => {
    const botMoves = ['first', 'second', 'third', 'fourth', 'fifth'];

    expect(movesOnTheChart(botMoves, { revealed: true })).toEqual(botMoves);
  });

  it('are none while the Bot has played no more than three', () => {
    expect(movesOnTheChart(['first', 'second'], { revealed: false })).toEqual([]);
  });
});

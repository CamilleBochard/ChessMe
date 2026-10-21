// Tests for the end-of-game report: what the Bot's moves in one game add up
// to, and Camille's figures they are set against.

import { describe, expect, it } from 'vitest';
import { currentFen, newGame, playMove } from '../game/game';
import type { BotMove } from '../engine/move-selection';
import { camilleFigures, gameReport, moveMatching, reportedMovesOf, type ReportedMove } from './game-report';
import { botMovesOf, replyKey } from './explained-moves';
import type { ShippedLossYardstick } from './yardsticks';

/** A Base Model move in the middlegame that lost nothing, changed as each test needs. */
function move(changes: Partial<ReportedMove> = {}): ReportedMove {
  return {
    ply: 20,
    phase: 'middlegame',
    san: 'Nf3',
    source: 'base-model',
    modelProbability: 0.4,
    positionAfter: 'a-position w -',
    evaluation: { centipawnLoss: 0, openPosition: true },
    ...changes,
  };
}

describe('the report of the Bot\'s game', () => {
  it('counts as plausible for Camille a move from his Opening Book or one the model gave at least 1%', () => {
    const moves = [
      move({ source: 'opening-book', modelProbability: undefined }),
      move({ modelProbability: 0.01 }),
      move({ modelProbability: 0.009 }),
      move({ source: 'random', modelProbability: undefined }),
    ];

    const report = gameReport(moves, null);

    expect(report.moves).toBe(4);
    expect(report.plausible).toBe(2);
  });

  it("counts its Opening Book moves, and its model moves of the first fifteen that led to one of Camille's positions", () => {
    const camillePositions = new Set(['his position b KQkq']);
    const moves = [
      move({ ply: 2, source: 'opening-book', modelProbability: undefined, positionAfter: 'his position b KQkq' }),
      move({ ply: 12, positionAfter: 'his position b KQkq' }),
      move({ ply: 14, positionAfter: 'another position b KQkq' }),
      move({ ply: 32, positionAfter: 'his position b KQkq' }),
    ];

    const report = gameReport(moves, camillePositions);

    expect(report.fromOpeningBook).toBe(1);
    expect(report.reachedByCamille).toEqual({ count: 1, of: 2 });
  });

  it("says nothing of Camille's positions until they have been read", () => {
    const report = gameReport([move()], null);

    expect(report.reachedByCamille).toBeNull();
  });

  it('averages each Phase over the moves Stockfish measured in open positions, and counts those still being measured', () => {
    const moves = [
      move({ phase: 'middlegame', evaluation: { centipawnLoss: 40, openPosition: true } }),
      move({ phase: 'middlegame', evaluation: { centipawnLoss: 400, openPosition: true } }),
      move({ phase: 'middlegame', evaluation: { centipawnLoss: 0, openPosition: false } }),
      move({ phase: 'middlegame', evaluation: 'pending' }),
      move({ phase: 'endgame', evaluation: 'failed' }),
    ];

    const report = gameReport(moves, null);

    expect(report.phases.middlegame).toEqual({ measured: 2, averageLoss: 220 });
    expect(report.phases.endgame).toEqual({ measured: 0, averageLoss: null });
    expect(report.pending).toBe(1);
  });

  it('counts the moves that lost more than three pawns, out of those measured in open positions', () => {
    const moves = [
      move({ evaluation: { centipawnLoss: 300, openPosition: true } }),
      move({ evaluation: { centipawnLoss: 301, openPosition: true } }),
      move({ evaluation: { centipawnLoss: 900, openPosition: false } }),
    ];

    const report = gameReport(moves, null);

    expect(report.overThreePawns).toEqual({ count: 1, of: 2 });
  });

  it('names the model moves under 1%, with what each lost once measured', () => {
    const moves = [
      move({ ply: 13, san: 'f6', modelProbability: 0.001, evaluation: { centipawnLoss: 197, openPosition: true } }),
      move({ ply: 15, san: 'Nf6', modelProbability: 0.3 }),
      move({ ply: 51, san: 'e4', modelProbability: 0.004, evaluation: 'pending' }),
    ];

    const report = gameReport(moves, null);

    expect(report.improbable).toEqual([
      { ply: 13, san: 'f6', probability: 0.001, loss: 197 },
      { ply: 51, san: 'e4', probability: 0.004, loss: null },
    ]);
  });
});

describe("Camille's figures the report sets the Bot's beside", () => {
  const losses: ShippedLossYardstick = {
    measuredOn: '2026-10-15',
    engine: 'Stockfish 19 Lite WASM',
    depth: 14,
    losses: 'losses.jsonl',
    games: 3,
    moves: 100,
    movesForAVerdict: 8,
    phases: {
      opening: { perGame: null },
      middlegame: { perGame: { games: 3, low: 24, high: 160 } },
      endgame: { perGame: { games: 2, low: 46, high: 216 } },
    },
    profile: { moves: 100, atMost: [0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.92, 0.96, 0.99] },
  };

  it('reads the share of his moves that lost more than three pawns, and the range of his games per Phase', () => {
    const figures = camilleFigures(losses);

    // 92% of his moves lost at most 300 centipawns.
    expect(figures.overThreePawnsShare).toBeCloseTo(0.08);
    expect(figures.lossRanges.middlegame).toEqual({ games: 3, low: 24, high: 160 });
    expect(figures.lossRanges.opening).toBeNull();
  });
});

describe("the Bot's moves as the report reads them", () => {
  it('give the model probability of the move played and the position it left, written as Camille\'s positions are', () => {
    const afterE4 = playMove(newGame(), { from: 'e2', to: 'e4' })!;
    const reply: BotMove = {
      move: { from: 'c7', to: 'c5' },
      source: 'base-model',
      legalMoves: 20,
      candidates: [
        { move: { from: 'e7', to: 'e5' }, modelProbability: 0.5, drawnProbability: 0.5 },
        { move: { from: 'c7', to: 'c5' }, modelProbability: 0.3, drawnProbability: 0.3 },
      ],
      rank: 2,
      temperature: 1,
      cut: { kind: 'none' },
    };
    const game = playMove(afterE4, reply.move)!;
    const botMoves = botMovesOf(game, 'black', new Map([[replyKey(currentFen(afterE4), reply.move), reply]]));

    const [reported] = reportedMovesOf(botMoves, new Map());

    expect(reported.modelProbability).toBe(0.3);
    expect(reported.positionAfter).toBe('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq');
    expect(reported.evaluation).toBe('pending');
  });
});

describe('how often the model guesses Camille\'s move', () => {
  it('reads the fine-tuned model and the untrained one on the Test Set, as times in 100', () => {
    const results = {
      rating: 1100,
      baseline: { overall: { matched: 3533, positions: 7092, games: 230 } },
      variants: { full: { testSet: { overall: { matched: 3822, positions: 7092, games: 230 } } } },
    };

    expect(moveMatching(results)).toEqual({ games: 230, fineTuned: 54, untrained: 50, rating: 1100 });
  });
});

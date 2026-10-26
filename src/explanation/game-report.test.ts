// Tests for the end-of-game report: what the Bot's moves in one game add up
// to, and Camille's figures they are set against.

import { describe, expect, it } from 'vitest';
import { currentFen, newGame, playMove } from '../game/game';
import type { BotMove } from '../engine/move-selection';
import {
  camilleFigures,
  camillePlausibleShare,
  gameReport,
  moveMatching,
  reportedMovesOf,
  type ReportedMove,
} from './game-report';
import { botMovesOf, replyKey } from './explained-moves';
import type { MoveEvaluation } from './panel';
import type { MoveCut } from '../engine/move-cut';
import {
  IMPROBABLE_BELOW,
  RARITY_LADDER,
  type ShippedImprobabilityYardstick,
  type ShippedLossYardstick,
} from './yardsticks';

/** A Base Model move in the middlegame that lost nothing, changed as each test needs. */
function move(changes: Partial<ReportedMove> = {}): ReportedMove {
  return {
    ply: 20,
    phase: 'middlegame',
    san: 'Nf3',
    source: 'base-model',
    modelProbability: 0.4,
    positionAfter: 'a-position w -',
    fen: 'a-position w - - 0 10',
    uci: 'g1f3',
    evaluation: { centipawnLoss: 0, openPosition: true },
    ...changes,
  };
}

describe('the report of the Bot\'s game', () => {
  it('counts the moves each side played, whether measured yet or not', () => {
    const visitorEvaluations: MoveEvaluation[] = [{ centipawnLoss: 0, openPosition: true }, 'pending', 'failed'];

    const report = gameReport([move(), move()], null, visitorEvaluations);

    expect(report.moves).toBe(2);
    expect(report.visitorMoves).toBe(3);
  });

  it('counts as plausible for Camille a move from his Opening Book or one the model gave at least 1%', () => {
    const moves = [
      move({ source: 'opening-book', modelProbability: undefined }),
      move({ modelProbability: 0.01 }),
      move({ modelProbability: 0.009 }),
      move({ source: 'random', modelProbability: undefined }),
    ];

    const report = gameReport(moves, null, []);

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

    const report = gameReport(moves, camillePositions, []);

    expect(report.fromOpeningBook).toBe(1);
    expect(report.reachedByCamille).toEqual({ count: 1, of: 2 });
  });

  it("says nothing of Camille's positions until they have been read", () => {
    const report = gameReport([move()], null, []);

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

    const report = gameReport(moves, null, []);

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

    const report = gameReport(moves, null, []);

    expect(report.overThreePawns).toEqual({ count: 1, of: 2 });
  });

  it('names the model moves under 1%, with what each lost once measured', () => {
    const moves = [
      move({ ply: 13, san: 'f6', modelProbability: 0.001, evaluation: { centipawnLoss: 197, openPosition: true } }),
      move({ ply: 15, san: 'Nf6', modelProbability: 0.3 }),
      move({ ply: 51, san: 'e4', modelProbability: 0.004, evaluation: 'pending' }),
    ];

    const report = gameReport(moves, null, []);

    expect(report.improbable).toEqual([
      { ply: 13, san: 'f6', probability: 0.001, loss: 197 },
      { ply: 51, san: 'e4', probability: 0.004, loss: null },
    ]);
  });
});

describe("the average loss of each side", () => {
  it("averages the Bot's moves and the visitor's over those measured in open positions, and counts both while measured", () => {
    const moves = [
      move({ evaluation: { centipawnLoss: 20, openPosition: true } }),
      move({ evaluation: { centipawnLoss: 60, openPosition: true } }),
      move({ evaluation: { centipawnLoss: 900, openPosition: false } }),
    ];
    const visitorEvaluations: MoveEvaluation[] = [
      { centipawnLoss: 100, openPosition: true },
      'pending',
      'failed',
    ];

    const report = gameReport(moves, null, visitorEvaluations);

    expect(report.averageLoss).toEqual({ bot: 40, visitor: 100 });
    expect(report.pending).toBe(1);
  });

  it('has no average for a side none of whose moves was measured in an open position', () => {
    const report = gameReport([move({ evaluation: 'pending' })], null, []);

    expect(report.averageLoss).toEqual({ bot: null, visitor: null });
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

  it('counts as plausible his Opening Book moves and those the model gave at least 1%, out of all his moves', () => {
    /** A Phase of his where the share given at the 1% rung of the ladder is the share under 1%. */
    function phase(moves: number, shareUnderOnePercent: number) {
      const atOrBelow = RARITY_LADDER.map((rung) => {
        if (rung < IMPROBABLE_BELOW) {
          return 0;
        }
        if (rung === IMPROBABLE_BELOW) {
          return shareUnderOnePercent;
        }
        return 1;
      });
      return { moves: moves, atOrBelow: atOrBelow, perGame: null };
    }
    const improbability: ShippedImprobabilityYardstick = {
      measuredOn: '2026-10-14',
      baseModel: 'model.onnx',
      rating: 1100,
      records: 'records.jsonl',
      games: 3,
      moves: 10,
      movesOutsideOpeningBook: 8,
      movesForAVerdict: 8,
      // 1 of 4 and 2 of 4 under 1%; the endgame holds none of his moves.
      phases: { opening: phase(4, 0.25), middlegame: phase(4, 0.5), endgame: phase(0, NaN) },
    };

    // 2 Opening Book moves and 5 of the 8 others.
    expect(camillePlausibleShare(improbability)).toBeCloseTo(0.7);
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

  it('keeps the position each move was played from and the move in UCI form, for the style discriminator to read', () => {
    const afterE4 = playMove(newGame(), { from: 'e2', to: 'e4' })!;
    const reply: BotMove = {
      move: { from: 'c7', to: 'c5' },
      source: 'base-model',
      legalMoves: 20,
      candidates: [{ move: { from: 'c7', to: 'c5' }, modelProbability: 0.3, drawnProbability: 0.3 }],
      rank: 1,
      temperature: 1,
      cut: { kind: 'none' },
    };
    const game = playMove(afterE4, reply.move)!;
    const botMoves = botMovesOf(game, 'black', new Map([[replyKey(currentFen(afterE4), reply.move), reply]]));

    const [reported] = reportedMovesOf(botMoves, new Map());

    expect(reported.fen).toBe(currentFen(afterE4));
    expect(reported.uci).toBe('c7c5');
  });
});

describe("how often the Bot plays Camille's move", () => {
  /** A run of the Bot on the Test Set, as the opening-cut experiment records it. */
  function run(openingCut: MoveCut, drawnMatched: number) {
    return {
      baseModel: 'maia3-5m-fine-tuned',
      temperature: 1,
      openingCut: openingCut,
      drawn: { overall: { matched: drawnMatched, positions: 7092, games: 230 } },
    };
  }
  const served = { baseModel: 'maia3-5m-fine-tuned', temperature: 1, openingCut: { kind: 'top-k', k: 10 } } as const;

  it('reads the drawn share of the run set up as the Bot is served, and how many games that holds', () => {
    const results = { first: run({ kind: 'none' }, 2935), second: run({ kind: 'top-k', k: 10 }, 2937) };

    const matching = moveMatching(results, served);

    expect(matching.games).toBe(230);
    expect(matching.guessed).toBeCloseTo(2937 / 7092);
  });

  it('refuses results none of whose runs is set up as the Bot is served', () => {
    const results = { first: run({ kind: 'none' }, 2935), second: run({ kind: 'top-k', k: 5 }, 2937) };

    expect(() => moveMatching(results, served)).toThrow();
  });
});

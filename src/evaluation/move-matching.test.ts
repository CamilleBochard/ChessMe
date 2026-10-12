// Tests for the Move-Matching harness. The fixture is a Test Set of seven
// positions and the engine is a table of fixed answers, so the expected score
// can be counted by hand from the comments below.

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { MoveProbability } from '../engine/base-model';
import { gameFromFen, legalMoves, uciName, type MoveRequest } from '../game/game';
import { measureDrawnMoveMatching, measureMoveMatching, readPositions, type PlayedPosition } from './move-matching';

const FIXTURE_TEST_SET = new URL('./fixtures/test-set.jsonl', import.meta.url);

/**
 * What the stand-in engine plays in each fixture position, beside the move
 * Camille played there. Five of the seven agree.
 */
const ANSWERS: Record<string, MoveRequest> = {
  // Ply 1, Camille played e2e4: agrees.
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1': { from: 'e2', to: 'e4' },
  // Ply 3, Camille played g1f3: differs.
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2': { from: 'b1', to: 'c3' },
  // Ply 9, Camille castled, e1g1: agrees.
  'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5': { from: 'e1', to: 'g1' },
  // Ply 10, Camille played e5d4: agrees.
  'r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 5': { from: 'e5', to: 'd4' },
  // Ply 11, Camille played d4c6: differs.
  'r1bqkbnr/pppp1ppp/2n5/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 0 6': { from: 'f1', to: 'c4' },
  // Ply 30, Camille played a8d8: agrees.
  'r4rk1/ppp2ppp/2n5/3q4/3P4/2P2N2/P4PPP/R2Q1RK1 b - - 0 15': { from: 'a8', to: 'd8' },
  // Ply 81, Camille promoted to a queen, e7e8q: agrees.
  '8/4P3/8/8/2k5/8/8/4K3 w - - 0 41': { from: 'e7', to: 'e8', promotion: 'queen' },
};

async function answerFromTable(fen: string): Promise<MoveRequest> {
  return ANSWERS[fen];
}

describe('measureMoveMatching', () => {
  it('counts the positions where the engine plays the move Camille played', async () => {
    const testSet = readPositions(await readFile(FIXTURE_TEST_SET, 'utf-8'));

    const report = await measureMoveMatching(testSet, answerFromTable);

    expect(report.overall).toMatchObject({ matched: 5, positions: 7 });
  });

  it('scores the positions after ply 10 on their own', async () => {
    const testSet = readPositions(await readFile(FIXTURE_TEST_SET, 'utf-8'));

    const report = await measureMoveMatching(testSet, answerFromTable);

    // Plies 11, 30 and 81; the engine agrees at 30 and 81. Ply 10 is left out.
    expect(report.afterPly10).toMatchObject({ matched: 2, positions: 3 });
  });

  it('scores each Phase on its own', async () => {
    const testSet = readPositions(await readFile(FIXTURE_TEST_SET, 'utf-8'));

    const report = await measureMoveMatching(testSet, answerFromTable);

    // Opening: plies 1, 3, 9 and 10, all but ply 3 agree. Middlegame: plies 11
    // and 30, only ply 30 agrees. Endgame: ply 81, which agrees.
    expect(report.byPhase.opening).toMatchObject({ matched: 3, positions: 4 });
    expect(report.byPhase.middlegame).toMatchObject({ matched: 1, positions: 2 });
    expect(report.byPhase.endgame).toMatchObject({ matched: 1, positions: 1 });
  });

  it('estimates the standard error by treating each game as one sample', async () => {
    const testSet = readPositions(await readFile(FIXTURE_TEST_SET, 'utf-8'));

    const report = await measureMoveMatching(testSet, answerFromTable);

    // Worked by hand. The share is 5/7. Each game's matches less 5/7 of its
    // positions: game 1 has 2 of 3, giving -1/7; game 2 has 2 of 3, -1/7; game
    // 3 has 1 of 1, 2/7. Their squares sum to 6/49. With three games the
    // variance is 3/2 * (6/49) / 7^2 = 9/2401, so the standard error is 3/49.
    expect(report.overall.standardError).toBeCloseTo(3 / 49, 10);
  });
});

/** Camille's move in the position, as one of its legal moves. */
function camillesMove(position: PlayedPosition): MoveRequest {
  const legal = legalMoves(gameFromFen(position.fen));
  return legal.find((move) => uciName(move) === position.move)!;
}

/** A move other than Camille's, standing in for whatever else the Bot might play. */
const SOME_OTHER_MOVE: MoveRequest = { from: 'a2', to: 'a3' };

describe('measureDrawnMoveMatching', () => {
  it('scores the top move by whether it is Camille\'s, and the draw by the probability it gives his move', async () => {
    const testSet = readPositions(await readFile(FIXTURE_TEST_SET, 'utf-8'));
    // Through ply 10 Camille's move is the most likely, at 0.6; after it, his
    // move comes second, at 0.3.
    const distributions = new Map<string, MoveProbability[]>();
    for (const position of testSet) {
      const his = camillesMove(position);
      if (position.ply <= 10) {
        distributions.set(position.fen, [
          { move: his, probability: 0.6 },
          { move: SOME_OTHER_MOVE, probability: 0.4 },
        ]);
      } else {
        distributions.set(position.fen, [
          { move: SOME_OTHER_MOVE, probability: 0.7 },
          { move: his, probability: 0.3 },
        ]);
      }
    }

    const report = await measureDrawnMoveMatching(testSet, async (fen) => distributions.get(fen)!);

    // Top move: the four opening positions match, the three later ones do not.
    expect(report.topMove.overall).toMatchObject({ matched: 4, positions: 7 });
    expect(report.topMove.byPhase.opening).toMatchObject({ matched: 4, positions: 4 });
    // Draw: 4 x 0.6 + 3 x 0.3 = 3.3 matches expected of 7; the middlegame's
    // two positions expect 0.6, the endgame's one 0.3.
    expect(report.drawn.overall.matched).toBeCloseTo(3.3, 10);
    expect(report.drawn.byPhase.opening.matched).toBeCloseTo(2.4, 10);
    expect(report.drawn.byPhase.middlegame.matched).toBeCloseTo(0.6, 10);
    expect(report.drawn.byPhase.endgame.matched).toBeCloseTo(0.3, 10);
    expect(report.drawn.afterPly10.matched).toBeCloseTo(0.9, 10);
  });
});

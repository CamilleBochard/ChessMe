// Tests for the Move-Matching harness. The fixture is a Test Set of seven
// positions and the engine is a table of fixed answers, so the expected score
// can be counted by hand from the comments below.

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { MoveRequest } from '../game/game';
import { measureMoveMatching, readTestSet } from './move-matching';

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
  'r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 3': { from: 'e5', to: 'd4' },
  // Ply 11, Camille played d4c6: differs.
  'r1bqkbnr/pppp1ppp/2n5/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 0 5': { from: 'f1', to: 'c4' },
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
    const testSet = readTestSet(await readFile(FIXTURE_TEST_SET, 'utf-8'));

    const report = await measureMoveMatching(testSet, answerFromTable);

    expect(report.overall).toEqual({ matched: 5, positions: 7 });
  });
});

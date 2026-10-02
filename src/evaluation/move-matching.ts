// The evaluation harness: replays Camille's Test Set positions through an
// engine and counts how often it plays the move he played. That share is
// Move-Matching, the project's primary measure of Style.
// Free of anything DOM or Node, so the same code could score the engine
// wherever it runs; reading files is left to the caller.

import type { MoveRequest } from '../game/game';

/** One of Camille's positions, as the Python pipeline writes it to the Test Set. */
export interface TestPosition {
  /** The position Camille faced, before his move. */
  fen: string;
  /** The ply of his move: White's first move is ply 1. */
  ply: number;
  /** The move he played, in UCI form such as e2e4, e1g1 or e7e8q. */
  move: string;
}

/** How many positions were scored and in how many the engine played Camille's move. */
export interface MoveMatchingScore {
  matched: number;
  positions: number;
}

export interface MoveMatchingReport {
  overall: MoveMatchingScore;
  /**
   * Positions from ply 11 on. Published Maia figures leave out each game's
   * first ten plies, where the opening makes moves easy to predict, so this is
   * the score to compare with them.
   */
  afterPly10: MoveMatchingScore;
}

/** The last ply left out of the score compared with published Maia figures. */
const LAST_OPENING_PLY = 10;

/** Whatever chooses a move for a position, usually the Move-Selection Engine. */
export type ChooseMove = (fen: string) => Promise<MoveRequest>;

/** Reads a Test Set in JSON Lines, one position per line. */
export function readTestSet(jsonLines: string): TestPosition[] {
  const positions: TestPosition[] = [];
  for (const line of jsonLines.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const record = JSON.parse(line);
    positions.push({ fen: record.fen, ply: record.ply, move: record.move });
  }
  return positions;
}

/** Asks the engine for its move in every position and counts the ones that match Camille's. */
export async function measureMoveMatching(testSet: TestPosition[], chooseMove: ChooseMove): Promise<MoveMatchingReport> {
  const overall: MoveMatchingScore = { matched: 0, positions: 0 };
  const afterPly10: MoveMatchingScore = { matched: 0, positions: 0 };

  for (const position of testSet) {
    const engineMove = await chooseMove(position.fen);
    const isMatch = uciName(engineMove) === position.move;

    addToScore(overall, isMatch);
    if (position.ply > LAST_OPENING_PLY) {
      addToScore(afterPly10, isMatch);
    }
  }
  return { overall: overall, afterPly10: afterPly10 };
}

function addToScore(score: MoveMatchingScore, isMatch: boolean): void {
  score.positions = score.positions + 1;
  if (isMatch) {
    score.matched = score.matched + 1;
  }
}

/** The move in UCI form, the form the Test Set records Camille's moves in. */
function uciName(move: MoveRequest): string {
  let suffix = '';
  if (move.promotion !== undefined) {
    suffix = UCI_PROMOTION_LETTERS[move.promotion];
  }
  return move.from + move.to + suffix;
}

const UCI_PROMOTION_LETTERS = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };

// Tests for analysis mode's measure of a move: the evaluation it lost against
// the best move, read as the Blunder Profile reads it, and the conversation
// with the engine that produces it.

import { describe, expect, it } from 'vitest';
import { connectAnalyser, moveLoss, type EnginePort } from './engine-analysis';

describe('the evaluation a move lost', () => {
  it('is how far the played move scores below the best one, from the side that moved', () => {
    const loss = moveLoss({ best: { centipawns: 50 }, played: { centipawns: -30 } });

    expect(loss).toEqual({ centipawnLoss: 80, openPosition: true });
  });

  it('is nothing when the played move, searched on its own, scores a little above the best', () => {
    const loss = moveLoss({ best: { centipawns: 20 }, played: { centipawns: 24 } });

    expect(loss.centipawnLoss).toBe(0);
  });

  it('reads a score beyond ten pawns, and any mate, as ten pawns', () => {
    // Mate in three against +2: a mate counts as +10, so the move lost 8 pawns.
    const missedMate = moveLoss({ best: { mateIn: 3 }, played: { centipawns: 200 } });
    // +25 against +15, both beyond the cap: read as +10 against +10.
    const stillWinning = moveLoss({ best: { centipawns: 2500 }, played: { centipawns: 1500 } });

    expect(missedMate.centipawnLoss).toBe(800);
    expect(stillWinning.centipawnLoss).toBe(0);
  });

  it('comes from an open position unless both moves score ten pawns or more for the same side', () => {
    const decided = moveLoss({ best: { mateIn: 2 }, played: { centipawns: 1200 } });
    const lostEitherWay = moveLoss({ best: { centipawns: -1100 }, played: { mateIn: -4 } });
    const throwsTheWinAway = moveLoss({ best: { centipawns: 1500 }, played: { centipawns: 300 } });

    expect(decided.openPosition).toBe(false);
    expect(lostEitherWay.openPosition).toBe(false);
    expect(throwsTheWinAway.openPosition).toBe(true);
  });
});

/**
 * A stand-in for Stockfish that records each command and answers a search
 * with the lines given: one set for a search of the whole position, another
 * for a search of the played move alone.
 */
function scriptedEngine(wholePosition: string[], playedMoveAlone: string[]): EnginePort & { received: string[] } {
  const received: string[] = [];
  let listener: (line: string) => void = () => {};
  return {
    received: received,
    send(command) {
      received.push(command);
      let answer: string[] = [];
      if (command === 'uci') {
        answer = ['id name Scripted', 'uciok'];
      } else if (command === 'isready') {
        answer = ['readyok'];
      } else if (command.startsWith('go') && command.includes('searchmoves')) {
        answer = playedMoveAlone;
      } else if (command.startsWith('go')) {
        answer = wholePosition;
      }
      // An engine answers later, never inside the call that asked.
      queueMicrotask(() => {
        for (const line of answer) {
          listener(line);
        }
      });
    },
    onLine(newListener) {
      listener = newListener;
    },
  };
}

describe('analysing a move', () => {
  const position = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

  it('searches the position for the best move, then the played move alone, at the depth given', async () => {
    const engine = scriptedEngine(
      ['info depth 14 seldepth 20 multipv 1 score cp 35 nodes 1000 pv c7c5 g1f3', 'bestmove c7c5 ponder g1f3'],
      ['info depth 14 seldepth 18 multipv 1 score cp -40 nodes 900 pv a7a5', 'bestmove a7a5'],
    );
    const analyser = connectAnalyser(engine, 14);

    const analysis = await analyser.analyse(position, 'a7a5');

    expect(analysis).toEqual({ bestMove: 'c7c5', best: { centipawns: 35 }, played: { centipawns: -40 } });
    // A new game clears the hash before the position, so the analysis depends
    // on the position and the depth alone; the two searches share it.
    expect(engine.received).toEqual([
      'uci',
      'ucinewgame',
      'isready',
      `position fen ${position}`,
      'go depth 14',
      `position fen ${position}`,
      'go depth 14 searchmoves a7a5',
    ]);
  });
});

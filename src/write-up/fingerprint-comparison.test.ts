// Tests for how the write-up page compares Camille's Style Fingerprint with
// the Bot's, read from the record pipeline/extract_style_fingerprint.py
// writes.

import { describe, expect, it } from 'vitest';
import { compareFingerprints, type FingerprintRecord, type StyleFingerprint } from './fingerprint-comparison';

const NO_PIECE = { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0 };

/** A loss distribution of 100 moves with the mean given, blunders losing 300 or more. */
function losses(mean: number, blunders: number) {
  return {
    moves: 100,
    mean: mean,
    histogram: [
      { from: 0, to: 300, moves: 100 - blunders },
      { from: 300, to: 500, moves: blunders },
    ],
  };
}

/** A fingerprint where every figure is zero unless given. */
function fingerprint(changes: Partial<StyleFingerprint> = {}): StyleFingerprint {
  const plain: StyleFingerprint = {
    games: 100,
    centipawn_loss: {
      phases: { opening: losses(0, 0), middlegame: losses(0, 0), endgame: losses(0, 0) },
    },
    piece_share: { phases: { opening: NO_PIECE, middlegame: NO_PIECE, endgame: NO_PIECE } },
    capture_taken_rate: { phases: { opening: { rate: 0 }, middlegame: { rate: 0 }, endgame: { rate: 0 } } },
    queen_trade_before_move_20: { rate: 0 },
    castling: { kingside: 0, queenside: 0, never: 0 },
  };
  return { ...plain, ...changes };
}

function record(changes: Partial<FingerprintRecord> = {}): FingerprintRecord {
  const plain: FingerprintRecord = {
    engine: 'Stockfish 19',
    depth: 18,
    camille: fingerprint(),
    bot: fingerprint(),
    camille_training_games: fingerprint(),
    camille_test_set: fingerprint(),
  };
  return { ...plain, ...changes };
}

describe('the Style Fingerprint comparison shown on the write-up', () => {
  it("compares the average size of Camille's mistakes with the Bot's, beside how far his own halves differ", () => {
    const middlegameLoss = (mean: number) =>
      fingerprint({
        centipawn_loss: { phases: { opening: losses(0, 0), middlegame: losses(mean, 0), endgame: losses(0, 0) } },
      });
    const fingerprints = record({
      camille: middlegameLoss(103.14),
      bot: middlegameLoss(54.94),
      camille_training_games: middlegameLoss(102.6),
      camille_test_set: middlegameLoss(105.0),
    });

    const rows = compareFingerprints(fingerprints);

    const row = rows.find((comparison) => comparison.statistic === 'Average loss per move, middlegame');
    expect(row).toMatchObject({ camille: '103.1', bot: '54.9', camilleAgainstHimself: '2.4' });
  });

  it('counts the moves that lose three pawns or more from the loss histogram', () => {
    const middlegameBlunders = (blunders: number) =>
      fingerprint({
        centipawn_loss: { phases: { opening: losses(0, 0), middlegame: losses(50, blunders), endgame: losses(0, 0) } },
      });
    const fingerprints = record({
      camille: middlegameBlunders(11),
      bot: middlegameBlunders(4),
      camille_training_games: middlegameBlunders(10),
      camille_test_set: middlegameBlunders(12),
    });

    const rows = compareFingerprints(fingerprints);

    const row = rows.find((comparison) => comparison.statistic === 'Moves losing three pawns or more, middlegame');
    expect(row).toMatchObject({ camille: '11.0%', bot: '4.0%', camilleAgainstHimself: '2.0%' });
  });

  it('shows Level first, then what Camille plays, then how he castles', () => {
    const rows = compareFingerprints(record());

    expect(rows.map((row) => row.statistic)).toEqual([
      'Average loss per move, middlegame',
      'Average loss per move, endgame',
      'Moves losing three pawns or more, middlegame',
      'Moves losing three pawns or more, endgame',
      'Pawn moves, middlegame',
      'Queen moves, opening',
      'Capture taken when one is offered, opening',
      'Capture taken when one is offered, endgame',
      'Queens traded off before move 20',
      'Castled kingside',
      'Castled queenside',
      'Never castled',
    ]);
  });

  it('reads how a player castles from the share of his games', () => {
    const fingerprints = record({
      camille: fingerprint({ castling: { kingside: 0.535, queenside: 0.152, never: 0.313 } }),
      bot: fingerprint({ castling: { kingside: 0.84, queenside: 0.065, never: 0.095 } }),
    });

    const rows = compareFingerprints(fingerprints);

    const row = rows.find((comparison) => comparison.statistic === 'Never castled');
    expect(row).toMatchObject({ camille: '31.3%', bot: '9.5%' });
  });
});

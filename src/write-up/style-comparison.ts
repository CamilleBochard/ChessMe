// The Style Fingerprint comparison as the write-up page presents it: a few of
// the fingerprint's statistics, chosen to be readable without knowing chess,
// for Camille and for the Bot. Beside each, how far Camille's training games
// and his Test Set differ on it: the same player on two sets of his games, so
// the gap chance alone produces. A gap between Camille and the Bot means
// something only when it is well beyond that one.
// Free of anything DOM so that it is tested under Node.

import type { Phase } from '../evaluation/move-matching';

/** How much evaluation a player's moves gave up, in one Phase. */
interface LossDistribution {
  moves: number;
  mean: number;
  histogram: { from: number; to: number | null; moves: number }[];
}

type PieceName = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

/** The part of one player's fingerprint the page shows, as pipeline/style_fingerprint.py writes it. */
export interface StyleFingerprint {
  games: number;
  centipawn_loss: { phases: Record<Phase, LossDistribution> };
  piece_share: { phases: Record<Phase, Record<PieceName, number>> };
  capture_taken_rate: { phases: Record<Phase, { rate: number }> };
  queen_trade_before_move_20: { rate: number };
  castling: { kingside: number; queenside: number; never: number };
}

/** The file pipeline/extract_style_fingerprint.py writes. */
export interface FingerprintRecord {
  engine: string;
  depth: number;
  camille: StyleFingerprint;
  bot: StyleFingerprint;
  camille_training_games: StyleFingerprint;
  camille_test_set: StyleFingerprint;
}

export interface ComparisonRow {
  statistic: string;
  camille: string;
  bot: string;
  /** How far apart Camille's training games and Test Set are on this statistic. */
  camilleAgainstHimself: string;
}

/** A move that gives up three pawns' worth of evaluation or more, as the Blunder Profile counts a blunder. */
const BLUNDER_CENTIPAWNS = 300;

/** One statistic of the comparison: what it is called and how it is read off a fingerprint. */
interface Statistic {
  name: string;
  read: (fingerprint: StyleFingerprint) => number;
  writeOut: (value: number) => string;
}

// Level first, since it is where the Bot and Camille differ most; then what
// he plays; then how he castles, the per-game choice the Bot imitates least.
// The full fingerprint is in docs/experiments/style-fingerprint.md.
const STATISTICS: Statistic[] = [
  {
    name: 'Average loss per move, middlegame',
    read: (fingerprint) => fingerprint.centipawn_loss.phases.middlegame.mean,
    writeOut: centipawns,
  },
  {
    name: 'Average loss per move, endgame',
    read: (fingerprint) => fingerprint.centipawn_loss.phases.endgame.mean,
    writeOut: centipawns,
  },
  {
    name: 'Moves losing three pawns or more, middlegame',
    read: (fingerprint) => shareLosingAtLeast(fingerprint.centipawn_loss.phases.middlegame, BLUNDER_CENTIPAWNS),
    writeOut: percent,
  },
  {
    name: 'Moves losing three pawns or more, endgame',
    read: (fingerprint) => shareLosingAtLeast(fingerprint.centipawn_loss.phases.endgame, BLUNDER_CENTIPAWNS),
    writeOut: percent,
  },
  {
    name: 'Pawn moves, middlegame',
    read: (fingerprint) => fingerprint.piece_share.phases.middlegame.pawn,
    writeOut: percent,
  },
  {
    name: 'Queen moves, opening',
    read: (fingerprint) => fingerprint.piece_share.phases.opening.queen,
    writeOut: percent,
  },
  {
    name: 'Capture taken when one is offered, opening',
    read: (fingerprint) => fingerprint.capture_taken_rate.phases.opening.rate,
    writeOut: percent,
  },
  {
    name: 'Capture taken when one is offered, endgame',
    read: (fingerprint) => fingerprint.capture_taken_rate.phases.endgame.rate,
    writeOut: percent,
  },
  {
    name: 'Queens traded off before move 20',
    read: (fingerprint) => fingerprint.queen_trade_before_move_20.rate,
    writeOut: percent,
  },
  {
    name: 'Castled kingside',
    read: (fingerprint) => fingerprint.castling.kingside,
    writeOut: percent,
  },
  {
    name: 'Castled queenside',
    read: (fingerprint) => fingerprint.castling.queenside,
    writeOut: percent,
  },
  {
    name: 'Never castled',
    read: (fingerprint) => fingerprint.castling.never,
    writeOut: percent,
  },
];

/** The statistics the page shows, for Camille, for the Bot, and for Camille against himself. */
export function compareStyles(record: FingerprintRecord): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  for (const statistic of STATISTICS) {
    const drift = Math.abs(statistic.read(record.camille_training_games) - statistic.read(record.camille_test_set));
    rows.push({
      statistic: statistic.name,
      camille: statistic.writeOut(statistic.read(record.camille)),
      bot: statistic.writeOut(statistic.read(record.bot)),
      camilleAgainstHimself: statistic.writeOut(drift),
    });
  }
  return rows;
}

/** A loss in centipawns, hundredths of a pawn, to one decimal. */
function centipawns(value: number): string {
  return value.toFixed(1);
}

/** A share written as a percentage to one decimal, such as 10.6%. */
function percent(fraction: number): string {
  return `${(100 * fraction).toFixed(1)}%`;
}

/**
 * The share of a distribution's moves that lost at least this many
 * centipawns, read off its histogram as pipeline/blunder_profile.py reads it:
 * the threshold is where a bucket starts.
 */
function shareLosingAtLeast(distribution: LossDistribution, threshold: number): number {
  let movesLosingThatMuch = 0;
  for (const bucket of distribution.histogram) {
    if (bucket.from >= threshold) {
      movesLosingThatMuch = movesLosingThatMuch + bucket.moves;
    }
  }
  return movesLosingThatMuch / distribution.moves;
}

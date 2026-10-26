// The Style Discriminator, run in the browser on the game the Bot has just
// played: the probability, read from its moves after the opening, that Camille
// played the game rather than another player at his Level. It is the same
// classifier pipeline/style_discriminator.py trains, scored from the
// parameters pipeline/measure_style_discriminator.py writes to
// style-discriminator.json, with the Style Fingerprint's statistics computed
// here as the Python code computes them. A parity test holds the two to the
// same scores on Camille's own games.
// Free of anything DOM.

import { Chess, normalizeMove } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import type { Role, Square } from 'chessops/types';
import { parseSquare, parseUci, squareFile } from 'chessops/util';
import { phaseOfPly, type Phase } from '../evaluation/move-matching';

/** One of the player's moves: the ply it was played at, the position it was played from, and the move in UCI form. */
export interface StyleMove {
  ply: number;
  fen: string;
  uci: string;
}

/** What style-discriminator.json holds. */
export interface ShippedStyleDiscriminator {
  measuredOn: string;
  /** The first ply read: the plies before it are where the Opening Book plays. */
  firstPlyRead: number;
  /** A game with fewer moves read than this is too short to score. */
  minMovesRead: number;
  discriminator: ShippedParameters;
  /** How many games of each kind it was trained on. */
  trainedOn: { camille: number; otherPlayers: number };
  /** Its scores on Camille's Test Set, the games of his it never saw. */
  camille: ReferenceGroup;
  /** Its scores on the other players' test split. */
  otherPlayers: ReferenceGroup;
  /** How far Camille's Test Set stands out from the other players' games, on all his games and on his Lichess games alone. */
  separation: Separation;
  separationLichessOnly: Separation;
}

/** A group of games the discriminator never saw, scored. */
export interface ReferenceGroup {
  games: number;
  /** The share of the games scored above one half, as Camille's. */
  shareScoredAsCamille: number;
  /** Every game's score, lowest first. */
  scores: number[];
}

/** The probability that one of Camille's games outscores another player's, with its 95% interval. */
export interface Separation {
  candidateGames: number;
  areaUnderCurve: number;
  interval: [number, number];
}

/**
 * The trained classifier, one entry per statistic in the order of
 * statistics: the value a missing statistic is filled with, the mean and
 * scale it is rescaled by, and its weight on the rescaled value.
 */
export interface ShippedParameters {
  statistics: string[];
  fillValues: number[];
  means: number[];
  scales: number[];
  weights: number[];
  intercept: number;
}

/** The discriminator's answer for one game. */
export type StyleScore =
  | { kind: 'too-short'; movesRead: number; needed: number }
  | { kind: 'scored'; movesRead: number; score: number };

/** The probability that Camille played the game these moves come from, or why it cannot be given. */
export function scoreGame(moves: StyleMove[], shipped: ShippedStyleDiscriminator): StyleScore {
  const read = moves.filter((move) => move.ply >= shipped.firstPlyRead);
  if (read.length < shipped.minMovesRead) {
    return { kind: 'too-short', movesRead: read.length, needed: shipped.minMovesRead };
  }

  const statistics = gameStatistics(read, shipped.firstPlyRead);
  const parameters = shipped.discriminator;
  let total = parameters.intercept;
  for (const [index, name] of parameters.statistics.entries()) {
    if (!(name in statistics)) {
      // A statistic the Python code reads and this one does not would be
      // filled silently and score every game wrong.
      throw new Error(`The page does not compute the statistic "${name}"`);
    }
    let value = statistics[name];
    if (value === null) {
      // No evidence either way: the average game's value, which weighs nothing.
      value = parameters.fillValues[index];
    }
    const rescaled = (value - parameters.means[index]) / parameters.scales[index];
    total += parameters.weights[index] * rescaled;
  }
  const score = 1 / (1 + Math.exp(-total));
  return { kind: 'scored', movesRead: read.length, score: score };
}

/**
 * The share of a group's games that score lower than this score, a game that
 * scores the same counting half: where the game stands among Camille's own
 * games, or among other players'.
 */
export function shareScoringBelow(groupScores: readonly number[], score: number): number {
  let below = 0;
  for (const groupScore of groupScores) {
    if (groupScore < score) {
      below += 1;
    } else if (groupScore === score) {
      below += 0.5;
    }
  }
  return below / groupScores.length;
}

/**
 * The share of a group's games in each band between consecutive edges, so two
 * groups of different sizes draw on the same scale. A score below the first
 * edge counts in the first band and one above the last in the last band, so
 * every game is drawn.
 */
export function scoreShares(groupScores: readonly number[], edges: readonly number[]): number[] {
  const bands = edges.length - 1;
  const counts = new Array<number>(bands).fill(0);
  for (const score of groupScores) {
    let band = 0;
    while (band < bands - 1 && score >= edges[band + 1]) {
      band += 1;
    }
    counts[band] += 1;
  }
  return counts.map((count) => count / groupScores.length);
}

/** Move 20 begins at ply 39, so a trade before it is complete within 38 plies. */
const PLIES_BEFORE_MOVE_20 = 38;

/** The Phases the discriminator reads: the opening is left to the Opening Book. */
const PHASES_READ = ['middlegame', 'endgame'] as const satisfies readonly Phase[];

/** The pieces in the order the Python code names them. */
const PIECES: readonly Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

/**
 * The game read as the statistics the discriminator weighs, under the names
 * pipeline/style_discriminator.py gives them, from firstPlyRead on. A
 * statistic the game gives no evidence on, such as the endgame of a game that
 * never reached it, is null.
 */
export function gameStatistics(moves: StyleMove[], firstPlyRead: number): Record<string, number | null> {
  const read = moves.filter((move) => move.ply >= firstPlyRead);
  const statistics: Record<string, number | null> = {};
  for (const phase of PHASES_READ) {
    const inPhase = read.filter((move) => phaseOfPly(move.ply) === phase);
    for (const piece of PIECES) {
      statistics[`${piece} moves, ${phase}`] = shareMadeBy(inPhase, piece);
    }
    statistics[`capture taken when on offer, ${phase}`] = captureTakenRate(inPhase);
  }
  const castling = castlingSide(read);
  statistics['castled kingside'] = castling === 'kingside' ? 1 : 0;
  statistics['castled queenside'] = castling === 'queenside' ? 1 : 0;
  statistics['queens off before move 20'] = queensOffBeforeMove20(read) ? 1 : 0;
  return statistics;
}

/**
 * Whether both queens were off the board on the last board known before move
 * 20. Only the player's own positions are recorded, but the board is known
 * after every ply all the same: as a position he faced, or as that position
 * once his move was played.
 */
function queensOffBeforeMove20(moves: StyleMove[]): boolean {
  let lastPlies = -1;
  let lastBoard: Chess | null = null;
  for (const move of moves) {
    const faced = positionOf(move);
    const afterTheMove = faced.clone();
    afterTheMove.play(normalizeMove(faced, parseUci(move.uci)!));
    const known: [number, Chess][] = [
      [move.ply - 1, faced],
      [move.ply, afterTheMove],
    ];
    for (const [plies, board] of known) {
      if (plies <= PLIES_BEFORE_MOVE_20 && plies > lastPlies) {
        lastPlies = plies;
        lastBoard = board;
      }
    }
  }
  if (lastBoard === null) {
    return false;
  }
  return lastBoard.board.queen.size() === 0;
}

/** The side the player castled on among the moves read, the last if more than one, or never. */
function castlingSide(moves: StyleMove[]): 'kingside' | 'queenside' | 'never' {
  let side: 'kingside' | 'queenside' | 'never' = 'never';
  for (const move of moves) {
    const castled = castlingOf(move);
    if (castled !== null) {
      side = castled;
    }
  }
  return side;
}

/**
 * The side a move castles on, or null for any other move. The king moves two
 * files in UCI form; onto its own rook, as chessops writes it, is read the
 * same way.
 */
function castlingOf(move: StyleMove): 'kingside' | 'queenside' | null {
  const position = positionOf(move);
  const from = parseSquare(move.uci.slice(0, 2))!;
  const to = parseSquare(move.uci.slice(2, 4))!;
  if (position.board.get(from)!.role !== 'king') {
    return null;
  }
  const filesMoved = squareFile(to) - squareFile(from);
  const ontoOwnRook = position.board.get(to)?.color === position.turn;
  if (Math.abs(filesMoved) < 2 && !ontoOwnRook) {
    return null;
  }
  if (filesMoved > 0) {
    return 'kingside';
  }
  return 'queenside';
}

/** The share of the moves made by the piece; null when there are none. */
function shareMadeBy(moves: StyleMove[], piece: Role): number | null {
  if (moves.length === 0) {
    return null;
  }
  // Castling is the king's move, as in UCI.
  const made = moves.filter((move) => movedPiece(move) === piece);
  return made.length / moves.length;
}

/**
 * How often a capture was played, among the positions where at least one was
 * legal; null when there were none. Positions with no capture on offer say
 * nothing about a taste for taking.
 */
function captureTakenRate(moves: StyleMove[]): number | null {
  let positionsWithACapture = 0;
  let capturesPlayed = 0;
  for (const move of moves) {
    const position = positionOf(move);
    if (!hasACaptureOnOffer(position)) {
      continue;
    }
    positionsWithACapture += 1;
    const from = parseSquare(move.uci.slice(0, 2))!;
    const to = parseSquare(move.uci.slice(2, 4))!;
    if (isCapture(position, from, to)) {
      capturesPlayed += 1;
    }
  }
  if (positionsWithACapture === 0) {
    return null;
  }
  return capturesPlayed / positionsWithACapture;
}

function hasACaptureOnOffer(position: Chess): boolean {
  for (const [from, destinations] of position.allDests()) {
    for (const to of destinations) {
      if (isCapture(position, from, to)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether the move takes a piece. A pawn that changes file always takes, en
 * passant included; castling, which chessops writes as the king moving onto
 * its own rook, does not.
 */
function isCapture(position: Chess, from: Square, to: Square): boolean {
  const target = position.board.get(to);
  if (target !== undefined) {
    return target.color !== position.turn;
  }
  const mover = position.board.get(from)!;
  return mover.role === 'pawn' && squareFile(from) !== squareFile(to);
}

function movedPiece(move: StyleMove): Role {
  const from = parseSquare(move.uci.slice(0, 2))!;
  return positionOf(move).board.get(from)!.role;
}

function positionOf(move: StyleMove): Chess {
  return Chess.fromSetup(parseFen(move.fen).unwrap()).unwrap();
}

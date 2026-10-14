// The Move-Selection Engine: the single place where the Bot decides on a move.
// Its boundary is a position in, one move out. Everything that later goes into
// choosing (the Opening Book, the Base Model) sits behind this function, so the
// page and the evaluation harness never change when the choice does.
// Free of anything DOM so that it runs unchanged under Node.

import { gameFromFen, legalMoves, uciName, type Game, type MoveRequest } from '../game/game';
import type { BaseModel, MoveProbability } from './base-model';
import { cutPolicy, type MoveCut } from './move-cut';
import { drawMove, withTemperature } from './move-draw';
import type { BookCounts, OpeningBook } from './opening-book';

/**
 * The last ply of the opening Phase: White's first move is ply 1, so the
 * opening is each side's first five moves. A cut given as openingCut applies
 * up to it.
 */
export const LAST_OPENING_PLY = 10;

/** What the engine depends on, supplied by the caller so tests can fix it. */
export interface EngineOptions {
  /** Camille's own replies, consulted before the Base Model. */
  openingBook?: OpeningBook;
  /**
   * The network consulted for the move. It may still be loading: the Opening
   * Book is asked first, so a move the book holds never waits for the model.
   */
  baseModel?: BaseModel | Promise<BaseModel>;
  /** Returns a number in [0, 1), like Math.random. */
  random?: () => number;
  /**
   * How the Base Model's move is drawn: at 1, each move as often as the model
   * predicts; below 1 the draw leans towards the most likely move, and at 0
   * it always plays it. Defaults to 1.
   */
  temperature?: number;
  /**
   * Which of the Base Model's moves the draw keeps in the opening. Left out,
   * the Bot draws among every legal move.
   */
  openingCut?: MoveCut;
}

/** Where a move of the Bot came from. */
export type MoveSource = 'opening-book' | 'base-model' | 'random';

/** A move the Base Model weighed, as the panel beside the board shows it. */
export interface Candidate {
  move: MoveRequest;
  /** The probability the Base Model gives the move. */
  modelProbability: number;
  /** The probability the Bot drew it with, once the cut and the temperature applied: 0 for a move cut. */
  drawnProbability: number;
}

/**
 * One move of the Bot, with where it came from, which the Session Game
 * records, and for a Base Model move what the draw chose among.
 */
export type BotMove =
  | {
      move: MoveRequest;
      source: 'opening-book';
      /** How often Camille reached the position and played the move; undefined when the book does not say. */
      counts: BookCounts | undefined;
    }
  | {
      move: MoveRequest;
      source: 'base-model';
      /** How many legal moves the position had. */
      legalMoves: number;
      /** Every move the Base Model weighed, most likely first by its own probability. */
      candidates: Candidate[];
      /** Where the move played stands among the candidates: 1 for the model's most likely. */
      rank: number;
    }
  | { move: MoveRequest; source: 'random' };

/**
 * Chooses the Bot's move in the position the FEN describes: Camille's own
 * reply when the Opening Book holds the position, otherwise a move drawn from
 * the Base Model's probabilities at the temperature given, otherwise a legal
 * move picked uniformly at random. Asynchronous because the Base Model runs a
 * network. Throws when the side to move has no legal move, since the Bot is
 * never asked to move in a finished game.
 */
export async function selectMove(fen: string, options: EngineOptions = {}): Promise<MoveRequest> {
  const botMove = await selectMoveWithSource(fen, options);
  return botMove.move;
}

/** The same choice as selectMove, also saying which of the three gave the move. */
export async function selectMoveWithSource(fen: string, options: EngineOptions = {}): Promise<BotMove> {
  const random = options.random ?? Math.random;
  const choice = await chooseDistribution(fen, options);
  const move = drawMove(choice.distribution, random);
  if (choice.source === 'base-model') {
    const candidates = candidatesOf(choice.policy, choice.distribution);
    const playedName = uciName(move);
    const playedIndex = candidates.findIndex((candidate) => uciName(candidate.move) === playedName);
    return {
      move: move,
      source: 'base-model',
      legalMoves: choice.legalMoves,
      candidates: candidates,
      rank: playedIndex + 1,
    };
  }
  if (choice.source === 'opening-book') {
    return { move: move, source: 'opening-book', counts: choice.counts };
  }
  return { move: move, source: 'random' };
}

/**
 * How likely the Bot is to play each move in the position, most likely first:
 * the move selectMove draws, given the same options. A book move has
 * probability one. Measuring reads this rather than single draws, so the
 * score it reports is the one the draw earns on average.
 */
export async function botMoveDistribution(fen: string, options: EngineOptions = {}): Promise<MoveProbability[]> {
  const choice = await chooseDistribution(fen, options);
  return choice.distribution;
}

/**
 * The moves the Bot may play and their probabilities, with where they come
 * from; for the Base Model, also the model's own probabilities before the cut
 * and the temperature.
 */
type Choice =
  | { distribution: MoveProbability[]; source: 'opening-book'; counts: BookCounts | undefined }
  | { distribution: MoveProbability[]; source: 'random' }
  | { distribution: MoveProbability[]; source: 'base-model'; policy: MoveProbability[]; legalMoves: number };

async function chooseDistribution(fen: string, options: EngineOptions): Promise<Choice> {
  const temperature = options.temperature ?? 1;

  const game = gameFromFen(fen);
  const candidates = legalMoves(game);
  if (candidates.length === 0) {
    // A finished game reaching the engine is a bug in the caller.
    throw new Error(`No legal move to choose in ${fen}`);
  }

  if (options.openingBook !== undefined) {
    const bookMove = options.openingBook.move(game);
    if (bookMove !== undefined) {
      return {
        distribution: [{ move: bookMove, probability: 1 }],
        source: 'opening-book',
        counts: options.openingBook.counts(game),
      };
    }
  }

  if (options.baseModel !== undefined) {
    const baseModel = await options.baseModel;
    const policy = await baseModel.movePolicy(game);
    const kept = cutPolicy(policy, cutAt(game, options.openingCut));
    return {
      distribution: withTemperature(kept, temperature),
      source: 'base-model',
      policy: policy,
      legalMoves: candidates.length,
    };
  }

  const uniform = candidates.map((move) => ({ move: move, probability: 1 / candidates.length }));
  return { distribution: uniform, source: 'random' };
}

/**
 * Each move of the Base Model's policy with the probability the draw gave it.
 * The distribution holds only the moves the cut kept; the others were drawn
 * with probability 0.
 */
function candidatesOf(policy: MoveProbability[], distribution: MoveProbability[]): Candidate[] {
  const drawnByMove = new Map<string, number>();
  for (const drawn of distribution) {
    drawnByMove.set(uciName(drawn.move), drawn.probability);
  }
  return policy.map((weighed) => ({
    move: weighed.move,
    modelProbability: weighed.probability,
    drawnProbability: drawnByMove.get(uciName(weighed.move)) ?? 0,
  }));
}

/**
 * The cut that applies in this position: the opening cut up to ply 10, none
 * after. Applied to the Base Model's own probabilities, before the
 * temperature, so which moves are kept depends on the model alone.
 */
function cutAt(game: Game, openingCut: MoveCut | undefined): MoveCut {
  if (openingCut === undefined) {
    return { kind: 'none' };
  }
  if (plyToPlay(game) > LAST_OPENING_PLY) {
    return { kind: 'none' };
  }
  return openingCut;
}

/**
 * The ply of the move about to be played, read from the position's move
 * number: White's first move is ply 1, Black's reply ply 2. A position given
 * with made-up move counters is read at the ply they claim.
 */
function plyToPlay(game: Game): number {
  const movesBefore = game.position.fullmoves - 1;
  if (game.position.turn === 'white') {
    return 2 * movesBefore + 1;
  }
  return 2 * movesBefore + 2;
}

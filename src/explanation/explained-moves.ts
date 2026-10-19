// Finds, in the game on the board, the Bot's moves and the reply the
// Move-Selection Engine gave with each, which says why the move was played. The page keeps every
// reply by the position and the move, so a move taken back and played again
// is explained by the reply that put it on the board.
// Free of anything DOM.

import type { Colour } from '../board/starting-position';
import type { BotMove, Candidate } from '../engine/move-selection';
import { currentFen, sideToMove, uciName, type Game, type MoveRequest } from '../game/game';
import { phaseOfPly, type Phase } from '../evaluation/move-matching';

/** One of the Bot's moves in the game on the board, with the reply that explains it. */
export interface ExplainedMove {
  /** The position the Bot moved from. */
  before: Game;
  ply: number;
  phase: Phase;
  /** The move in algebraic notation. */
  san: string;
  botMove: BotMove;
}

/** How the page files a reply: by the position the Bot was asked about and the move it gave. */
export function replyKey(fen: string, move: MoveRequest): string {
  return `${fen} ${uciName(move)}`;
}

/** How the page files one of the Bot's moves on the board, among the replies and their evaluations alike. */
export function moveKeyOf(explained: ExplainedMove): string {
  return replyKey(currentFen(explained.before), explained.botMove.move);
}

/** The moves the Bot's side played in the game, oldest first, each with the reply recorded for it. */
export function botMovesOf(game: Game, botColour: Colour, replies: Map<string, BotMove>): ExplainedMove[] {
  const explained: ExplainedMove[] = [];
  // Walked from the last move back, so the ply counts down from the game's length.
  let ply = pliesPlayed(game);
  let moment = game;
  while (moment.previous !== undefined && moment.lastMove !== undefined) {
    const before = moment.previous;
    const reply = replies.get(replyKey(currentFen(before), moment.lastMove));
    if (sideToMove(before) === botColour && reply !== undefined) {
      explained.push({ before: before, ply: ply, phase: phaseOfPly(ply), san: moment.lastMoveSan!, botMove: reply });
    }
    moment = before;
    ply -= 1;
  }
  explained.reverse();
  return explained;
}

/** How many moves led to the position. */
function pliesPlayed(game: Game): number {
  let plies = 0;
  let moment = game;
  while (moment.previous !== undefined) {
    plies += 1;
    moment = moment.previous;
  }
  return plies;
}

/** How many of the Base Model's candidates the panel lists, before the move played when it ranks lower. */
export const CANDIDATES_LISTED = 5;

/** The candidates the panel lists for a Base Model move. */
export interface CandidateRows {
  /** The model's most likely moves, most likely first. */
  mostLikely: Candidate[];
  /** The move played when it is not among them, listed after a gap; null otherwise. */
  playedFurtherDown: Candidate | null;
}

/**
 * The model's five most likely moves, and the move played after them when it
 * ranks lower: a position can hold forty legal moves, and the panel lists the
 * ones that explain the draw.
 */
export function candidateRows(candidates: Candidate[], rank: number): CandidateRows {
  const mostLikely = candidates.slice(0, CANDIDATES_LISTED);
  let playedFurtherDown: Candidate | null = null;
  if (rank > CANDIDATES_LISTED) {
    playedFurtherDown = candidates[rank - 1];
  }
  return { mostLikely: mostLikely, playedFurtherDown: playedFurtherDown };
}


/**
 * Where a move the Base Model chose stood, as the panel shows it in large:
 * its rank among the position's legal moves, such as 1/22 for the model's
 * favourite out of 22. The Opening Book's reply and a move picked at random
 * rank nothing; the panel names them in the page's language instead.
 */
export function rankOf(botMove: Extract<BotMove, { source: 'base-model' }>): string {
  return `${botMove.rank}/${botMove.legalMoves}`;
}

/** How many of the Bot's latest moves the chart leaves out while the game goes on. */
export const CHART_LAG = 3;

/**
 * The Bot's moves the chart of losses may draw. While the game goes on it
 * leaves out the last CHART_LAG of them: the curve moving with the move just
 * played would tell the visitor whether the Bot had just gone wrong, which is
 * the help analysis mode marks a game assisted for. Once the evaluations are
 * revealed, in analysis mode or once the game is over, every move is drawn.
 */
export function movesOnTheChart<Move>(botMoves: Move[], view: { revealed: boolean }): Move[] {
  if (view.revealed) {
    return botMoves;
  }
  const shown = Math.max(0, botMoves.length - CHART_LAG);
  return botMoves.slice(0, shown);
}

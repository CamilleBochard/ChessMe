// Whether a game is still going and, if not, how it ended. chessops detects
// checkmate, stalemate and insufficient material on a single position; the
// fifty-move rule and threefold repetition depend on the game's history, so
// this module is where those two are decided.

import type { Colour } from '../board/starting-position';
import type { Game } from './game';

/** Every way a game can stand. Only checkmate and resignation have a winner. */
export type GameStatus =
  | { kind: 'ongoing' }
  | { kind: 'checkmate'; winner: Colour }
  | { kind: 'resignation'; winner: Colour }
  | { kind: 'stalemate' }
  | { kind: 'insufficient-material' }
  | { kind: 'fifty-move-rule' }
  | { kind: 'threefold-repetition' };

/**
 * How the game stands right now. The draw rules end the game automatically
 * rather than waiting for a player to claim them: there is no claim button.
 */
export function gameStatus(game: Game): GameStatus {
  const position = game.position;

  if (game.resignedBy !== undefined) {
    return { kind: 'resignation', winner: opponentOf(game.resignedBy) };
  }

  if (position.isCheckmate()) {
    // The side to move is the side that has been mated.
    return { kind: 'checkmate', winner: opponentOf(position.turn) };
  }

  if (position.isStalemate()) {
    return { kind: 'stalemate' };
  }

  if (position.isInsufficientMaterial()) {
    return { kind: 'insufficient-material' };
  }

  // The halfmove clock counts moves since the last capture or pawn move; fifty
  // moves by each side is a hundred half-moves.
  if (position.halfmoves >= 100) {
    return { kind: 'fifty-move-rule' };
  }

  if (occurrencesOfCurrentPosition(game) >= 3) {
    return { kind: 'threefold-repetition' };
  }

  return { kind: 'ongoing' };
}

/** The sentence the page shows when the game ends. Null while the game is ongoing. */
export function describeResult(status: GameStatus): string | null {
  switch (status.kind) {
    case 'ongoing':
      return null;
    case 'checkmate':
      if (status.winner === 'white') {
        return 'Checkmate. White wins.';
      }
      return 'Checkmate. Black wins.';
    case 'resignation':
      if (status.winner === 'white') {
        return 'Black resigns. White wins.';
      }
      return 'White resigns. Black wins.';
    case 'stalemate':
      return 'Draw by stalemate.';
    case 'insufficient-material':
      return 'Draw by insufficient material.';
    case 'fifty-move-rule':
      return 'Draw by the fifty-move rule.';
    case 'threefold-repetition':
      return 'Draw by threefold repetition.';
  }
}

function opponentOf(side: Colour): Colour {
  if (side === 'white') {
    return 'black';
  }
  return 'white';
}

/** How many times the current position has occurred in this game, itself included. */
function occurrencesOfCurrentPosition(game: Game): number {
  const keys = game.repetitionKeys;
  const currentKey = keys[keys.length - 1];

  let count = 0;
  for (const key of keys) {
    if (key === currentKey) {
      count = count + 1;
    }
  }
  return count;
}

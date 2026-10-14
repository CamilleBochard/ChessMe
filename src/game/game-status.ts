// Whether a game is still going and, if not, how it ended. chessops detects
// checkmate, stalemate and insufficient material on a single position; the
// fifty-move rule and threefold repetition depend on the game's history, so
// this module is where those two are decided.

import type { Colour } from '../board/starting-position';
import type { Game } from './game';
import type { Language } from '../i18n/language';
import { TEXTS } from '../i18n/texts';

/** Every way a game can stand. Only checkmate, resignation and a loss on time have a winner. */
export type GameStatus =
  | { kind: 'ongoing' }
  | { kind: 'checkmate'; winner: Colour }
  | { kind: 'resignation'; winner: Colour }
  | { kind: 'time-forfeit'; winner: Colour }
  | { kind: 'stalemate' }
  | { kind: 'insufficient-material' }
  | { kind: 'fifty-move-rule' }
  | { kind: 'threefold-repetition' }
  | { kind: 'draw-on-time' };

/**
 * How the game stands right now. The draw rules end the game automatically
 * rather than waiting for a player to claim them: there is no claim button.
 */
export function gameStatus(game: Game): GameStatus {
  const position = game.position;

  if (game.resignedBy !== undefined) {
    return { kind: 'resignation', winner: opponentOf(game.resignedBy) };
  }

  if (game.timedOutBy !== undefined) {
    // Running out of time loses only to an opponent who could still mate;
    // against one who never could, whatever the other side did, it is a draw.
    const opponent = opponentOf(game.timedOutBy);
    if (position.hasInsufficientMaterial(opponent)) {
      return { kind: 'draw-on-time' };
    }
    return { kind: 'time-forfeit', winner: opponent };
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

/** The sentence the page shows when the game ends, in the language given. Null while the game is ongoing. */
export function describeResult(status: GameStatus, language: Language = 'en'): string | null {
  const texts = TEXTS[language];
  switch (status.kind) {
    case 'ongoing':
      return null;
    case 'checkmate':
      return texts.checkmate(status.winner);
    case 'resignation':
      return texts.resignation(status.winner);
    case 'time-forfeit':
      return texts.timeForfeit(status.winner);
    case 'stalemate':
      return texts.stalemate;
    case 'insufficient-material':
      return texts.insufficientMaterial;
    case 'fifty-move-rule':
      return texts.fiftyMoveRule;
    case 'threefold-repetition':
      return texts.threefoldRepetition;
    case 'draw-on-time':
      return texts.drawOnTime;
  }
}

/**
 * The line the page shows under the board, as seen by the visitor playing the
 * given side: whose turn it is while the game goes on, how it ended once over.
 */
export function describeTurn(game: Game, visitor: Colour, language: Language = 'en'): string {
  const result = describeResult(gameStatus(game), language);
  if (result !== null) {
    return result;
  }

  const toMove = game.position.turn;
  if (toMove === visitor) {
    return TEXTS[language].yourTurn(toMove);
  }
  return TEXTS[language].botThinking(toMove);
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

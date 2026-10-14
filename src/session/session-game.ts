// A Session Game: one game between a visitor and the Bot, with everything that
// happens around the moves. The visitor picks a side, moves, takes back,
// resigns or starts over; the Bot replies through the Move-Selection Engine.
// Free of anything DOM so the rules of the session are tested under Node, and
// the board component only draws what this module says.

import type { Colour } from '../board/starting-position';
import {
  currentFen,
  newGame,
  playMove,
  resign,
  sideToMove,
  takeBack,
  timeOut,
  type Game,
  type MoveRequest,
} from '../game/game';
import { newClock, remainingTime, startTurn, stopClock, type Clock } from '../game/clock';
import { describeTurn, gameStatus } from '../game/game-status';
import type { MoveSource } from '../engine/move-selection';
import type { Language } from '../i18n/language';
import { TEXTS } from '../i18n/texts';

/** A move of the Bot and where it came from: all the session needs of the Bot's reply. */
export interface SourcedMove {
  move: MoveRequest;
  source: MoveSource;
}

/** How the Bot chooses its move: a position as FEN in, one move out, with where it came from. */
export type ChooseMove = (fen: string) => Promise<SourcedMove>;

/** One move of a finished game. The Bot's moves also say where they came from. */
export interface PlayedMove {
  move: MoveRequest;
  source?: MoveSource;
}

/** A game that has ended, as the page reports it. */
export interface FinishedGame {
  visitor: Colour;
  /** Every move of the game, oldest first. Moves taken back are not among them. */
  moves: PlayedMove[];
  /** True when the visitor resigned, rather than the game ending on the board. */
  visitorResigned: boolean;
  /** The side whose clock ran out, or null when the game ended otherwise. */
  timedOut: Colour | null;
  /**
   * True when analysis mode was on at any point during the game: an engine's
   * evaluation shows the visitor where the Bot went wrong, so such a game
   * says less about how the Bot plays against an unaided player.
   */
  assisted: boolean;
}

export interface SessionGameOptions {
  chooseMove: ChooseMove;
  /**
   * Called after every change to the game, the visitor's side or the position
   * on display, including a Bot reply that lands on its own time, so the page
   * can redraw.
   */
  onChange?: () => void;
  /** Called once when a game ends, by the rules of chess or by the visitor resigning. */
  onGameEnd?: (finished: FinishedGame) => void;
}

export interface SessionGame {
  /** The game as it stands now. */
  game(): Game;
  /** The visitor's side, or null while waiting for the visitor to pick one. */
  visitor(): Colour | null;
  /** The line shown under the board, in the language given (English if none): whose turn it is, or how the game ended. */
  status(language?: Language): string;
  /** The time the side has left on its clock right now, in milliseconds. */
  timeLeft(side: Colour): number;
  /** The side whose clock is running, or null before the first move and once the game has ended. */
  runningClock(): Colour | null;
  /**
   * Starts a fresh game with the visitor on the given side. Resolves once the
   * Bot has played its opening move, if it has the first move.
   */
  start(visitor: Colour): Promise<void>;
  /**
   * Plays the visitor's move and then the Bot's reply, if the game goes on.
   * Resolves to false when the move is refused, which is the board's signal to
   * put the piece back.
   */
  playVisitorMove(move: MoveRequest): Promise<boolean>;
  /** True when takeBack would change something, for enabling its button. */
  canTakeBack(): boolean;
  /** Reverts the visitor's last move and the Bot's reply to it. */
  takeBack(): void;
  /** True while there is a game in progress the visitor could resign. */
  canResign(): boolean;
  /** Ends the game with the visitor resigning. A finished game keeps its result. */
  resign(): void;
  /** Goes back to the starting position, waiting for the visitor to pick a side. */
  startOver(): void;
  /** Records that analysis mode is on during the game in progress, which makes it an assisted game. */
  markAssisted(): void;
  /**
   * The position on display. Usually the current one, but the visitor may
   * step back through the game to look at earlier positions. Looking never
   * changes the game itself.
   */
  viewedGame(): Game;
  /** True when there is an earlier position to show. */
  canViewBack(): boolean;
  /** Shows the position one move earlier than the one on display. */
  viewBack(): void;
  /** True while an earlier position is on display. */
  canViewForward(): boolean;
  /** Shows the position one move later, stopping at the current position. */
  viewForward(): void;
}

/** One clock as the page shows it: whose time it holds and the name above the time. */
export interface ClockFace {
  side: Colour;
  name: string;
}

/**
 * Which clock goes above the board and which below. The visitor's sits under
 * the board, on the side the board is turned to, and the Bot's above. Before
 * a side is chosen the board shows White at the bottom, and so do the clocks.
 */
export function clockFaces(visitor: Colour | null, language: Language = 'en'): { top: ClockFace; bottom: ClockFace } {
  const texts = TEXTS[language];
  if (visitor === null) {
    return { top: { side: 'black', name: texts.side('black') }, bottom: { side: 'white', name: texts.side('white') } };
  }

  let botSide: Colour = 'white';
  if (visitor === 'white') {
    botSide = 'black';
  }
  return { top: { side: botSide, name: texts.bot }, bottom: { side: visitor, name: texts.you } };
}

export function createSessionGame(options: SessionGameOptions): SessionGame {
  let game = newGame();
  let visitor: Colour | null = null;
  // How many moves before the current position the visitor is looking.
  // Zero means the current position.
  let stepsBack = 0;
  // Whether analysis mode has been on during the game in progress.
  let assisted = false;
  // Where each of the Bot's moves came from, by the ply it was played at. A
  // move taken back leaves its entry behind, but the Bot's next move at that
  // ply replaces it, and only the plies of the game as it stands are read.
  const botMoveSources = new Map<number, MoveSource>();
  let clock: Clock = newClock();
  // Wakes the session when the running clock reaches zero, since a flag can
  // fall while nobody moves.
  let flagTimer: ReturnType<typeof setTimeout> | undefined = undefined;

  /**
   * The only place the game is replaced, so the page never misses a change.
   * Any change brings the view back to the current position: a visitor looking
   * at an earlier move should see the Bot's reply, a takeback or a new game.
   */
  function setGame(next: Game): void {
    const wasOngoing = gameStatus(game).kind === 'ongoing';
    game = next;
    stepsBack = 0;

    // However the game ended, both clocks stop where they were.
    const hasEnded = gameStatus(game).kind !== 'ongoing';
    if (hasEnded) {
      stopBothClocks();
    }
    notifyPage();

    if (wasOngoing && hasEnded) {
      announceGameEnd();
    }
  }

  /** Both sides back to ten minutes, neither running until the first move. */
  function resetBothClocks(): void {
    stopBothClocks();
    clock = newClock();
  }

  function stopBothClocks(): void {
    clock = stopClock(clock, Date.now());
    cancelFlagTimer();
  }

  function announceGameEnd(): void {
    if (options.onGameEnd === undefined || visitor === null) {
      return;
    }

    const moves: PlayedMove[] = [];
    for (const [index, move] of movesOf(game).entries()) {
      const ply = index + 1;
      const source = botMoveSources.get(ply);
      if (source === undefined) {
        moves.push({ move: move });
      } else {
        moves.push({ move: move, source: source });
      }
    }

    const visitorResigned = game.resignedBy !== undefined;
    const timedOut = game.timedOutBy ?? null;
    options.onGameEnd({
      visitor: visitor,
      moves: moves,
      visitorResigned: visitorResigned,
      timedOut: timedOut,
      assisted: assisted,
    });
  }

  /** Plays a move on the game and passes the turn on the clock. */
  function playOnBoard(next: Game): void {
    clock = startTurn(clock, sideToMove(next), Date.now());
    setGame(next);
    watchForFlag();
  }

  /** Arranges to end the game when the running clock reaches zero. */
  function watchForFlag(): void {
    cancelFlagTimer();
    const running = clock.running;
    if (running === null) {
      return;
    }

    const timeUntilFlag = remainingTime(clock, running, Date.now());
    flagTimer = setTimeout(() => {
      flagTimer = undefined;
      // A timer may wake a little early; the clock, not the timer, decides.
      const flagFell = endOnTimeIfFlagFell();
      if (!flagFell) {
        watchForFlag();
      }
    }, timeUntilFlag);
  }

  /**
   * Ends the game on time if the running clock has reached zero, and says
   * whether it did. Asked by the timer, and again before any move lands: a
   * timer can wake late, in a background tab for instance, and a move made
   * once the time is gone must not count.
   */
  function endOnTimeIfFlagFell(): boolean {
    const running = clock.running;
    if (running === null) {
      return false;
    }
    if (remainingTime(clock, running, Date.now()) > 0) {
      return false;
    }
    setGame(timeOut(game, running));
    return true;
  }

  function cancelFlagTimer(): void {
    if (flagTimer !== undefined) {
      clearTimeout(flagTimer);
      flagTimer = undefined;
    }
  }

  function notifyPage(): void {
    if (options.onChange !== undefined) {
      options.onChange();
    }
  }

  function viewedGame(): Game {
    let viewed = game;
    for (let step = 0; step < stepsBack; step++) {
      viewed = viewed.previous!;
    }
    return viewed;
  }

  function canViewBack(): boolean {
    return viewedGame().previous !== undefined;
  }

  function canViewForward(): boolean {
    return stepsBack > 0;
  }

  /** True once the visitor has picked a side and until the game ends. */
  function isGameInProgress(): boolean {
    const isOngoing = gameStatus(game).kind === 'ongoing';
    return visitor !== null && isOngoing;
  }

  /** True from the visitor's move until the Bot's reply is on the board. */
  function isBotThinking(): boolean {
    const isBotsTurn = sideToMove(game) !== visitor;
    return isGameInProgress() && isBotsTurn;
  }

  /**
   * Where a takeback would lead, or null when there is nothing to take back.
   * Taking back waits for the Bot's reply, so the reply is taken back with the
   * move it answers instead of landing on the earlier position.
   */
  function gameBeforeVisitorsLastMove(): Game | null {
    if (visitor === null || isBotThinking()) {
      return null;
    }
    return takeBack(game, visitor);
  }

  async function playBotMove(): Promise<void> {
    const askedAbout = game;
    let reply: SourcedMove;
    try {
      reply = await options.chooseMove(currentFen(askedAbout));
    } catch (error) {
      // A Bot that failed cannot go on, and its clock must not run out for
      // it: the game would be reported as won on time against a Bot that
      // never played. The page says the game cannot continue.
      if (game === askedAbout) {
        stopBothClocks();
      }
      throw error;
    }

    // While the Bot was choosing, the visitor may have resigned or started
    // over. The reply answers a game that is gone.
    if (game !== askedAbout) {
      return;
    }
    // Or its time ran out while it chose, and the timer has yet to say so.
    if (endOnTimeIfFlagFell()) {
      return;
    }

    const next = playMove(game, reply.move);
    if (next === null) {
      const move = reply.move;
      throw new Error(`The Bot chose an illegal move: ${move.from}-${move.to} in ${currentFen(game)}`);
    }
    const ply = movesOf(next).length;
    botMoveSources.set(ply, reply.source);
    playOnBoard(next);
  }

  return {
    game: () => game,

    visitor: () => visitor,

    status(language: Language = 'en'): string {
      if (visitor === null) {
        return TEXTS[language].chooseASide;
      }
      return describeTurn(game, visitor, language);
    },

    timeLeft(side: Colour): number {
      return remainingTime(clock, side, Date.now());
    },

    runningClock: () => clock.running,

    async start(side: Colour): Promise<void> {
      visitor = side;
      assisted = false;
      resetBothClocks();
      setGame(newGame());

      if (sideToMove(game) !== visitor) {
        await playBotMove();
      }
    },

    async playVisitorMove(move: MoveRequest): Promise<boolean> {
      // A legal move is not enough. It must also be the visitor's own turn,
      // or the visitor could move the Bot's pieces while it is choosing; the
      // game must still be going, since the position does not show a
      // resignation; and the current position must be the one on display,
      // or the move would land somewhere other than where it was made.
      if (endOnTimeIfFlagFell()) {
        return false;
      }
      const isVisitorsTurn = sideToMove(game) === visitor;
      const isViewingCurrent = stepsBack === 0;
      if (!isGameInProgress() || !isVisitorsTurn || !isViewingCurrent) {
        return false;
      }

      const next = playMove(game, move);
      if (next === null) {
        return false;
      }
      playOnBoard(next);

      if (gameStatus(game).kind === 'ongoing') {
        await playBotMove();
      }
      return true;
    },

    canTakeBack(): boolean {
      return gameBeforeVisitorsLastMove() !== null;
    },

    takeBack(): void {
      const earlier = gameBeforeVisitorsLastMove();
      if (earlier === null) {
        return;
      }
      setGame(earlier);
      // Taking back a move that ended the game, a checkmate or a draw,
      // reopens it, and the clock that stopped with it runs again for the
      // side to move. No time comes back.
      if (clock.running === null && gameStatus(game).kind === 'ongoing') {
        clock = startTurn(clock, sideToMove(game), Date.now());
        watchForFlag();
      }
    },

    canResign: isGameInProgress,

    resign(): void {
      if (visitor === null || !isGameInProgress()) {
        return;
      }
      setGame(resign(game, visitor));
    },

    viewedGame: viewedGame,

    canViewBack: canViewBack,

    viewBack(): void {
      if (!canViewBack()) {
        return;
      }
      stepsBack = stepsBack + 1;
      notifyPage();
    },

    canViewForward: canViewForward,

    viewForward(): void {
      if (!canViewForward()) {
        return;
      }
      stepsBack = stepsBack - 1;
      notifyPage();
    },

    startOver(): void {
      visitor = null;
      assisted = false;
      resetBothClocks();
      setGame(newGame());
    },

    markAssisted(): void {
      assisted = true;
    },
  };
}

/** The moves that led to the game, oldest first. */
function movesOf(game: Game): MoveRequest[] {
  const moves: MoveRequest[] = [];
  let moment = game;
  while (moment.previous !== undefined && moment.lastMove !== undefined) {
    moves.push(moment.lastMove);
    moment = moment.previous;
  }
  moves.reverse();
  return moves;
}

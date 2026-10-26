import { describe, expect, it } from 'vitest';
import type { SquareName } from 'chessops/types';
import { currentFen, newGame, playMove, sideToMove, type Game } from '../game/game';
import shippedFile from './style-discriminator.json';
import parityFile from './style-discriminator-parity.json';
import {
  gameStatistics,
  scoreGame,
  scoreShares,
  shareScoringBelow,
  type ShippedStyleDiscriminator,
  type StyleMove,
} from './style-discriminator';

const shipped = shippedFile as ShippedStyleDiscriminator;

/** The moves White played in a game from the starting position, given in UCI form for both sides. */
function whiteMoves(moves: string): StyleMove[] {
  const played: StyleMove[] = [];
  let game: Game = newGame();
  for (const [index, uci] of moves.trim().split(/\s+/).entries()) {
    const ply = index + 1;
    const fen = currentFen(game);
    const isWhite = sideToMove(game) === 'white';
    const next = playMove(game, { from: uci.slice(0, 2) as SquareName, to: uci.slice(2, 4) as SquareName });
    // A mistyped fixture would test nothing; this catches it.
    if (next === null) {
      throw new Error(`${uci} is illegal at ply ${ply}`);
    }
    if (isWhite) {
      played.push({ ply: ply, fen: fen, uci: uci });
    }
    game = next;
  }
  return played;
}

// Ten plies of development, then White's knights shuffle from ply 11 on.
const DEVELOPMENT = 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 b1c3 f8c5 d2d3 d7d6';
const KNIGHTS_SHUFFLE = ' c3b1 c6b8 b1c3 b8c6';

describe('scoreGame', () => {
  it('does not score a game with fewer than ten of the moves it reads, from ply 11 on', () => {
    const nineMovesRead = whiteMoves(DEVELOPMENT + KNIGHTS_SHUFFLE.repeat(4) + ' c3b1 c6b8');

    const style = scoreGame(nineMovesRead, shipped);

    expect(style).toEqual({ kind: 'too-short', movesRead: 9, needed: 10 });
  });

  it('fills a statistic the game gives no evidence on, rescales, weighs, and turns the sum into a probability', () => {
    const tenKnightMoves = whiteMoves(DEVELOPMENT + KNIGHTS_SHUFFLE.repeat(5));
    const twoStatistics: ShippedStyleDiscriminator = {
      ...shipped,
      discriminator: {
        statistics: ['knight moves, middlegame', 'knight moves, endgame'],
        fillValues: [0.5, 0.25],
        means: [0.5, 0.25],
        scales: [0.5, 1],
        weights: [2, 3],
        intercept: -1,
      },
    };

    const style = scoreGame(tenKnightMoves, twoStatistics);

    // Knights made every middlegame move: (1 - 0.5) / 0.5 = 1, weighed 2. The
    // endgame was never reached, so it is filled with its mean and weighs 0.
    expect(style.kind).toBe('scored');
    if (style.kind === 'scored') {
      expect(style.movesRead).toBe(10);
      expect(style.score).toBeCloseTo(1 / (1 + Math.exp(-1)), 12);
    }
  });
});

describe('gameStatistics', () => {
  it('reads the share of moves each piece made in the middlegame, from ply 11 on only', () => {
    const knightsOnly = whiteMoves(DEVELOPMENT + KNIGHTS_SHUFFLE.repeat(5));

    const statistics = gameStatistics(knightsOnly, 11);

    expect(statistics['knight moves, middlegame']).toBe(1);
    expect(statistics['pawn moves, middlegame']).toBe(0);
    expect(statistics['bishop moves, middlegame']).toBe(0);
    // The game ends before ply 31: it says nothing of the endgame.
    expect(statistics['knight moves, endgame']).toBeNull();
  });

  it('reads how often a capture was played among the positions where one was on offer', () => {
    const pawnCanTake = '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 30';
    const nothingToTake = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 30';
    const moves: StyleMove[] = [
      { ply: 21, fen: pawnCanTake, uci: 'e4d5' },
      { ply: 23, fen: pawnCanTake, uci: 'e1d1' },
      { ply: 25, fen: nothingToTake, uci: 'e2e3' },
    ];

    const statistics = gameStatistics(moves, 11);

    expect(statistics['capture taken when on offer, middlegame']).toBe(0.5);
    expect(statistics['capture taken when on offer, endgame']).toBeNull();
  });

  it('counts a pawn taking en passant as a capture', () => {
    const enPassantOnOffer = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 30';
    const moves: StyleMove[] = [{ ply: 21, fen: enPassantOnOffer, uci: 'e5d6' }];

    const statistics = gameStatistics(moves, 11);

    expect(statistics['capture taken when on offer, middlegame']).toBe(1);
  });

  it('reads on which side the player castled, from ply 11 on only', () => {
    const castlesAtPly11 = whiteMoves(DEVELOPMENT + ' e1g1 c6b8' + ' c3b1 b8c6 b1c3 c6b8');
    const castlesAtPly9 = whiteMoves('e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 b1c3 f8c5 e1g1 d7d6' + KNIGHTS_SHUFFLE);

    expect(gameStatistics(castlesAtPly11, 11)['castled kingside']).toBe(1);
    expect(gameStatistics(castlesAtPly11, 11)['castled queenside']).toBe(0);
    expect(gameStatistics(castlesAtPly9, 11)['castled kingside']).toBe(0);
  });

  it('reads whether both queens were off the board before move 20', () => {
    // The queens come off at ply 8; the knights shuffle from ply 11 on.
    const queensTraded = whiteMoves('d2d4 e7e5 d4e5 d7d6 e5d6 d8d6 d1d6 c7d6 b1c3 b8c6' + KNIGHTS_SHUFFLE.repeat(3));
    const queensKept = whiteMoves(DEVELOPMENT + KNIGHTS_SHUFFLE.repeat(3));

    expect(gameStatistics(queensTraded, 11)['queens off before move 20']).toBe(1);
    expect(gameStatistics(queensKept, 11)['queens off before move 20']).toBe(0);
  });
});

describe('the shipped discriminator', () => {
  it('scores Camille\'s games as the Python discriminator does', () => {
    const parity = parityFile as { games: { gameId: string; moves: StyleMove[]; score: number }[] };
    expect(parity.games.length).toBeGreaterThan(0);

    for (const game of parity.games) {
      const style = scoreGame(game.moves, shipped);

      expect(style.kind, game.gameId).toBe('scored');
      if (style.kind === 'scored') {
        expect(style.score, game.gameId).toBeCloseTo(game.score, 9);
      }
    }
  });
});

describe('shareScoringBelow', () => {
  it('gives the share of a group\'s games that score lower than the game, a tie counting half', () => {
    const group = [0.2, 0.4, 0.5, 0.6];

    expect(shareScoringBelow(group, 0.5)).toBe(0.625);
    expect(shareScoringBelow(group, 0.1)).toBe(0);
    expect(shareScoringBelow(group, 0.9)).toBe(1);
  });
});

describe('scoreShares', () => {
  it('gives the share of a group\'s games in each band of scores, a score past either end counting in the end band', () => {
    const group = [0.05, 0.2, 0.3, 0.6, 0.95];

    // Bands 0.1 to 0.4 and 0.4 to 0.9.
    const shares = scoreShares(group, [0.1, 0.4, 0.9]);

    expect(shares).toEqual([0.6, 0.4]);
  });
});

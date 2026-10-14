// Tests for which language the page opens in.

import { describe, expect, it } from 'vitest';
import { chooseLanguage, notation } from './language';

describe('the language the page opens in', () => {
  it("is the visitor's own choice when they made one, else the first of their browser's languages the page speaks, else English", () => {
    expect(chooseLanguage('en', ['fr-FR', 'fr'])).toBe('en');
    expect(chooseLanguage(null, ['fr-CA', 'en-US'])).toBe('fr');
    expect(chooseLanguage(null, ['de-DE', 'en-GB', 'fr'])).toBe('en');
    expect(chooseLanguage(null, ['de-DE'])).toBe('en');
    expect(chooseLanguage('klingon', ['fr'])).toBe('fr');
  });
});

describe('a move in algebraic notation', () => {
  it('names the pieces with French letters in French, and is left alone in English', () => {
    const moves = ['Nf3', 'Bxc4+', 'O-O', 'Qd8#', 'Rae1', 'Kxh1', 'e8=Q', 'exd8=N+', 'e4'];

    expect(moves.map((move) => notation(move, 'fr'))).toEqual(['Cf3', 'Fxc4+', 'O-O', 'Dd8#', 'Tae1', 'Rxh1', 'e8=D', 'exd8=C+', 'e4']);
    expect(moves.map((move) => notation(move, 'en'))).toEqual(moves);
  });
});

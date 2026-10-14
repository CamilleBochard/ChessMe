// Tests for which language the page opens in.

import { describe, expect, it } from 'vitest';
import { chooseLanguage } from './language';

describe('the language the page opens in', () => {
  it("is the visitor's own choice when they made one, else the first of their browser's languages the page speaks, else English", () => {
    expect(chooseLanguage('en', ['fr-FR', 'fr'])).toBe('en');
    expect(chooseLanguage(null, ['fr-CA', 'en-US'])).toBe('fr');
    expect(chooseLanguage(null, ['de-DE', 'en-GB', 'fr'])).toBe('en');
    expect(chooseLanguage(null, ['de-DE'])).toBe('en');
    expect(chooseLanguage('klingon', ['fr'])).toBe('fr');
  });
});

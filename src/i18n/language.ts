// The languages the page speaks, and which one it opens in.
// Free of anything DOM, so the choice is tested under Node; the page passes
// in what the browser says.

/** The languages the page is written in. */
export type Language = 'en' | 'fr';

export const LANGUAGES: readonly Language[] = ['en', 'fr'];

/**
 * The language the page opens in: the one the visitor picked last time, if
 * any, else the first of the browser's preferred languages the page speaks,
 * read by its primary subtag (fr-CA is French), else English.
 */
export function chooseLanguage(stored: string | null, browserLanguages: readonly string[]): Language {
  const storedLanguage = LANGUAGES.find((language) => language === stored);
  if (storedLanguage !== undefined) {
    return storedLanguage;
  }
  for (const browserLanguage of browserLanguages) {
    const primary = browserLanguage.split('-')[0].toLowerCase();
    const spoken = LANGUAGES.find((language) => language === primary);
    if (spoken !== undefined) {
      return spoken;
    }
  }
  return 'en';
}

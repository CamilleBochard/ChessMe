// The language the page is in, for every script on it. The first script to
// ask settles it, from the visitor's earlier choice or their browser, and
// writes the page's fixed words in it; a change made with the switch is
// remembered and announced, so each part of the page redraws its own text.

import { chooseLanguage, type Language } from './language';
import { TEXTS, type PageText, type Texts } from './texts';

/** Where the visitor's choice is kept between visits. */
const LANGUAGE_KEY = 'chessme.language';

/** The event announced on the document when the visitor switches language. */
export const LANGUAGE_CHANGED = 'chessme:language-changed';

let current: Language | undefined = undefined;

/** The language the page is in, settled the first time it is asked. */
export function pageLanguage(): Language {
  if (current === undefined) {
    current = chooseLanguage(storedLanguage(), navigator.languages);
    showLanguage(current);
  }
  return current;
}

/** The words of the language the page is in. */
export function pageTexts(): Texts {
  return TEXTS[pageLanguage()];
}

/** Switches the page to the language given, remembers the choice and tells the rest of the page. */
export function switchLanguage(language: Language): void {
  current = language;
  try {
    window.localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Storage refused: the choice holds until the page is left.
  }
  showLanguage(language);
  document.dispatchEvent(new Event(LANGUAGE_CHANGED));
}

/**
 * Marks the page with its language, for screen readers and the browser's
 * own hyphenation and quotes, and writes every fixed word in it: an
 * element's data-text names its text, data-text-label its accessible name
 * and data-text-title its tooltip.
 */
function showLanguage(language: Language): void {
  const texts = TEXTS[language];
  document.documentElement.lang = language;
  for (const element of document.querySelectorAll<HTMLElement>('[data-text]')) {
    element.textContent = texts.page[element.dataset.text as PageText];
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-text-label]')) {
    element.setAttribute('aria-label', texts.page[element.dataset.textLabel as PageText]);
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-text-title]')) {
    element.title = texts.page[element.dataset.textTitle as PageText];
  }
}

function storedLanguage(): string | null {
  try {
    return window.localStorage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
}

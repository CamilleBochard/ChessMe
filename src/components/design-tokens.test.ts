// Checks that the game page keeps to the portfolio's palette: every colour its
// stylesheets use is one of the tokens of src/styles/tokens.css, or mixed from
// them, never a value written out again. A colour typed into a component would
// drift from the rest of the page the day the palette changes; this test fails
// first. It reads the style rules of the page's components, page and
// stylesheets for colour literals: hex values and the colour functions.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = join(import.meta.dirname, '..');
const TOKENS = join(SOURCE, 'styles', 'tokens.css');

/** The files that style the game page, apart from the tokens themselves. */
function gamePageStyleFiles(): string[] {
  const components = readdirSync(join(SOURCE, 'components'), { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.astro'))
    .map((name) => join(SOURCE, 'components', name));
  const stylesheets = readdirSync(join(SOURCE, 'styles'))
    .filter((name) => name.endsWith('.css'))
    .map((name) => join(SOURCE, 'styles', name))
    .filter((path) => path !== TOKENS);
  const page = join(SOURCE, 'pages', 'index.astro');
  return [...components, ...stylesheets, page];
}

/** The style rules of a file: the whole of a stylesheet, the style blocks of a component. */
function styleRules(path: string): string {
  const text = readFileSync(path, 'utf8');
  if (path.endsWith('.css')) {
    return text;
  }
  const blocks = text.match(/<style[^>]*>[\s\S]*?<\/style>/g) ?? [];
  return blocks.join('\n');
}

const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g;

describe('the game page', () => {
  it('takes every colour from the design tokens', () => {
    const literals: string[] = [];
    for (const path of gamePageStyleFiles()) {
      for (const literal of styleRules(path).match(COLOUR_LITERAL) ?? []) {
        literals.push(`${relative(SOURCE, path)}: ${literal}`);
      }
    }

    expect(literals).toEqual([]);
  });
});

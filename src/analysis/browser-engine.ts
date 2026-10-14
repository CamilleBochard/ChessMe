// The engine analysis mode runs in the visitor's browser, and its settings.
// The same build at the same depth measured Camille's moves for the
// yardstick the panel shows (docs/experiments/browser-engine.md), so the
// Bot's losses and his are one computation.

/**
 * Stockfish 19 lite, compiled to WebAssembly on a single thread, from the
 * stockfish package pinned in package.json: about 1.8 MB, and it runs without
 * the cross-origin isolation headers a multi-threaded build needs.
 */
export const BROWSER_ENGINE_FILES = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];

/** Where the package keeps them. */
export const BROWSER_ENGINE_SOURCE = 'node_modules/stockfish/bin';

/** Where the build serves them from, fetched only when analysis mode is switched on. */
export const BROWSER_ENGINE_DIRECTORY = 'public/stockfish';

/**
 * The depth of every search. A fixed depth, rather than a time limit, makes
 * an analysis depend on the position alone, whatever the visitor's machine.
 * At 14 a move takes about 0.3 s on a 2012 laptop.
 */
export const ANALYSIS_DEPTH = 14;

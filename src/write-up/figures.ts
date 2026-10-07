// How the write-up page writes out a measured figure. Shared so that every
// table and sentence on the page writes the same kind of figure the same way.

import { share, type MoveMatchingScore } from '../evaluation/move-matching';

/** Move-Matching in percent with one standard error, such as 49.35 ± 0.34. */
export function percentWithError(score: MoveMatchingScore): string {
  const percentMatched = 100 * share(score);
  const error = 100 * score.standardError;
  return `${percentMatched.toFixed(2)} ± ${error.toFixed(2)}`;
}

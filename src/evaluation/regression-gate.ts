// The check a refreshed Opening Book passes before it is deployed: on the
// Test Set, the Bot with the new book must not match Camille's moves less
// often than the served Bot by more than two standard errors of the change.
// The change is measured position by position, both Bots answering the same
// positions (compareBots in ./move-matching.ts), so only what the books do
// differently enters it.

import type { MoveMatchingScore } from './move-matching';

/** How many standard errors of the change a fall may reach before the new book is refused. */
export const ALLOWED_STANDARD_ERRORS = 2;

export interface RegressionVerdict {
  passes: boolean;
  /** The change in the share of positions matched: negative when the new book matches fewer. */
  change: number;
  standardError: number;
  /** The largest fall allowed, as a negative share. */
  limit: number;
}

/** The verdict on the gain of the Bot with the new Opening Book over the served Bot. */
export function regressionGate(gain: MoveMatchingScore): RegressionVerdict {
  const change = gain.matched / gain.positions;
  const limit = -ALLOWED_STANDARD_ERRORS * gain.standardError;
  // A standard error of NaN (positions from a single game) makes the
  // comparison false: a change whose spread cannot be measured is refused.
  return { passes: change >= limit, change: change, standardError: gain.standardError, limit: limit };
}

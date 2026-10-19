// Cutting the Base Model's least likely moves out of the draw, so that the
// Bot only draws among moves a player at its rating would plausibly play.
// Free of anything DOM so that it runs unchanged under Node.

/** A move, or anything standing for one, with the probability the Base Model gives it. */
interface Weighed {
  probability: number;
}

/** Which of the Base Model's moves the draw keeps. */
export type MoveCut =
  /** Every legal move, as the Bot draws without a cut. */
  | { kind: 'none' }
  /** The k most likely moves. */
  | { kind: 'top-k'; k: number }
  /** The most likely moves, taken in order until together they cover a share p of the probability. */
  | { kind: 'top-p'; p: number }
  /**
   * The moves with at least a fraction of the most likely move's probability:
   * few where the model is confident, more where it hesitates.
   */
  | { kind: 'min-p'; fraction: number };

/**
 * The moves the cut keeps, most likely first as given, with their
 * probabilities rescaled to sum to one: what the Bot would draw from.
 * The policy must be sorted most likely first, as the Base Model gives it;
 * every cut then keeps a run of moves from the top, the most likely always.
 * Whatever else describes a move is carried through unchanged.
 */
export function cutPolicy<Candidate extends Weighed>(policy: Candidate[], cut: MoveCut): Candidate[] {
  if (cut.kind === 'none') {
    return policy;
  }

  let kept: Candidate[];
  if (cut.kind === 'top-k') {
    kept = policy.slice(0, cut.k);
  } else if (cut.kind === 'top-p') {
    kept = mostLikelyCovering(policy, cut.p);
  } else {
    const smallestKept = cut.fraction * policy[0].probability;
    kept = policy.filter((candidate) => candidate.probability >= smallestKept);
  }
  return rescaled(kept);
}

/** The shortest run of most likely moves whose probabilities add up to the share or more. */
function mostLikelyCovering<Candidate extends Weighed>(policy: Candidate[], share: number): Candidate[] {
  const kept: Candidate[] = [];
  let covered = 0;
  for (const candidate of policy) {
    kept.push(candidate);
    covered += candidate.probability;
    if (covered >= share) {
      break;
    }
  }
  return kept;
}

function rescaled<Candidate extends Weighed>(kept: Candidate[]): Candidate[] {
  const total = kept.reduce((sum, candidate) => sum + candidate.probability, 0);
  return kept.map((candidate) => ({ ...candidate, probability: candidate.probability / total }));
}

/** How a cut is named in a table: no cut, top-5, top-p 0.90, min-p 0.05. */
export function cutName(cut: MoveCut): string {
  if (cut.kind === 'none') {
    return 'no cut';
  }
  if (cut.kind === 'top-k') {
    return `top-${cut.k}`;
  }
  if (cut.kind === 'top-p') {
    return `top-p ${cut.p.toFixed(2)}`;
  }
  return `min-p ${cut.fraction.toFixed(2)}`;
}

/**
 * A cut as a script's option names it: top-k=10, top-p=0.9 or min-p=0.05.
 * Refuses a value that would not cut as asked rather than run a measurement
 * on a cut nobody meant.
 */
export function readMoveCut(text: string): MoveCut {
  const parts = text.split('=');
  const kind = parts[0];
  // A value is one number after a single '='. Anything else, such as
  // top-k=10=3, is read as no number at all rather than cut in part.
  let number = Number.NaN;
  if (parts.length === 2) {
    number = Number(parts[1]);
  }
  const unusable = new Error(`Cannot cut with ${text}: k counts moves from 1, p and the fraction lie above 0 and at most 1`);

  if (kind === 'top-k') {
    if (!Number.isInteger(number) || number < 1) {
      throw unusable;
    }
    return { kind: 'top-k', k: number };
  }
  if (kind === 'top-p') {
    if (!isShare(number)) {
      throw unusable;
    }
    return { kind: 'top-p', p: number };
  }
  if (kind === 'min-p') {
    if (!isShare(number)) {
      throw unusable;
    }
    return { kind: 'min-p', fraction: number };
  }
  throw new Error(`Unknown cut: ${text}. Expected top-k=<k>, top-p=<p> or min-p=<fraction>`);
}

/** Above 0 and at most 1. Not a number is not a share. */
function isShare(number: number): boolean {
  return number > 0 && number <= 1;
}

// Chooses the Base Model from the Move-Matching of every candidate. The
// choice is made by measurement rather than by converting Camille's rating
// between sites (see docs/adr/0001-base-model-chosen-by-measurement.md).
// Free of anything DOM or Node; running the candidates is left to the caller.

import { share, type MoveMatchingReport } from './move-matching';

/** One candidate Base Model, as measured by the sweep. */
export interface CandidateResult {
  /** Such as maia1-1300, or maia3-5m at 1500 for a model given its rating. */
  name: string;
  /**
   * The model family, such as maia1 or maia3. Members of a family share an
   * architecture and a licence, so their downloads differ only slightly.
   */
  family: string;
  /** The rating the candidate plays at, on the Lichess scale it was trained on. */
  rating: number;
  licence: string;
  /** What a visitor downloads: the ONNX file as the server sends it, compressed. */
  downloadBytes: number;
  report: MoveMatchingReport;
}

/**
 * What one run of the sweep measured, as it is kept for the write-up: every
 * candidate's raw counts, so that anything shown from it, the choice of Base
 * Model included, is computed again from the measurement.
 */
export interface SweepRecord {
  /** The day the sweep ran, as YYYY-MM-DD. */
  measuredOn: string;
  /** The JavaScript runtime the engine ran on, such as Node 22.12.0. */
  runtime: string;
  /** Camille's Lichess rating, the scale Maia is trained on, which the Maia-Equivalent Rating is compared with. */
  lichessRating: number;
  candidates: CandidateResult[];
}

export interface BaseModelDecision {
  /** The candidate that matches most of Camille's moves after ply 10. */
  best: CandidateResult;
  /** Every other candidate within half a point of the best. */
  tied: CandidateResult[];
  /** The candidate to ship as the Base Model. */
  chosen: CandidateResult;
}

/** Candidates closer than this to the best, in share of positions, are reported as tied. */
const HALF_A_POINT = 0.005;
/** Allows for rounding when a gap is exactly half a point. */
const ROUNDING_ALLOWANCE = 1e-9;

/**
 * Picks the candidate that matches most of Camille's moves after ply 10.
 * The opening is left out because the Opening Book answers there, and because
 * it is the figure published Maia results report.
 *
 * Candidates within half a point of the best are treated as equally good:
 * a gap that small does not justify a larger download, so the one a visitor
 * downloads fastest is chosen among them.
 */
export function chooseBaseModel(results: CandidateResult[]): BaseModelDecision {
  if (results.length === 0) {
    throw new Error('No candidate to choose from');
  }

  let best = results[0];
  for (const result of results) {
    if (shareAfterPly10(result) > shareAfterPly10(best)) {
      best = result;
    }
  }

  const tied: CandidateResult[] = [];
  for (const result of results) {
    if (result === best) {
      continue;
    }
    const gap = shareAfterPly10(best) - shareAfterPly10(result);
    if (gap <= HALF_A_POINT + ROUNDING_ALLOWANCE) {
      tied.push(result);
    }
  }

  // Size and licence belong to a family: members share one architecture and
  // one licence, and their downloads differ only by how well each set of
  // weights happens to compress. So the size picks a family, and the score
  // picks among its members.
  const contenders = [best, ...tied];
  let smallest = best;
  for (const result of contenders) {
    if (result.downloadBytes < smallest.downloadBytes) {
      smallest = result;
    }
  }

  let chosen = smallest;
  for (const result of contenders) {
    const isSameFamily = result.family === smallest.family;
    if (isSameFamily && shareAfterPly10(result) > shareAfterPly10(chosen)) {
      chosen = result;
    }
  }
  return { best: best, tied: tied, chosen: chosen };
}

function shareAfterPly10(result: CandidateResult): number {
  return share(result.report.afterPly10);
}

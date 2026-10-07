// The Base Model sweep as the write-up page presents it: every candidate's
// Move-Matching per slice, and the choice made from them. Both are computed
// from the record the sweep writes, with the sweep's own decision code, so
// nothing on the page is copied from its output by hand.
// Free of anything DOM so that it is tested under Node.

import { chooseBaseModel, type CandidateResult, type SweepRecord } from '../evaluation/base-model-sweep';
import { share, type MoveMatchingReport, type MoveMatchingScore } from '../evaluation/move-matching';
import { percentWithError } from './figures';

/** The slices of the table, in the order of its columns. */
export const SWEEP_SLICES = ['Opening', 'Middlegame', 'Endgame', 'After ply 10', 'All'];

/** One candidate's line of the table. */
export interface SweepRow {
  candidate: string;
  /** Move-Matching in each of SWEEP_SLICES. */
  cells: string[];
  /**
   * Whether this candidate became the Base Model, was within half a point of
   * the best and so counted as equally good, or was only measured.
   */
  standing: 'chosen' | 'tied' | 'measured';
}

export interface SweepSummary {
  rows: SweepRow[];
  /** How many positions, and from how many games, each of SWEEP_SLICES holds. */
  slices: { positions: string; games: string }[];
  /** The candidate shipped as the Base Model, and its Move-Matching after ply 10. */
  chosen: { candidate: string; afterPly10: string };
  /** The rating of the candidate that matches Camille best, tie or not. */
  maiaEquivalentRating: number;
  /** How that rating sits against his Lichess rating, such as "231 points below his Lichess rating of 1331". */
  againstLichessRating: string;
  /**
   * How many points of Move-Matching after ply 10 the best candidate leads
   * the best candidate of any other family by, and which candidate that is.
   * Written to one decimal: each figure carries an error of about a third of
   * a point, and at two decimals the exact gap can differ from the gap
   * between the two rounded figures in the table, which reads as a mistake.
   * Undefined when every candidate is of one family.
   */
  leadOverOtherFamilies?: { points: string; runnerUp: string };
}

/** The table of every candidate and the choice made from it, from the record of one sweep. */
export function describeSweep(record: SweepRecord): SweepSummary {
  const decision = chooseBaseModel(record.candidates);
  // The best candidate is tied with the chosen one when a tie sent the
  // choice to a smaller download.
  const tiedWithTheChosen = [decision.best, ...decision.tied].filter((result) => result !== decision.chosen);

  const rows: SweepRow[] = [];
  for (const result of record.candidates) {
    const cells = slicesOf(result.report).map(percentWithError);

    let standing: SweepRow['standing'] = 'measured';
    if (result === decision.chosen) {
      standing = 'chosen';
    } else if (tiedWithTheChosen.includes(result)) {
      standing = 'tied';
    }
    rows.push({ candidate: result.name, cells: cells, standing: standing });
  }

  const maiaEquivalentRating = decision.best.rating;
  const distance = maiaEquivalentRating - record.lichessRating;
  let direction = 'below';
  if (distance > 0) {
    direction = 'above';
  }
  const againstLichessRating = `${Math.abs(distance)} points ${direction} his Lichess rating of ${record.lichessRating}`;

  let runnerUp: CandidateResult | undefined = undefined;
  for (const result of record.candidates) {
    if (result.family === decision.best.family) {
      continue;
    }
    if (runnerUp === undefined || share(result.report.afterPly10) > share(runnerUp.report.afterPly10)) {
      runnerUp = result;
    }
  }
  let leadOverOtherFamilies: SweepSummary['leadOverOtherFamilies'] = undefined;
  if (runnerUp !== undefined) {
    const lead = 100 * (share(decision.best.report.afterPly10) - share(runnerUp.report.afterPly10));
    leadOverOtherFamilies = { points: lead.toFixed(1), runnerUp: runnerUp.name };
  }

  // Every candidate is measured on the same positions, so any one of them
  // describes the slices.
  const slices = slicesOf(record.candidates[0].report).map((score) => ({
    positions: score.positions.toLocaleString('en'),
    games: score.games.toLocaleString('en'),
  }));

  return {
    rows: rows,
    slices: slices,
    chosen: { candidate: decision.chosen.name, afterPly10: percentWithError(decision.chosen.report.afterPly10) },
    maiaEquivalentRating: maiaEquivalentRating,
    againstLichessRating: againstLichessRating,
    leadOverOtherFamilies: leadOverOtherFamilies,
  };
}

/** A report's scores in the order of SWEEP_SLICES. */
function slicesOf(report: MoveMatchingReport): MoveMatchingScore[] {
  return [report.byPhase.opening, report.byPhase.middlegame, report.byPhase.endgame, report.afterPly10, report.overall];
}

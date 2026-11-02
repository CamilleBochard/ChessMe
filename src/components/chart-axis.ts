// The axes of a column chart: round ticks for the values, and which columns
// keep a label along the bottom when there is no room for all of them.
// Free of anything DOM.

/** Each step is one of these times a power of ten: 1, 2, 5, 10, 20, 50... */
const ROUND_STEPS = [1, 2, 5];

/** At most this many steps above zero, so the labels stay apart on a short axis. */
const MOST_STEPS = 4;

/**
 * The ticks of a value axis: zero, then a round step at a time up to the
 * first tick at or past the largest value, so the tallest column stays
 * under the top line.
 */
export function valueTicks(largest: number): number[] {
  const step = roundStep(largest / MOST_STEPS);
  const ticks = [0];
  while (ticks[ticks.length - 1] < largest) {
    ticks.push(ticks[ticks.length - 1] + step);
  }
  return ticks;
}

/** The smallest round step that is at least the given one. */
function roundStep(atLeast: number): number {
  let power = 1;
  while (true) {
    for (const multiple of ROUND_STEPS) {
      const step = multiple * power;
      if (step >= atLeast) {
        return step;
      }
    }
    power *= 10;
  }
}

/**
 * Which of the columns, by index from the oldest, keep their date under them.
 * All of them while they fit; past that, one every few columns, counted back
 * from the newest so the latest update is always dated.
 */
export function labelledColumns(columns: number, mostLabels: number): number[] {
  const every = Math.ceil(columns / mostLabels);
  const labelled: number[] = [];
  for (let index = columns - 1; index >= 0; index -= every) {
    labelled.unshift(index);
  }
  return labelled;
}

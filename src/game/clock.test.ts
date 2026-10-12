// Tests for the chess clock. Time is passed in as milliseconds, so each test
// says exactly when every press happens and nothing waits for real time.

import { describe, expect, it } from 'vitest';
import { formatClockTime, newClock, remainingTime, startTurn, stopClock } from './clock';

const TEN_MINUTES = 10 * 60 * 1000;

describe('the chess clock', () => {
  it('gives each side ten minutes and runs neither before the first move', () => {
    const clock = newClock();

    // However long the first move takes to come, no time is spent.
    expect(remainingTime(clock, 'white', 45_000)).toBe(TEN_MINUTES);
    expect(remainingTime(clock, 'black', 45_000)).toBe(TEN_MINUTES);
  });

  it("runs only the clock of the side whose turn it is", () => {
    // White moved at 1 second; Black's clock starts then.
    const clock = startTurn(newClock(), 'black', 1_000);

    // Thirty seconds later, Black has spent thirty seconds and White nothing.
    expect(remainingTime(clock, 'black', 31_000)).toBe(TEN_MINUTES - 30_000);
    expect(remainingTime(clock, 'white', 31_000)).toBe(TEN_MINUTES);
  });

  it('charges each side the time it took, turn after turn', () => {
    // Black's clock starts at 0 and Black replies 20 seconds later; White
    // then thinks for 30 seconds.
    const blackToMove = startTurn(newClock(), 'black', 0);
    const whiteToMove = startTurn(blackToMove, 'white', 20_000);

    expect(remainingTime(whiteToMove, 'black', 50_000)).toBe(TEN_MINUTES - 20_000);
    expect(remainingTime(whiteToMove, 'white', 50_000)).toBe(TEN_MINUTES - 30_000);
  });

  it('keeps both times as they were once stopped', () => {
    const blackToMove = startTurn(newClock(), 'black', 0);

    // The game ends at 10 seconds; an hour later nothing has moved.
    const stopped = stopClock(blackToMove, 10_000);

    expect(remainingTime(stopped, 'black', 3_600_000)).toBe(TEN_MINUTES - 10_000);
    expect(remainingTime(stopped, 'white', 3_600_000)).toBe(TEN_MINUTES);
  });

  it('never shows less than no time left', () => {
    const blackToMove = startTurn(newClock(), 'black', 0);

    expect(remainingTime(blackToMove, 'black', TEN_MINUTES + 5_000)).toBe(0);
  });
});

describe('formatting a clock time', () => {
  it('shows minutes and seconds, rounding up so 0:00 appears only when the time is gone', () => {
    expect(formatClockTime(TEN_MINUTES)).toBe('10:00');
    expect(formatClockTime(61_500)).toBe('1:02');
    expect(formatClockTime(999)).toBe('0:01');
    expect(formatClockTime(0)).toBe('0:00');
  });
});

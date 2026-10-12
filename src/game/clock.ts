// The chess clock: ten minutes a side, no increment, the format of every game
// Camille's dataset holds. A clock is a value, like a Game: pressing it returns
// a new clock. The time is always passed in, in milliseconds, so the rules are
// tested without waiting and the page decides where the time comes from.

import type { Colour } from '../board/starting-position';

/** Each side's time at the start: ten minutes. */
export const TIME_PER_SIDE = 10 * 60 * 1000;

export interface Clock {
  /** Each side's time left when its clock last stopped, in milliseconds. */
  readonly banked: Readonly<Record<Colour, number>>;
  /** The side whose clock is running, or null before the first move and after the game. */
  readonly running: Colour | null;
  /** When the running clock started, in the same milliseconds as the time passed in. */
  readonly runningSince: number;
}

/** A clock with ten minutes for each side, neither running. */
export function newClock(): Clock {
  return { banked: { white: TIME_PER_SIDE, black: TIME_PER_SIDE }, running: null, runningSince: 0 };
}

/**
 * The clock once a move has been played: the side that was thinking is
 * charged the time it took, and the given side's clock starts at that moment.
 */
export function startTurn(clock: Clock, side: Colour, now: number): Clock {
  const stopped = stopClock(clock, now);
  return { banked: stopped.banked, running: side, runningSince: now };
}

/** The clock with neither side running, the running side charged its time so far. */
export function stopClock(clock: Clock, now: number): Clock {
  if (clock.running === null) {
    return clock;
  }
  const banked = { ...clock.banked };
  banked[clock.running] = remainingTime(clock, clock.running, now);
  return { banked: banked, running: null, runningSince: now };
}

/** The time the side has left at the given moment, never below zero. */
export function remainingTime(clock: Clock, side: Colour, now: number): number {
  const banked = clock.banked[side];
  if (clock.running !== side) {
    return banked;
  }
  const spent = now - clock.runningSince;
  const left = banked - spent;
  if (left < 0) {
    return 0;
  }
  return left;
}

/**
 * A time as a clock face shows it, minutes and seconds such as 9:30. Seconds
 * are rounded up, so the face reads 0:00 only once the time is gone, never
 * while a fraction of a second is left to move in.
 */
export function formatClockTime(milliseconds: number): string {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, '0');
  return `${minutes}:${paddedSeconds}`;
}

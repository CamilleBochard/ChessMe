// A random source that can be replayed: the same seed gives the same numbers,
// so a measurement that depends on chance gives the same result every run.
// Free of anything DOM or Node.

/** A random number generator in [0, 1), like Math.random, using mulberry32. */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

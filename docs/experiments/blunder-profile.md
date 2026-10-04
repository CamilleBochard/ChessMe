# The Blunder Profile

The Blunder Profile is the measured distribution of Camille's own evaluation
losses, sliced by Phase. It turns Level from a rating into a shape: how often
a move loses nothing, how often it loses a little, and how heavy the tail of
large mistakes is. It is a yardstick the Bot is compared against, not a
mechanism applied to it.

## Reproducing

```sh
scripts/fetch_stockfish.sh
python -m pipeline.build_dataset
python -m pipeline.extract_blunder_profile --depth 18 --workers 4
```

The first command installs Stockfish 19, pinned by release and sha256, into
`tools/stockfish`. The third measures every move of the dataset and writes
`data/dataset/blunder-profile.json` (the distribution) and
`data/dataset/centipawn-losses.jsonl` (each move's loss with its game, ply and
Phase). A full run took about five hours on a four-core 2012 laptop.

Every analysis is kept in `data/analysis/stockfish-19-depth-18.jsonl` the
moment it is made. A run stopped at any point, even killed mid-write, carries
on from there when started again, and a finished run repeats nothing. Only
analyses made by the same engine at the same depth are reused.

## How a move is measured

**Two searches from the same position.** Stockfish searches the position
Camille faced, at a fixed depth, for its best move and score; then searches
the same position restricted to the move he played. The loss is the first
score minus the second, from his side of the board. When he played
Stockfish's own choice the second search is skipped and the loss is 0. A
played move scored a little above the best move, which a restricted search
can produce, also counts as 0.

**Capped at ten pawns.** Scores beyond ±1000 centipawns are read as ±1000,
and a mate as the cap. Past ten pawns the game is decided, so going from +25
to +15 is not a blunder in any human sense; missing a mate in three while
keeping +2 still costs 800. Losses therefore run from 0 to 2000.

**Reproducible.** Each Stockfish process runs on one thread and clears its
hash table before each position, so an analysis depends on the position and
the depth alone. Several processes run side by side, one per physical core.

**Every move of the dataset.** Both the training games and the Test Set are
measured. The profile is never fed to the Bot, so the Test Set has nothing to
leak into.

## Results

Measured on 2026-10-05 with Stockfish 19 at depth 18: 30,860 of Camille's
moves from 1,046 games, 27,970 distinct position and move pairs.

Centipawn loss per move. The percentile columns read "p% of moves lost this
much or less".

| Phase | Moves | Mean | p50 | p75 | p90 | p95 | p99 |
|---|---|---|---|---|---|---|---|
| Opening (1-10) | 5,225 | 25.7 | 1 | 27 | 62 | 104 | 315 |
| Middlegame (11-30) | 9,822 | 103.1 | 24 | 115 | 313 | 526 | 878 |
| Endgame (31+) | 15,813 | 104.5 | 0 | 95 | 320 | 563 | 1184 |
| All | 30,860 | 90.7 | 6 | 81 | 273 | 487 | 1000 |

Share of moves by size of loss, using the usual thresholds.

| Phase | Lost nothing | 50 or more | 100 or more | 300 or more |
|---|---|---|---|---|
| Opening | 49.0% | 12.6% | 5.4% | 1.1% |
| Middlegame | 39.0% | 40.1% | 27.7% | 10.6% |
| Endgame | 52.2% | 33.4% | 24.3% | 10.7% |
| All | 47.5% | 32.0% | 22.2% | 9.0% |

That is 2,789 moves losing three pawns or more, about 2.7 per game. Camille
plays Stockfish's own first choice on 35-40% of his moves in every Phase.

The full histogram, with finer buckets, is in `blunder-profile.json`.

## Reading the numbers

**The opening is where he errs least.** One move in a hundred loses three
pawns, against one in ten afterwards. This matches the Opening Book result:
the first moves are the ones he repeats from game to game.

**The endgame's "lost nothing" is inflated by decided positions.** The Phase
is assigned by ply, so "endgame" means move 16 onward, and many of those
games are already decided: on 18.5% of endgame moves both the best move and
the played move score beyond ten pawns for the same side, which the cap reads
as no loss. That share is 0.9% in the middlegame and 0 in the opening. The
median of 0 in the endgame says more about how his games end than about how
he plays them. Any comparison with the Bot has to apply the same cap to both,
which the shared code guarantees.

**Depth changes single moves, not the shape.** The same moves measured at
depth 8 give an overall mean of 86.5 against 90.7 at depth 18, but only 76.7%
of moves land in the same category (under 50, 50-99, 100-299, 300 or more) at
both depths, and of the 2,789 three-pawn losses found at depth 18, 2,058 are
also found at depth 8. A shallow search misses or invents a quarter of the
individual verdicts, which is why the profile uses depth 18 and records it.

## Known limitations

**No move history.** Each position is analysed from its FEN alone, so
Stockfish cannot see a threefold repetition. A move that allows a repetition
draw, or misses one in a lost position, can be mis-scored. Such moves are
rare in ten-minute games at this level.

**The dataset is not identified.** The profile records the engine, depth and
cap, and how many moves it measured, but not which export of the games. It
should be extracted again after each data refresh; the cache makes that
re-run cost only the new moves.

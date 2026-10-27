# The Level Break

Camille's play changes as he improves, and the Bot imitates him as he plays
today. His Level, how often and how badly he goes wrong, can move within a
few months; his Style moves slowly and is learned better from more games. So
the yardsticks of Level are built from his games since the last Level Break,
and everything that carries Style from every game kept
([ADR 0003](../adr/0003-level-since-the-last-level-break-style-from-every-game.md)).

This experiment states the rule that finds the Level Break, runs it on his
games, and says what the yardsticks of Level become when they are built from
the games after it.

## The rule

Stated here and committed, with the code that runs it
(`pipeline/level_break.py`), before it is first run on Camille's games.

**A game's Level.** The share of mistakes, moves that lost 300 centipawns or
more, among Camille's moves after ply 10, measured by the Stockfish analysis
the Blunder Profile uses (Stockfish 19 at depth 18). The plies before 11 are
left out: the Opening Book plays most of them for the Bot, and there his
preparation shows more than his Level. A game with no move after ply 10 has
no Level and is left out. Every move after ply 10 counts, in open and in
decided positions alike: a game played on in a lost position, where every
move reads as losing nothing, reads as a game with fewer mistakes.

**The games.** Camille's training games only, in the order they were
played, by the time each began in UTC. The Test Set stays held back from
every use but measurement.

**The candidate break.** For every split of the games into before and after
that leaves at least 150 games on each side, the difference between the
mean Level before and the mean Level after. The candidate is the split
where the difference, a fall or a rise, is largest. 150 games is several
thousand moves, enough for the yardsticks built after a break.

**The verdict.** The game order is shuffled at random 1,000 times, with a
fixed seed, and in each shuffle the largest difference over every split is
taken the same way. The candidate is a break if its difference is larger
than the 99th percentile of those 1,000. Taking the largest over every split
in the shuffles too accounts for having looked at every split: in a history
whose Level never changes, the largest difference passes the threshold one
time in a hundred. The level is 1% rather than 5% because the rule runs
again every month, and each run is another chance of a false alarm.

**After a break.** The rule runs again on the games after it. The last break
found is the Level Break, the moment the first game after it began.

**Ratings beside it.** Camille's ratings on each site are shown beside the
result as context. The rule does not use them: the two sites' scales differ
([ADR 0001](../adr/0001-base-model-chosen-by-measurement.md)), and a rating
also moves with the opponents met.

## What is run

1. **On today's games**: the training games of the dataset, every ten-minute
   game since 1 June 2025.
2. **On every ten-minute game since January 2025**, about 580 more games,
   which the dataset leaves out. The first day the dataset keeps, June 2025,
   was set by eye before this rule existed; this run says whether the rule
   finds a break near it. The first day kept does not change here.

For each run the write-up gives each game's Level over time, the candidate
break, the threshold and the verdict.

## The yardsticks since a break

The Blunder Profile, the improbability profile, the loss yardstick with its
per-game spreads and the Maia-Equivalent Rating can each be built from the
games played since a given moment. Each keeps the games it uses today and
keeps only those that began at that moment or later: the Blunder Profile and
the Maia-Equivalent Rating every game, training and Test Set (the original
model never saw his games), the improbability profile the Test Set, which
the fine-tuned model did not train on. With no Level Break, each is
identical to today's.

When the rule finds a break in today's games, each yardstick is given beside
its all-games version. The site keeps serving its current files: the ones
built here are written beside the results and published by the refresh.

## Reproducing

```sh
python -m pipeline.measure_level_break
python -m pipeline.measure_level_break --first-day 2025-01-01 \
    --out docs/experiments/results/level-break-since-2025-01.json
```

Both read the exports committed in `data/raw` and take each game's Level from
the Stockfish cache in `data/analysis`, analysing any move it does not hold.
They write `docs/experiments/results/level-break.json` and
`level-break-since-2025-01.json`, each game's Level and rating with every run
of the rule, and print the tables below.

## Results

Run on 2026-10-27 on the Ryzen desktop, where Stockfish analysed the 12,095
moves of the older games after scoring 300 positions of the laptop's cache
exactly as the laptop had; then run again on the laptop from the merged
cache, which gave both records byte for byte.

### Today's games: no Level Break

806 training games since 1 June 2025 have a move after ply 10.

| Month | Games | Mean Level | Chess.com rating (median, games) | Lichess rating (median, games) |
|---|---|---|---|---|
| 2025-06 | 69 | 13.2% | 814 (69) | |
| 2025-07 | 82 | 13.1% | 819 (3) | 1314 (79) |
| 2025-08 | 124 | 13.1% | 835 (4) | 1230 (120) |
| 2025-09 | 25 | 10.3% | 846 (4) | 1174 (21) |
| 2025-11 | 16 | 10.9% | 854 (16) | |
| 2025-12 | 4 | 6.9% | 840 (4) | |
| 2026-03 | 36 | 11.1% | 781 (31) | 1129 (5) |
| 2026-04 | 143 | 11.7% | 766 (143) | |
| 2026-05 | 125 | 11.9% | 840 (94) | 1261 (31) |
| 2026-06 | 120 | 13.1% | 799 (93) | 1338 (27) |
| 2026-07 | 23 | 9.3% | 708 (7) | 1315 (16) |
| 2026-08 | 29 | 10.5% | 701 (29) | |
| 2026-09 | 10 | 13.6% | 719 (5) | 1331 (5) |

The candidate break falls before the game of 3 September 2025: a mean Level
of 13.1% before it and 11.8% after, a difference of 1.35 points. The
threshold, the 99th percentile of the largest difference in 1,000 shuffles,
is 3.32 points. **It is not a break, and no Level Break is found: Level is
measured on every game, as it was.** The yardsticks of Level built since the
Level Break are therefore the yardsticks of every game, identical to those
the site serves, and nothing on the site changes.

### Every game since January 2025: no break near June 2025

1,280 training games since 1 January 2025, the same 806 and 474 older ones.

| Month | Games | Mean Level | Chess.com rating (median, games) |
|---|---|---|---|
| 2025-01 | 99 | 14.4% | 413 (99) |
| 2025-02 | 112 | 13.5% | 558 (112) |
| 2025-03 | 47 | 10.7% | 659 (47) |
| 2025-04 | 71 | 13.4% | 675 (71) |
| 2025-05 | 145 | 13.2% | 747 (145) |

The months from June 2025 on are those of the table above. The candidate
break falls before the game of 12 February 2025: 15.0% before it, 12.3%
after, a difference of 2.66 points against a threshold of 3.44. **No break
is found here either.** The split the dataset makes by hand, 1 June 2025,
separates a Level of 13.3% before it from 12.2% after, a difference of 1.07
points, the third of what the rule would need.

## Reading the results

**Camille's Level, read as his share of mistakes, has not moved by more
than chance since January 2025.** Month by month it stays between about 10%
and 14.5%, and the months that stand out hold few games.

**His Chess.com rating doubled in the same months.** From a median of 413
in January 2025 to 814 in June, while his share of mistakes went from 14.4%
to 13.2%. The first day the dataset keeps was set by eye from that rise.
The rule does not see it in his moves, and it was not built to: what a
rating measures is results against opponents, which can climb without the
mistakes this rule counts becoming rarer, for instance through smaller
inaccuracies, the clock, or a rating still finding its level. Which of these
it was, this experiment does not show.

**The rule sees only large changes.** One game's Level varies a lot from one
game to the next, with a standard deviation of 11.9 points around a mean of
12.2%, because a game holds a few dozen moves after ply 10. Checked once
outside the committed run, on today's 806 games put in a random order with
a drop added to the later half: a drop of 4 points, a third of his mistakes,
is found in 29 of 40 trials, a drop of 2 points in 9 of 40. "No break" means
no change of that size; a smaller one would pass unseen. The 1% level, the
150 games on each side and the share of 300 cp mistakes were fixed before
the run, and this is their price.

**What changes.** Nothing, for now: the Blunder Profile, the improbability
profile, the loss yardstick and the Maia-Equivalent Rating keep every game.
The first day kept stays June 2025; the rule finds no reason to move it, and
none to keep it either. Whether the older games can come back for Style is
the subject of weighting each game by its rating. Each refresh of the games
runs the rule again.

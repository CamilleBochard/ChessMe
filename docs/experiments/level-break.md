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

## Results

Not yet run.

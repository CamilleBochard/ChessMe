# Move-Matching on each month's new games

Every Move-Matching figure so far was measured on the Test Set, the same 230
games each time. The games each monthly refresh brings are a second, fresh
test: the served model has never seen them, and measured before anything is
trained on them they say whether the model keeps up with how Camille plays
today, not only with how he played when it was trained. The record is in
[`monthly/`](monthly/README.md), one row per month or pooled months.

## Reproducing

The monthly refresh measures the games it has just fetched
(`pipeline/refresh_games.py`, see [the monthly refresh](../monthly-refresh.md)).
To measure games already in `data/raw` as a refresh that had just fetched
them would:

```sh
python -m pipeline.new_games_matching data/raw/lichess-2026-10-13.pgn data/raw/chesscom-2026-10-27.pgn data/raw/lichess-2026-10-27.pgn
```

The games of the named files that no other file holds are measured. Both
models must be in `models/onnx`: the served one from its `bot-data`
release, the untrained one from the `untrained-maia3-5m` release or
converted with `python -m pipeline.convert_maia3`.

## Method

**New games only, before anything takes them in.** The new games are those
the files a refresh fetched bring and no earlier file holds, filtered as
the dataset filters them. The refresh measures them before the dataset,
the Opening Book or anything else is rebuilt with them, so the measure can
never see a model trained on the games it is measured on. A run that
fetched nothing measures nothing, and says so.

**Two models on the same positions.** The served model and the untrained
Maia-3 5M both play at the served rating, 1100. Each is the Base Model
alone, with no Opening Book, and its first choice is compared with
Camille's move: the move the Move-Selection Engine plays from the model at
temperature 0, measured as in [Move-Matching](move-matching.md), under Node
with the engine's own encoding. The untrained model is the yardstick: some
months' positions are easier to guess than others, and what both models
find easy cancels out of the gain.

**The gain, position by position.** The figure followed from month to month
is the served model's Move-Matching minus the untrained model's. It is
measured position by position, and its standard error is clustered by game
from each game's own gain, so whatever makes a game easy or hard for both
models does not count against it. Each figure is also given per
[Phase](../../CONTEXT.md).

**A minimum of 1,500 moves.** A month's games range from 6 to 189, that is
143 to 5,798 of Camille's moves. Fixed before the first measurement: a
month needs 1,500 of his moves to be reported alone. On the Test Set, where
neither model trained, samples of whole games adding up to 1,500 moves
measure the gain to about ±0.83 points (median of 200 random samples),
against ±1.00 at 1,000 moves and ±0.54 at 3,500; the served model's gain
over all 7,092 Test Set moves is +4.08 ± 0.38 points. A shorter month is not
reported: its games wait for the next month's and the two are reported
together, the table saying which months a row covers. Months measured on
two different served models, after a retraining, are never pooled.

**What is kept.** Each measurement keeps, per game and per Phase, Camille's
moves and how many each model matched, with both models' checksums. That is
enough to compute every figure again, and to pool months by computing the
errors over the union of their games.

## Reading the gain

Steady or rising, the served model follows Camille as he plays now. Falling,
his play is moving away from the games the model was trained on, which is a
reason to train it again on the newer ones.

## Results

The first measurement, taken on 2026-10-27, covers the games of
`lichess-2026-10-13.pgn`, `chesscom-2026-10-27.pgn` and
`lichess-2026-10-27.pgn`: 114 games played from 24 September to 25 October
2026, 3,479 of Camille's moves (1,351 in September, 2,128 in October). The
served model was trained on the 816 training games of the dataset built
from the earlier files, so none of them. Both models ran under Node in
about 100 seconds each. Move-Matching in percent, gain in points, ± one
standard error clustered by game; the Test Set columns are the same
measure on its 230 games, from the two models' records there.

| Phase | Moves | Served | Untrained | Gain | Gain on the Test Set |
|---|---|---|---|---|---|
| Opening (1-10) | 567 | 71.08 ± 2.35 | 57.67 ± 1.87 | +13.40 ± 1.81 | +14.96 ± 1.24 |
| Middlegame (11-30) | 1,067 | 49.77 ± 1.54 | 47.70 ± 1.68 | +2.06 ± 1.19 | +3.25 ± 0.69 |
| Endgame (31+) | 1,845 | 53.88 ± 0.97 | 54.58 ± 1.04 | -0.70 ± 0.72 | +1.23 ± 0.47 |
| All | 3,479 | 55.42 ± 0.76 | 52.97 ± 0.86 | +2.44 ± 0.63 | +4.08 ± 0.38 |

18 of the new games fell in the Test Set when the dataset took them in, and
the refresh had already placed their moves in the served model's
distribution: its first choice matches Camille's move in the same moves,
Phase by Phase, as in this measurement.

### Reading the first measurement

**The served model still gains on games it has never seen**, 2.44 points
over the untrained model, nearly four standard errors from nothing. What it
learnt from Camille's games carries over to the games he played after them.

**The gain is smaller than on the Test Set**, 2.44 against 4.08 points. The
difference, 1.6 points, is about two standard errors of the difference
(0.74), so one month cannot tell whether it is real. Most of it is in the
endgame, where the served model no longer gains anything. The Test Set
games were played over the same months as the training games, these after
them: a model that partly learnt the openings and plans of those months
would gain less on later games, which is the drift the table is kept to
watch. The opening, where the gain is largest, holds up (13.40 against
14.96).

**These positions were easier to guess.** The untrained model matches 52.97%
of them against 49.82% of the Test Set's, the reason the gain over it, not
the served model's own figure, is the one followed.

**The error is a little larger than the minimum's estimate predicts.** At
3,479 moves the gain's error is 0.63 points, against about 0.54 for
samples of that size drawn from the Test Set: this month's games are
somewhat less alike than the Test Set's, nothing more.

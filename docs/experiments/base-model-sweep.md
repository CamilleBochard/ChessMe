# Choosing the Base Model

The Base Model is chosen by measuring which candidate best reproduces
Camille's moves, not by converting his rating from one site's scale to
another's (see [ADR 0001](../adr/0001-base-model-chosen-by-measurement.md)).
This page records how every candidate was measured and which one was chosen.

## Reproducing

```sh
npm run base-model-sweep > sweep.md
```

The command reads the candidates from `pipeline/base_model_candidates.json`,
loads each converted file from `models/onnx` (see
[Converting the candidate Base Models](onnx-conversion.md)), and measures
Move-Matching through the Move-Selection Engine under Node, exactly as
[Measuring Move-Matching](move-matching.md) describes. It prints the tables
below as Markdown; progress goes to standard error.

## Method

**The candidates.** The nine Maia-1 bins, 1100 to 1900, and Maia-3 5M. Maia-3
takes its rating as an input, so it is measured from 700 to 1900, each
rating counted as a candidate. Maia-3 was trained on games from below 600 to
above 2600, re-sampled so that every level is equally represented, so the
lower ratings are within what it learned. Each Maia-3 rating costs about 25
minutes over the full dataset, which is why the steps are 200 points rather
than Maia-1's 100.

**Every position, not only the Test Set.** The candidates were trained by
others on other players' games, so none of Camille's games can have shaped
them. His training games are therefore as fair a measure as the Test Set,
and four times as many positions narrow every estimate.

**Per Phase.** Each candidate is scored on the opening (plies 1-10), the
middlegame (11-30) and the endgame (31 on), and after ply 10 as published
Maia figures are. The Phase of each position is the one the dataset
pipeline assigned.

**Error estimates clustered by game.** Positions from one game share an
opening, a plan and an opponent, so they are not independent samples.
Treating them as independent would make every figure look more precise than
it is. Each figure carries one standard error computed with games as
clusters: each game contributes how far its number of matches strays from
what the overall share predicts for its number of positions.

**The decision.** Candidates are ranked by Move-Matching after ply 10. The
opening is left out because the Opening Book will answer most opening
positions, and because published figures leave it out. Every candidate
within half a point of the best is reported as tied with it. Among tied
candidates, the one with the smallest download is chosen; size picks a
family, and within that family the better score wins, because the bins of
one family share an architecture and differ in download only by how well
each set of weights compresses.

Licence is not compared by the code. Among these candidates it points the
same way as size: every Maia-1 bin is GPL-3.0, published with the weights,
while Maia-3's weights carry no licence of their own and are covered only
by the AGPL-3.0 of the repository the model card points to.

**The Maia-Equivalent Rating** is the rating of the candidate that matches
Camille's moves best, whether or not a tie sends the choice of Base Model to
another candidate.

## Results

Measured on 2026-10-03: 30,860 positions from 1,046 games, on an 8-core
desktop under Node 22.12.0 and onnxruntime-web 1.30.0. A Maia-1 bin takes
about 2.5 minutes, a Maia-3 rating about 25; the whole sweep about 3 hours
10 minutes. Running two candidates at once made each about eight times
slower, since ONNX Runtime already spreads one model over several cores.

Move-Matching in percent, ± one standard error clustered by game.

| Candidate | Opening (1-10) | Middlegame (11-30) | Endgame (31+) | After ply 10 | All |
|---|---|---|---|---|---|
| maia1-1100 | 45.53 ± 0.68 | 44.56 ± 0.50 | 48.81 ± 0.44 | 47.19 ± 0.34 | 46.91 ± 0.30 |
| maia1-1200 | 47.08 ± 0.69 | 44.31 ± 0.50 | 48.31 ± 0.46 | 46.78 ± 0.34 | 46.83 ± 0.31 |
| maia1-1300 | 46.76 ± 0.69 | 44.62 ± 0.49 | 48.11 ± 0.45 | 46.77 ± 0.34 | 46.77 ± 0.30 |
| maia1-1400 | 45.91 ± 0.68 | 44.92 ± 0.49 | 47.78 ± 0.45 | 46.68 ± 0.34 | 46.55 ± 0.31 |
| maia1-1500 | 46.79 ± 0.69 | 45.25 ± 0.49 | 47.75 ± 0.44 | 46.79 ± 0.33 | 46.79 ± 0.29 |
| maia1-1600 | 52.44 ± 0.77 | 44.89 ± 0.50 | 47.49 ± 0.44 | 46.50 ± 0.33 | 47.50 ± 0.31 |
| maia1-1700 | 47.12 ± 0.61 | 44.38 ± 0.49 | 46.66 ± 0.45 | 45.79 ± 0.33 | 46.01 ± 0.29 |
| maia1-1800 | 47.81 ± 0.72 | 43.86 ± 0.50 | 45.66 ± 0.44 | 44.97 ± 0.33 | 45.45 ± 0.30 |
| maia1-1900 | 46.78 ± 0.66 | 43.42 ± 0.49 | 45.72 ± 0.46 | 44.84 ± 0.34 | 45.17 ± 0.30 |
| maia3-5m at 700 | 47.04 ± 0.69 | 43.69 ± 0.50 | 48.41 ± 0.43 | 46.60 ± 0.33 | 46.68 ± 0.30 |
| maia3-5m at 900 | 47.90 ± 0.68 | 46.05 ± 0.50 | 50.36 ± 0.44 | 48.71 ± 0.33 | 48.57 ± 0.30 |
| maia3-5m at 1100 | 48.52 ± 0.66 | 46.96 ± 0.51 | 50.84 ± 0.44 | 49.35 ± 0.34 | 49.21 ± 0.30 |
| maia3-5m at 1300 | 49.40 ± 0.66 | 47.28 ± 0.51 | 50.51 ± 0.46 | 49.27 ± 0.35 | 49.29 ± 0.31 |
| maia3-5m at 1500 | 49.86 ± 0.66 | 46.84 ± 0.50 | 50.00 ± 0.46 | 48.79 ± 0.34 | 48.97 ± 0.31 |
| maia3-5m at 1700 | 49.38 ± 0.65 | 46.33 ± 0.50 | 49.43 ± 0.46 | 48.24 ± 0.34 | 48.43 ± 0.30 |
| maia3-5m at 1900 | 49.28 ± 0.66 | 45.82 ± 0.50 | 48.52 ± 0.46 | 47.49 ± 0.34 | 47.79 ± 0.31 |

| Slice | Positions | Games |
|---|---|---|
| Opening (1-10) | 5,225 | 1,046 |
| Middlegame (11-30) | 9,822 | 1,036 |
| Endgame (31+) | 15,813 | 887 |
| After ply 10 | 25,635 | 1,036 |
| All | 30,860 | 1,046 |

| | Value |
|---|---|
| Best candidate (after ply 10) | maia3-5m at 1100, 49.35 ± 0.34 |
| Tied with it (within 0.5 points) | maia3-5m at 1300 |
| Maia-Equivalent Rating | 1100 |
| Distance from the Lichess rating (1331) | -231 |
| Chosen as Base Model | maia3-5m at 1100, 49.35 ± 0.34 |
| Its rating | 1100 |
| Its download (brotli) | 19.17 MB |
| Its licence | AGPL-3.0 (the CSSLab/maia3 repository; the model card points there) |

The ticket counted 30,649 positions; the dataset has since gained the 9
games of `data/raw/chesscom-2026-10-02.pgn`.

The sweep was run twice, the second time with Maia-3 at 700 and 900 added.
Every figure the two runs share is identical, so the measurement is
repeatable on this machine.

## Reading the results

**Maia-3 matches more of Camille's moves than any Maia-1 bin, at every
rating and in every Phase.** After ply 10 its best rating leads the best
Maia-1 bin by 2.16 points, more than six times the standard error of
either figure. No Maia-1 bin is
within half a point, so size and licence do not come into the decision.

**Both families match him best at the low end of their range.** Maia-1
declines steadily from its lowest bin, 1100, to 1900. Maia-3 rises from 700
to a plateau at 1100 and 1300, then declines. The two plateau ratings are
tied; 900 and 1500 are each about 0.6 points lower.

**The middlegame is the hardest Phase to predict** for every candidate, and
the endgame the easiest, likely because captures and forced moves are
more common there.

**Maia-1 1600 matches 52.44% of the opening**, five points above its
neighbours, while its other Phases sit in line with them. It most likely
shares a few of Camille's frequent opening choices, which the Opening Book
will answer in any case.

## Decision

The Base Model is **Maia-3 5M at 1100**, with 1300 tied. Camille's
**Maia-Equivalent Rating is 1100**, 231 points below his Lichess rating of
1331 and 350 above his Chess.com rating of about 750. Maia-3 learned the
Lichess blitz scale, while his games are 10-minute ones, so this rating is
a position on Maia's scale rather than a forecast of either site's rating.

The cost is the download: 19.17 MB with Brotli, against about 2.4 MB for a
Maia-1 bin. Loading Maia-1 first and switching to Maia-3 later was
considered and rejected: a visitor who plays a single game would mostly
meet the weaker model and download both. The page instead starts
downloading Maia-3 as soon as it opens and shows its progress.

## Limits

- Ties use a fixed threshold of half a point, not a test of significance.
  Every candidate is measured on the same positions, so the uncertainty of
  a gap between two candidates is not the error of either figure; it was
  not computed. The choice of family does not hinge on it, with a gap of
  2.16 points; the choice between 1100 and 1300 does, and they are reported
  as tied.
- Licence is not compared by the code. Here it points the same way as
  size: Maia-1's weights are GPL-3.0, while Maia-3's carry no licence of
  their own and are covered by the AGPL-3.0 of the repository its model
  card points to.
- Only the top move is compared, and the engine is given no earlier
  positions, as described in [Measuring Move-Matching](move-matching.md).

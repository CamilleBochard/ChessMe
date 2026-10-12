# Measuring Move-Matching

Move-Matching is the share of Camille's Test Set positions in which the Bot
plays the move he played. It is the project's primary measure of Style, and
every later addition (the Opening Book, a different Base Model) is judged by
how it moves this number.

## Reproducing

```sh
npm run move-matching -- models/onnx/maia1-1500.onnx
npm run move-matching -- models/onnx/maia3-5m.onnx --rating 1500
```

The command loads the named ONNX file, replays every position of
`data/dataset/test.jsonl` through the Move-Selection Engine under Node, and
prints two scores. The model is named by its path: measuring another candidate
needs no code change.

## Method

The engine is the code the page runs, not a copy written for measurement. It
runs on onnxruntime-web, the runtime visitors' browsers use.

**The move compared is the model's top legal move.** The network scores every
move; the engine keeps the legal ones, turns their scores into probabilities
and plays the most likely. This is how published Maia figures are computed.

**Two scores are reported.** The overall score counts every Test Set position.
The second leaves out each game's first ten plies, as published Maia figures
do, because opening moves are easy to predict and would flatter any model.
The second is the one to compare with published numbers. A breakdown by Phase
belongs to the Base Model sweep.

**The engine is given a position, not a game.** Both Base Model families read
the last eight positions, but the engine's boundary is a single FEN, and the
Test Set records only the position before each of Camille's moves. When no
earlier positions are known, the reference implementations fill the history
with copies of the current position, and the engine does the same. Maia was
trained on real histories, so this may cost some Move-Matching against
published figures. It is also exactly what the page does, so the number
measured is the number visitors get.

**Maia-3 is given one rating for both players.** It reads the player's and
the opponent's rating as inputs. The opponent's rating is unknown to the
engine, so both are set to the rating the model plays at.

## Encoding checked against the reference implementations

The engine builds each network's input with its own TypeScript code, so that
code is checked against the implementation each model was trained with, on
the 50 positions of `pipeline/verification_positions.txt`. In both checks the
reference runs the very ONNX file the engine loads, so only the encoding can
make the answers differ.

| Family | Reference | Recorded by | Agreement required |
|---|---|---|---|
| Maia-1 | lc0 v0.32.1 | `python -m pipeline.maia1_reference` | 0.01 percentage points |
| Maia-3 | CSSLab's maia3 package | `python -m pipeline.maia3_reference` | 0.001 percentage points |

Every position passes, for every legal move's probability and for the top
move. The two tests (`src/engine/maia1-encoding.test.ts`,
`src/engine/maia3-encoding.test.ts`) are skipped on a checkout without the
converted models.

lc0 needs care. It computes its probabilities with an approximate exponential
(`FastExp`, off by up to about 0.3%) and stores each in 16 bits before
printing it to two decimals. Compared naively, the engine differed from lc0 by
up to 0.07 points. With lc0's two approximations reproduced in the test, the
largest difference is 0.017 points before rounding, and the test holds the
engine to 0.01 points after it.

The checks were shown to catch real mistakes by breaking the encoder on
purpose. For Maia-1, leaving out the history copies, filling history at the
starting position, skipping the en passant correction, scaling the fifty-move
counter, or dropping one castling plane each failed between 2 and 47 of the
50 positions. For Maia-3, leaving out the history copies, not mirroring the
board for Black, or mixing up the two sides' pieces each failed between 25
and 49. Setting Maia-3's clock feature changed nothing: the converted model's
policy does not read it.

This also settles the question the conversion notes left open: the
WebAssembly build of ONNX Runtime computes the same numbers as the native
build.

## Results

Test Set: 7,092 positions from 230 games, 5,942 of them after ply 10.

| Model | Overall | After ply 10 | Time |
|---|---|---|---|
| maia1-1500 | 47.77% (3,388) | 47.31% (2,811) | 89 s |
| maia3-5m at 1500 | 49.82% (3,533) | 48.96% (2,909) | 429 s |

These are the first two measurements, not yet the Baseline, at a
placeholder rating of 1500. The sweep across every candidate, with error
estimates and a breakdown by Phase, chose the Base Model: see
[Choosing the Base Model](base-model-sweep.md).

## The drawn move

The Bot no longer always plays the Base Model's most likely move. Maia
predicts the moves of a crowd of players at a rating, and the crowd's single
most likely move is rarely a mistake, while a player at that rating
sometimes plays a less likely move and makes most of his mistakes among
them. Always playing the top move filtered those out, and Camille won none
of 21 games against that Bot. The engine now draws the Base Model's move at
random, weighted by the model's probabilities over the legal moves. A
temperature shapes the draw: each probability is raised to the power 1/T
and the set rescaled, which is what dividing the network's raw scores by T
before its softmax gives. At 1, the served setting, each move is played as
often as the model predicts; below 1 the draw leans towards the top move,
and at 0 it always plays it. The Opening Book is consulted before any draw
and still plays Camille's most played reply.

### Reproducing

```sh
npm run drawn-move -- models/onnx/maia3-5m.onnx --rating 1100 --record docs/experiments/results/drawn-move.json
```

`--temperature <t>` measures another temperature. Every earlier script
(Move-Matching, the sweep, the Opening Book, the Bot's games) asks for
temperature 0, so the figures and games recorded with the top move are
reproduced unchanged.

### Method

**The expected score, not one run.** A drawn move is random, so the
Move-Matching of one run would mix the luck of the draw with the luck of
which games the Test Set holds. Each position is scored instead by the
probability the draw lands on Camille's move, and the scores are summed:
the Move-Matching the draw earns on average. The standard error is
clustered by game as before, each game contributing the sum of its
positions' probabilities in place of its count of matches.

**One pass for both figures.** The engine works out, for each position, how
likely it is to play each move; the same distribution is what it draws
from. Its most likely move gives the top-move score and the probability it
gives Camille's move gives the drawn score, so the two columns come from
the same run on the same positions.

**The Base Model alone**, as the sweep measured it, so the top-move column
reproduces the published figures.

### Results

Measured on 2026-10-12 on the Test Set, 7,092 positions from 230 games,
with Maia-3 5M at 1100 under Node, in about five minutes. Move-Matching in
percent, ± one standard error clustered by game, with the number of
positions in brackets.

| Phase | Top move | Drawn at temperature 1 |
|---|---|---|
| Opening (1-10) | 51.30 ± 1.46 (1150) | 35.08 ± 0.78 (1150) |
| Middlegame (11-30) | 47.60 ± 1.06 (2187) | 34.40 ± 0.58 (2187) |
| Endgame (31+) | 50.65 ± 0.94 (3755) | 37.97 ± 0.71 (3755) |
| After ply 10 | 49.53 ± 0.67 (5942) | 36.66 ± 0.50 (5942) |
| All | 49.82 ± 0.57 (7092) | 36.40 ± 0.43 (7092) |

The top-move column is the Baseline published by the
[Opening Book experiment](opening-book.md), to the last digit.

### Reading the results

**Drawing costs about 13 points of Move-Matching in every Phase**: after
ply 10, 36.66% against 49.53%. On average the model gives the move Camille
played a probability of about 0.37, so a draw lands on it a little more
than one time in three, while the top move is his about half the time.

The loss is the price of the change, not a flaw in it: Move-Matching
rewards always playing the most likely move, which is exactly what made
the Bot stronger than the player it imitates. Whether the drawn Bot plays
at Camille's Level is a different measurement, of evaluation losses
against his [Blunder Profile](blunder-profile.md), and is not made here;
neither is the choice of temperature that it would inform.

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

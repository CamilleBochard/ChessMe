# Fine-tuning the Base Model

Everything else in the project leaves the Base Model's weights as CSSLab
trained them and adds to what surrounds it. This experiment changes the
weights: it continues training Maia-3 5M on Camille's own moves, then
measures whether the result plays his move more often than the Baseline.

It was expected to fail. [ADR 0001](../adr/0001-base-model-chosen-by-measurement.md)
records the reason: in the Maia-individual study (McIlroy-Young et al., KDD
2022), as the ADR reads it, fine-tuning on a player with about a thousand
games lowered move-matching below the untrained model, 49.7% against 52.7%,
and Camille has fewer games than that. The experiment was run anyway,
because a prediction is not a measurement.

**It did not fail.** Training all of the Base Model's weights for one epoch
raised Move-Matching after ply 10 from 49.53% to 51.50% on the Test Set, a
gain of 1.97 ± 0.37 points measured position by position, more than five
standard errors. Training only a small adapter gained 0.40 ± 0.37 points,
within chance. How much of the first gain is Camille's Style, rather than
the model adapting to how this project feeds it positions, is not settled
here; see [What the gain may contain](#what-the-gain-may-contain).

## Reproducing

```sh
python -m pipeline.build_dataset
python -m pipeline.fetch_models
python -m pipeline.measure_fine_tuning
```

The last command uses a GPU when PyTorch finds one. On a CPU it takes
hours: on the project's desktop, throttled to about two cores, the first
epoch of the first learning rate had not finished after half an hour.
`notebooks/fine-tuning.ipynb` runs the same three commands on a Google
Colab GPU, which is how the project trains, since no local GPU here has a
working ROCm setup. The notebook clones the repository at the commit named
in its first cell, which must be on GitHub, rebuilds the dataset from the
raw games it tracks, so the split is the same, and downloads
`docs/experiments/results/fine-tuning.json` at the end. The tables below go
to standard output, and progress to standard error.

## The Base Model in PyTorch

The site runs an ONNX copy of the Base Model, but training needs the
original PyTorch weights, built and loaded with CSSLab's maia3 package as
in [the conversion](onnx-conversion.md). Before any training result can be
trusted, the PyTorch model must play the moves the site's model plays.

**The encoding.** Training encodes a position as the Move-Selection Engine
does (see [Measuring Move-Matching](move-matching.md)): the maia3 package's
tokenizer, the eight positions of history filled with copies of the current
one, and the Base Model's rating, 1100, for both players. Probabilities are
taken over the legal moves only, and Black's moves are mirrored, since the
network sees every position from the side to move.

**Checked twice.** A test (`pipeline/tests/test_fine_tuning.py`) runs the
PyTorch model through the training code's encoder on the 50 positions the
engine's own encoding is checked against, and requires the same top move as
the ONNX file in every one. Breaking the mirroring for Black, or passing
another rating, makes it fail. Then every run plays the whole Test Set with
the PyTorch model and sets its counts beside the ones the engine recorded
under Node for [the Opening Book](opening-book.md). They are identical in
every Phase, down to the last digit of the standard error.

## Method

**Two variants.**

- *Full*: every one of the Base Model's 5,230,084 weights is trained.
- *Adapter*: the Base Model is frozen, and only a small adapter is
  trained, inserted between the trunk (the eight transformer blocks that
  describe each square) and the heads that turn those descriptions into
  move scores. It squeezes each square's 256 numbers to 16, widens them
  back and adds the result to the original: 8,464 weights. Its last layer
  starts at zero, so before training the model plays exactly the Base
  Model's moves, which a test checks; another test checks that training
  leaves every Base Model weight unchanged.

**The loss.** Each step lowers the cross-entropy of the move Camille
played among the legal moves: the network learns to give that move more
probability. The optimiser is AdamW, with batches of 64 positions and no
weight decay: decay pulls weights toward zero, which suits training from
scratch, while here the weights worth staying near are the Base Model's.

**Validation games, not the Test Set.** A tenth of the training games,
whole games chosen by a hash of their id, is set aside. After each epoch
the model plays them, and the epoch with the best Move-Matching after ply 10
is kept. The untrained model is scored too, as epoch 0, but never kept,
even when no epoch beats it: keeping it would hand back the Baseline and
leave fine-tuning unmeasured. The learning rate is chosen the same way,
from a small grid for each variant: 10⁻⁶, 10⁻⁵ and 10⁻⁴ for the full model, whose weights already
encode millions of games, and 10⁻⁴, 10⁻³ and 10⁻² for the adapter, which
starts from nothing. Choosing on the Test Set would keep the luckiest of
several runs and overstate it; here each variant plays the Test Set once.

**The comparison.** Each variant's chosen model plays the 7,092 Test Set
positions, and its Move-Matching is reported per Phase beside the
Baseline's. Both play the same positions, so the gap is measured position
by position: each game contributes its matches gained or lost, and the
standard error of the gap is clustered by game like every other figure in
the project. Putting the two separate errors side by side would overstate
the uncertainty of the gap.

**Nothing ships unless it beats the Baseline.** What counts as beating it
was fixed before the run: a variant's gain after ply 10 must exceed two
standard errors of the gap; a model with no real advantage clears that bar
by luck about one time in forty. After ply 10, because the Base Model was chosen there and the
Opening Book answers most opening positions. The trained weights are saved
to `models/fine-tuned`, outside the site, which only ever serves
`models/onnx/maia3-5m.onnx`.

## Results

Measured on 2026-10-08 on a Google Colab GPU, with PyTorch 2.11.0. The
training games were split into 21,639 positions from 741 games to train on
and 2,129 positions from 75 games to validate on. The Test Set is the
usual 7,092 positions from 230 games. The PyTorch Baseline's counts and
clustered errors were identical to the engine's in every slice, on the GPU
as on the CPU.

Move-Matching on the Test Set, in percent, ± one standard error clustered
by game.

| Model | Opening (1-10) | Middlegame (11-30) | Endgame (31+) | After ply 10 | All |
|---|---|---|---|---|---|
| Baseline | 51.30 ± 1.46 | 47.60 ± 1.06 | 50.65 ± 0.94 | 49.53 ± 0.67 | 49.82 ± 0.57 |
| Fine-tuned, full | 66.26 ± 1.61 | 50.85 ± 1.09 | 51.88 ± 1.00 | 51.50 ± 0.69 | 53.89 ± 0.62 |
| Fine-tuned, adapter | 59.74 ± 1.47 | 48.06 ± 1.06 | 51.03 ± 0.97 | 49.93 ± 0.69 | 51.52 ± 0.60 |

Gain over the Baseline on the same positions, in percentage points, ± one
standard error of the gain.

| Variant | Opening (1-10) | Middlegame (11-30) | Endgame (31+) | After ply 10 | All | Beats the Baseline |
|---|---|---|---|---|---|---|
| Full | +14.96 ± 1.24 | +3.25 ± 0.69 | +1.23 ± 0.47 | +1.97 ± 0.37 | +4.08 ± 0.38 | yes |
| Adapter | +8.43 ± 0.98 | +0.46 ± 0.65 | +0.37 ± 0.44 | +0.40 ± 0.37 | +1.71 ± 0.36 | no |

The gains' errors are smaller than the separate errors in the first table,
about half of them after ply 10: both models play the same positions, so
most of what makes one sample of games easier than another cancels out of
the gain.

**Choosing the learning rate.** Validation Move-Matching after ply 10, in
percent, after each epoch; epoch 0 is the untrained model. The kept epoch
is in bold.

| Variant | Learning rate | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|---|
| Full | 10⁻⁶ | 50.66 | 52.02 | 52.19 | **52.25** | 52.19 | | |
| Full | **10⁻⁵** | 50.66 | **52.88** | 52.59 | 52.76 | 52.65 | | |
| Full | 10⁻⁴ | 50.66 | 49.63 | **50.43** | 48.55 | 46.15 | | |
| Adapter | **10⁻⁴** | 50.66 | 52.02 | 52.25 | 52.48 | 52.42 | **52.82** | 52.48 |
| Adapter | 10⁻³ | 50.66 | 51.68 | **51.74** | 50.88 | 51.05 | 51.62 | 51.23 |
| Adapter | 10⁻² | 50.66 | 50.60 | 51.45 | 51.57 | 51.51 | **51.85** | 51.68 |

The validation games hold 1,755 positions after ply 10, so each of these
figures carries about one point of standard error. They are good enough to
reject 10⁻⁴ for the full model, not to rank the rates that end within a
point of each other.

| Variant | Weights trained | Per training position | Learning rate | Epoch |
|---|---|---|---|---|
| Full | 5,230,084 | 241.7 | 10⁻⁵ | 1 |
| Adapter | 8,464 | 0.39 | 10⁻⁴ | 5 |

## Reading the results

**Full fine-tuning plays Camille's move more often in every Phase.** After
ply 10 it gains 1.97 points, more than five standard errors of the gain.
The middlegame gains the most of the later Phases, 3.25 ± 0.69 points; the
endgame gains 1.23 ± 0.47.

**The opening gains most of all, and that gain is mostly not new.** Full
fine-tuning matches 66.26% of opening positions, against 51.30% for the
Baseline. The Opening Book already brings the Bot to 62.61% there (see
[The Opening Book](opening-book.md)), and the Bot consults the book first,
so most of this gain would reach a visitor anyway. How much a fine-tuned
model adds behind the book was not measured.

**The adapter learns the opening and little else.** It gains 8.43 points
in the opening but 0.40 ± 0.37 after ply 10, which is within chance. On the
validation games its best epoch scored as well as full fine-tuning's
(52.82% against 52.88%), so the two only parted on the Test Set; the
validation games were too few to tell them apart.

## The parameter-to-example ratio

The full model has 242 weights for every training position. A model with
that much freedom can memorise its training games, learning which move
Camille played in each position seen rather than how he plays, and then
does worse on games it has not seen. This is the reason the experiment was
expected to fail, and the validation curves show it happening: at a
learning rate of 10⁻⁴, validation Move-Matching drops below the untrained
model's after the first epoch and falls to 46.15% by the fourth.

At 10⁻⁵ it does not happen within one epoch. The validation score peaks
after the first pass over the training games and then stays flat, and that
first epoch is the one kept. The ratio counts the weights that may change,
not how far they move: a small learning rate, one epoch and an early stop
let each weight move only slightly away from a model that already plays
like a human of his Level. The ratio predicts what happens when training is
pushed; validation stopped it before.

The adapter has 0.39 weights per training position, too few to memorise
anything, and its validation curve indeed never collapses at any learning
rate. The price is how little it can change: it adds one correction to the
trunk's description of each square, after the eight blocks have done
their work, and that was enough to learn opening preferences but not to move
Move-Matching later in the game.

## What the gain may contain

The gain is measured; what it consists of is not. Two things besides
Camille's Style can raise Move-Matching here, and neither is specific to
him.

- **The history the network is given.** Maia-3 was trained on real game
  histories, but the engine gives it eight copies of the current position,
  since it receives a FEN and no earlier moves (see
  [Measuring Move-Matching](move-matching.md)). Fine-tuning trains on that
  same input, so part of the gain may be the model adapting to copied
  histories.
- **The time control.** Maia-3's ratings are on the Lichess blitz scale,
  while Camille's games are ten-minute ones (see
  [Choosing the Base Model](base-model-sweep.md)). If the games it learned
  from were mostly faster than his, part of the gain may be learning how
  people play with ten minutes on the clock.

Fine-tuning the same way on the other players' ten-minute games at his
Level, sampled for [the style discriminator](style-discriminator.md), and
measuring that model on Camille's Test Set would separate the two: whatever
gain it shows is not his. That control has not been run.

## Decision

Full fine-tuning **beats the Baseline** by the rule fixed before the run,
so it may replace the Base Model in the browser. It is not shipped by this
experiment. Shipping it means converting the trained weights to ONNX,
measuring the Bot with it under Node behind the Opening Book, and playing
again the Bot's games that the Style Fingerprint and the style
discriminator were measured on. The adapter does not beat the Baseline and
does not ship.

The result also disagrees with the prediction recorded in ADR 0001. That
prediction rests on another model (Maia-1), its training setup and other
players. Which of these differences matters was not tested.

## Limits

- One run per learning rate, on a GPU. GPU arithmetic is not exactly
  repeatable, so a second run would give slightly different figures; how
  different was not measured.
- The validation games are few: about one point of standard error per
  figure, too coarse to rank learning rates that end within a point of
  each other.
- The learning-rate grids are three values each, and the batch size and the
  adapter's width were fixed in advance, not searched.
- Only the top move is compared, as everywhere in the project.

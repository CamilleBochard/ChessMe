# Fine-tuning the Base Model

Everything else in the project leaves the Base Model's weights as CSSLab
trained them and adds to what surrounds it. This experiment changes the
weights: it continues training Maia-3 5M on Camille's own moves, then
measures whether the result plays his move more often than the Baseline.

The published evidence says it should not.
[ADR 0001](../adr/0001-base-model-chosen-by-measurement.md) records why:
McIlroy-Young et al., *Learning Models of Individual Behavior in Chess*
(KDD 2022), found that fine-tuning Maia on a player's games degraded
move-matching below the untrained model when the player had about a
thousand games, 49.7% against 52.7%, and Camille has fewer. The
experiment is run anyway, because a prediction is not a measurement, and
because the reason it should fail, the ratio of weights trained to positions
learned from, can be measured too.

## Reproducing

```sh
python -m pipeline.build_dataset
python -m pipeline.fetch_models
python -m pipeline.measure_fine_tuning
```

The last command uses a GPU when PyTorch finds one. On a CPU it takes
hours; `notebooks/fine-tuning.ipynb` runs the same three commands on a
Google Colab GPU, which is how the project trains, since no local GPU here
has a working ROCm setup. The notebook clones the repository, rebuilds the
dataset from the raw games it tracks, so the split is the same, and
downloads `docs/experiments/results/fine-tuning.json` at the end. The tables
below go to standard output, and progress to standard error.

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
leave fine-tuning unmeasured. The learning rate is chosen the same way, from a small grid for
each variant: 10⁻⁶, 10⁻⁵ and 10⁻⁴ for the full model, whose weights already
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
standard errors of the gap; a model with no real advantage clears that bar by luck about one time
in forty. After ply 10, because the Base Model was chosen there and the
Opening Book answers most opening positions. The trained weights are saved
to `models/fine-tuned`, outside the site, which only ever serves
`models/onnx/maia3-5m.onnx`.

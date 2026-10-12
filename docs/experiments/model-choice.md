# The original or the fine-tuned Base Model

[Fine-tuning](fine-tuning.md) Maia-3 5M on Camille's training games raised
Move-Matching on the Test Set after ply 10 by 1.97 ± 0.37 points over the
Baseline, and a control model trained on other players' games gained
nothing. That was measured on the model alone, in PyTorch, on its top move.
The Bot is more than that: the Opening Book answers first, the engine runs
the model as ONNX in the browser, it draws its move at a temperature, and a
model can gain Style while changing Level. This experiment measures both
models inside the Bot, on the same footing, and chooses the one the Bot
serves.

## Recreating the fine-tuned weights

```sh
python -m pipeline.fetch_models
python -m pipeline.recreate_fine_tuned
```

The model is trained again from the repository with the recipe the
experiment chose on validation: every weight, learning rate 1e-5, one epoch,
seed 0, on the same training games. It then plays the Test Set, and its
matched counts are set beside the recorded ones, slice by slice.

**What counts as reproduced, stated before training.** The experiment
trained on a Colab GPU; this run trains on a CPU, which rounds differently,
and the differences accumulate over some 340 training steps. Played on a
CPU, the experiment's own weights match the recorded counts exactly in every
slice (3,822 of 7,092 overall, 3,060 after ply 10), so any gap comes from
training and not from playing.

- The same count in every slice: the recipe is reproduced.
- Counts that differ, by at most 1% of the recorded matches in every slice
  (38 of 3,822 overall): the recipe is reproduced up to rounding. The gap is
  reported with the largest weight difference from the experiment's
  weights and the number of Test Set positions where the two models play
  another top move.
- A larger gap in any slice: the recipe does not reproduce, and nothing goes
  further until the cause is found.

In the first two cases the recreated weights go forward, since they are
what the repository produces: they are the ones converted, measured and,
if chosen, served.

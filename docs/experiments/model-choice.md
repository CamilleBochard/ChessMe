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

**Reproduced exactly.** Trained on 2026-10-12 on an eight-core Ryzen 7 X3D
CPU under WSL2 with PyTorch 2.14.1, in 2.1 minutes. Validation after the
epoch scored 52.88%, the experiment's figure. On the Test Set the
recreated model matches the recorded counts in every slice: 3,822 of 7,092
overall, 3,060 after ply 10, 762, 1,112 and 1,948 in the three Phases. Its
weights differ from the experiment's by at most 4.9e-06, and the two models
play the same top move in all 7,092 Test Set positions. The details are in
`docs/experiments/results/fine-tuned-recreation.json`.

## Converting it and running it in the engine

```sh
python -m pipeline.convert_maia3 --fine-tuned models/fine-tuned/maia3-5m-full-recreated.pt
python -m pipeline.verify_maia3 --fine-tuned models/fine-tuned/maia3-5m-full-recreated.pt
npm run check-models
npm run drawn-move -- models/onnx/maia3-5m-fine-tuned.onnx --rating 1100 --record docs/experiments/results/drawn-move-fine-tuned.json
python -m pipeline.model_sizes
```

**The conversion passes the original's test.** On the 50 verification
positions the ONNX file plays the same top move as the PyTorch model at
every rating from 1100 to 1900. The largest difference in raw scores is
2.3e-05, against 2.4e-05 for the original conversion: the rounding of
32-bit arithmetic done in another order. onnxruntime-web, the runtime
visitors' browsers use, loads and runs it.

**The engine reproduces it.** Under Node, the Move-Selection Engine with
the converted file plays the model's top move on the Test Set and matches
Camille's in exactly the positions PyTorch did: 3,822 of 7,092, and 762,
1,112 and 1,948 in the opening, middlegame and endgame.

**Same download.** Both files weigh 22.20 MB, 19.17 MB with Brotli: the
same network with other values in its weights.

## The rule, stated before the figures were read

A Bot plays like Camille when its mistakes are his size and frequency
(Level) and it chooses his moves (Style). The temperature of the draw is
the dial for Level, so each model is first set to its own temperature, and
the models are then compared on Style.

**Each model at its own temperature.** The temperature that brings a
model's evaluation losses closest to Camille's Blunder Profile is chosen
exactly as in [the draw's temperature](draw-temperature.md): the same rule,
distance, opponent (the original model at 1100, drawing at 1), 200 games
per temperature, seed 13, and Stockfish 19 at depth 18. For the original
model this was done: temperature 1. For the fine-tuned model it is done
here. The ticket that asked for this comparison left the temperature out
of scope; the rule needs it, so it is measured here and reported with the
rest.

**Then Style decides.** Both Bots, the Opening Book in front of each model
and each drawing at its own temperature, answer the Test Set. The
fine-tuned model is chosen if its Bot's Move-Matching after ply 10,
measured on the drawn move as the probability the draw lands on Camille's
move, exceeds the original Bot's by more than two standard errors of the
gain, measured position by position. Otherwise the original model stays:
it is already served, and a gap within chance is no reason to change what
every visitor downloads. After ply 10, because the Opening Book answers
most opening positions for both Bots alike.

**Reported beside the decision, without changing it:** each model's
temperature and distance to the Blunder Profile, the top move's
Move-Matching, the Style Fingerprint and the style discriminator on 400
games of each Bot at its own temperature, and both models' download sizes.

**What follows.** If the fine-tuned model is chosen, the site serves it at
its temperature. If not, nothing changes on the site.

## Reproducing the measurements

```sh
for t in 0.75 1 1.25 1.5; do
  npm run bot-games -- --model models/onnx/maia3-5m-fine-tuned.onnx --temperature $t --opponent-rating 1100 --games 200 --out data/dataset/bot-games-fine-tuned-temperature-$t.jsonl
done
python -m pipeline.measure_draw_temperature --out docs/experiments/results/draw-temperature-fine-tuned.json \
  --run 0.75=data/dataset/bot-games-fine-tuned-temperature-0.75.jsonl --run 1=data/dataset/bot-games-fine-tuned-temperature-1.jsonl \
  --run 1.25=data/dataset/bot-games-fine-tuned-temperature-1.25.jsonl --run 1.5=data/dataset/bot-games-fine-tuned-temperature-1.5.jsonl
npm run compare-bots -- models/onnx/maia3-5m.onnx models/onnx/maia3-5m-fine-tuned.onnx \
  --first-temperature 1 --second-temperature 1.25 --record docs/experiments/results/model-choice-test-set.json
npm run bot-games -- --temperature 1 --opponent-rating 1100 --games 400 --out data/dataset/bot-games-original.jsonl
npm run bot-games -- --model models/onnx/maia3-5m-fine-tuned.onnx --temperature 1.25 --opponent-rating 1100 --games 400 --out data/dataset/bot-games-fine-tuned.jsonl
python -m pipeline.measure_model_choice --run original=data/dataset/bot-games-original.jsonl --run fine-tuned=data/dataset/bot-games-fine-tuned.jsonl
python -m pipeline.extract_style_fingerprint --bot-games data/dataset/bot-games-original.jsonl --out docs/experiments/results/style-fingerprint-original.json
python -m pipeline.extract_style_fingerprint --bot-games data/dataset/bot-games-fine-tuned.jsonl --out docs/experiments/results/style-fingerprint-fine-tuned.json
python -m pipeline.measure_model_choice_style --original data/dataset/bot-games-original.jsonl --fine-tuned data/dataset/bot-games-fine-tuned.jsonl
```

The games and Stockfish's analyses of them were made on the Ryzen desktop
that recreated the weights, with the same pinned Stockfish 19 and Node
22.12.0, after 300 positions of the laptop's cache came out identical
there. The original Bot's first 200 games, played there, are identical to
the 200 the laptop played for [the draw's temperature](draw-temperature.md):
the seeded draws reproduce across machines. Every figure below was then
computed again on the laptop from the merged cache, without a new
analysis, and the fine-tuned temperature results came out byte for byte
the same.

## Results

Measured on 2026-10-12 and 2026-10-13. **By the rule, the original model
stays**: at their own temperatures, the fine-tuned Bot matches Camille's
moves less often than the original Bot. The verdict turns on the
fine-tuned model's temperature, which was itself a close call; both are
set out below.

### The fine-tuned model's temperature: 1.25

The rule measured 1, 0.75 and 1.25, then 1.5 because 1.25 was the closest
so far and sat at the edge of what had been measured. 1.5 was further, so
it chose 1.25.

| Temperature | Won, drawn, lost | Distance | Distance, undecided positions | Middlegame | Endgame |
|---|---|---|---|---|---|
| 0.75 | 136, 19, 45 | 28.0 | 17.7 | 20.1 | 40.4 |
| 1 | 106, 25, 69 | 24.3 | 14.4 | 9.4 | 39.9 |
| 1.25 | 61, 32, 107 | 21.3 | 18.0 | 25.8 | 23.9 |
| 1.5 | 27, 23, 150 | 23.8 | 25.3 | 36.3 | 22.6 |

Distances in centipawns, 200 games each; the two right-hand columns are
each Phase's own distance. Full tables are in
`docs/experiments/results/draw-temperature-fine-tuned.json`.

**The choice is within chance, and the endgame makes it.** 1.25 is closer
than 1 by 3.0 centipawns, less than the 3.6 that separates Camille's own
training games from his Test Set. It wins on the endgame alone (23.9
against 39.9), while in the middlegame temperature 1 is far closer (9.4
against 25.8). The endgame is where the Bot's games, played on to mate,
spend twice Camille's share of moves in positions already decided, which
the ten-pawn cap scores as losing nothing; the check written into the rule
for exactly this case, the distance without those moves, points to 1
(14.4 against 18.0). As stated before the figures were read, the rule's
choice stands and the disagreement is reported.

At the same temperature the fine-tuned Bot errs less than the original:
against the same opponent at temperature 1 it scores 59% where the
original scores 52.5%, which is why its temperature comes out higher.

### Both Bots on the Test Set: the decision

The original Bot draws at 1 and the fine-tuned Bot at 1.25, the Opening
Book in front of each. Move-Matching in percent, the gain in points, ±
one standard error clustered by game.

| Phase | Original, drawn at 1 | Fine-tuned, drawn at 1.25 | Gain |
|---|---|---|---|
| Opening (1-10) | 55.18 ± 1.51 | 56.84 ± 1.46 | +1.66 ± 0.27 |
| Middlegame (11-30) | 34.43 ± 0.59 | 32.38 ± 0.55 | −2.05 ± 0.20 |
| Endgame (31+) | 37.97 ± 0.71 | 34.52 ± 0.69 | −3.45 ± 0.14 |
| **After ply 10** | **36.67 ± 0.51** | **33.73 ± 0.49** | **−2.94 ± 0.11** |
| All | 39.67 ± 0.49 | 37.48 ± 0.48 | −2.19 ± 0.10 |

The fine-tuned Bot loses 2.94 points after ply 10, far beyond chance in
the wrong direction, so the rule keeps the original model. The top move,
reported beside it, shows the gain fine-tuning brought to the model: +1.97
± 0.37 after ply 10 and +3.65 ± 0.78 in the opening even behind the
Opening Book (`docs/experiments/results/model-choice-test-set.json`).

### The same comparison at equal temperature

Run as a check, not as part of the rule: both Bots drawing at 1.

| Phase | Original | Fine-tuned | Gain |
|---|---|---|---|
| Opening (1-10) | 55.18 ± 1.51 | 58.90 ± 1.43 | +3.72 ± 0.35 |
| Middlegame (11-30) | 34.43 ± 0.59 | 36.63 ± 0.61 | +2.20 ± 0.21 |
| Endgame (31+) | 37.97 ± 0.71 | 38.79 ± 0.72 | +0.82 ± 0.11 |
| **After ply 10** | **36.67 ± 0.51** | **38.00 ± 0.51** | **+1.33 ± 0.10** |
| All | 39.67 ± 0.49 | 41.39 ± 0.49 | +1.71 ± 0.11 |

At the same temperature the fine-tuned Bot plays Camille's move more
often in every Phase, by 1.33 points after ply 10, about thirteen standard
errors. The verdict therefore flips with the fine-tuned model's
temperature: at 1 it would win, at 1.25 it loses.

### Reported beside the decision

**Level, on 400 games of each Bot at its own temperature.** Both are as
far from the Blunder Profile overall: 21.1 for the original at 1, 21.5 for
the fine-tuned at 1.25 (`model-choice-losses.json`). They err in different
places: the original matches Camille in the middlegame (5.0) and errs less
than he does in the endgame (36.7); the fine-tuned errs more than he does
in the middlegame (27.4) and is closer in the endgame (23.4). Against the
stand-in opponent, the original scores 54.0% (195 wins, 42 draws, 163
losses), the fine-tuned 36.9% (114, 67, 219), against Camille's 48%.

**The style discriminator.** The fine-tuned Bot's games score as more like
Camille's than the original Bot's by +0.021, with an interval of +0.008 to
+0.036 that excludes zero (`model-choice-style.json`). The original Bot
stands out from his peers at 0.454 (0.417 to 0.491), less like him than
they are; the fine-tuned Bot at 0.511 (0.474 to 0.550), indistinguishable
from them. The instrument is weak (0.573 on Camille's own Test Set) and
the two Bots drew at different temperatures, so this is a small sign, not
a finding.

**The Style Fingerprint.** Drawing at temperature 1 removed most of the
castling gap that the top-move Bot showed: the original Bot now castles
kingside in 56.8% of games, queenside in 15.0% and never in 28.2%, against
Camille's 53.5%, 15.2% and 31.3%. The fine-tuned Bot at 1.25 castles
kingside less (45.2%) and stays uncastled more (39.0%). Both are in
`style-fingerprint-original.json` and `style-fingerprint-fine-tuned.json`.

**Download.** Both models weigh 19.17 MB with Brotli.

## Reading the result

**Fine-tuning made the model more like Camille and more accurate at
once.** At equal temperature it finds his move more often in every Phase,
and its Bot wins more games than the original's. Its mistakes come back to
his size and frequency only at a higher temperature, and spreading the
draw that much costs more Move-Matching than fine-tuning gained.

**The decision rests on the endgame measurement.** In the middlegame the
fine-tuned model is already at Camille's Level at temperature 1, where it
also beats the original on Style. What moves its temperature to 1.25 is
the endgame, the Phase where the Bot's games are least like his because
they run on to mate. A Level yardstick that compared like with like in the
endgame, with Bot games ending as human games do or judged only on
positions still open, could well set the fine-tuned model at 1, where it
would win. That would be a new measurement with its own rule, not a
reading of this one.

**What changes on the site: nothing.** The original model at temperature
1 keeps being served.

## Known limitations

- **One seed, one stand-in opponent,** 200 games per temperature and 400
  per Bot; the temperature grid moves in quarter steps.
- **The fine-tuned model's temperature is within chance of 1,** and the
  verdict depends on it.
- **Bot games end by mate, not by resignation,** which inflates the share
  of endgame moves in decided positions; the rule measures Level with the
  Blunder Profile as defined, including those moves.
- **The discriminator compares Bots drawing at different temperatures,**
  so its small difference mixes the model with the temperature.

# The model and its temperature, chosen again on open positions

[The model choice](model-choice.md) kept the original Base Model, on a
fragile verdict. Its rule first set each model at the temperature that
brings its mistakes closest to Camille's Level, then let Style decide. The
fine-tuned model came out at 1.25, closer than 1 by less than chance and on
the endgame alone, and at 1.25 its Bot matched Camille's moves less often
than the original Bot. At temperature 1 it would have matched them more
often.

Two experiments since then change the ground the choice stands on. [Level
on open positions](level-on-open-positions.md) removed a bias from the
yardstick: the Bot's games run on to mate, and the moves made once a game is
decided read as losing nothing. [Cutting the improbable
moves](move-cut.md) found that the original model, drawn without a cut,
plays moves it gives less than 1% more often in the opening than Camille
does, and the engine can now draw among the ten most likely moves there
only.

This experiment makes the choice again, in two steps: the model and its
temperature, then, for the model chosen, whether the opening cut is served.

## What is already known

The rule below reads some figures that earlier experiments already
published, and the reader should weigh it accordingly.

- **Each model's temperature on open positions** was read in [Level on open
  positions](level-on-open-positions.md), from the same games this rule
  reads: 1 for the original model, 1 for the fine-tuned one, the latter
  within chance of both its neighbours.
- **Both Bots drawing at 1 on the Test Set** were compared in [the model
  choice](model-choice.md), as a check outside its rule: the fine-tuned Bot
  matched Camille's move more often after ply 10, by 1.33 ± 0.10 points.
- **The games are seeded.** Played again with the same seed and the same
  opponent, the Bot's games come out move for move the same, on another
  machine too. Playing the temperature runs again is a check that they
  reproduce, not a new sample.

Step 1 is therefore unlikely to surprise. What is new is the 400 games of
the fine-tuned Bot at its temperature, if that temperature is no longer
1.25, and the whole of step 2 on the Test Set: of the opening cut, only the
training-game figures were read before, for both models.

## The rule, stated before the figures were read

### Step 1: the model and its temperature

**Each model at its own temperature.** For each model, the temperature that
brings its evaluation losses closest to Camille's Level on open positions
is chosen by [the draw's temperature](draw-temperature.md)'s rule
(`next_step` in `pipeline/draw_temperature.py`), unchanged: the same
distance read on Open Positions, the same search on a grid of quarter steps,
200 games per temperature against the same opponent (the original model at
1100, drawing at 1), seed 13, Stockfish 19 at depth 18. The runs are played
again and analysed on the Ryzen desktop, and each is compared with the file
the earlier experiments played. If the rule asks for a temperature no run
has measured, its 200 games are played there too.

**Then Style decides.** Both Bots answer the Test Set, the Opening Book in
front of each model and each drawing at its own temperature. The fine-tuned
model replaces the original only if its Bot's Move-Matching after ply 10,
measured on the drawn move as the probability the draw lands on Camille's
move, exceeds the original Bot's by more than two standard errors of the
gain, measured position by position and clustered by game. Otherwise the
original model stays. After ply 10, because the Opening Book answers most
opening positions for both Bots alike.

### Step 2: the opening cut, for the model chosen

The candidate is the cut [Cutting the improbable moves](move-cut.md)
recommended: the ten most likely moves, top-10, on plies 1 to 10 only, read
on the model's own probabilities before the temperature. Move-Matching
after ply 10 cannot see a cut confined to the opening, so the cut has a
check of its own, on the model chosen at its temperature. It is served only
if both of these hold on the Test Set:

1. **It brings the opening closer to Camille.** The Bot's expected share of
   opening moves the model gives less than 1%, the model measured alone as
   in Cutting the improbable moves and on that model's own probabilities, is
   closer to Camille's share with the cut than without it, in absolute
   value. The change is reported with its standard error, clustered by
   game; the condition is only that the cut lands closer.
2. **It does not cost Camille's moves.** Opening Move-Matching, on the drawn
   move with the Opening Book in front, the same model and temperature with
   and without the cut, does not fall by more than two standard errors of
   the change, measured position by position.

### Reported beside the decision, without changing it

- each candidate's distance to Camille's Level on open positions, and each
  Phase's own distance;
- each candidate's Move-Matching per Phase, for the top move and the drawn
  move;
- the share of each candidate Bot's moves that the model served today, the
  original Maia-3 5M at 1100, gives less than 1%, per Phase, beside
  Camille's: on the moves of its 400 games drawn from the Base Model, the
  Opening Book's left out;
- the Style Fingerprint and the style discriminator on 400 games of each
  Bot at its own temperature, against the same opponent with seed 13.

### What follows

The site serves the model chosen, at its temperature, with the opening cut
if it passed. The choice is written up with its reasons whichever model wins
and whether or not the cut is served. If the original model at 1 wins
without the cut, nothing changes on the site.

## Reproducing

```sh
for t in 0.75 1 1.25; do
  npm run bot-games -- --model models/onnx/maia3-5m.onnx --temperature $t --opponent-rating 1100 --games 200 --out data/dataset/bot-games-temperature-$t.jsonl
done
for t in 0.75 1 1.25 1.5; do
  npm run bot-games -- --model models/onnx/maia3-5m-fine-tuned.onnx --temperature $t --opponent-rating 1100 --games 200 --out data/dataset/bot-games-fine-tuned-temperature-$t.jsonl
done
python -m pipeline.measure_draw_temperature --out docs/experiments/results/draw-temperature-open-positions.json \
  --run 0.75=data/dataset/bot-games-temperature-0.75.jsonl --run 1=data/dataset/bot-games-temperature-1.jsonl \
  --run 1.25=data/dataset/bot-games-temperature-1.25.jsonl
python -m pipeline.measure_draw_temperature --out docs/experiments/results/draw-temperature-fine-tuned-open-positions.json \
  --run 0.75=data/dataset/bot-games-fine-tuned-temperature-0.75.jsonl --run 1=data/dataset/bot-games-fine-tuned-temperature-1.jsonl \
  --run 1.25=data/dataset/bot-games-fine-tuned-temperature-1.25.jsonl --run 1.5=data/dataset/bot-games-fine-tuned-temperature-1.5.jsonl
npm run compare-bots -- models/onnx/maia3-5m.onnx models/onnx/maia3-5m-fine-tuned.onnx \
  --first-temperature 1 --second-temperature 1 --record docs/experiments/results/model-choice-on-open-positions-test-set.json
npm run compare-bots -- models/onnx/maia3-5m-fine-tuned.onnx models/onnx/maia3-5m-fine-tuned.onnx \
  --first-temperature 1 --second-temperature 1 --second-opening-cut top-k=10 \
  --record docs/experiments/results/opening-cut-test-set-fine-tuned.json
npm run opening-cut-check -- --cut top-k=10 --test data/dataset/move-probabilities/fine-tuned-test.jsonl \
  --matching docs/experiments/results/opening-cut-test-set-fine-tuned.json \
  --record docs/experiments/results/opening-cut-check-fine-tuned.json
npm run bot-games -- --model models/onnx/maia3-5m.onnx --temperature 1 --opponent-rating 1100 --games 400 --out data/dataset/bot-games-original.jsonl
npm run bot-games -- --model models/onnx/maia3-5m-fine-tuned.onnx --temperature 1 --opponent-rating 1100 --games 400 --out data/dataset/bot-games-fine-tuned-at-1.jsonl
python -m pipeline.measure_model_choice --out docs/experiments/results/model-choice-on-open-positions-losses.json \
  --run original=data/dataset/bot-games-original.jsonl --run fine-tuned=data/dataset/bot-games-fine-tuned-at-1.jsonl
python -m pipeline.extract_style_fingerprint --bot-games data/dataset/bot-games-fine-tuned-at-1.jsonl \
  --out docs/experiments/results/style-fingerprint-fine-tuned-at-1.json
python -m pipeline.measure_model_choice_style --original data/dataset/bot-games-original.jsonl \
  --fine-tuned data/dataset/bot-games-fine-tuned-at-1.jsonl --out docs/experiments/results/model-choice-on-open-positions-style.json
python -m pipeline.export_bot_moves data/dataset/bot-games-fine-tuned-at-1.jsonl --out data/dataset/bot-moves-fine-tuned-at-1.jsonl
npm run move-probabilities -- models/onnx/maia3-5m.onnx --rating 1100 data/dataset/bot-moves-fine-tuned-at-1.jsonl \
  --out data/dataset/move-probabilities/original-on-fine-tuned-bot-at-1.jsonl
npm run improbable-moves -- --camille data/dataset/move-probabilities/original-test.jsonl \
  --bot original=data/dataset/move-probabilities/original-bot.jsonl \
  --bot fine-tuned=data/dataset/move-probabilities/original-on-fine-tuned-bot-at-1.jsonl \
  --record docs/experiments/results/model-choice-on-open-positions-improbable-moves.json
```

The Bot's games, all seed 13 against the original model at 1100 drawing at
1, were played and analysed on the Ryzen desktop, after 300 positions of
the laptop's Stockfish cache came out identical there. Every one of the
seven temperature runs came out identical, move for move, to the files the
earlier experiments played on the laptop, and so did the original Bot's 400
games at 1. Its new games and analyses were then added to the laptop's
cache, and every figure below was computed there from the cache: the
temperature results equal, value for value, those committed for [Level on
open positions](level-on-open-positions.md), which are therefore not
written again. The records of npm run move-probabilities for Camille's
games and the original Bot's come from [Cutting the improbable
moves](move-cut.md#reproducing).

## Results

Measured on 2026-10-14. **The fine-tuned model replaces the original, at
temperature 1, and the opening cut top-10 is served with it.**

### Step 1: both models at 1, and the fine-tuned model wins

The rule set both models at temperature 1, as [Level on open
positions](level-on-open-positions.md) had read on the same games.

| Temperature | Original | Fine-tuned |
|---|---|---|
| 0.75 | 25.7 | 17.7 |
| 1 | **10.6** | **14.4** |
| 1.25 | 19.3 | 18.0 |
| 1.5 | | 25.3 |

Distance to Camille's Level on open positions, in centipawns, 200 games per
temperature. His Test Set lies 4.0 from his training games by the same
distance. The original model's choice is firm, by 8.7 centipawns or more;
the fine-tuned model's is not, by 3.3 and 3.6, both under the chance gap.

Both Bots on the Test Set, the Opening Book in front of each, drawing at 1.
Move-Matching in percent, the gain in points, ± one standard error clustered
by game:

| Phase | Original, drawn | Fine-tuned, drawn | Gain | Gain, top move |
|---|---|---|---|---|
| Opening (1-10) | 55.18 ± 1.51 | 58.90 ± 1.43 | +3.72 ± 0.35 | +3.65 ± 0.78 |
| Middlegame (11-30) | 34.43 ± 0.59 | 36.63 ± 0.61 | +2.20 ± 0.21 | +3.25 ± 0.69 |
| Endgame (31+) | 37.97 ± 0.71 | 38.79 ± 0.72 | +0.82 ± 0.11 | +1.23 ± 0.47 |
| **After ply 10** | **36.67 ± 0.51** | **38.00 ± 0.51** | **+1.33 ± 0.10** | +1.97 ± 0.37 |
| All | 39.67 ± 0.49 | 41.39 ± 0.49 | +1.71 ± 0.11 | +2.24 ± 0.33 |

The fine-tuned Bot gains 1.33 points after ply 10, about thirteen standard
errors, so by the rule it replaces the original. These are, digit for digit,
the figures [the model choice](model-choice.md) measured as a check at
equal temperature: the same models and the same Test Set, scored by an
expectation rather than a draw, give the same numbers.

### Step 2: the opening cut passes, narrowly

The fine-tuned Bot at 1, with and without top-10 in the opening, on the
1,150 opening positions of the Test Set. The shares are read on the
fine-tuned model's own probabilities; on that scale Camille plays a move it
gives less than 1% in 1.74% of his opening moves.

| Measure | Without the cut | With top-10 | Change |
|---|---|---|---|
| Bot's expected share under 1% | 2.26% | 1.48% | −0.78 ± 0.03 points |
| The same minus Camille's | +0.52 ± 0.39 | −0.26 ± 0.40 | |
| Opening Move-Matching, drawn, Opening Book in front | 58.90% | 59.06% | +0.16 ± 0.01 points |

**Both conditions hold, so the cut is served.** It lands the Bot 0.26
points from Camille instead of 0.52, and opening Move-Matching rises rather
than falls. The change the cut makes to the Bot is firm, since it is
measured on the same positions with and without it. Whether it lands nearer
Camille is not: each gap carries about 0.4 points of uncertainty from his
own 1,150 moves. The rule asked for closer, not closer beyond chance, and
the write-up does not claim more.

As context, the same check for the original model would have passed by a
wider margin: from +2.33 to −0.14 points, a change of −2.47 ± 0.05, with
opening Move-Matching up 0.35 ± 0.02 (`opening-cut-check-original.json`).
Fine-tuning had already closed most of the opening gap the cut was meant
for.

### Reported beside the decision

**Level, on 400 games of each Bot at 1.** On open positions the two Bots
are as far from Camille as each other: 13.4 centipawns for the original,
12.8 for the fine-tuned, a gap well inside the 4.0 of chance
(`model-choice-on-open-positions-losses.json`). Phase by Phase on open
positions, the fine-tuned Bot is a little further in the middlegame (10.0
against 7.1) and a little closer in the endgame (18.3 against 22.1). Both
lose less than he does in open endgames: 109.8 centipawns a move for the
fine-tuned Bot, 106.2 for the original, 128.1 for Camille. Against the
stand-in opponent the fine-tuned Bot scores 58.0% (205 wins, 54 draws, 141
losses), the original 54.0%, Camille 48% against his own opponents.

**Improbable moves, on the scale of the model served until now.** Every
move both Bots drew from their model in their 400 games, the Opening
Book's left out, scored by the original Maia-3 5M at 1100, beside
Camille's Test Set moves scored by the same model
(`model-choice-on-open-positions-improbable-moves.json`). The share of
moves it gives less than 1%:

| Phase | Camille | Original Bot | Fine-tuned Bot |
|---|---|---|---|
| Opening (1-10) | 1.30% | 4.20% | 2.42% |
| Middlegame (11-30) | 2.74% | 2.95% | 3.26% |
| Endgame (31+) | 3.28% | 2.99% | 3.15% |

Read by the original model, the fine-tuned Bot does not look stranger: it
plays far fewer improbable moves in the opening, and later on both Bots
stay within half a point of Camille, the original a little closer in the
middlegame and the fine-tuned in the endgame. Under 5% the fine-tuned Bot
is the closer in both Phases (14.02% against 13.37% in the middlegame,
Camille 14.04%; 13.22% against 11.59% in the endgame, Camille 14.09%). These games were played without the opening
cut, so the opening row is the uncut Bot's.

**The Style Fingerprint**, on the same 400 games of each Bot, both drawing
at 1. The two right-hand columns are Camille's training games and Test Set
measured apart: the gap between them is how far a statistic drifts by
chance.

| Statistic | Camille | Original Bot | Fine-tuned Bot | Camille, training games | Camille, Test Set |
|---|---|---|---|---|---|
| Mean loss, middlegame | 103.1 | 108.0 | 110.1 | 102.6 | 105.0 |
| Mean loss, endgame | 104.5 | 67.7 | 65.7 | 104.1 | 105.7 |
| Capture taken when on offer, opening | 29.8% | 39.3% | 39.7% | 29.8% | 30.1% |
| Capture taken when on offer, middlegame | 30.0% | 37.5% | 33.8% | 30.2% | 29.3% |
| Capture taken when on offer, endgame | 36.9% | 39.3% | 40.4% | 36.9% | 36.8% |
| Queen moves, opening | 5.8% | 3.2% | 4.3% | 5.9% | 5.3% |
| King moves, endgame | 16.4% | 26.5% | 22.4% | 16.2% | 17.2% |
| Queens off before move 20 | 19.2% | 22.8% | 23.3% | 18.4% | 22.2% |
| Material at move 30, mean (of 78) | 37.5 | 32.6 | 32.2 | 37.2 | 38.3 |
| Castled kingside | 53.5% | 56.8% | 59.2% | 52.2% | 58.3% |
| Never castled | 31.3% | 28.2% | 25.8% | 32.7% | 26.1% |

At equal temperature the fingerprints are close, and neither Bot is closer
on every count. The fine-tuned Bot takes an offered capture in the
middlegame less often than the original (33.8% against 37.5%, Camille
30.0%), moves its queen more in the opening and its king less in the
endgame, all towards Camille. The original is a little closer on castling.
Both trade queens early and reach move 30 with less material than he does.
The full fingerprints are in `style-fingerprint-original.json` and
`style-fingerprint-fine-tuned-at-1.json`.

**The style discriminator**, trained on Camille's training games against
other players', on the same 400 games of each Bot
(`model-choice-on-open-positions-style.json`). The fine-tuned Bot's games
score as more like Camille's than the original Bot's by +0.045, with an
interval of +0.032 to +0.059. Set against the other players' games, the
fine-tuned Bot stands out at 0.579 (0.544 to 0.615), as much as Camille's
own Test Set does at 0.573 (0.527 to 0.620); the original Bot stands out at
0.454 (0.417 to 0.491), less like him than his peers are. In [the model
choice](model-choice.md) the difference was +0.021, with the fine-tuned Bot
drawing at 1.25: drawing both at 1 removes the temperature from the
comparison, and the gap doubles. The instrument is still weak, separating
Camille from his peers at only 0.573, so this supports the decision without
carrying it.

## Reading the result

**The earlier verdict came from the yardstick, not from the model.** In
[the model choice](model-choice.md) the fine-tuned model lost by 2.94
points, far beyond chance, because it was paired with temperature 1.25, a
temperature its endgame alone had asked for. That endgame was read on moves
made after games were decided, which the cap scores as perfect and which
the Bot, playing on to mate, makes twice as often as Camille. A narrow
error bar protects a verdict against noise, not against a biased measure:
it was narrow around the wrong answer. With the bias removed, both models
want the temperature the original already had, and at that temperature
fine-tuning shows up as it did on the model alone: more of Camille's moves
in every Phase, at his Level.

**Style gained without Level lost.** The fine-tuned Bot finds Camille's
move more often, its games read as more like his to the discriminator, and
its mistakes are as close to his as the original Bot's on open positions.
It also wins more often against the stand-in opponent, 58.0% against
54.0%, and both play open endgames better than he does: one temperature
still cannot fit every Phase.

**The opening cut is a small change, and a narrow pass.** Fine-tuning had
already brought the Bot's share of improbable opening moves most of the
way to Camille's. The cut takes it the rest of the way and a little
beyond, and costs no Move-Matching. Its rule asked only that it land
closer, which it does by less than the uncertainty in Camille's own share.
Served as the rule says, it is the least firm of this experiment's
choices.

**What changes on the site.** The Bot now plays the fine-tuned model, at
temperature 1, drawing among the ten most likely moves on plies 1 to 10.
The download is the same size, 19.17 MB with Brotli.

## Known limitations

- **Step 1 was not blind.** Its figures were published before the rule
  was written; the replayed games are the same games, and the Test Set
  comparison the same expectation. An independent check of the fine-tuned
  model's temperature, which sits within chance of 0.75 and 1.25, would
  need games played from another seed.
- **The 400 games were played without the opening cut.** Level, the Style
  Fingerprint and the discriminator describe the fine-tuned Bot drawing
  among every move; the served Bot differs on plies 1 to 10 only.
- **The cut's check reads the model alone in the opening,** as Cutting the
  improbable moves did; the Opening Book answers many of those positions
  first, and opening Move-Matching, read with the book in front, is where
  that shows.
- **One seed, one stand-in opponent,** 200 games per temperature and 400
  per Bot, as in the earlier choices. Bot games still run on to mate; the
  yardstick leaves decided positions out but does not model resignation.

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

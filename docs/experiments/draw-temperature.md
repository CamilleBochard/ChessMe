# The draw's temperature

Outside the Opening Book, the Bot draws its move from the Base Model's
probabilities, reshaped by a temperature (see [the drawn
move](move-matching.md#the-drawn-move)). At 1 each move is played as often
as the model predicts a player at its rating would play it; below 1 the draw
leans towards the most likely move, and at 0 it always plays it. The site
served 1 because it is the model's own estimate, but nothing checked that
the Bot then plays at Camille's Level.

Level is how often a move is a mistake and how large the mistake is, which
is what his [Blunder Profile](blunder-profile.md) measures. This experiment
measures the same distribution for the Bot at a few temperatures and keeps
the temperature whose losses come closest to his. The profile is the
yardstick, not a mechanism: the Bot never sees an evaluation, and its moves
are never filtered or corrected by one.

## Reproducing

```sh
npm run bot-games -- --temperature 1 --opponent-rating 1100 --games 200 --out data/dataset/bot-games-temperature-1.jsonl
python -m pipeline.measure_draw_temperature --run 1=data/dataset/bot-games-temperature-1.jsonl
```

The first command plays the Bot's games at one temperature; it is run once
for each temperature measured, with only `--temperature` and `--out`
changing. The second scores every move of the Bot's with Stockfish 19 at
depth 18, the Blunder Profile's settings and cache, takes one `--run` per
temperature, and writes `docs/experiments/results/draw-temperature.json`
with Markdown tables of the results. It ends by saying which temperature the
rule wants measured next, or which one it chooses.

## How the Bot's games are played

**The Bot as the site serves it**, but for the temperature: the Opening
Book, then Maia-3 5M at 1100 drawing its move at the temperature measured.

**Against a stand-in for Camille's opponents.** Lichess and Chess.com pair
him with players of about his own rating, and he scores 48% against them. The Bot's opponent is the same network at 1100, his
Maia-Equivalent Rating, drawing at temperature 1: the model's own estimate
of a player at his rating. The opponent is the same at every temperature, so
only the Bot changes from one run to the next. The 2000-rated opponent of
the [Style Fingerprint](style-fingerprint.md) was set to balance the score
of the top-move Bot, which was far stronger than Camille; tuning the
opponent again for each temperature would hide the very difference being
measured, so the Bot's score is reported instead, as a second sign of its
Level.

**200 games per temperature, seed 13.** The Bot plays White in half of
them. Its draws and its opponent's come from two seeded streams, so every
run can be played again exactly. On Camille's own games, a sample of 200
games moves the mean loss of a Phase by about 5 centipawns in the
middlegame and 6 in the endgame from one sample to another. From the
Style Fingerprint's timings, each run should cost about an hour and a half
of Stockfish on a four-core 2012 laptop.

## The rule, stated before the figures were read

**The distance.** For each Phase, the Bot's distribution of losses is
compared with Camille's by how far, on average, each loss would have to move
to turn one distribution into the other: the area between the two
cumulative distributions, in centipawns, also called the earth mover's
distance. Unlike a difference of means, it sees the shape: a player who
loses a pawn on every move and one who loses nothing or two pawns in turn
have the same mean and are a pawn apart. The three Phases are then weighed by
Camille's share of moves in each (17% opening, 32% middlegame, 51%
endgame), so the distance is the one for a move picked at random from his
games, whatever the length of the Bot's.

**The search.** It starts at temperature 1 and moves on a grid of quarter
steps. The temperatures a quarter step either side of the closest one so
far are measured, the lower first. A temperature is chosen once both its
neighbours are measured and neither is closer. The search therefore carries
on in whichever direction keeps getting closer and never stops at the edge
of what has been measured; 0, the most likely move every time, has no lower
neighbour. Of two temperatures equally close, the one nearer 1 is kept, then
the lower. The rule is code, `pipeline/draw_temperature.py`, and its tests
pin each case.

**What is reported beside it.** Per Phase and per temperature, beside
Camille's: the mean loss, the 50th to 99th percentiles, and the shares of
moves losing 50, 100 and 300 centipawns or more. Two further figures help
read the distances, without changing the rule:

- Camille's Test Set measured against his training games by the same
  distance: how far two sets of the same player's games land apart by
  chance. A gap between two temperatures smaller than that is not evidence
  that one is closer.
- The Bot's games run on to mate, where Camille's often end in a
  resignation, so the Bot may play more moves in positions already decided,
  which the ten-pawn cap reads as losing nothing. The share of such moves is
  reported, and the distance recomputed without them for both players. On
  the top-move Bot's games, 24.7% of endgame moves were in decided positions
  against Camille's 18.5%. If the recomputed distances point to another
  temperature, the write-up says so; the rule's choice stands.

**What follows from the choice.** The site serves the chosen temperature,
and Move-Matching on the Test Set at that temperature is reported beside the
top move's. The result is written up whichever temperature is chosen, 1
included.

## Results

Not measured yet.

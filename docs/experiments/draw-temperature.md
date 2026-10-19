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
for t in 0.75 1 1.25; do
  npm run bot-games -- --model models/onnx/maia3-5m.onnx --temperature $t --opponent-rating 1100 --games 200 --out data/dataset/bot-games-temperature-$t.jsonl
done
python -m pipeline.measure_draw_temperature --yardstick "every move" \
  --run 0.75=data/dataset/bot-games-temperature-0.75.jsonl \
  --run 1=data/dataset/bot-games-temperature-1.jsonl \
  --run 1.25=data/dataset/bot-games-temperature-1.25.jsonl
```

The first command plays the Bot's games at one temperature; it is run once
for each temperature measured, with only `--temperature` and `--out`
changing. The second scores every move of the Bot's with Stockfish 19 at
depth 18, the Blunder Profile's settings and cache, takes one `--run` per
temperature, and writes `docs/experiments/results/draw-temperature.json`
with Markdown tables of the results: the losses per Phase, the distances,
each Phase's own distance, and the losses again without the moves made in
positions already decided. It ends by saying which temperature the rule
wants measured next, or which one it chooses. `--yardstick "every move"` reads
the distance on every move, as this rule did; the tools now read it on open
positions by default ([Level on open positions](level-on-open-positions.md)).
The results file was written in the format of the time: the same figures now
come under other names.

## How the Bot's games are played

**The Bot as the site serves it**, but for the temperature: the Opening
Book, then Maia-3 5M at 1100 drawing its move at the temperature measured.

**Against a stand-in for Camille's opponents.** Lichess and Chess.com pair
him with players of about his own rating, and he scores 48% against them.
The Bot's opponent is the same network at 1100, his Maia-Equivalent Rating, drawing at temperature 1: the model's own estimate
of a player at his rating. The opponent is the same at every temperature, so
only the Bot changes from one run to the next. The 2000-rated opponent of
the [Style Fingerprint](style-fingerprint.md) was set to balance the score
of the top-move Bot, whose Level was far above Camille's; tuning the
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

Measured on 2026-10-12 with Stockfish 19 at depth 18. Three temperatures,
200 games each, seed 13: 1, then its two neighbours 0.75 and 1.25. **The
rule chooses temperature 1**, the one the site already served: it is
closer to Camille than both its neighbours, so the search stops there.

| Temperature | Games | Won, drawn, lost | Distance | Distance, undecided positions | Endgame moves in decided positions |
|---|---|---|---|---|---|
| 0.75 | 200 | 134, 14, 52 | 31.7 | 25.7 | 35.7% |
| 1 | 200 | 96, 18, 86 | 19.4 | 10.6 | 36.7% |
| 1.25 | 200 | 48, 19, 133 | 29.9 | 19.3 | 44.9% |

Distances are in centipawns. Camille's Test Set lies 3.6 from his training
games by the same distance, so the gaps between temperatures, ten
centipawns and more, are not chance. Without the moves made in positions
already decided, temperature 1 is still the closest.
On 18.5% of Camille's endgame moves the position was already decided.

Centipawn loss per move, per Phase, beside Camille's Blunder Profile. The
percentile columns read "p% of moves lost this much or less".

Opening (1-10)

| Player | Moves | Mean | p50 | p75 | p90 | p95 | p99 | 50 or more | 100 or more | 300 or more |
|---|---|---|---|---|---|---|---|---|---|---|
| Camille | 5,225 | 25.7 | 1 | 27 | 62 | 104 | 315 | 12.6% | 5.4% | 1.1% |
| Bot at 0.75 | 1,000 | 23.4 | 0 | 23 | 58 | 120 | 304 | 11.1% | 6.2% | 1.1% |
| Bot at 1 | 1,000 | 25.6 | 0 | 27 | 69 | 120 | 259 | 13.6% | 7.0% | 0.8% |
| Bot at 1.25 | 998 | 32.7 | 0 | 30 | 77 | 136 | 656 | 15.3% | 6.8% | 1.6% |

Middlegame (11-30)

| Player | Moves | Mean | p50 | p75 | p90 | p95 | p99 | 50 or more | 100 or more | 300 or more |
|---|---|---|---|---|---|---|---|---|---|---|
| Camille | 9,822 | 103.1 | 24 | 115 | 313 | 526 | 878 | 40.1% | 27.7% | 10.6% |
| Bot at 0.75 | 1,987 | 82.8 | 13 | 87 | 236 | 452 | 813 | 35.2% | 22.3% | 7.7% |
| Bot at 1 | 1,967 | 104.6 | 27 | 122 | 310 | 526 | 904 | 41.7% | 28.6% | 10.8% |
| Bot at 1.25 | 1,962 | 133.0 | 35 | 150 | 449 | 669 | 1005 | 44.3% | 32.7% | 14.3% |

Endgame (31+)

| Player | Moves | Mean | p50 | p75 | p90 | p95 | p99 | 50 or more | 100 or more | 300 or more |
|---|---|---|---|---|---|---|---|---|---|---|
| Camille | 15,813 | 104.5 | 0 | 95 | 320 | 563 | 1184 | 33.4% | 24.3% | 10.7% |
| Bot at 0.75 | 4,642 | 56.8 | 0 | 32 | 150 | 312 | 924 | 21.4% | 13.7% | 5.2% |
| Bot at 1 | 5,402 | 69.9 | 0 | 41 | 202 | 394 | 1000 | 23.4% | 16.5% | 7.1% |
| Bot at 1.25 | 4,964 | 67.2 | 0 | 37 | 166 | 373 | 1019 | 22.4% | 15.2% | 6.2% |

The distance of each Phase on its own, before Camille's weights combine
them, with all moves and then without those made in positions already
decided:

| Phase | 0.75 | 1 | 1.25 | 0.75, undecided | 1, undecided | 1.25, undecided |
|---|---|---|---|---|---|---|
| Opening | 4.3 | 3.4 | 7.4 | 4.3 | 3.4 | 7.4 |
| Middlegame | 20.6 | 3.4 | 30.0 | 18.4 | 4.9 | 35.0 |
| Endgame | 47.7 | 34.6 | 37.3 | 40.0 | 17.8 | 12.1 |

## Reading the results

**Before the endgame, temperature 1 plays at Camille's Level.** In the
middlegame its losses match his almost point for point: a mean of 104.6
centipawns against 103.1, a 90th percentile of 310 against 313, three
pawns or more lost on 10.8% of moves against 10.6%. In the opening the mean
is 25.6 against 25.7. Both Phases are 3.4 from his, about the 3.6 that
separates his own two sets of games. The opening is close partly by
construction, since the Opening Book plays Camille's own replies there, and
it barely moves with the temperature. A quarter step either way is clearly
off: at 0.75 the middlegame mean falls to 82.8, at 1.25 it rises to 133.0. The
Base Model's own estimate of how a player at 1100 chooses turns out to be
the right one, with no adjustment.

**The endgame is where the Bot and Camille differ, and where the
comparison is least clean.** The Bot's games run on to mate, so 36.7% of
its endgame moves at temperature 1 come in positions already decided,
twice Camille's 18.5%, and the ten-pawn cap reads all of them as losing
nothing. Leaving those moves out for both players halves the endgame
distance, from 34.6 to 17.8. What remains is real: in open endgames the
Bot at 1 loses 110 centipawns a move against Camille's 128, and three
pawns or more on 11.1% of moves against 13.1%. It plays the endgame a
little better than he does. Temperature 1.25 matches that endgame more
closely (122 centipawns a move) but overshoots the middlegame by 30 (133.0
against 103.1), and the endgame gain does not outweigh that. A single
temperature cannot fit both Phases better than 1 does; a temperature by
Phase could, but it is a different design and is not tried here.

**The Bot's results tell the same story.** Against the stand-in for
Camille's opponents, the Bot at 1 scores 52.5%, against his 48% in his own
games. At 0.75 it scores 70.5%, at 1.25 only 28.8%: a quarter step of
temperature is worth about twenty points of score.

**Compared with the top move.** The top-move Bot measured for the [Style
Fingerprint](style-fingerprint.md) lost 55 centipawns a move in the
middlegame, half of Camille's 103. Its games were played against an
opponent of a higher Level, so the figures are not strictly comparable, but the
direction is plain: drawing at 1 brings the Bot's mistakes back to the
size and frequency of his.

**Move-Matching at the chosen temperature.** Since 1 is the temperature
the drawn move was already measured at, the figures are those of [the
drawn move](move-matching.md#the-drawn-move), the Base Model alone on the
Test Set, without the Opening Book: 36.66% after ply 10 against 49.53%
for the top move; 35.08%
against 51.30% in the opening, 34.40% against 47.60% in the middlegame and
37.97% against 50.65% in the endgame. The site keeps serving temperature
1, so nothing changes on it.

## How the run was made

The Bot's games were played on the project's four-core 2012 laptop, about
an hour for the three temperatures side by side. Stockfish ran at a pace
of two to three hours per temperature there, so the analysis was moved to an
eight-core Ryzen 7 X3D desktop, running the same pinned Linux build of
Stockfish 19 under WSL2. The universal build picks its code path from the
CPU it runs on, so the scores were checked first: 300 positions drawn from
the laptop's cache were analysed again on the desktop, and the 2,044 Bot
moves the laptop had analysed before the run was moved were also analysed
on the desktop. Every one of the 2,344 analyses came out identical, best
move and both scores. The desktop's analyses were then added to the
laptop's cache, and the measurement run there from the cache reproduced
the desktop's results exactly.

## Known limitations

**A grid of quarter steps.** The rule finds the closest temperature on
the grid, not the best possible one: the true optimum could lie anywhere
between 0.75 and 1.25. Finer steps would cost a Stockfish run each, for a
difference the middlegame figures suggest is small.

**One seed, one opponent.** Each temperature is 200 games played from
seed 13 against one stand-in opponent. The stand-in is the model's
estimate of a player at Camille's rating; if that estimate is off, the
Bot meets opponents slightly above or below his Level, at every
temperature alike.

**Positions are judged from the FEN alone,** as in the Blunder Profile,
so repetitions are invisible to Stockfish.

**The temperature belongs to the model it was measured with.** If the
fine-tuned Base Model replaces the original one, the temperature has to be
measured again for it.

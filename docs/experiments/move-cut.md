# Cutting the improbable moves

Outside the Opening Book, the Bot draws its move from the Base Model's
probabilities (see [the drawn move](move-matching.md#the-drawn-move)). Every
legal move keeps a chance, so now and then the draw lands on a move the
model itself expects almost no player at its rating to play. In one of
Camille's games against the Bot, the move that lost it the game, 9.Bf4??,
had a probability of 0.13%, 22nd of 37 legal moves: a bishop dropped in a
quiet position, which reads as a gift rather than a human mistake.

Drawing only among the most likely moves would remove such moves. But
Camille himself plays some moves the model finds unlikely, and some of his
mistakes are among them, so removing every improbable move would take the
Bot away from him as surely as keeping them all. This experiment chooses
the cut from his own games, with one target: **the Bot should play
improbable moves as often as Camille does, not more.**

## Reproducing

```sh
python -m pipeline.export_bot_moves data/dataset/bot-games-original.jsonl \
  --out data/dataset/bot-moves-original.jsonl
for set in train test; do
  npm run move-probabilities -- models/onnx/maia3-5m.onnx --rating 1100 data/dataset/$set.jsonl \
    --out data/dataset/move-probabilities/original-$set.jsonl
done
npm run move-probabilities -- models/onnx/maia3-5m.onnx --rating 1100 data/dataset/bot-moves-original.jsonl \
  --out data/dataset/move-probabilities/original-bot.jsonl
npm run improbability -- --model original \
  --training data/dataset/move-probabilities/original-train.jsonl \
  --test data/dataset/move-probabilities/original-test.jsonl \
  --bot data/dataset/move-probabilities/original-bot.jsonl \
  --losses data/dataset/centipawn-losses.jsonl --losses data/dataset/bot-moves-original.jsonl \
  --record docs/experiments/results/move-cut.json
```

The first command writes each move of the Bot's 400 games with the
evaluation it lost, read from the Blunder Profile's Stockfish cache, where
those games were already analysed. The next record, for every move of
Camille's and of the Bot's, the probability and rank the Base Model gave
it and the whole distribution of its position; they run the model under
Node, about half an hour in all on a four-core 2012 laptop. The last
applies the rule to the records and writes the results with Markdown
tables. The fine-tuned model's figures come from the same commands with
`models/onnx/maia3-5m-fine-tuned.onnx`, its games at temperature 1
(`bot-games-fine-tuned-temperature-1.jsonl`), `--model fine-tuned` and
`--record docs/experiments/results/move-cut-fine-tuned.json`.

## What is measured

**Camille's improbability profile.** For each of his moves, the served
Base Model (Maia-3 5M at 1100) gives the move he played a probability and a
rank, 1 for the most likely move. They are computed under Node by the
engine's own code, the encoding and the runtime visitors' browsers use. His
profile is the share of his moves the model gave less than 1%, 2% and 5%,
per Phase: the counterpart of the [Blunder Profile](blunder-profile.md) for
the kind of move rather than its cost.

**The candidate cuts.** Each keeps some of the legal moves and rescales
their probabilities to sum to one; the Bot would draw among those alone.

- top-k: the k most likely moves, k in {3, 4, 5, 6, 8, 10};
- top-p: the most likely moves, taken in order until together they cover
  a share p of the probability, p in {0.80, 0.85, 0.90, 0.95, 0.98};
- min-p: the moves with at least a fraction a of the most likely move's
  probability, a in {0.02, 0.05, 0.10, 0.20};
- no cut, as the site draws today.

Every cut keeps the most likely move. Top-p and min-p adapt to the
position: where the model is sure they keep one or two moves, where it
hesitates they keep many.

**The Bot's expected profile under each cut.** On the same positions as
Camille's, the Bot's share of moves the model gives less than 1% is
computed from the model's distribution at temperature 1, not from games:
in each position, it is the probability the cut distribution puts on the
kept moves the uncut model gives less than 1%. Averaged over positions,
that is the share the Bot would play on average, without the luck of a
draw. The Base Model is measured alone, as the cut would apply to it
alone; in the opening the Bot consults the Opening Book first.

## The rule, stated before the figures were read

**On the training games only.** The cut is chosen on Camille's training
games, which play the part validation games played in the
[fine-tuning experiment](fine-tuning.md). The Test Set is used once, to
check the chosen cut.

**The distance.** For each candidate and each Phase, the gap between the
Bot's expected share of moves the model gives less than 1% and Camille's
share, in absolute value. The three Phases are then weighed by Camille's
share of training moves in each, so the distance is the gap for a move
picked at random from his games, as in [the draw's
temperature](draw-temperature.md).

**The choice.** The candidate with the smallest distance is chosen. "No
cut" is a candidate like the others. Two distances equal to the hundredth
of a percentage point are a tie; on a tie, the candidate that keeps more of
Camille's training moves is chosen, and if that is equal too, the one
listed first above, each family from its loosest value. The rule is code,
`src/evaluation/improbability.ts`, and its tests pin each case.

**One cut, a recommendation per Phase.** For each Phase, the candidate
closest to Camille in that Phase alone is reported too, by the same rule.
Whether a cut per Phase would do better than one cut by more than chance
is read from a bootstrap over Camille's training games: 1,000 resamples of
whole games, drawn with replacement from a seeded random source, each
measuring, in that Phase, the chosen cut's gap minus the Phase's best
candidate's. If the middle 95% of those differences lies above zero in at
least one Phase, the write-up recommends a cut per Phase as a follow-up.
This ticket keeps one cut either way.

**The check on the Test Set.** The chosen cut is measured once on the
Test Set. Per Phase, the Bot's expected share minus Camille's is reported
beside the training figure, with its standard error clustered by game. The
match is read as holding if, in every Phase, that gap is within two
standard errors of zero. The check is reported; it does not reopen the
choice.

**What is reported beside it,** for every candidate and per Phase:

- the Bot's expected share of moves the model gives less than 1%, 2% and
  5%, beside Camille's;
- the share of Camille's moves the cut would make impossible, and the
  share of his mistakes it would make impossible: moves losing 300
  centipawns or more, from the Blunder Profile's cache;
- the trade-off: the share of Camille's moves the cut keeps against the
  share of the Bot's expected moves under 1% it removes, compared with no
  cut;
- as context that decides nothing, the Bot's 400 games at temperature 1
  (`data/dataset/bot-games-original.jsonl`), scored with Stockfish 19 at
  depth 18 from the same cache: the share of its mistakes, moves losing
  300 centipawns or more outside the Opening Book, each cut would have
  made impossible;
- the same figures for the fine-tuned Base Model at 1100, with its 200
  games at temperature 1 as context. They decide nothing.

The result is written up whichever cut is chosen, no cut included. The
choice is made at temperature 1; the temperature with the cut in place is
chosen again in a later experiment, since a higher temperature makes the
kept but unlikely moves more frequent, never the cut ones.

## Results

Measured on 2026-10-13 with Maia-3 5M at 1100, the served Base Model, on
Camille's 23,768 training moves, his 7,092 Test Set moves, and the 15,467
moves of the Bot's 400 games it drew from the Base Model rather than the
Opening Book. **The rule chooses no cut**: the site's draw already brings
the Bot closest to how often Camille plays moves the model finds
improbable.

Camille's improbability profile beside the Bot's expected one without a
cut, on the training games:

| Phase | Moves | Camille under 1% | Bot under 1% | Camille under 2% | Bot under 2% | Camille under 5% | Bot under 5% |
|---|---|---|---|---|---|---|---|
| Opening (1-10) | 4,075 | 1.40% | 3.58% | 4.42% | 6.46% | 13.40% | 13.74% |
| Middlegame (11-30) | 7,635 | 3.29% | 3.77% | 6.67% | 6.89% | 14.39% | 14.51% |
| Endgame (31+) | 12,058 | 3.47% | 3.51% | 6.58% | 6.42% | 14.00% | 13.46% |

On the Test Set his shares under 1% are 1.30%, 2.74% and 3.28%.

The rule's distance for each candidate, with the signed gap of each Phase
(the Bot's share under 1% minus Camille's, in percentage points) and the
trade-off: the share of Camille's training moves the cut keeps, against
the share of the Bot's expected moves under 1% it removes compared with
no cut.

| Cut | Distance | Opening gap | Middlegame gap | Endgame gap | His moves kept | Bot's moves under 1% removed |
|---|---|---|---|---|---|---|
| no cut | 0.55 | +2.18 | +0.48 | +0.04 | 100.00% | 0.00% |
| top-10 | 2.08 | -0.27 | -2.37 | -2.51 | 96.52% | 72.99% |
| top-8 | 2.54 | -0.91 | -2.81 | -2.92 | 94.49% | 85.67% |
| top-6 | 2.84 | -1.30 | -3.07 | -3.22 | 90.94% | 94.09% |
| top-5 | 2.93 | -1.35 | -3.15 | -3.32 | 88.37% | 96.48% |
| top-4 | 2.99 | -1.37 | -3.21 | -3.39 | 83.78% | 98.15% |
| top-3 | 3.03 | -1.39 | -3.25 | -3.44 | 77.30% | 99.24% |
| top-p 0.98 | 1.16 | +0.49 | -1.12 | -1.41 | 98.74% | 42.76% |
| top-p 0.95 | 2.63 | -1.16 | -2.87 | -2.97 | 96.70% | 88.16% |
| top-p 0.90 | 3.04 | -1.40 | -3.29 | -3.45 | 92.82% | 99.71% |
| top-p 0.85 | 3.05 | -1.40 | -3.29 | -3.46 | 88.93% | 99.86% |
| top-p 0.80 | 3.05 | -1.40 | -3.29 | -3.46 | 85.55% | 99.93% |
| min-p 0.02 | 2.29 | -0.73 | -2.45 | -2.72 | 97.23% | 78.75% |
| min-p 0.05 | 3.03 | -1.39 | -3.27 | -3.44 | 93.50% | 99.38% |
| min-p 0.10 | 3.05 | -1.40 | -3.29 | -3.47 | 88.03% | 99.99% |
| min-p 0.20 | 3.05 | -1.40 | -3.29 | -3.47 | 80.79% | 100.00% |

Every candidate per Phase on the training games: the Bot's expected share
of moves under each threshold, drawing under the cut, and the share of
Camille's moves and of his mistakes, moves losing 300 centipawns or more,
the cut would make impossible.

Opening (1-10)

| Cut | Under 1% | Under 2% | Under 5% | His moves made impossible | His mistakes made impossible |
|---|---|---|---|---|---|
| Camille | 1.40% | 4.42% | 13.40% |  | (43 mistakes) |
| no cut | 3.58% | 6.46% | 13.74% | 0.00% | 0.00% |
| top-10 | 1.13% | 3.77% | 11.26% | 1.23% | 16.28% |
| top-8 | 0.49% | 2.29% | 9.50% | 3.02% | 20.93% |
| top-6 | 0.10% | 0.83% | 6.27% | 6.97% | 27.91% |
| top-5 | 0.05% | 0.45% | 3.80% | 9.06% | 27.91% |
| top-4 | 0.03% | 0.12% | 1.64% | 16.07% | 37.21% |
| top-3 | 0.01% | 0.03% | 0.62% | 25.23% | 39.53% |
| top-p 0.98 | 1.89% | 4.81% | 12.22% | 0.52% | 4.65% |
| top-p 0.95 | 0.23% | 2.47% | 10.02% | 1.67% | 23.26% |
| top-p 0.90 | 0.00% | 0.25% | 6.19% | 5.37% | 27.91% |
| top-p 0.85 | 0.00% | 0.01% | 2.93% | 9.84% | 37.21% |
| top-p 0.80 | 0.00% | 0.00% | 1.10% | 11.98% | 44.19% |
| min-p 0.02 | 0.67% | 3.37% | 10.88% | 1.23% | 16.28% |
| min-p 0.05 | 0.00% | 0.56% | 7.16% | 4.27% | 27.91% |
| min-p 0.10 | 0.00% | 0.00% | 2.48% | 11.80% | 37.21% |
| min-p 0.20 | 0.00% | 0.00% | 0.04% | 17.13% | 51.16% |

Middlegame (11-30)

| Cut | Under 1% | Under 2% | Under 5% | His moves made impossible | His mistakes made impossible |
|---|---|---|---|---|---|
| Camille | 3.29% | 6.67% | 14.39% |  | (804 mistakes) |
| no cut | 3.77% | 6.89% | 14.51% | 0.00% | 0.00% |
| top-10 | 0.92% | 3.11% | 10.90% | 3.82% | 10.70% |
| top-8 | 0.48% | 1.82% | 8.78% | 6.23% | 14.68% |
| top-6 | 0.22% | 0.78% | 5.38% | 9.99% | 20.90% |
| top-5 | 0.13% | 0.46% | 3.40% | 12.90% | 25.75% |
| top-4 | 0.08% | 0.24% | 1.73% | 17.37% | 33.83% |
| top-3 | 0.03% | 0.11% | 0.66% | 23.31% | 42.41% |
| top-p 0.98 | 2.17% | 5.32% | 13.08% | 1.39% | 4.60% |
| top-p 0.95 | 0.41% | 3.11% | 10.96% | 3.63% | 12.19% |
| top-p 0.90 | 0.00% | 0.64% | 7.55% | 7.44% | 22.39% |
| top-p 0.85 | 0.00% | 0.05% | 4.54% | 11.17% | 29.85% |
| top-p 0.80 | 0.00% | 0.00% | 2.30% | 15.14% | 36.57% |
| min-p 0.02 | 0.84% | 3.80% | 11.68% | 2.87% | 9.70% |
| min-p 0.05 | 0.02% | 0.88% | 8.05% | 6.88% | 20.52% |
| min-p 0.10 | 0.00% | 0.05% | 3.51% | 12.14% | 32.34% |
| min-p 0.20 | 0.00% | 0.00% | 0.43% | 20.24% | 46.14% |

Endgame (31+)

| Cut | Under 1% | Under 2% | Under 5% | His moves made impossible | His mistakes made impossible |
|---|---|---|---|---|---|
| Camille | 3.47% | 6.58% | 14.00% |  | (1,286 mistakes) |
| no cut | 3.51% | 6.42% | 13.46% | 0.00% | 0.00% |
| top-10 | 0.96% | 2.95% | 10.10% | 4.02% | 10.34% |
| top-8 | 0.55% | 1.89% | 8.21% | 5.89% | 14.31% |
| top-6 | 0.25% | 0.94% | 5.24% | 9.18% | 21.38% |
| top-5 | 0.15% | 0.58% | 3.55% | 11.69% | 27.06% |
| top-4 | 0.07% | 0.31% | 2.03% | 15.54% | 34.29% |
| top-3 | 0.03% | 0.13% | 0.88% | 21.46% | 44.48% |
| top-p 0.98 | 2.06% | 4.97% | 12.14% | 1.43% | 4.74% |
| top-p 0.95 | 0.50% | 2.96% | 10.12% | 3.64% | 10.42% |
| top-p 0.90 | 0.02% | 0.78% | 6.96% | 7.63% | 19.75% |
| top-p 0.85 | 0.01% | 0.11% | 4.32% | 11.41% | 27.60% |
| top-p 0.80 | 0.01% | 0.03% | 2.37% | 14.84% | 34.99% |
| min-p 0.02 | 0.75% | 3.40% | 10.70% | 3.23% | 10.58% |
| min-p 0.05 | 0.03% | 0.86% | 7.32% | 7.02% | 18.97% |
| min-p 0.10 | 0.00% | 0.06% | 3.30% | 11.91% | 28.62% |
| min-p 0.20 | 0.00% | 0.00% | 0.51% | 19.27% | 44.79% |

**Each Phase's own best cut.** The chosen cut's gap minus the Phase's best
candidate's, in percentage points, with the middle 95% of 1,000 resamples
of his training games:

| Phase | Best cut | Difference | 95% interval | Beyond chance |
|---|---|---|---|---|
| Opening (1-10) | top-10 | 1.91 | 1.14 to 2.45 | yes |
| Middlegame (11-30) | no cut | 0.00 | 0.00 to 0.00 | no |
| Endgame (31+) | no cut | 0.00 | 0.00 to 0.00 | no |

**The check on the Test Set.** The Bot's share under 1% without a cut
minus Camille's, in percentage points, with one standard error clustered
by game:

| Phase | Training games | Test Set |
|---|---|---|
| Opening (1-10) | +2.18 ± 0.18 | +2.33 ± 0.35 |
| Middlegame (11-30) | +0.48 ± 0.21 | +0.99 ± 0.33 |
| Endgame (31+) | +0.04 ± 0.17 | +0.14 ± 0.30 |
| Distance | 0.55 | 0.76 |

**The Bot's games, as context.** Of the 16,602 moves the Bot made in its
400 games at temperature 1, 15,467 came from the Base Model. Its own
share of moves under 1% there was 4.20% in the opening, 2.95% in the
middlegame and 2.99% in the endgame. The share of its mistakes each cut
would have made impossible, with the number of mistakes in brackets, and
the share of all its moves:

| Cut | Opening (24) | Middlegame (452) | Endgame (714) | All mistakes | All moves |
|---|---|---|---|---|---|
| top-10 | 8.33% | 8.85% | 7.28% | 7.90% | 3.04% |
| top-8 | 16.67% | 14.16% | 12.75% | 13.36% | 4.89% |
| top-6 | 37.50% | 21.68% | 20.03% | 21.01% | 8.08% |
| top-5 | 45.83% | 26.77% | 25.07% | 26.13% | 10.67% |
| top-4 | 50.00% | 34.96% | 30.11% | 32.35% | 14.01% |
| top-3 | 58.33% | 42.48% | 39.50% | 41.01% | 19.40% |
| top-p 0.98 | 8.33% | 6.86% | 5.04% | 5.80% | 1.33% |
| top-p 0.95 | 20.83% | 13.50% | 11.90% | 12.69% | 3.37% |
| top-p 0.90 | 33.33% | 21.46% | 20.73% | 21.26% | 6.89% |
| top-p 0.85 | 41.67% | 30.31% | 27.59% | 28.91% | 10.32% |
| top-p 0.80 | 50.00% | 37.61% | 33.75% | 35.55% | 13.69% |
| min-p 0.02 | 12.50% | 11.73% | 10.78% | 11.18% | 2.81% |
| min-p 0.05 | 33.33% | 20.35% | 18.91% | 19.75% | 5.98% |
| min-p 0.10 | 50.00% | 32.08% | 26.61% | 29.16% | 10.34% |
| min-p 0.20 | 58.33% | 46.24% | 40.20% | 42.86% | 17.54% |

## Reading the results

**Improbable moves are part of how Camille plays.** Outside the opening,
one of his moves in thirty is a move the model gives less than 1%: 3.29%
in the middlegame, 3.47% in the endgame. Drawing without a cut, the Bot
plays such moves 3.77% and 3.51% of the time, within half a point of him.
The same holds at 2% and 5%. A move like 9.Bf4??, at 0.13%, looks
inhuman in a single game, but over thousands of moves Camille plays moves
that unlikely about as often as the Bot does. Every cut overshoots: the
mildest one, top-p 0.98, already takes two fifths off the Bot's share in
the middlegame and the endgame, and top-10 leaves it under 1% there.

**The Bot's mistakes sit where his do.** A cut removes the Bot's
mistakes and Camille's in about the same proportion. Top-10 would have
removed 8.85% of the Bot's middlegame mistakes and would forbid 10.70% of
Camille's; top-3, 42.48% and 42.41%. If the Bot's blunders were drawn
from the model's far tail more often than his, a cut would remove more
of them than of his; it does not. What feels like a gift in one game is,
over 400, a mistake of the kind and at the place he makes his own.

**What a cut costs.** The trade-off table puts a price on each cut. The
mildest removes 43% of the Bot's moves under 1% while forbidding 1.3% of
Camille's moves and 4.7% of his mistakes; top-3 removes nearly all of
them but forbids 23% of his moves and over 40% of his mistakes. Since he
plays these moves himself, every cut takes the Bot further from him.

**The opening is the exception.** There the model, uncut, draws a move
under 1% 3.58% of the time against Camille's 1.40%, and top-10 would
bring it to 1.13%: closer to him by 1.91 points, more than chance allows
(1.14 to 2.45 over the resamples). His opening moves come from a
repertoire he knows, so his rare moves are rarer there. The Opening Book
already answers the positions he reaches most, but not all: in the Bot's
games, 4.20% of the opening moves it drew from the model were under 1%.
The rule keeps one cut for every Phase, so it chooses no cut; **a cut in
the opening only, top-10, is recommended as a follow-up.** It would cost
1.23% of Camille's opening moves.

**The check on the Test Set.** Read as stated before the figures, the
match does not hold: on the Test Set the gap is 2.33 points in the
opening and 0.99 in the middlegame, more than two standard errors from
zero. That reading, stated in advance, was the wrong test for this
outcome, and what follows is a reading made after the figures, not part
of the rule. The stated test asks whether the chosen cut leaves no gap at all, but no cut already left a gap of
2.18 points in the opening on the training games; the rule accepted it
because every cut that closes it opens wider gaps in the middlegame and
the endgame. What the Test Set does show is that the training figures
carry over: 2.18 against 2.33 in the opening, 0.04 against 0.14 in the
endgame, and 0.48 against 0.99 in the middlegame, a difference of about
1.3 standard errors of the two together. The distance itself moves from
0.55 to 0.76 points. The choice stands, as the rule said it would; the
opening gap is the one the recommended follow-up addresses.

**What follows.** The served Bot does not change, since no cut is what
it already does. A cut in the engine is still worth having for the
opening, and for the fine-tuned model if it is chosen again with a
higher temperature, which makes the far tail more likely.

## The fine-tuned Base Model

The same measurement for the Base Model fine-tuned on Camille's training
games (see [the model choice](model-choice.md)), at 1100, with its 200
games at temperature 1 as context. It decides nothing: the site serves
the original model. Full figures in
`docs/experiments/results/move-cut-fine-tuned.json`.

**The rule would choose no cut for it too,** at a distance of 0.49
points; the next best, top-p 0.98, is at 0.99 and top-10 at 1.56. No
Phase has a cut of its own that beats no cut by more than chance: in the
opening, top-10 is closer by 0.70 points, but the resamples range from
-0.11 to 0.84.

| Phase | Camille under 1% | Bot under 1%, no cut | Gap, training | Gap, Test Set |
|---|---|---|---|---|
| Opening (1-10) | 1.52% | 2.27% | +0.75 ± 0.19 | +0.52 ± 0.39 |
| Middlegame (11-30) | 3.09% | 3.24% | +0.15 ± 0.21 | +0.79 ± 0.32 |
| Endgame (31+) | 2.67% | 3.30% | +0.63 ± 0.15 | +0.17 ± 0.27 |

Read as stated, the check on the Test Set fails here as well, on the
middlegame (+0.79, about two and a half standard errors), while the
distance moves from 0.49 on the training games to 0.42 on the Test Set.

**Fine-tuning closed most of the opening gap.** Trained on Camille's own
games, the model gives his opening moves more weight: under 5% fall
6.09% of his opening moves against 13.40% for the original, and the
uncut Bot's share of opening moves under 1% drops from 3.58% to 2.27%.
That is why the opening no longer asks for a cut of its own.

**Its mistakes too sit where Camille's do.** In its 200 games, 7,506 of
its 8,058 moves were drawn from the model and 569 of those were mistakes;
top-10 would have removed 6.68% of them and top-3 38.66%, against 8.95%
and 40.32% of Camille's mistakes under the same cuts of the same model.

## The cut in the engine

The Move-Selection Engine can now draw among the most likely moves in the
opening only, as recommended above. The cut is an option the served Bot
is not given, so the site still draws among every legal move. It applies
to the plies of the opening Phase, 1 to 10, read from the position's move
number, and to no other; the Opening Book is consulted first, as before.
The cut is read on the Base Model's own probabilities, before the
temperature, so which moves are kept depends on the model alone and the
temperature only reshapes the draw among them.

The scripts that play and measure the Bot under Node take the cut as
`top-k=<k>`, `top-p=<p>` or `min-p=<fraction>`:

```sh
npm run bot-games -- --model models/onnx/maia3-5m.onnx --temperature 1 --opening-cut top-k=10 --out data/dataset/bot-games-top-10.jsonl
npm run drawn-move -- models/onnx/maia3-5m.onnx --rating 1100 --opening-cut top-k=10
npm run compare-bots -- models/onnx/maia3-5m.onnx models/onnx/maia3-5m.onnx --second-opening-cut top-k=10
```

Whether to serve the cut was decided with the model and the temperature,
in [the model and its temperature, chosen again](model-choice-on-open-positions.md):
the site serves top-10 in the opening with the fine-tuned model.

## Known limitations

**Improbable means improbable to this model.** A move under 1% is one
the Base Model finds unlikely for a player at 1100, which is not the
same as a move no human would play. The comparison is fair because both
players are measured on the same scale, but the scale is the model's.

**The Base Model alone.** The cut would apply to the model's draws
only. On Camille's positions the model is measured without the Opening
Book in front, so the opening figures describe the model in positions
the Bot would partly answer from the book.

**Expected, not played.** The Bot's figures are what its draw would
give on average on Camille's positions, not counts from games played
with a cut. The Bot's own games, played without a cut, agree with them:
its share of moves under 1% there is 2.95% in the middlegame and 2.99%
in the endgame.

**The clock is not measured.** Camille's mistakes come more often short
of time, and a cut that depends on the time left cannot be measured: the
games store no time left per move.

**One threshold decides.** The rule reads the share under 1%; the 2% and
5% figures are reported beside it. In the middlegame and the endgame they
tell the same story. In the opening they do not: under 5% the uncut Bot
and Camille are close (13.74% against 13.40%), so his opening differs
from the model only in the far tail, the moves under 1% or 2%.

**The bootstrap does not choose again.** Each Phase's best cut is chosen
once, on all the training games, and the resamples measure its advantage
over the chosen cut without choosing again. That favours the best cut a
little, so the intervals are somewhat optimistic for it. The opening's
interval, 1.14 to 2.45 points, lies well above zero; the conclusion does
not rest on that margin.

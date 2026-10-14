# Level on open positions

Level is how often a move is a mistake and how large the mistake is, and the
[Blunder Profile](blunder-profile.md) measures it as the distribution of
Camille's evaluation losses. The Bot's temperature is chosen by how close its
losses come to that profile ([the draw's temperature](draw-temperature.md)),
and so was the fine-tuned model's ([the model choice](model-choice.md)).

The profile counts every move, including those made once a game is decided.
Beyond ten pawns either way the evaluation is capped, so a move there is read
as losing nothing. Camille's games often end by resignation, while the Bot's,
played under Node, run on to mate. At temperature 1, 36.7% of the Bot's endgame
moves were made in decided positions, against 18.5% of his. Comparing the two
endgames therefore compares a player who resigns with one who does not.

The fine-tuned model's temperature came out at 1.25 rather than 1 on the
endgame alone, by less than chance, and the model choice turned on that
temperature. The distance without decided positions, reported in both
write-ups as a check, pointed to 1 both times.

This experiment makes the comparison like with like: Level is measured on the
moves made in [Open Positions](../../CONTEXT.md), for Camille and the Bot
alike. That measure becomes the yardstick the next choices are made with.

## The measure, stated before the figures were read

**An Open Position** is one in which the move played could still be a
mistake. A move is left out when the best move and the move played both score
ten pawns or more for the same side, mates included: there, the cap reads any
move as losing nothing. The test is the one tickets 22 and 19 already used for
their check (`position_already_decided` in `pipeline/blunder_profile.py`),
unchanged.

**Level on open positions** is the distribution of losses of the moves made in
Open Positions, per Phase, built exactly as the Blunder Profile is: the same
Stockfish 19 at depth 18, the same cache, the same buckets and percentiles.

**The distance on open positions** is the draw's temperature's distance
computed on those moves alone, for both players. Each Phase is compared on its
own by the earth mover's distance. The Phases are then weighed by Camille's
share of moves in Open Positions in each.

**What chance looks like.** Camille's Test Set is measured against his
training games by the same distance on open positions, as the all-moves
distance was (3.6 centipawns). A gap between two temperatures smaller than
that is not evidence that one is closer.

## What is re-read, stated before the figures were read

Nothing is played or analysed again. The games of tickets 22 and 19 are read
from the same files and every move from the same Stockfish cache.

- **The original model's temperature** (ticket 22): its runs at 0.75, 1 and
  1.25.
- **The fine-tuned model's temperature** (ticket 19): its runs at 0.75, 1, 1.25
  and 1.5.
- **The two Bots of the model choice** (ticket 19): 400 games each, reported on
  open positions as context.

For each model, the draw's temperature's rule (`next_step` in
`pipeline/draw_temperature.py`) is applied unchanged to the distances on open
positions. The write-up reports the temperature it chooses, the gap to the
next closest beside the chance gap, and each Phase's distance. If the rule
asks for a temperature these runs did not measure, the write-up says so and
does not guess: playing new games is the next choice's work.

Camille's Level on open positions is reported per Phase beside his Blunder
Profile, with the share of his moves left out.

**What follows.** Nothing the site serves changes here. The temperature and
the model are chosen again, with this yardstick, in the next ticket.

## Reproducing

```sh
python -m pipeline.extract_blunder_profile
python -m pipeline.measure_draw_temperature --out docs/experiments/results/draw-temperature-open-positions.json \
  --run 0.75=data/dataset/bot-games-temperature-0.75.jsonl --run 1=data/dataset/bot-games-temperature-1.jsonl \
  --run 1.25=data/dataset/bot-games-temperature-1.25.jsonl
python -m pipeline.measure_draw_temperature --out docs/experiments/results/draw-temperature-fine-tuned-open-positions.json \
  --run 0.75=data/dataset/bot-games-fine-tuned-temperature-0.75.jsonl --run 1=data/dataset/bot-games-fine-tuned-temperature-1.jsonl \
  --run 1.25=data/dataset/bot-games-fine-tuned-temperature-1.25.jsonl --run 1.5=data/dataset/bot-games-fine-tuned-temperature-1.5.jsonl
python -m pipeline.measure_model_choice --out docs/experiments/results/model-choice-losses-open-positions.json \
  --run original=data/dataset/bot-games-original.jsonl --run fine-tuned=data/dataset/bot-games-fine-tuned.jsonl
```

The games are those of tickets 22 and 19, and every move was already in the
Stockfish 19 depth 18 cache: the whole re-read analysed nothing and ran on the
laptop in about a minute. The comparison tools now read the distance on open
positions by default. Run with `--yardstick "every move"`, they give back the
figures committed for tickets 22 and 19, value for value; that was checked
before the open-position figures were read.

## Results

Measured on 2026-10-14 with Stockfish 19 at depth 18.

**Camille's Level on open positions.** Leaving out decided positions removes
almost nothing before move 31: one opening move in 5,225 and 0.9% of
middlegame moves. In the endgame it removes 18.5% of his moves, and his
endgame mean rises from 104.5 to 128.1 centipawns a move, with three pawns or
more lost on 13.1% of moves against 10.7%. The table per Phase is in [the
Blunder Profile](blunder-profile.md#on-open-positions).

**What chance looks like.** Camille's Test Set lies 4.0 centipawns from his
training games on open positions, against 3.6 on every move.

### The original model: temperature 1, as before

| Temperature | Distance, every move | Distance, open positions | Opening | Middlegame | Endgame |
|---|---|---|---|---|---|
| 0.75 | 31.7 | 25.7 | 4.3 | 18.4 | 40.0 |
| 1 | 19.4 | **10.6** | 3.4 | 4.9 | 17.8 |
| 1.25 | 29.9 | 19.3 | 7.4 | 35.0 | 12.1 |

The three right-hand columns are each Phase's own distance on open positions.
**The rule chooses temperature 1**, closer than both neighbours by 8.7
centipawns or more, about twice the chance gap. Nothing changes from ticket
22.

### The fine-tuned model: temperature 1 rather than 1.25

| Temperature | Distance, every move | Distance, open positions | Opening | Middlegame | Endgame |
|---|---|---|---|---|---|
| 0.75 | 28.0 | 17.7 | 5.4 | 18.3 | 22.2 |
| 1 | 24.3 | **14.4** | 5.1 | 12.6 | 19.5 |
| 1.25 | 21.3 | 18.0 | 5.0 | 29.0 | 15.0 |
| 1.5 | 23.8 | 25.3 | 4.1 | 41.4 | 21.7 |

**The rule chooses temperature 1**, where on every move it chose 1.25. 1 is
closer than 0.75 by 3.3 centipawns and than 1.25 by 3.6, both under the 4.0
chance gap. **The choice is no firmer than the one it replaces:** on either
yardstick, the fine-tuned model's temperature is within chance of its
neighbour.

What changed is the endgame. On every move, 1.25 led there by 16.0 centipawns
(23.9 against 39.9). On open positions it still leads, but by 4.5 (15.0
against 19.5), and that no longer outweighs the middlegame, where 1 is closer
by 16.4 (12.6 against 29.0).

In open endgames, Camille loses 128.1 centipawns a move. The fine-tuned Bot
loses 108.7 at 1 and 143.1 at 1.25: he sits between the two, a little
nearer 1.25. In the middlegame he loses 104.1, the Bot 116.3 at 1 and 133.0 at
1.25.

### The two Bots of the model choice, as context

| Bot | Games | Distance, every move | Distance, open positions | Endgame moves in decided positions |
|---|---|---|---|---|
| Original, at 1 | 400 | 21.1 | 13.4 | 36.2% |
| Fine-tuned, at 1.25 | 400 | 21.5 | 15.4 | 40.2% |

`docs/experiments/results/model-choice-losses-open-positions.json` holds the
tables per Phase.

## Reading the results

**The yardstick removes a bias, not a disagreement.** The Bot's endgames run
on to mate. On every move, that was enough to make a hotter temperature look
closer in the endgame. On open positions the original model's choice does not
move, and the fine-tuned model's moves from 1.25 to 1. The two models now
agree, which is what one would expect of two models whose middlegames both
match Camille best at 1.

**What it means for the model choice, which this ticket does not make.**
Ticket 19's rule compared the two Bots each at its own temperature. With the
fine-tuned model at 1, the comparison is the one already run there as a check
(`model-choice-test-set-equal-temperature.json`). There, the fine-tuned Bot
plays Camille's move more often after ply 10 by 1.33 points ± 0.10, about
thirteen standard errors. The rule would then choose the fine-tuned model.

Two cautions keep this a reading, not a decision:

- The fine-tuned model's temperature is within chance of 0.75 and 1.25.
- These are the same 200 games per temperature that were read before.

Choosing the temperature and the model again, on this yardstick and with
fresh games, is the next ticket's work. The site keeps serving the original
model at 1.

**A single temperature still cannot fit every Phase.** On open positions, the
Bot at 1 plays the endgame a little better than Camille: 110.4 centipawns a
move for the original model and 108.7 for the fine-tuned one, against his
128.1. A hotter draw fits his endgame better and overshoots his middlegame.
This is the same tension ticket 22 found, now measured without the bias.

## What the measure cannot see

- **Play after a game is lost or won.** Once both the best move and the move
  played are ten pawns or more for the same side, the move is left out,
  whatever it gives up. How Camille or the Bot plays out a lost position, and
  whether either converts a won one cleanly, is not measured.
- **The mistake that throws a won game away is still counted.** A move from
  +12 to +3 leaves the cap, so it is measured, at the capped loss of 7 pawns.
  So is a move that turns a lost position back into a fight.
- **The cap still compresses losses near it.** A move from +9 to +2 counts
  its full 7 pawns, a move from +15 to +8 counts 2. Open positions remove the
  moves the cap reads as nothing, not the cap's effect on the moves around
  it.
- **Resignation is not modelled.** The Bot's games still run on to mate. They
  are only read like Camille's: decided moves are left out of both.

## Known limitations

- **No new games.** Every figure re-reads the 200 games per temperature and
  the 400 per Bot of tickets 22 and 19, with one seed and one stand-in
  opponent.
- **The Phases are weighed by Camille's moves on open positions:** 18.8%
  opening, 34.9% middlegame, 46.3% endgame, against 17%, 32% and 51% on every
  move. The weighting rule is unchanged; the moves it counts are those the
  distance is read on.

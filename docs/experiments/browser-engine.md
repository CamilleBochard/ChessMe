# The yardsticks beside the board

The game page explains each of the Bot's moves as the game goes, and says
whether the game so far stays close to Camille or drifts away from him. Two
yardsticks of his ship with the site for that, and this write-up says how
each was built and why.

- **Improbability.** How often Camille plays a move the Base Model finds
  unlikely, and how much that varies from one of his games to the next. It
  needs no engine.
- **Losses.** How much evaluation his moves lose, game by game. Analysis mode,
  off by default, runs Stockfish in the visitor's browser and sets the Bot's
  losses against these.

The [Blunder Profile](blunder-profile.md) measured his losses with Stockfish 19
at depth 18. The browser cannot run that engine at that depth. The full build
is 99 MB, and its multi-threaded form needs cross-origin isolation headers the
site does not send. So analysis mode runs a smaller build, and his losses had
to be measured again with it before the two could be compared. The second
half of this write-up measures how much that changes his figures.

## How a game is compared with his

A single game is a small sample, so the panel does not set it against
Camille's average. It sets it against how much his own games vary.

For each Phase, a figure is read from each of his games: the share of moves
the model gives less than 1%, or the average loss. The range the middle 80%
of his games cover is his usual range, from the 10th to the 90th percentile,
read with the Blunder Profile's nearest-rank percentiles. The Bot's game so far
is inside that range, above it or below it.

A figure is read only from eight moves or more in the Phase, for his games and
the Bot's alike. Below that one move swings the share by more than an eighth,
and the panel says there are too few moves to tell. The opening holds at most
five of a player's moves, so one game's opening never gets a verdict.

The functions are in `src/explanation/yardsticks.ts`, each tested on its own.

## The improbability yardstick

It is built from the probabilities the served Base Model gives Camille's moves
on the Test Set: the fine-tuned Maia-3 5M at a rating of 1100, the model the
site serves ([the model choice](model-choice-on-open-positions.md)). The
records are those `npm run move-probabilities` wrote for that model. Twenty of
them, recomputed, gave identical probabilities.

Only the Test Set is used, because the fine-tuned model was trained on the
other games. It finds those games more probable than it would find a new game
of his.

His moves in positions the Opening Book holds are left out. The Bot never asks
the Base Model in those positions, so only his moves outside the book are like
with like: 6,435 of his 7,092 Test Set moves, from 230 games.

| Phase | Moves | Games with 8 moves or more | Middle 80% of games, share under 1% |
|---|---|---|---|
| Opening (1-10) | 505 | 0 | none |
| Middlegame (11-30) | 2,175 | 214 | 0.0% to 10.0% |
| Endgame (31+) | 3,755 | 161 | 0.0% to 9.5% |

The panel also says how rare a single move is. Its rarity is the share of his
moves in the Phase that the model gave no more than it gave the Bot's move:
"Camille plays a move this unlikely on x% of his moves". That share is shipped
for 51 probabilities, ten a decade from 0.00001 to 1. Between two of them it is
read on a straight line on a logarithmic scale. The file is under 4 KB.

The low end of the range is 0% in both Phases, because most of his games hold
no move under 1% at all. So the panel can say a game has more improbable moves
than his usually do, but never fewer.

## The browser's engine

Analysis mode runs Stockfish.js 19.0.0 (the `stockfish` package, pinned in
`package.json`), in its "lite" single-threaded build: Stockfish 19 compiled to
WebAssembly, with a smaller network, 1.8 MB in all. It is fetched only when the
visitor switches analysis mode on, and runs in its own Web Worker.

Every search goes to depth 14. On this project's 2012 laptop, a move (one
search for the best move and one for the move played) took:

- 0.10 s at depth 12;
- 0.29 s at depth 14;
- 0.80 s at depth 16.

These are averages over 40 of Camille's Test Set moves. Depth 14 keeps a phone
responsive while the Bot's own model also runs. A fixed depth, rather than a
time limit, makes an evaluation depend on the position alone, whatever the
visitor's machine.

The page talks to the engine as `pipeline/stockfish_analysis.py` does through
python-chess, as follows.

1. A new game, which clears the hash, before each position.
2. A search of the whole position.
3. Unless the best move is the one played, a search restricted to the played
   move.

The loss is then read as the Blunder Profile reads it: scores capped at ten
pawns, a mate counted as ten pawns, and a move made once both scores are past
the cap for the same side read as made in a decided position. The page's code
is `src/analysis/engine-analysis.ts`.

### One computation, three times

Three checks show that the Bot's loss in a visitor's browser and Camille's
yardstick are the same computation.

- **Twice on the laptop.** The same 291 positions analysed twice gave 291
  identical analyses.
- **Laptop and Ryzen.** The Ryzen desktop that measured his games gave the
  same 291 analyses as the laptop, before measuring the rest.
- **The page's code.** Run under Node against the same WebAssembly build,
  `scripts/browser-engine-parity.ts` returned exactly the scores the pipeline
  cached on a fixed sample of 300 of his moves: best move, best score and
  played score.

## The loss yardstick

All 30,860 of Camille's moves, from his training games and the Test Set alike,
were measured with that engine at depth 14. The Blunder Profile measured the
same moves at depth 18 for the same reason: an engine yardstick is never fed
to the Bot, so the Test Set has nothing to leak into.

Each game's figure is its average loss over the moves made in open positions,
the moves Level is compared on since [Level on open positions](level-on-open-positions.md).
A move made once the game was decided is left out, his and the Bot's alike.

| Phase | Games with 8 open moves or more | Middle 80% of games, average loss |
|---|---|---|
| Opening (1-10) | 0 | none |
| Middlegame (11-30) | 938 | 24 to 160 cp |
| Endgame (31+) | 609 | 47 to 217 cp |

## The gap between the two engines

The same 30,860 moves, read by Stockfish 19 at depth 18 (the Blunder Profile)
and by the browser's build at depth 14. Each engine is read over the moves it
reads as made in an open position.

| Phase | Engine | Open moves | Average loss | Losing 1 pawn or more | Losing 3 or more | Middle 80% of games |
|---|---|---|---|---|---|---|
| Opening (1-10) | Stockfish 19, depth 18 | 5,224 | 25.7 cp | 5.4% | 1.1% | none |
| | Browser, depth 14 | 5,225 | 21.9 cp | 4.3% | 0.9% | none |
| Middlegame (11-30) | Stockfish 19, depth 18 | 9,730 | 104.1 cp | 27.9% | 10.7% | 25 to 193 cp |
| | Browser, depth 14 | 9,749 | 88.2 cp | 25.7% | 8.4% | 24 to 160 cp |
| Endgame (31+) | Stockfish 19, depth 18 | 12,890 | 128.1 cp | 29.9% | 13.1% | 38 to 240 cp |
| | Browser, depth 14 | 13,315 | 114.8 cp | 30.2% | 11.5% | 47 to 217 cp |

Move by move, on the moves both engines read as open:

| Phase | Moves | Average difference | Within 10 cp | Same side of one pawn | Open for one engine only |
|---|---|---|---|---|---|
| Opening (1-10) | 5,224 | 9.0 cp | 72.4% | 98.4% | 1 |
| Middlegame (11-30) | 9,725 | 29.8 cp | 51.0% | 92.7% | 29 |
| Endgame (31+) | 12,761 | 45.0 cp | 44.9% | 89.5% | 683 |

## Reading the gap

The browser's engine finds Camille's moves less costly. His middlegame average
falls from 104 to 88 cp, and the top of his usual range from 193 to 160 cp; in
the endgame the range moves to 47 to 217 cp. Had the panel set the browser's
evaluations against the Blunder Profile's figures, a Bot losing 180 cp a move
in the middlegame would have read as inside his range. Read at the browser's
settings, it is above it. That is why the yardstick is measured again rather
than corrected by an average gap: the gap differs by Phase and from move to
move, and it moves the ends of the range by different amounts.

Move by move, the two engines agree on whether a move lost a pawn or more nine
times in ten or better, and within 10 cp about half the time once past the
opening. The browser's engine also reads 683 more endgame moves as made in an
open position: with a weaker search, fewer positions reach the ten-pawn cap
for both moves.

The panel names the engine and depth its losses were read at, so a reader
comparing them with the Blunder Profile knows they are not the same scale.

## Known limitations

- A game's average loss is pulled up by a single large blunder, so one bad move
  can put a game above his range. Camille's games are read the same way, so his
  range already holds games like that.
- From eight moves up, a game's figure is still noisy. The range is his games'
  spread, not a confidence interval on the Bot's game.
- The opening never gets a verdict from one game, for either yardstick.
- The improbability yardstick reads 230 Test Set games. Its range rests on 214
  middlegames and 161 endgames.
- The browser's engine is weaker than the Blunder Profile's, so its losses are
  a coarser measure of Level. The comparison is like with like, but on a
  coarser scale.
- Turning analysis mode on marks the game as assisted, but nothing stops a
  visitor from analysing the game in another tab. Assisted games are told
  apart only when the site's own mode was used.

## Reproducing

```sh
# The served model's probabilities on the Test Set, then the improbability yardstick.
npm run move-probabilities -- models/onnx/maia3-5m-fine-tuned.onnx --rating 1100 data/dataset/test.jsonl \
  --out data/dataset/move-probabilities/fine-tuned-test.jsonl
npm run yardsticks -- --model models/onnx/maia3-5m-fine-tuned.onnx \
  --probabilities data/dataset/move-probabilities/fine-tuned-test.jsonl

# Every one of Camille's moves with the browser's engine at depth 14 (about an hour
# on the 2012 laptop with four processes, 7 minutes on an eight-core desktop).
python -m pipeline.extract_blunder_profile --engine scripts/stockfish-lite.sh --depth 14 \
  --profile data/dataset/blunder-profile-browser.json --losses data/dataset/centipawn-losses-browser.jsonl
npm run yardsticks -- --losses data/dataset/centipawn-losses-browser.jsonl \
  --loss-profile data/dataset/blunder-profile-browser.json

# The page's own conversation with the engine against the pipeline's cache.
npm run browser-engine-parity -- --cache data/analysis/stockfish-19-lite-wasm-depth-14.jsonl --sample 300

# The gap against Stockfish 19 at depth 18.
npm run browser-engine-gap -- \
  --reference data/dataset/centipawn-losses.jsonl --reference-profile data/dataset/blunder-profile.json \
  --browser data/dataset/centipawn-losses-browser.jsonl --browser-profile data/dataset/blunder-profile-browser.json \
  --record docs/experiments/results/browser-engine-gap.json
```

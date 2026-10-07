# The Opening Book

The Opening Book maps the positions Camille has reached often enough to the
move he played there, and the Move-Selection Engine consults it before the
Base Model. This page records how the book is built and what it adds,
measured on the Test Set rather than assumed.

## Reproducing

```sh
python -m pipeline.build_dataset
python -m pipeline.build_opening_book --min-occurrences 3
npm run opening-book -- models/onnx/maia3-5m.onnx --rating 1100 --record docs/experiments/results/opening-book.json
```

The first command writes the dataset, the second builds the book from it
into `data/dataset/opening-book.json`, and the third measures the chosen Base
Model (see [Choosing the Base Model](base-model-sweep.md)) on the Test Set,
alone and behind the book. `--book <file>` measures another book. The tables
go to standard output as Markdown; `--record` also keeps the raw counts in
`docs/experiments/results/opening-book.json`, which the write-up page reads.

## How the book is built

**From the training games only.** A Test Set game in the book would hand it
the answer to the very positions it is scored on. The builder reads both
dataset files and draws on the training games alone, so keeping the Test Set
out does not depend on which file a caller passes.

**One entry per position, whatever the move order.** A position is named by
the first four fields of its FEN: the pieces, the side to move, the castling
rights and an en passant square where a capture there is legal. The move
counters are left out, so a position reached by a transposition is the same
entry. python-chess and chessops both write the en passant square only when
the capture is legal; on all 30,860 positions of the dataset the key the
Python builder computes and the one the engine computes agree.

**Reached often enough.** A position enters the book once Camille has faced
it at least `--min-occurrences` times in the training games, 3 by default.
The book plays the reply he chose most often there. When two replies are tied
for most played, his reply is not known and the position stays out, leaving
it to the Base Model.

**Not limited to the opening.** Any position reached often enough enters,
which in practice means the opening and a few early middlegame positions.

The engine looks the book's move up among the legal moves of the position, so
a stale or malformed book can only fall silent, never play an illegal move.

## Results

Measured on 2026-10-04 on the Test Set: 7,092 positions from 230 games. The
book, built from the 816 training games, holds 182 positions. The Base Model
is Maia-3 5M at 1100.

Move-Matching in percent, ± one standard error clustered by game, with the
number of positions in brackets.

**Coverage.** The share of Test Set positions the book answers.

| Phase | Answered by the book | Positions | Share |
|---|---|---|---|
| Opening (1-10) | 645 | 1150 | 56.1% |
| Middlegame (11-30) | 12 | 2187 | 0.5% |
| Endgame (31+) | 0 | 3755 | 0.0% |

**Every Test Set position.**

| Phase | Base Model alone | Book, then Base Model |
|---|---|---|
| Opening (1-10) | 51.30 ± 1.46 (1150) | 62.61 ± 1.56 (1150) |
| Middlegame (11-30) | 47.60 ± 1.06 (2187) | 47.60 ± 1.06 (2187) |
| Endgame (31+) | 50.65 ± 0.94 (3755) | 50.65 ± 0.94 (3755) |
| All | 49.82 ± 0.57 (7092) | 51.65 ± 0.61 (7092) |

**Only the positions the book answers.** The two runs can differ nowhere
else, so this isolates the book's effect.

| Phase | Base Model alone | Book, then Base Model |
|---|---|---|
| Opening (1-10) | 52.71 ± 1.84 (645) | 72.87 ± 1.67 (645) |
| Middlegame (11-30) | 25.00 ± 11.97 (12) | 25.00 ± 11.97 (12) |
| All | 52.21 ± 1.78 (657) | 71.99 ± 1.58 (657) |

## Reading the results

The book raises opening Move-Matching by about 11 points, from 51.3% to
62.6%. The gain comes entirely from the 56% of opening positions the book
answers: there it plays Camille's move 72.9% of the time, against 52.7% for
the Base Model. The two figures are measured on the same positions, so their
standard errors overstate the uncertainty of the difference; a gap of 20
points against errors under 2 is clear either way.

In the twelve middlegame positions the book answers, the book and the Base
Model each match three. Twelve positions say nothing either way.

Over the whole game the gain shrinks to under two points, because the book
reaches only the first few moves and more than five in six Test Set
positions come after ply 10. The book carries Style, not Level: it changes which opening
the Bot plays, not how often it errs later.

## Sensitivity to the threshold

The default of 3 was set by argument before the Test Set was scored: a
position met in only one or two games should not decide the Bot's opening.
Scoring several thresholds on the Test Set and keeping the best would choose
on the same games that report the score, so the table below is reported as a
check of how much the choice matters, not as the way it was made.

Opening Move-Matching in percent with the book consulted first, against
51.30 ± 1.46 for the Base Model alone.

| Minimum occurrences | Positions in the book | Opening positions answered | Opening Move-Matching |
|---|---|---|---|
| 1 | 21,064 | 760 (66.1%) | 62.78 ± 1.53 |
| 2 | 306 | 685 (59.6%) | 62.70 ± 1.56 |
| **3** | **182** | **645 (56.1%)** | **62.61 ± 1.56** |
| 5 | 99 | 577 (50.2%) | 62.09 ± 1.57 |
| 10 | 47 | 500 (43.5%) | 60.61 ± 1.55 |

From 1 to 5 the results differ by less than one standard error, so the
choice of threshold barely matters. A lower threshold answers more positions
with less reliable replies, and the two effects nearly cancel. At 1 the book
holds 21,064 positions, almost all met in a single game and never again: they
add 75 answered positions over a threshold of 2. At 10 the lost coverage
begins to show, though still within about one and a half standard errors. The default of 3 stays: it keeps the
book a hundred times smaller than a threshold of 1 for the same score, which
matters once the book is downloaded with the page.

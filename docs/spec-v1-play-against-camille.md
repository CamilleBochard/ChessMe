# Spec v1 — Play a game against Camille

> Holding file. The issue tracker for this repo is GitHub Issues, but the `gh`
> token is invalid, so this could not be published yet. Publish it as an issue
> labelled `ready-for-agent` once `gh auth login` succeeds, then delete this file.

## Problem Statement

Camille's portfolio lists projects but shows no evidence that he can work with
machine-learning models: measure one, interpret the result, and decide what to do
about it. Writing "used AI" on a project page proves nothing, and a working demo
with no numbers behind it proves nearly as little, because a reader cannot tell a
careful result from a lucky one.

Separately, a visitor reading a portfolio has nothing to do on it. There is no
reason to stay and no reason to come back.

## Solution

A page on the portfolio where a visitor plays a full game of chess against a Bot
that imitates Camille, and a write-up beside it showing how the Bot was built and
how well it works, in numbers.

The Bot is a published Base Model conditioned to Camille's measured strength,
consulted through an Opening Book built from his own games. It trains nothing:
ADR-0001 records why, and the write-up says so plainly, because the reason is a
measurement rather than a shortcut.

Everything the Bot does is measured against a Baseline on a Test Set of games it
has never seen. The Base Model itself is picked by measurement rather than by
converting Camille's rating between sites, which is the project's first real
experiment and its first result.

## User Stories

1. As a visitor, I want to start a game against the Bot without signing up, so that I can try it in one click.
2. As a visitor, I want to choose whether I play White or Black, so that I can practise the side I want.
3. As a visitor, I want to see the board respond immediately when I move, so that the game feels like a game and not a form submission.
4. As a visitor, I want illegal moves to be refused with the piece returned to its square, so that I cannot accidentally break the position.
5. As a visitor, I want the Bot to reply within a couple of seconds, so that the pace feels like playing a person rather than waiting on a server.
6. As a visitor, I want to see which side is to move, so that I am never unsure whether the Bot is thinking.
7. As a visitor, I want the game to end and tell me the result on checkmate, stalemate, or the draw rules, so that the game concludes properly.
8. As a visitor, I want to resign, so that I can stop a lost game without abandoning the page.
9. As a visitor, I want to start a new game after one finishes, so that I can play again without reloading.
10. As a visitor, I want to see the moves so far in a list, so that I can follow what has happened.
11. As a visitor, I want to take back my last move, so that a misclick does not ruin the game.
12. As a visitor, I want the page to work on my phone, so that I can play from wherever I read the portfolio.
13. As a visitor, I want the Bot's first moves to feel like a real opening rather than random, so that the game starts sensibly.
14. As a visitor, I want to be told, after the game, whether the Bot was playing from Camille's Opening Book or from the Base Model, so that I understand what I just played against.
15. As a visitor, I want to say whether the Bot felt like a real player at that level, so that my impression feeds back into the project.
16. As a visitor on a slow connection, I want the page to tell me the model is downloading, so that I do not think it is broken.
17. As a returning visitor, I want the model not to download again, so that the second visit starts instantly.
18. As a portfolio reader, I want to see the Bot's measured Move-Matching against the Baseline, so that I can judge whether it works.
19. As a portfolio reader, I want to see how the Base Model was chosen, so that I can see a decision made on evidence.
20. As a portfolio reader, I want to see the number of Session Games played and the Bot's record in them, so that the claims are backed by live data rather than a one-off run.
21. As a portfolio reader, I want to read why no fine-tuning was done, so that I understand the absence was a decision and not an omission.
22. As Camille, I want every game I have played on Chess.com and Lichess pulled and stored raw, so that I never re-download to change a filter.
23. As Camille, I want the dataset filtered to 10-minute games from 2025-06 onward, so that the Bot imitates the player I am now rather than the one I was at 416.
24. As Camille, I want to see my rating over time as a chart, so that I can confirm the cut-off is in the right place.
25. As Camille, I want a Test Set held back from everything else, so that no measurement is contaminated by data the Bot has seen.
26. As Camille, I want an Opening Book built from the positions I reach often, so that the Bot carries my repertoire.
27. As Camille, I want to set how many times a position must appear before it enters the Opening Book, so that I can trade coverage against reliability.
28. As Camille, I want my Blunder Profile extracted from my own games with an engine, so that I have a yardstick for how often and how badly I err.
29. As Camille, I want to compare the Bot's error distribution against my Blunder Profile, so that I can say whether it plays at my Level and not merely near it.
30. As Camille, I want to run several candidate Base Models against the Test Set in one command, so that choosing one is a measurement rather than an argument.
31. As Camille, I want the sweep to report each candidate's Move-Matching in a table, so that the result goes straight into the write-up.
32. As Camille, I want to know my Maia-Equivalent Rating from that sweep, so that I stop guessing which rating scale applies.
33. As Camille, I want the evaluation harness itself covered by a test with a hand-countable answer, so that a silently wrong measurement cannot corrupt every conclusion.
34. As Camille, I want the Move-Selection Engine to load an ONNX file rather than depend on one model's internals, so that swapping the Base Model is a file change.
35. As Camille, I want the same engine code measured offline and shipped to the browser, so that what I measure is what visitors play.
36. As Camille, I want finished Session Games stored as PGN on the VPS, so that I can analyse how the Bot behaves against real opponents.
37. As Camille, I want no accounts, logins, or IP addresses stored, so that the telemetry carries no personal data.
38. As Camille, I want the VPS to serve only static files, so that its 4 GB and 2 vCores are never the bottleneck.
39. As Camille, I want the chess project in its own public repository under AGPL-3.0, so that the Base Model's licence obligation is satisfied cleanly and separately from my portfolio.
40. As Camille, I want the Phase 5 fine-tuning experiment kept as a tracked follow-up, so that the project's only model-training experiment does not quietly disappear.

## Implementation Decisions

**Language boundary.** Python owns data and training. TypeScript owns move
selection. ONNX and JSON are the only artifacts that cross between them. This is
recorded in `CLAUDE.md` and is the project's primary structural constraint.

**The Move-Selection Engine exists once, in TypeScript.** Its boundary is a
position in, one move out. It is measured by running it under Node against the
Test Set, so the code that is measured is byte-for-byte the code that ships.
There is no second Python implementation to keep in sync.

**Inference runs in the visitor's browser** via onnxruntime-web in a Web Worker,
with the model cached in IndexedDB. The VPS serves the static Astro build and
nothing else. This follows CSSLab's own deployment of the same model family.

**The Base Model is undecided until the sweep runs.** Candidates span several
Maia-1 rating bins and at least one Maia-3 variant. Selection is by Move-Matching
on the Test Set. See ADR-0001 — in particular that Camille's ~750 Chess.com
rating and ~1331 Lichess rating are the same strength on two scales, and that
Maia speaks the Lichess one.

**Artifact contract.** Python emits `book.json` (Opening Book), `profile.json`
(Blunder Profile), `testset.jsonl` (Test Set), and one ONNX file per candidate.
TypeScript and the evaluation harness read those and nothing else. The schema of
these files is the seam between the two halves and is versioned.

**Move selection order.** Opening Book first; when the position is absent, encode
it for the Base Model and take a move from the model's output restricted to legal
moves. The Blunder Profile is not applied to move selection in v1 — it exists as
a yardstick, since a correctly-conditioned Base Model should already play at the
right Level. Whether it needs to become a mechanism is a question the measurement
answers, not the spec.

**Dataset.** Chess.com and Lichess, 10-minute games only (98.4% of the
Chess.com archive), games from 2025-06 onward. Roughly 1,030 games survive.
All 396 Lichess games survive, the account having been created in July 2025. Raw
downloads are stored untouched and never re-fetched to change a filter.

**Telemetry.** Finished Session Games are stored as PGN in SQLite on the VPS,
with each Bot move flagged as Opening Book or Base Model, plus an optional
end-of-game impression from the visitor. No accounts, no IP addresses.

**Build order.** Each ticket is built in small, test-first steps, every one of
which keeps the page playable end to end. The working agreement is recorded in
`CLAUDE.md`.

## Testing Decisions

A good test here asserts what a caller can observe and nothing else. A test that
asserts the Opening Book was consulted before the Base Model freezes the
engine's internal order and makes the eventual Rust rewrite a test rewrite too.
A test that asserts a given position produces a given move survives any
restructuring. There is no prior art in this repo; it has no source yet, so these
conventions are set here.

**Seam 1 — the Move-Selection Engine.** One function, position in, move out,
with the Opening Book and Base Model supplied as dependencies. Tests hand it a
position plus a fixture book and fixture model and assert the move returned.
Everything beneath it — book lookup, tensor encoding, the ONNX call, legality
filtering, sampling — is covered through this one entry point.

**Seam 2 — the artifact directory.** The Python pipeline is tested by pointing
it at a small committed fixture of PGN games and asserting properties of the
files it emits: that a known position maps to the known reply in `book.json`,
that `profile.json` carries the expected buckets, that `testset.jsonl` contains
no game present in the training split. Intermediate parsing and filtering steps
are not tested directly.

**The download step sits outside both seams** as a thin, untested wrapper over
network I/O. The PGN fixture stands in for it everywhere else.

**The evaluation harness gets its own fixture** — a Test Set small enough that
the correct Move-Matching score can be counted by hand. A measurement tool that
is silently wrong is worse than no measurement, because every number in the
write-up inherits its error.

## Out of Scope

Any model training, including fine-tuning on Camille's games and training a Base
Model from scratch on public Lichess data. Both are recorded in ADR-0001 with
reasons; fine-tuning returns as a separate tracked experiment.

The Rust and WebAssembly rewrite of the Move-Selection Engine. It is a second
project of roughly 60 to 100 hours, and it replaces code that must already work.

Blunder injection as a move-selection mechanism. Kept as measurement only.

Accounts, ratings for visitors, matchmaking, game history per visitor, engine
analysis of the visitor's moves, and time controls or clocks.

Anything touching the portfolio's own design system beyond the single page.

## Further Notes

The Lichess game export was rate-limited during the grilling session and those
396 games have not been downloaded yet; the 1,270 Chess.com games are in
`data/raw/`. The export endpoint permits one request at a time and holds the lock
until the prior stream closes.

`gh` authentication is broken, so this spec has not reached the issue tracker.
The repository may also not exist on GitHub yet — the 401 blocked that check.

The write-up is a deliverable, not a by-product. The most valuable thing this
project can show is a measured negative result explained well, and that only
exists if the numbers are recorded as they are produced rather than reconstructed
at the end.

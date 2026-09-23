# ChessMe

## Agent skills

### Issue tracker

Issues live in the GitHub Issues of `CamilleBochard/ChessMe` and are managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single context: `CONTEXT.md` and `docs/adr/` at the repository root. See `docs/agents/domain.md`.

## Working agreement

### Language boundary

Python owns data and training: pulling games, building the Opening Book,
extracting the Blunder Profile, the Phase 5 fine-tuning. TypeScript owns move
selection and runs in the browser. ONNX and JSON are the only handoff between
them. The Move-Selection Engine exists once, in TypeScript, and is measured by
running it under Node.

### Implementing a ticket

When a ticket is started, Claude implements it end to end: read the issue and
the domain docs, cut a branch named `ticket-<n>-<slug>`, build the ticket, and
stop once every acceptance criterion is met. Report which criteria are covered
and how each was verified.

Build in small steps. Each step leaves the program runnable and the tests
green, and is committed on its own with a message that explains why the change
was made. Do not push, open pull requests or close issues: each ticket is
reviewed against its acceptance criteria and closed by hand.

### Test-driven

Logic is built test-first. Each step is one red-green-refactor cycle: write one
failing test, confirm it fails for the right reason, write the least code that
makes it pass, then tidy. One test at a time, never a batch of tests up front.

Tests assert behaviour through the public interface (position in, status or
move out), never how the result was produced. TypeScript uses Vitest
(`npm test`), Python uses pytest.

TDD applies to logic: game status, the Move-Selection Engine, the Opening
Book, the Blunder Profile, the Style Fingerprint. It does not apply to
Chessground rendering and drag-and-drop (check by hand, keep the component
thin) or to measurements such as the Base Model sweep and fine-tuning, where
the expected answer is unknown until the run. Do not test the chess rules
library itself, only our layer on top of it.

### How the code should read

Optimise for a human reading it, not for brevity. Prefer an explicit `if` over a
clever ternary or a chain of concatenations. Name intermediate values instead of
nesting calls. A longer function that reads top to bottom beats a short one that
has to be decoded.

Comments say what the code is for and why it is shaped the way it is. They do
not narrate the project's history: ticket numbers and what changed in which
step belong in commit messages. Code, comments, commit messages and issues are
written for any reader of a public repository.

# The monthly refresh

Once a month, GitHub Actions brings the Bot up to date with the games Camille
has played since the last run, checks it, publishes it and deploys it. When
anything fails after the publication, the previous version is restored
without anyone stepping in. Nobody has to merge anything for a good update to
go live, and a bad one never stays live.

The workflow is `.github/workflows/monthly-refresh.yml`. It runs at 04:00 UTC
on the first day of each month, and on demand from the Actions tab.

## Where it runs

On GitHub's hosted runners. The repository is public, so they cost nothing; a
public repository's `ubuntu-24.04` runner has 4 vCPUs, 16 GB of memory and a
14 GB disk, and a job may run for up to six hours
([runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners),
[limits](https://docs.github.com/en/actions/reference/limits)). A month's new
games are a few thousand moves for Stockfish, well inside one job. The VPS
only serves the site and receives Session Games; it computes nothing.

## The stages

Each stage is a job that runs only when the one before it succeeded.

| Stage | What it does | What it guards against |
|---|---|---|
| 1. Refresh | Restores the caches, checks Stockfish against them, rebuilds what the site was built from, fetches the new games, runs `pipeline/refresh_games.py`, and commits the result on a branch named after the day and the run. Before anything is rebuilt with the new games, the served model is measured on them (`docs/experiments/monthly/`). A run with no new game stops here. | A runner whose Stockfish scores moves differently: the identity check runs before anything else and fails the run before any move is analysed. |
| 2. Checks | The test suites and the typecheck; `npm run check-opening-book`; the site's build; 20 games of the Bot with the new Opening Book, which must all finish; and the regression gate. | A book built wrong, code that no longer builds or runs, and a book that makes the Bot match Camille's moves less often. |
| 3. Publish | The next `bot-data-N` release (the served model and the new book), its name and checksums in `docker/bot-data-release` and `docker/bot-data.sha256`, and the refresh's commits put on master. | Master moving meanwhile: the push only moves master forward, so it fails rather than overwrite anything. |
| 4. Deploy | `deploy.yml`, called with the published commit: both images built and deployed by the VPS's deploy script, which restores the previous image of a container that fails its health check. | A container that does not start. |
| 5. Production | `pipeline/check_production.py` against the production address, each check retried for five minutes. | A site that deployed but does not work: the page, the published model and book, the Session Games service, and the Bot answering three moves in a real browser. |
| 6. Rollback | After a failure at stage 4 or 5: the previous commit's images deployed again, the publication reverted on master, the release marked as not deployed, and an issue opened naming the failed stage, with a link to its log. | A bad version staying live, and master saying something other than what the site serves. |

**The regression gate.** The served Bot (the served model at its temperature
and opening cut, with the served book) and the same Bot with the new book
answer the same Test Set positions (`npm run compare-bots` with
`--first-book` and `--second-book`). The gate (`npm run regression-gate`,
`src/evaluation/regression-gate.ts`) fails when the drawn Move-Matching of the
second falls below the first's by more than two standard errors of the change,
the change measured position by position and its standard error clustered by
game. A change whose spread cannot be measured fails too.

**The new games' Move-Matching.** The games a run fetches are new to the
served model. Before the dataset, the Opening Book or anything else takes
them in, the served model and the untrained Maia-3 5M answer their
positions, and the gain of the first over the second is recorded in
`docs/experiments/monthly/` with a cumulative table, committed with the
refresh. A month with fewer than 1,500 of Camille's moves is pooled with
the next. The method is in [the new games' Move-Matching](experiments/new-games-matching.md).
The untrained model comes from the `untrained-maia3-5m` release, checked
against `scripts/monthly-refresh/untrained-model.sha256`.

**The 20 games** are played against the served model at 1100, since the
runner holds no other model. They check that the Bot runs with the new book,
not how well it plays.

**The checks against production** read the address from the `PRODUCTION_URL`
secret of the `production` environment, never from the repository. A secret
rather than a variable: the repository's run logs are public, GitHub prints a
step's variables in them and masks its secrets. The
site's build writes `public/bot-data.json`, the sha256 of the model and of the
book it was built with; the book is bundled into the Bot's worker, so this is
how production says which book it serves. The browser blocks anything the page
would send to the Session Games service, so the check never records a game.

## What persists between runs

The raw games are in the repository. The Stockfish caches, which take hours
to rebuild, and the served model's records on the Test Set are not: they are
kept, compressed, as assets of the `pipeline-state` release
(`pipeline/pipeline_state.py`). A run downloads the latest copy of each at
the start, and saves new copies only once it has deployed and passed the
checks against production; the older copies are deleted only after every new
one is up. A failed run leaves the previous copies as they were. The Actions
cache is not used for them: it is evicted after seven days unused, and a run
is a month apart.

## Secrets and permissions

- The Lichess token is the `LICHESS_TOKEN` repository secret. Only the step
  that fetches the games receives it, and nothing prints or writes it.
- The deploy key and the VPS's address stay in the `production` environment,
  which only master may deploy from.
- The workflow asks for no permission by default; each job asks for what it
  needs (`contents: write` to push a branch or master and to write releases,
  `packages: write` for the images, `issues: write` to open the issue).
- Every action is pinned by commit SHA.

## Setting it up

Once, by someone with admin rights on the repository:

```sh
gh secret set LICHESS_TOKEN < ~/.config/chessme/lichess-token
printf '%s' "https://<the production host>" | gh secret set PRODUCTION_URL --env production
# The first copy of the caches and records, from a machine that holds them:
python -m pipeline.pipeline_state save --stamp "$(date -u +%Y-%m-%d)-setup"
# The untrained model the new games are measured against, from a machine
# that converted it (python -m pipeline.convert_maia3):
sha256sum --check scripts/monthly-refresh/untrained-model.sha256
gh release create untrained-maia3-5m models/onnx/maia3-5m.onnx --latest=false \
  --title "Untrained Maia-3 5M" --notes "Maia-3 5M as published, converted to ONNX."
```

## Running it by hand

From the Actions tab, or:

```sh
gh workflow run monthly-refresh.yml
# Every stage again even with no new game:
gh workflow run monthly-refresh.yml -f continue_without_new_games=true
# A real deployment, then the rollback, on purpose:
gh workflow run monthly-refresh.yml -f continue_without_new_games=true -f fail_checks_after_deploying=true
```

Each stage can also be run on its own machine, from the repository root:
`python -m pipeline.check_engines`, `python -m pipeline.fetch_games`,
`python -m pipeline.refresh_games --no-fetch`,
`python -m pipeline.new_games_matching <game files>`, `npm run check-opening-book`,
`npm run compare-bots` then `npm run regression-gate`, and
`python -m pipeline.check_production https://<the production host>`.

## Rolling back by hand

If the automation itself fails, in this order:

1. **The site.** Deploy the last good commit's images with the VPS's deploy
   script, the same call the workflow makes, service first:
   `ssh <deploy user>@<VPS> chessme-api sha-<commit>` then
   `chessme-web sha-<commit>`; or from the Actions tab, re-run the Deploy
   workflow of that commit.
2. **Master.** `git revert --no-commit <last good commit>..<published commit>`,
   commit, push. Master holds what the site serves again, and
   `docker/bot-data-release` names the release it serves.
3. **The release.** `gh release edit bot-data-N --prerelease --latest=false --title "bot-data-N (not deployed)"`,
   then `gh release edit <previous release> --latest`.
4. **The caches.** Nothing to do: a failed run never saves them.

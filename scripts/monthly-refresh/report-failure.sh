#!/usr/bin/env bash
# Opens an issue for a failed monthly refresh that the rollback did not
# report: a failure in stages 1 to 3, in saving the caches, or in the
# rollback itself. Without it such a failure shows only as a red run in the
# Actions tab, and a month can pass before anyone notices.
#
# Run with PUBLISH_RESULT, RUN_URL and GITHUB_RUN_ID in the environment.
# Needs the gh CLI, with GH_TOKEN allowed to read actions and write issues.
set -euo pipefail

failed_jobs="$(gh run view "$GITHUB_RUN_ID" --json jobs --jq '.jobs[] | select(.conclusion == "failure") | "- " + .name')"
if [ -z "$failed_jobs" ]; then
  failed_jobs="- (no job reported as failed: see the run)"
fi

# What a reader needs first: whether the site and master changed.
if [ "$PUBLISH_RESULT" = "success" ]; then
  state="The refresh was published: master and the latest bot-data release hold it, and no rollback reported this failure. Check what production serves before anything else (docs/monthly-refresh.md, Rolling back by hand)."
else
  state="Nothing was published: master, the bot-data releases and the site are as they were before the run."
fi

body="The monthly refresh failed.

Failed jobs:
${failed_jobs}

${state}

The log of each failed job is in the run: ${RUN_URL}"
gh issue create --title "Monthly refresh failed on $(date -u +%Y-%m-%d)" --body "$body"

#!/usr/bin/env bash
# Stage 6 of the monthly refresh, after a failure once the refresh was
# published: master reverted to what the site serves again, the release
# marked as not deployed, and an issue opened with the failing stage. The
# previous images were deployed again by the job before this one.
#
# Run on a checkout of master, with RELEASE, COMMIT, PREVIOUS_COMMIT, the
# results of the deploy, production and rollback-deploy jobs, and RUN_URL in
# the environment. Needs the gh CLI and git, with GH_TOKEN allowed to write
# contents and issues.
set -euo pipefail

failed_stage="5. Check production"
if [ "$DEPLOY_RESULT" = "failure" ]; then
  failed_stage="4. Deploy"
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
# Reverted rather than erased, so the history keeps what was tried.
git revert --no-commit "${PREVIOUS_COMMIT}..${COMMIT}"
git commit -m "Roll back the monthly refresh that published ${RELEASE}" \
  -m "It failed at stage ${failed_stage}; master holds again what the site serves. Run: ${RUN_URL}"
git push "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" HEAD:master

previous_release="$(git show "${PREVIOUS_COMMIT}:docker/bot-data-release")"
gh release edit "$RELEASE" --prerelease --latest=false --title "${RELEASE} (not deployed)"
gh release edit "$previous_release" --latest

rollback="the previous images were deployed again"
if [ "$ROLLBACK_DEPLOY_RESULT" != "success" ]; then
  rollback="deploying the previous images again ended with \"${ROLLBACK_DEPLOY_RESULT}\": check production by hand (docs/monthly-refresh.md)"
fi
body="The monthly refresh failed at stage **${failed_stage}** after publishing ${RELEASE}.

- Rollback: ${rollback}.
- Master: the publication (${COMMIT}) is reverted.
- Release: ${RELEASE} is marked as not deployed; ${previous_release} is the latest again.

The log of the failing stage is in the run: ${RUN_URL}"
gh issue create --title "Monthly refresh rolled back: failed at ${failed_stage}" --body "$body"

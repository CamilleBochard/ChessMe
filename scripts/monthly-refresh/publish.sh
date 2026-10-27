#!/usr/bin/env bash
# Stage 3 of the monthly refresh: publishes the refreshed Opening Book, with
# the served model, as the next bot-data release, writes its name and
# checksums into the repository, and puts the refresh on master.
#
# Run on a checkout of the refresh's branch, named in BRANCH, with the model
# in models/onnx and the refreshed book in data/dataset. Master moves forward only: if it
# moved since the refresh began, the push fails and nothing is published
# on it. Needs the gh CLI and git, with GH_TOKEN allowed to write contents.
# Writes release, commit and previous_commit to GITHUB_OUTPUT.
set -euo pipefail

previous_commit="$(git rev-parse origin/master)"
if ! git merge-base --is-ancestor "$previous_commit" HEAD; then
  echo "master moved since the refresh began: nothing is published." >&2
  exit 1
fi

previous_release="$(cat docker/bot-data-release)"
number=$(( ${previous_release#bot-data-} + 1 ))
release="bot-data-${number}"

sha256sum models/onnx/maia3-5m-fine-tuned.onnx data/dataset/opening-book.json > docker/bot-data.sha256
echo "$release" > docker/bot-data-release

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add docker/bot-data.sha256 docker/bot-data-release
git commit -m "Publish ${release}" -m "The Opening Book refreshed by the monthly refresh, with the served model, run ${GITHUB_RUN_ID}."

remote="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
# On the branch first: the release is tagged on this commit, which GitHub
# must hold before master does.
git push "$remote" "HEAD:${BRANCH}"

notes="The served Base Model and the Opening Book of the monthly refresh, run ${GITHUB_RUN_ID}. Their checksums are in docker/bot-data.sha256 at the commit that publishes it."
gh release create "$release" models/onnx/maia3-5m-fine-tuned.onnx data/dataset/opening-book.json \
  --title "Bot data ${number}" --notes "$notes" --target "$(git rev-parse HEAD)"

git push "$remote" HEAD:master

{
  echo "release=${release}"
  echo "commit=$(git rev-parse HEAD)"
  echo "previous_commit=${previous_commit}"
} >> "$GITHUB_OUTPUT"

#!/usr/bin/env bash
# Publish viewer/dist to the gh-pages branch as a clean, site-only orphan commit.
#
# Why not just `gh-pages -d dist`: the repo's root .gitignore has a `/data/` rule
# (the raw/generated data is never committed to main). If the publish runs in a
# tree where that .gitignore is visible, the whole data/ folder is silently
# excluded and the deployed site 404s on data/manifest.json. Publishing from
# INSIDE dist/ (which has no .gitignore) with the global excludes file disabled
# guarantees data/ is included, and the orphan branch keeps main's source out of
# the published site. Force-push means the gh-pages branch is one commit, so its
# history never bloats with repeated ~GB deploys.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REMOTE="$(git -C "$HERE/.." remote get-url origin)"

cd "$HERE/dist"
[ -f index.html ] || { echo "dist/ not built — run 'npm run build' first" >&2; exit 1; }
[ -f data/manifest.json ] || { echo "dist/data missing — run 'python3 export.py' then 'npm run build'" >&2; exit 1; }

rm -rf .git
git init -q
git config core.excludesFile /dev/null   # ignore any global gitignore
git checkout -q -b gh-pages
git add -A
git -c user.name="deploy" -c user.email="deploy@local" commit -q -m "Deploy site"
echo "Publishing $(git ls-files | wc -l | tr -d ' ') files to gh-pages (large; this takes a few minutes)…"
git push -q -f "$REMOTE" gh-pages
rm -rf .git
echo "Done — gh-pages updated."
